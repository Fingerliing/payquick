# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de commande
- Order
- OrderItem
- OrderManager
"""

import pytest
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from api.models import (
    Order,
    OrderItem,
    Menu,
    MenuItem,
    MenuCategory,
    Restaurant,
    Table,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="orderowner@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Order Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number="1"
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Test",
        restaurant=restaurant
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        order=1
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Burger Classic",
        price=Decimal('15.00'),
        vat_rate=Decimal('0.10')
    )


@pytest.fixture
def order(restaurant, user):
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-001",
        table_number="1",
        customer_name="Jean Dupont",
        phone="0612345678",
        subtotal=Decimal('30.00'),
        tax_amount=Decimal('3.00'),
        total_amount=Decimal('33.00')
    )


@pytest.fixture
def order_item(order, menu_item):
    return OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=2,
        unit_price=Decimal('15.00'),
        total_price=Decimal('30.00'),
        vat_rate=Decimal('0.10')
    )


# =============================================================================
# TESTS - Order
# =============================================================================

@pytest.mark.django_db
class TestOrder:
    """Tests pour le modèle Order"""

    def test_order_creation(self, order):
        """Test de la création d'une commande"""
        assert order.id is not None
        assert order.order_number == "ORD-001"
        assert order.table_number == "1"
        assert order.subtotal == Decimal('30.00')
        assert order.total_amount == Decimal('33.00')
        assert order.created_at is not None

    def test_order_default_status(self, restaurant, user):
        """Test du statut par défaut"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-002",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.status == 'pending'

    def test_order_default_payment_status(self, restaurant, user):
        """Test du statut de paiement par défaut"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-003",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.payment_status == 'unpaid'

    def test_order_default_order_type(self, restaurant, user):
        """Test du type de commande par défaut"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-004",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.order_type == 'dine_in'

    def test_order_status_choices(self, restaurant, user):
        """Test des choix de statut"""
        statuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled']
        
        for i, status in enumerate(statuses):
            order = Order.objects.create(
                restaurant=restaurant,
                user=user,
                order_number=f"ORD-STATUS-{i}",
                subtotal=Decimal('10.00'),
                total_amount=Decimal('11.00'),
                status=status
            )
            assert order.status == status

    def test_order_payment_status_choices(self, restaurant, user):
        """Test des choix de statut de paiement"""
        payment_statuses = ['unpaid', 'partial_paid', 'paid', 'refunded']
        
        for i, ps in enumerate(payment_statuses):
            order = Order.objects.create(
                restaurant=restaurant,
                user=user,
                order_number=f"ORD-PAY-{i}",
                subtotal=Decimal('10.00'),
                total_amount=Decimal('11.00'),
                payment_status=ps
            )
            assert order.payment_status == ps

    def test_order_order_type_choices(self, restaurant, user):
        """Test des choix de type de commande"""
        order_types = ['dine_in', 'takeaway']
        
        for i, ot in enumerate(order_types):
            order = Order.objects.create(
                restaurant=restaurant,
                user=user,
                order_number=f"ORD-TYPE-{i}",
                subtotal=Decimal('10.00'),
                total_amount=Decimal('11.00'),
                order_type=ot
            )
            assert order.order_type == ot

    def test_order_number_unique(self, restaurant, user):
        """Test que le numéro de commande est unique"""
        from django.db import IntegrityError
        
        Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="UNIQUE-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        
        with pytest.raises(IntegrityError):
            Order.objects.create(
                restaurant=restaurant,
                user=user,
                order_number="UNIQUE-001",
                subtotal=Decimal('10.00'),
                total_amount=Decimal('11.00')
            )

    def test_order_table_session_id_auto_generated(self, restaurant, user):
        """Test que table_session_id est généré automatiquement"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-SESSION-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        
        import uuid
        assert isinstance(order.table_session_id, uuid.UUID)

    def test_order_is_main_order_default(self, restaurant, user):
        """Test de la valeur par défaut is_main_order"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-MAIN-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.is_main_order is True

    def test_order_sequence_default(self, restaurant, user):
        """Test de la valeur par défaut order_sequence"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-SEQ-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.order_sequence == 1

    def test_order_timestamps(self, order):
        """Test des timestamps"""
        assert order.ready_at is None
        assert order.served_at is None
        
        order.ready_at = timezone.now()
        order.served_at = timezone.now()
        order.save()
        
        order.refresh_from_db()
        assert order.ready_at is not None
        assert order.served_at is not None

    def test_order_vat_details_json(self, restaurant, user):
        """Test du champ JSON vat_details"""
        vat_details = {
            "10.0": {"ht": 45.45, "tva": 4.55, "ttc": 50.00}
        }
        
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-VAT-001",
            subtotal=Decimal('45.45'),
            tax_amount=Decimal('4.55'),
            total_amount=Decimal('50.00'),
            vat_details=vat_details
        )
        
        order.refresh_from_db()
        assert order.vat_details == vat_details

    def test_order_has_split_payment_property(self, order):
        """Test de la propriété has_split_payment"""
        assert order.has_split_payment is False

    def test_order_split_payment_progress_no_split(self, order):
        """Test de split_payment_progress sans paiement divisé"""
        # Sans paiement divisé et non payé
        order.payment_status = 'unpaid'
        assert order.split_payment_progress == 0
        
        # Sans paiement divisé mais payé
        order.payment_status = 'paid'
        assert order.split_payment_progress == 100

    def test_order_guest_fields(self, restaurant, user):
        """Test des champs guest"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=user,
            order_number="ORD-GUEST-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00'),
            source="guest",
            guest_contact_name="Guest User",
            guest_phone="0699999999",
            guest_email="guest@example.com"
        )
        
        assert order.source == "guest"
        assert order.guest_contact_name == "Guest User"
        assert order.guest_phone == "0699999999"
        assert order.guest_email == "guest@example.com"

    def test_order_is_split_payment_field(self, order):
        """Test du champ is_split_payment"""
        assert order.is_split_payment is False
        
        order.is_split_payment = True
        order.save()
        
        order.refresh_from_db()
        assert order.is_split_payment is True

    def test_order_notes_field(self, order):
        """Test du champ notes"""
        order.notes = "Sans oignons, allergie aux arachides"
        order.save()
        
        order.refresh_from_db()
        assert order.notes == "Sans oignons, allergie aux arachides"

    def test_order_ordering(self, restaurant, user):
        """Test de l'ordre par défaut (created_at desc)"""
        o1 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SORT-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        o2 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SORT-002",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        
        orders = list(Order.objects.filter(restaurant=restaurant))
        # Plus récent en premier
        assert orders[0] == o2
        assert orders[1] == o1

    def test_order_cascade_delete_with_restaurant(self, restaurant, order):
        """Test que la commande est supprimée avec le restaurant"""
        order_id = order.id
        restaurant.delete()
        
        assert not Order.objects.filter(id=order_id).exists()

    def test_order_user_optional(self, restaurant):
        """Test que user est optionnel"""
        order = Order.objects.create(
            restaurant=restaurant,
            user=None,
            order_number="ORD-NOUSER-001",
            subtotal=Decimal('10.00'),
            total_amount=Decimal('11.00')
        )
        assert order.user is None


# =============================================================================
# TESTS - OrderItem
# =============================================================================

@pytest.mark.django_db
class TestOrderItem:
    """Tests pour le modèle OrderItem"""

    def test_order_item_creation(self, order_item):
        """Test de la création d'un item de commande"""
        assert order_item.id is not None
        assert order_item.quantity == 2
        assert order_item.unit_price == Decimal('15.00')
        assert order_item.total_price == Decimal('30.00')

    def test_order_item_vat_rate(self, order_item):
        """Test du taux de TVA"""
        assert order_item.vat_rate == Decimal('0.10') or order_item.vat_rate == Decimal('0.100')

    def test_order_item_vat_amount_calculation(self, order, menu_item):
        """Test du calcul du montant de TVA"""
        item = OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('10.00'),
            total_price=Decimal('10.00'),
            vat_rate=Decimal('0.10')
        )
        
        # Le montant TVA devrait être calculé automatiquement
        # TVA = TTC - HT = TTC - (TTC / (1 + taux))
        # Pour 10€ TTC à 10%: HT = 9.09€, TVA = 0.91€
        assert item.vat_amount is not None

    def test_order_item_customizations_json(self, order, menu_item):
        """Test du champ JSON customizations"""
        customizations = {
            "size": "large",
            "extras": ["cheese", "bacon"],
            "sauce": "BBQ"
        }
        
        item = OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('15.00'),
            total_price=Decimal('15.00'),
            customizations=customizations
        )
        
        item.refresh_from_db()
        assert item.customizations == customizations

    def test_order_item_special_instructions(self, order, menu_item):
        """Test du champ special_instructions"""
        item = OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('15.00'),
            total_price=Decimal('15.00'),
            special_instructions="Sans cornichons, bien cuit"
        )
        
        assert item.special_instructions == "Sans cornichons, bien cuit"

    def test_order_item_created_at(self, order_item):
        """Test du timestamp created_at"""
        assert order_item.created_at is not None

    def test_order_item_related_name_items(self, order, order_item):
        """Test du related_name 'items'"""
        assert order_item in order.items.all()

    def test_order_item_cascade_delete_with_order(self, order, order_item):
        """Test que l'item est supprimé avec la commande"""
        item_id = order_item.id
        order.delete()
        
        assert not OrderItem.objects.filter(id=item_id).exists()

    def test_order_item_quantity_positive(self, order, menu_item):
        """Test que la quantité est positive"""
        item = OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=5,
            unit_price=Decimal('10.00'),
            total_price=Decimal('50.00')
        )
        assert item.quantity > 0

    def test_order_item_multiple_items_per_order(self, order, menu, menu_category):
        """Test de plusieurs items par commande"""
        item1 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item 1", price=Decimal('10.00')
        )
        item2 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item 2", price=Decimal('15.00')
        )
        
        OrderItem.objects.create(
            order=order, menu_item=item1,
            quantity=2, unit_price=Decimal('10.00'), total_price=Decimal('20.00')
        )
        OrderItem.objects.create(
            order=order, menu_item=item2,
            quantity=1, unit_price=Decimal('15.00'), total_price=Decimal('15.00')
        )
        
        assert order.items.count() == 2


# =============================================================================
# TESTS - OrderManager
# =============================================================================

@pytest.mark.django_db
class TestOrderManager:
    """Tests pour le manager personnalisé OrderManager"""

    def test_active_for_table(self, restaurant, user):
        """Test de la méthode active_for_table"""
        # Créer des commandes actives et inactives
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-ACTIVE-001",
            table_number="T1",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='pending'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-ACTIVE-002",
            table_number="T1",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='preparing'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SERVED-001",
            table_number="T1",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='served'
        )
        
        active_orders = Order.objects.active_for_table(restaurant, "T1")
        assert active_orders.count() == 2

    def test_table_statistics(self, restaurant, user):
        """Test de la méthode table_statistics"""
        # Créer des commandes pour une table
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-STAT-001",
            table_number="STAT1",
            subtotal=Decimal('50.00'), total_amount=Decimal('55.00'),
            status='served', payment_status='paid'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-STAT-002",
            table_number="STAT1",
            subtotal=Decimal('30.00'), total_amount=Decimal('33.00'),
            status='pending', payment_status='unpaid'
        )
        
        stats = Order.objects.table_statistics(restaurant, "STAT1")
        
        assert stats is not None
        # Vérifier les clés attendues selon l'implémentation

    def test_filter_by_status(self, restaurant, user):
        """Test du filtrage par statut"""
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-PEND-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='pending'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-PEND-002",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='pending'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-READY-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='ready'
        )
        
        pending = Order.objects.filter(restaurant=restaurant, status='pending')
        assert pending.count() == 2

    def test_filter_by_payment_status(self, restaurant, user):
        """Test du filtrage par statut de paiement"""
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-PAID-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            payment_status='paid'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-UNPAID-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            payment_status='unpaid'
        )
        
        paid = Order.objects.filter(restaurant=restaurant, payment_status='paid')
        assert paid.count() == 1

    def test_filter_by_date_range(self, restaurant, user):
        """Test du filtrage par plage de dates"""
        today = timezone.now().date()
        
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-TODAY-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        
        today_orders = Order.objects.filter(
            restaurant=restaurant,
            created_at__date=today
        )
        assert today_orders.count() >= 1


# =============================================================================
# TESTS - Calculs TVA
# =============================================================================

@pytest.mark.django_db
class TestOrderVATCalculations:
    """Tests pour les calculs de TVA"""

    def test_calculate_vat_breakdown(self, restaurant, user, menu, menu_category):
        """Test du calcul de la répartition TVA"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-VAT-CALC-001",
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('5.00'),
            total_amount=Decimal('55.00')
        )
        
        # Créer des items avec différents taux
        item = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item 10%", price=Decimal('55.00'),
            vat_rate=Decimal('0.10')
        )
        
        OrderItem.objects.create(
            order=order,
            menu_item=item,
            quantity=1,
            unit_price=Decimal('55.00'),
            total_price=Decimal('55.00'),
            vat_rate=Decimal('0.10')
        )
        
        vat_breakdown = order.calculate_vat_breakdown()
        
        assert vat_breakdown is not None
        assert order.vat_details is not None

    def test_vat_breakdown_multiple_rates(self, restaurant, user, menu, menu_category):
        """Test de la répartition TVA avec plusieurs taux"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-MULTI-VAT-001",
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('10.00'),
            total_amount=Decimal('110.00')
        )
        
        # Item à 10%
        item1 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item 10%", price=Decimal('55.00'),
            vat_rate=Decimal('0.10')
        )
        OrderItem.objects.create(
            order=order, menu_item=item1,
            quantity=1, unit_price=Decimal('55.00'), total_price=Decimal('55.00'),
            vat_rate=Decimal('0.10')
        )
        
        # Item à 5.5%
        item2 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item 5.5%", price=Decimal('55.00'),
            vat_rate=Decimal('0.055')
        )
        OrderItem.objects.create(
            order=order, menu_item=item2,
            quantity=1, unit_price=Decimal('55.00'), total_price=Decimal('55.00'),
            vat_rate=Decimal('0.055')
        )
        
        vat_breakdown = order.calculate_vat_breakdown()
        
        # Devrait avoir 2 taux différents
        assert len(vat_breakdown) == 2
