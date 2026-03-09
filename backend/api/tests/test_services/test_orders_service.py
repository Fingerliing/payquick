# -*- coding: utf-8 -*-
"""
Tests unitaires pour api/services/orders.py — create_order_from_draft

Axes couverts :
  1. Chemin nominal (cash / online)
  2. Protection anti-rejeu séquentiel
  3. Protection anti-rejeu via simulation de concurrence
  4. Expiration du draft
  5. Statuts terminaux / inattendus
  6. Atomicité de la transaction (rollback complet si Order.create échoue)
  7. Montants centimes → euros
  8. Items correctement créés
  9. Draft inexistant
"""

import threading
import pytest
from decimal import Decimal
from unittest.mock import patch
from django.utils import timezone
from django.db import transaction, IntegrityError

from api.models import DraftOrder, Order, OrderItem, Restaurant, Menu, MenuItem
from api.services.orders import create_order_from_draft
from api.tests.factories import RestaurantFactory


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def restaurant(db):
    return RestaurantFactory()


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(name="Menu Test", restaurant=restaurant)


@pytest.fixture
def menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Burger",
        price=Decimal("12.50"),
        is_available=True,
    )


@pytest.fixture
def second_menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Frites",
        price=Decimal("5.00"),
        is_available=True,
    )


@pytest.fixture
def draft_cash(restaurant, menu_item):
    """Draft cash prêt à être consommé (statut 'created')."""
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="T01",
        items=[{"menu_item_id": menu_item.id, "quantity": 2}],
        amount=2500,           # 25.00 € en centimes
        currency="eur",
        customer_name="Alice",
        phone="+33612345678",
        email="alice@example.com",
        payment_method="cash",
        status="created",
        expires_at=timezone.now() + timezone.timedelta(minutes=15),
    )


@pytest.fixture
def draft_online(restaurant, menu_item):
    """Draft online prêt à être consommé (pi_succeeded)."""
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="T02",
        items=[{"menu_item_id": menu_item.id, "quantity": 1}],
        amount=1250,
        currency="eur",
        customer_name="Bob",
        phone="+33698765432",
        payment_method="online",
        status="pi_succeeded",
        expires_at=timezone.now() + timezone.timedelta(minutes=15),
    )


@pytest.fixture
def draft_multi_items(restaurant, menu_item, second_menu_item):
    """Draft avec plusieurs types d'articles."""
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="T03",
        items=[
            {"menu_item_id": menu_item.id, "quantity": 2},       # 2 × 12.50 = 25.00
            {"menu_item_id": second_menu_item.id, "quantity": 3}, # 3 ×  5.00 = 15.00
        ],
        amount=4000,  # 40.00 € en centimes
        currency="eur",
        customer_name="Charlie",
        phone="+33611223344",
        payment_method="cash",
        status="created",
        expires_at=timezone.now() + timezone.timedelta(minutes=15),
    )


# =============================================================================
# 1. CHEMIN NOMINAL
# =============================================================================

@pytest.mark.django_db
class TestHappyPath:

    def test_cash_creates_order(self, draft_cash):
        """Un draft cash valide produit exactement une Order."""
        order = create_order_from_draft(draft_cash, paid=False)

        assert order is not None
        assert order.pk is not None
        assert Order.objects.filter(pk=order.pk).exists()

    def test_cash_payment_status_pending(self, draft_cash):
        """Une commande cash doit être en attente de paiement (pas encore encaissé)."""
        order = create_order_from_draft(draft_cash, paid=False)
        assert order.payment_status == "pending"

    def test_online_payment_status_paid(self, draft_online):
        """Une commande online (paid=True) doit être marquée comme payée."""
        order = create_order_from_draft(draft_online, paid=True)
        assert order.payment_status == "paid"

    def test_draft_status_confirmed_cash_after_cash(self, draft_cash):
        """Le draft doit passer à 'confirmed_cash' après une confirmation espèces."""
        create_order_from_draft(draft_cash, paid=False)
        draft_cash.refresh_from_db()
        assert draft_cash.status == "confirmed_cash"

    def test_draft_status_confirmed_online_after_online(self, draft_online):
        """Le draft doit passer à 'confirmed_online' après une confirmation online."""
        create_order_from_draft(draft_online, paid=True)
        draft_online.refresh_from_db()
        assert draft_online.status == "confirmed_online"

    def test_order_fields_copied_from_draft(self, draft_cash):
        """Les champs de l'Order doivent correspondre au draft."""
        order = create_order_from_draft(draft_cash, paid=False)

        assert order.restaurant == draft_cash.restaurant
        assert order.table_number == draft_cash.table_number
        assert order.customer_name == draft_cash.customer_name
        assert order.phone == draft_cash.phone
        assert order.guest_phone == draft_cash.phone
        assert order.source == "guest"

    def test_order_type_dine_in_with_table(self, draft_cash):
        """Un draft avec table_number doit créer une commande de type dine_in."""
        order = create_order_from_draft(draft_cash, paid=False)
        assert order.order_type == "dine_in"

    def test_order_type_takeaway_without_table(self, restaurant, menu_item):
        """Un draft sans table_number doit créer une commande de type takeaway."""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            table_number=None,
            items=[{"menu_item_id": menu_item.id, "quantity": 1}],
            amount=1250,
            currency="eur",
            customer_name="Dave",
            phone="+33600000001",
            payment_method="cash",
            status="created",
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )
        order = create_order_from_draft(draft, paid=False)
        assert order.order_type == "takeaway"


# =============================================================================
# 2. MONTANTS centimes → euros
# =============================================================================

@pytest.mark.django_db
class TestAmountConversion:

    def test_subtotal_converted_from_cents(self, draft_cash):
        """2500 centimes → 25.00 euros de subtotal."""
        order = create_order_from_draft(draft_cash, paid=False)
        assert order.subtotal == Decimal("25.00")

    def test_total_amount_equals_subtotal_when_no_tax(self, draft_cash):
        """Sans TVA, total_amount == subtotal."""
        order = create_order_from_draft(draft_cash, paid=False)
        assert order.total_amount == order.subtotal

    def test_amount_conversion_precision(self, restaurant, menu_item):
        """Test la précision avec un montant non-entier : 1999 centimes = 19.99 €."""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[{"menu_item_id": menu_item.id, "quantity": 1}],
            amount=1999,
            currency="eur",
            customer_name="Eve",
            phone="+33600000002",
            payment_method="cash",
            status="created",
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )
        order = create_order_from_draft(draft, paid=False)
        assert order.subtotal == Decimal("19.99")


# =============================================================================
# 3. ITEMS
# =============================================================================

@pytest.mark.django_db
class TestOrderItems:

    def test_items_are_created(self, draft_cash, menu_item):
        """Les OrderItems correspondant au draft doivent être créés."""
        order = create_order_from_draft(draft_cash, paid=False)

        items = OrderItem.objects.filter(order=order)
        assert items.count() == 1

    def test_item_quantity(self, draft_cash, menu_item):
        """La quantité de chaque OrderItem doit correspondre au draft."""
        order = create_order_from_draft(draft_cash, paid=False)
        item = OrderItem.objects.get(order=order)
        assert item.quantity == 2

    def test_item_unit_price(self, draft_cash, menu_item):
        """Le prix unitaire doit être copié depuis MenuItem.price."""
        order = create_order_from_draft(draft_cash, paid=False)
        item = OrderItem.objects.get(order=order)
        assert item.unit_price == Decimal("12.50")

    def test_item_total_price(self, draft_cash, menu_item):
        """total_price = unit_price × quantity."""
        order = create_order_from_draft(draft_cash, paid=False)
        item = OrderItem.objects.get(order=order)
        assert item.total_price == Decimal("25.00")  # 12.50 × 2

    def test_multiple_items_all_created(self, draft_multi_items):
        """Tous les types d'articles du draft doivent générer des OrderItems."""
        order = create_order_from_draft(draft_multi_items, paid=False)
        assert OrderItem.objects.filter(order=order).count() == 2

    def test_multiple_items_correct_totals(self, draft_multi_items, menu_item, second_menu_item):
        """Chaque item a son propre prix et total."""
        order = create_order_from_draft(draft_multi_items, paid=False)

        burger_item = OrderItem.objects.get(order=order, menu_item=menu_item)
        frites_item = OrderItem.objects.get(order=order, menu_item=second_menu_item)

        assert burger_item.quantity == 2
        assert burger_item.total_price == Decimal("25.00")
        assert frites_item.quantity == 3
        assert frites_item.total_price == Decimal("15.00")


# =============================================================================
# 4. PROTECTION ANTI-REJEU — séquentiel
# =============================================================================

@pytest.mark.django_db
class TestSequentialReplayProtection:
    """
    Teste que deux appels séquentiels au même draft sont bloqués.
    C'est le scénario "double clic" ou "retry immédiat du client".
    """

    def test_second_call_raises_value_error(self, draft_cash):
        """
        Le premier appel réussit ; le second lève ValueError 'already consumed'.
        C'est la garde de statut qui joue ici (draft.status est déjà 'confirmed_cash').
        """
        create_order_from_draft(draft_cash, paid=False)

        with pytest.raises(ValueError, match="already consumed"):
            create_order_from_draft(draft_cash, paid=False)

    def test_second_call_creates_no_extra_order(self, draft_cash):
        """
        Une seule Order doit exister même si le client rejoue la requête.
        """
        create_order_from_draft(draft_cash, paid=False)
        order_count_after_first = Order.objects.count()

        try:
            create_order_from_draft(draft_cash, paid=False)
        except ValueError:
            pass

        assert Order.objects.count() == order_count_after_first

    def test_confirmed_cash_draft_immediately_blocked(self, draft_cash, restaurant, menu_item):
        """
        Un draft dont le statut est déjà 'confirmed_cash' est rejeté
        dès le premier appel — même sans appel préalable dans ce test.
        """
        draft_cash.status = "confirmed_cash"
        draft_cash.save(update_fields=["status"])

        with pytest.raises(ValueError, match="already consumed"):
            create_order_from_draft(draft_cash, paid=False)

    @pytest.mark.parametrize("terminal_status", [
        "confirmed_cash",
        "confirmed_online",
        "expired",
        "failed",
    ])
    def test_all_terminal_statuses_blocked(self, draft_cash, terminal_status):
        """
        Chaque statut terminal doit bloquer la création d'une commande.
        """
        draft_cash.status = terminal_status
        draft_cash.save(update_fields=["status"])

        with pytest.raises(ValueError, match="already consumed"):
            create_order_from_draft(draft_cash, paid=False)

    def test_unexpected_status_raises_value_error(self, draft_cash):
        """
        Un statut inconnu (ni consommable ni terminal) lève ValueError
        avec un message 'unexpected status'.
        """
        draft_cash.status = "mystery_state"
        draft_cash.save(update_fields=["status"])

        with pytest.raises(ValueError, match="unexpected status"):
            create_order_from_draft(draft_cash, paid=False)


# =============================================================================
# 5. PROTECTION ANTI-REJEU — simulation de concurrence
# =============================================================================

@pytest.mark.django_db(transaction=True)
class TestConcurrentReplayProtection:
    """
    Teste le comportement sous requêtes concurrentes.

    On ne peut pas acquérir deux SELECT FOR UPDATE simultanément dans le même
    processus de test, mais on peut vérifier que :
    - Le statut est écrit en premier dans la transaction (avant Order.create).
    - Une transaction en attente du verrou verra le statut terminal et échouera.

    La mécanique est validée ici en simulant l'ordre d'exécution avec des threads
    et en vérifiant qu'une seule Order est créée.
    """

    def test_concurrent_requests_produce_one_order_only(self, restaurant, menu_item):
        """
        Deux threads appellent create_order_from_draft sur le même draft
        simultanément. Au final, exactement une Order doit exister.
        """
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            table_number="T10",
            items=[{"menu_item_id": menu_item.id, "quantity": 1}],
            amount=1250,
            currency="eur",
            customer_name="Concurrent",
            phone="+33600000099",
            payment_method="cash",
            status="created",
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )

        results = {"orders": 0, "errors": 0}
        lock = threading.Lock()

        def attempt():
            try:
                create_order_from_draft(draft, paid=False)
                with lock:
                    results["orders"] += 1
            except ValueError:
                with lock:
                    results["errors"] += 1

        t1 = threading.Thread(target=attempt)
        t2 = threading.Thread(target=attempt)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactement une commande créée, l'autre thread a levé ValueError
        assert results["orders"] + results["errors"] == 2
        assert results["orders"] == 1
        assert Order.objects.filter(restaurant=restaurant).count() == 1

    def test_select_for_update_refetches_from_db(self, draft_cash):
        """
        Vérifie que la fonction re-fetche le draft depuis la DB (pas l'objet Python
        passé en argument), afin de voir le statut le plus récent.
        """
        # On simule : l'objet Python en mémoire dit "created" mais la DB dit
        # "confirmed_cash" (une autre requête l'aurait déjà consommé).
        DraftOrder.objects.filter(pk=draft_cash.pk).update(status="confirmed_cash")

        # L'objet Python local n'a pas encore refresh_from_db — il dit "created".
        assert draft_cash.status == "created"

        # create_order_from_draft doit lire depuis la DB et rejeter le draft.
        with pytest.raises(ValueError, match="already consumed"):
            create_order_from_draft(draft_cash, paid=False)


# =============================================================================
# 6. EXPIRATION
# =============================================================================

@pytest.mark.django_db
class TestDraftExpiration:

    def test_expired_draft_raises_value_error(self, draft_cash):
        """Un draft dont la date d'expiration est passée doit lever ValueError."""
        draft_cash.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        draft_cash.save(update_fields=["expires_at"])

        with pytest.raises(ValueError, match="expired"):
            create_order_from_draft(draft_cash, paid=False)

    def test_expired_draft_status_updated(self, draft_cash):
        """Le statut du draft doit passer à 'expired' après tentative sur draft expiré."""
        draft_cash.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        draft_cash.save(update_fields=["expires_at"])

        with pytest.raises(ValueError):
            create_order_from_draft(draft_cash, paid=False)

        draft_cash.refresh_from_db()
        assert draft_cash.status == "expired"

    def test_expired_draft_creates_no_order(self, draft_cash):
        """Aucune Order ne doit être créée pour un draft expiré."""
        initial_count = Order.objects.count()
        draft_cash.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        draft_cash.save(update_fields=["expires_at"])

        with pytest.raises(ValueError):
            create_order_from_draft(draft_cash, paid=False)

        assert Order.objects.count() == initial_count

    def test_not_yet_expired_draft_succeeds(self, draft_cash):
        """Un draft dont l'expiration est dans le futur doit être accepté."""
        draft_cash.expires_at = timezone.now() + timezone.timedelta(seconds=30)
        draft_cash.save(update_fields=["expires_at"])

        order = create_order_from_draft(draft_cash, paid=False)
        assert order is not None


# =============================================================================
# 7. ATOMICITÉ DE LA TRANSACTION
# =============================================================================

@pytest.mark.django_db
class TestTransactionAtomicity:
    """
    Vérifie que si la création de l'Order échoue, la mise à jour du statut
    du draft est également annulée (tout-ou-rien).
    """

    def test_draft_status_rolled_back_if_order_create_fails(self, draft_cash):
        """
        Si Order.objects.create lève une exception, le draft doit revenir à
        son statut initial ('created') — pas rester coincé à 'confirmed_cash'.
        """
        with patch("api.services.orders.Order.objects.create",
                   side_effect=IntegrityError("simulated db failure")):
            with pytest.raises(IntegrityError):
                create_order_from_draft(draft_cash, paid=False)

        draft_cash.refresh_from_db()
        # La transaction a été rollbackée : le statut doit être 'created', pas 'confirmed_cash'
        assert draft_cash.status == "created"

    def test_no_order_created_if_transaction_fails(self, draft_cash):
        """
        Aucune Order persistée si la transaction est annulée.
        """
        initial_count = Order.objects.count()

        with patch("api.services.orders.Order.objects.create",
                   side_effect=IntegrityError("simulated db failure")):
            with pytest.raises(IntegrityError):
                create_order_from_draft(draft_cash, paid=False)

        assert Order.objects.count() == initial_count

    def test_no_items_created_if_transaction_fails(self, draft_cash, menu_item):
        """
        Aucun OrderItem persisté si la transaction est annulée.
        """
        initial_count = OrderItem.objects.count()

        with patch("api.services.orders.OrderItem.objects.create",
                   side_effect=IntegrityError("simulated item failure")):
            with pytest.raises(IntegrityError):
                create_order_from_draft(draft_cash, paid=False)

        # Ni Order ni OrderItem ne doivent persister
        assert OrderItem.objects.count() == initial_count

    def test_draft_status_rolled_back_if_item_create_fails(self, draft_cash):
        """
        Même si c'est la création des items qui échoue, le statut du draft
        doit revenir à 'created' (pas rester 'confirmed_cash').
        """
        with patch("api.services.orders.OrderItem.objects.create",
                   side_effect=IntegrityError("simulated item failure")):
            with pytest.raises(IntegrityError):
                create_order_from_draft(draft_cash, paid=False)

        draft_cash.refresh_from_db()
        assert draft_cash.status == "created"


# =============================================================================
# 8. DRAFT INEXISTANT
# =============================================================================

@pytest.mark.django_db
class TestDraftNotFound:

    def test_nonexistent_draft_pk_raises_value_error(self, restaurant, menu_item):
        """
        Passer un draft dont le pk a été supprimé entre la vue et le service
        doit lever ValueError 'Draft not found'.

        Cela couvre le cas où la ligne est supprimée entre le get_object_or_404
        de la vue et le select_for_update() du service.
        """
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[{"menu_item_id": menu_item.id, "quantity": 1}],
            amount=1250,
            currency="eur",
            customer_name="Ghost",
            phone="+33600000050",
            payment_method="cash",
            status="created",
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )
        # Supprimer depuis la DB sans toucher à l'objet Python
        DraftOrder.objects.filter(pk=draft.pk).delete()

        with pytest.raises(ValueError, match="not found"):
            create_order_from_draft(draft, paid=False)