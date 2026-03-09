from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from api.models import Order, OrderItem, DraftOrder
from api.models import MenuItem

# Statuts qui indiquent qu'un draft a déjà été consommé ou invalidé.
# Tout draft portant l'un de ces statuts doit bloquer la création d'une commande.
_TERMINAL_DRAFT_STATUSES = frozenset({"confirmed_cash", "confirmed_online", "expired", "failed"})

# Statuts valides pour la consommation (draft encore exploitable).
_CONSUMABLE_DRAFT_STATUSES = frozenset({"created", "pi_succeeded"})


def create_order_from_draft(draft: DraftOrder, paid: bool) -> Order:
    """
    Crée une Order finale depuis une DraftOrder (invité).

    Protection anti-rejeu :
    - Re-fetche le draft avec SELECT FOR UPDATE à l'intérieur de la transaction
      pour poser un verrou exclusif sur la ligne.  Deux requêtes concurrentes ne
      peuvent donc pas toutes les deux passer la garde de statut.
    - Met draft.status à 'confirmed_cash' / 'confirmed_online' DANS la même
      transaction atomique, avant de créer l'Order : un rollback éventuel annule
      aussi la mise à jour du statut (garantie tout-ou-rien).

    Cas expiration :
    - La détection se fait à l'intérieur du verrou (donnée fraîche).
    - La mise à jour vers 'expired' est écrite dans une transaction séparée,
      APRÈS le rollback de la transaction principale — un `raise` à l'intérieur
      d'un bloc `@transaction.atomic` annulerait aussi le `save()`, laissant le
      statut coincé à 'created'.

    Raises:
        ValueError: si le draft est expiré, déjà consommé, ou a un statut inattendu.
    """
    try:
        return _create_order_from_draft_atomic(draft, paid)
    except ValueError as exc:
        # La transaction atomique interne a été rollbackée.
        # Si la raison est l'expiration, on écrit 'expired' dans une nouvelle
        # transaction indépendante (QuerySet.update pour éviter un nouveau race).
        if "Draft expired" in str(exc):
            DraftOrder.objects.filter(
                pk=draft.pk,
                status__in=_CONSUMABLE_DRAFT_STATUSES,  # idempotent : n'écrase pas un statut terminal
            ).update(status="expired")
        raise


@transaction.atomic
def _create_order_from_draft_atomic(draft: DraftOrder, paid: bool) -> Order:
    """
    Cœur transactionnel de create_order_from_draft — ne pas appeler directement.
    """
    # ── Verrou exclusif sur la ligne draft ──────────────────────────────────
    # select_for_update() bloque toute autre transaction qui tente d'acquérir
    # le même verrou jusqu'à la fin de cette transaction.
    # On re-fetche depuis la DB pour obtenir l'état le plus récent.
    try:
        draft = DraftOrder.objects.select_for_update().get(pk=draft.pk)
    except DraftOrder.DoesNotExist:
        raise ValueError("Draft not found")

    # ── Garde de statut : rejeu impossible ──────────────────────────────────
    if draft.status in _TERMINAL_DRAFT_STATUSES:
        raise ValueError(f"Draft already consumed (status={draft.status})")

    if draft.status not in _CONSUMABLE_DRAFT_STATUSES:
        raise ValueError(f"Draft in unexpected status: {draft.status}")

    # ── Expiration ───────────────────────────────────────────────────────────
    # On lève ici pour que le verrou soit libéré proprement via le rollback.
    # La mise à jour vers 'expired' en base est gérée par le wrapper externe.
    if draft.is_expired():
        raise ValueError("Draft expired")

    # ── Marquer immédiatement comme consommé (avant toute création) ──────────
    # Écrire le statut terminal ICI garantit qu'une transaction concurrente qui
    # attendait sur le verrou verra ce statut et échouera à la garde ci-dessus.
    new_status = "confirmed_online" if paid else "confirmed_cash"
    draft.status = new_status
    draft.save(update_fields=["status"])

    # ── Créer la commande ────────────────────────────────────────────────────
    subtotal = Decimal(draft.amount) / Decimal(100)
    tax_amount = Decimal("0.00")
    total_amount = subtotal + tax_amount

    order = Order.objects.create(
        restaurant=draft.restaurant,
        order_type="dine_in" if draft.table_number else "takeaway",
        table_number=draft.table_number or "",
        customer_name=draft.customer_name,
        phone=draft.phone,
        status="pending",
        payment_status="paid" if paid else "pending",
        payment_method=draft.payment_method,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        notes="",
        source="guest",
        guest_contact_name=draft.customer_name,
        guest_phone=draft.phone,
        guest_email=draft.email or None,
    )

    # ── Créer les items ──────────────────────────────────────────────────────
    for it in draft.items:
        mi = MenuItem.objects.get(
            id=it["menu_item_id"],
            menu__restaurant=draft.restaurant
        )
        qty = int(it["quantity"])
        unit_price = mi.price
        OrderItem.objects.create(
            order=order,
            menu_item=mi,
            quantity=qty,
            unit_price=unit_price,
            total_price=unit_price * qty,
            customizations=it.get("options") or {},
            special_instructions=""
        )

    return order