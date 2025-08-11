# orders/services.py
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from api.models import Order, OrderItem, DraftOrder
from api.models import MenuItem

@transaction.atomic
def create_order_from_draft(draft: DraftOrder, paid: bool) -> Order:
    if draft.is_expired():
        draft.status = "expired"
        draft.save(update_fields=["status"])
        raise ValueError("Draft expired")

    # Montants en Decimal (euros)
    subtotal = Decimal(draft.amount) / Decimal(100)
    tax_amount = Decimal("0.00")  # ajuste si tu gères la TVA
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

    # Items (prix source = MenuItem.price en euros)
    for it in draft.items:
        mi = MenuItem.objects.get(
            id=it["menu_item_id"],
            menu__restaurant=draft.restaurant
        )
        qty = int(it["quantity"])
        unit_price = mi.price
        OrderItem.objects.create(
            order=order,
            # ⚠️ si OrderItem.menu_item pointe déjà sur MenuItem, garde "menu_item=mi"
            # sinon, adapte ou migre le FK comme recommandé
            menu_item=mi,                # <— idéalement FK->MenuItem
            quantity=qty,
            unit_price=unit_price,
            total_price=unit_price * qty,
            customizations=it.get("options") or {},
            special_instructions=""
        )

    return order
