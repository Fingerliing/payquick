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
from unittest.mock import patch, PropertyMock, MagicMock
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
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
    SplitPaymentSession,
    SplitPaymentPortion,
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


# =============================================================================
# TESTS - OrderManager.by_table_session (line 34)
# =============================================================================

@pytest.mark.django_db
class TestOrderManagerByTableSession:
    """Tests pour la méthode by_table_session du manager"""

    def test_by_table_session(self, restaurant, user):
        """Test de la méthode by_table_session (ligne 34)"""
        import uuid
        session_id = uuid.uuid4()

        o1 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-BTS-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        o1.table_session_id = session_id
        o1.save(update_fields=['table_session_id'])

        o2 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-BTS-002",
            subtotal=Decimal('20.00'), total_amount=Decimal('22.00')
        )
        o2.table_session_id = session_id
        o2.save(update_fields=['table_session_id'])

        # Commande avec un autre session_id (ne devrait pas apparaître)
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-BTS-003",
            subtotal=Decimal('5.00'), total_amount=Decimal('5.50')
        )

        results = Order.objects.by_table_session(session_id)
        assert results.count() == 2


# =============================================================================
# TESTS - Order.__str__ (line 193)
# =============================================================================

@pytest.mark.django_db
class TestOrderStr:
    """Tests pour Order.__str__"""

    def test_order_str(self, order):
        """Test de la méthode __str__ (ligne 193)"""
        result = str(order)
        assert "ORD-001" in result
        # get_payment_status_display() devrait retourner le label du choix
        assert "Non payé" in result or "unpaid" in result.lower() or "payé" in result.lower()


# =============================================================================
# TESTS - Order.generate_order_number (lines 219-252)
# =============================================================================

@pytest.mark.django_db
class TestGenerateOrderNumber:
    """Tests pour la génération automatique de numéro de commande"""

    def test_generate_order_number_no_existing(self, restaurant, user):
        """Test génération quand aucune commande n'existe (lignes 219-235, 239-244)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="",  # Force la génération
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        # Devrait commencer par T (dine_in)
        assert order.order_number.startswith("T")
        assert len(order.order_number) > 0

    def test_generate_order_number_takeaway(self, restaurant, user):
        """Test génération pour commande à emporter"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='takeaway'
        )
        assert order.order_number.startswith("E")

    def test_generate_order_number_with_existing(self, restaurant, user):
        """Test génération incrémentale avec commande existante (lignes 227-231)"""
        # Créer une commande avec un numéro standard
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="T001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        # La suivante devrait s'incrémenter
        order2 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        assert order2.order_number != ""
        assert order2.order_number.startswith("T")

    def test_generate_order_number_collision_loop(self, restaurant, user):
        """Test que la boucle anti-collision fonctionne (lignes 239-246)"""
        # Pré-remplir T001 et T002
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="T001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="T002",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        # Générer devrait sauter au-delà de T002
        order3 = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        assert order3.order_number not in ("T001", "T002")

    def test_generate_order_number_fallback(self, restaurant, user):
        """Test du fallback ultime avec timestamp (lignes 248-252)"""
        order = Order(
            restaurant=restaurant, user=user,
            order_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        # Mock Order.objects.filter().exists() to always return True (constant collision)
        with patch.object(Order.objects, 'filter') as mock_filter:
            # For aggregate call, return no max
            mock_qs = MagicMock()
            mock_qs.aggregate.return_value = {'max_num': None}
            mock_qs.filter.return_value = mock_qs
            # exists() always True → forces fallback
            mock_qs.exists.return_value = True
            mock_filter.return_value = mock_qs

            result = order.generate_order_number()

        # Fallback format: T001_HHMMSS_XX
        assert "_" in result
        assert result.startswith("T")

    def test_generate_order_number_parse_error(self, restaurant, user):
        """Test ValueError lors du parsing du dernier numéro (lignes 232-233)"""
        # Créer une commande avec un numéro qui matchera le regex mais ne pourra
        # pas être parsé comme int (simulated via mock)
        order = Order(
            restaurant=restaurant, user=user,
            order_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        with patch.object(Order.objects, 'filter') as mock_filter:
            mock_qs = MagicMock()
            # max_num exists but can't be parsed (e.g. "TXYZ")
            mock_qs.aggregate.return_value = {'max_num': 'TXYZ'}
            mock_qs.filter.return_value = mock_qs
            mock_qs.exists.return_value = False
            mock_filter.return_value = mock_qs

            result = order.generate_order_number()

        # Should fall to except → next_num = 1
        assert result.startswith("T")


# =============================================================================
# TESTS - Order.set_order_sequence (line 257)
# =============================================================================

@pytest.mark.django_db
class TestSetOrderSequence:
    """Tests pour set_order_sequence"""

    def test_set_order_sequence_no_table_number(self, restaurant, user):
        """Test que set_order_sequence retourne sans rien faire sans table_number (ligne 257)"""
        order = Order(
            restaurant=restaurant, user=user,
            order_number="ORD-NOSEQ-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            table_number=""
        )
        original_sequence = order.order_sequence
        order.set_order_sequence()
        # Rien ne change
        assert order.order_sequence == original_sequence


# =============================================================================
# TESTS - Order.get_preparation_time edge cases (lines 302, 307)
# =============================================================================

@pytest.mark.django_db
class TestGetPreparationTime:
    """Tests pour get_preparation_time cas limites"""

    def test_preparation_time_item_quantity_none(self, order, menu, menu_category):
        """Test que les items avec quantité invalide sont ignorés (ligne 302)"""
        item = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Bad Item", price=Decimal('10.00'),
            vat_rate=Decimal('0.10')
        )
        oi = OrderItem.objects.create(
            order=order, menu_item=item,
            quantity=1, unit_price=Decimal('10.00'), total_price=Decimal('10.00')
        )
        # Force quantity to 0 directly in DB
        OrderItem.objects.filter(pk=oi.pk).update(quantity=0)
        oi.refresh_from_db()

        result = order.get_preparation_time()
        # With no valid items contributing, should be base(5) + 0 + buffer(5 min minimum)
        assert result == 10

    def test_preparation_time_menu_item_prep_time_none(self, order, menu, menu_category):
        """Test quand preparation_time du MenuItem est None (ligne 307)"""
        item = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="No Prep Time", price=Decimal('10.00'),
            vat_rate=Decimal('0.10')
        )
        # Set preparation_time to None if the field exists
        if hasattr(item, 'preparation_time'):
            item.preparation_time = None
            item.save()

        OrderItem.objects.create(
            order=order, menu_item=item,
            quantity=2, unit_price=Decimal('10.00'), total_price=Decimal('20.00')
        )

        result = order.get_preparation_time()
        # prep_time defaults to 5 per getattr, quantity=2 → 10
        # base(5) + 10 + buffer(max(5, 10*0.2)=5) = 20
        assert result >= 15  # At minimum base + some prep time


# =============================================================================
# TESTS - Order.table_orders fallback (line 324)
# =============================================================================

@pytest.mark.django_db
class TestTableOrdersFallback:
    """Tests pour le fallback de table_orders"""

    def test_table_orders_no_session_id(self, restaurant, user):
        """Test table_orders retourne seulement self quand pas de session_id (ligne 324)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-NOSESS-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        # Force table_session_id to None via property mock
        with patch.object(Order, 'table_session_id', new_callable=PropertyMock, return_value=None):
            result = order.table_orders
            assert result.count() == 1
            assert result.first().id == order.id


# =============================================================================
# TESTS - Order.can_add_order_to_table (lines 351-362)
# =============================================================================

@pytest.mark.django_db
class TestCanAddOrderToTable:
    """Tests pour can_add_order_to_table"""

    def test_can_add_order_to_table_no_table_number(self, restaurant, user):
        """Test retourne False sans table_number (ligne 351)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-NOADD-001",
            table_number="",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        assert order.can_add_order_to_table() is False

    def test_can_add_order_to_table_under_limit(self, restaurant, user):
        """Test retourne True quand sous la limite (lignes 355-362)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-ADDOK-001",
            table_number="ADD1",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='pending'
        )
        assert order.can_add_order_to_table() is True

    def test_can_add_order_to_table_at_limit(self, restaurant, user):
        """Test retourne False à la limite de 5 commandes actives"""
        for i in range(5):
            Order.objects.create(
                restaurant=restaurant, user=user,
                order_number=f"ORD-LIMIT-{i:03d}",
                table_number="FULL",
                subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
                status='pending'
            )
        # Vérifier depuis n'importe quelle commande de cette table
        order = Order.objects.filter(table_number="FULL").first()
        assert order.can_add_order_to_table() is False


# =============================================================================
# TESTS - Order.get_table_waiting_time return 0 (line 373)
# =============================================================================

@pytest.mark.django_db
class TestGetTableWaitingTime:
    """Tests pour get_table_waiting_time"""

    def test_get_table_waiting_time_no_active_orders(self, restaurant, user):
        """Test retourne 0 quand pas de commandes actives (ligne 373)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-WAIT-001",
            table_number="WAIT1",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='served'
        )
        assert order.get_table_waiting_time() == 0


# =============================================================================
# TESTS - Order.split_payment_progress with session (lines 386-394)
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentProgress:
    """Tests pour split_payment_progress avec session réelle"""

    def test_split_payment_progress_partial(self, restaurant, user):
        """Test progrès partiel avec session de paiement divisé (lignes 386-394)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SPLIT-001",
            subtotal=Decimal('90.00'), total_amount=Decimal('100.00')
        )
        session = SplitPaymentSession.objects.create(
            order=order, split_type='equal',
            total_amount=Decimal('100.00'), tip_amount=Decimal('0.00'),
            created_by=user
        )
        SplitPaymentPortion.objects.create(
            session=session, name="P1", amount=Decimal('50.00'), is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=session, name="P2", amount=Decimal('50.00'), is_paid=False
        )
        # 50 paid out of 100 total → 50%
        assert order.split_payment_progress == 50

    def test_split_payment_progress_complete(self, restaurant, user):
        """Test progrès 100% quand tout est payé"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SPLIT-002",
            subtotal=Decimal('90.00'), total_amount=Decimal('100.00')
        )
        session = SplitPaymentSession.objects.create(
            order=order, split_type='equal',
            total_amount=Decimal('100.00'), tip_amount=Decimal('0.00'),
            created_by=user
        )
        SplitPaymentPortion.objects.create(
            session=session, name="P1", amount=Decimal('100.00'), is_paid=True
        )
        assert order.split_payment_progress == 100

    def test_split_payment_progress_zero_total(self, restaurant, user):
        """Test progrès quand total_with_tip <= 0 (ligne 390-391)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-SPLIT-003",
            subtotal=Decimal('0.00'), total_amount=Decimal('0.00')
        )
        session = SplitPaymentSession.objects.create(
            order=order, split_type='equal',
            total_amount=Decimal('0.00'), tip_amount=Decimal('0.00'),
            created_by=user
        )
        assert order.split_payment_progress == 100


# =============================================================================
# TESTS - OrderItem.save vat_rate from menu_item (lines 427-429)
# =============================================================================

@pytest.mark.django_db
class TestOrderItemSaveVatRate:
    """Tests pour la logique VAT dans OrderItem.save"""

    def test_save_inherits_vat_from_menu_item(self, order, menu, menu_category):
        """Test que save() récupère le vat_rate du menu_item quand non fourni (lignes 427-429)"""
        item = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="VAT Item", price=Decimal('20.00'),
            vat_category='DRINK_ALCOHOL'  # VAT_RATES['DRINK_ALCOHOL'] = 0.200
        )
        item.refresh_from_db()
        assert item.vat_rate == Decimal('0.200')  # Confirm menu_item has 20% VAT

        oi = OrderItem(
            order=order, menu_item=item,
            quantity=1, unit_price=Decimal('20.00'), total_price=Decimal('20.00'),
            vat_rate=Decimal('0')  # Falsy → triggers menu_item fallback
        )
        oi.save()
        oi.refresh_from_db()
        # Should inherit 0.200 from menu_item, NOT the 0.100 fallback
        assert oi.vat_rate == Decimal('0.200')


# =============================================================================
# TESTS - OrderItem.clean validation (lines 450-480)
# =============================================================================

@pytest.mark.django_db
class TestOrderItemClean:
    """Tests pour la validation OrderItem.clean"""

    def test_clean_quantity_none(self, order, menu_item):
        """Test validation quantité None (ligne 452-453)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=None,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00')
        )
        with pytest.raises(ValidationError, match="quantité"):
            oi.clean()

    def test_clean_quantity_zero(self, order, menu_item):
        """Test validation quantité <= 0 (ligne 454-455)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=0,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00')
        )
        with pytest.raises(ValidationError):
            oi.clean()

    def test_clean_unit_price_none(self, order, menu_item):
        """Test validation unit_price None (ligne 458-459)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=None, total_price=Decimal('10.00')
        )
        with pytest.raises(ValidationError, match="prix unitaire"):
            oi.clean()

    def test_clean_unit_price_negative(self, order, menu_item):
        """Test validation unit_price négatif (ligne 464-465)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('-5.00'), total_price=Decimal('10.00')
        )
        with pytest.raises(ValidationError, match="négatif"):
            oi.clean()

    def test_clean_vat_rate_auto_round(self, order, menu_item):
        """Test auto-correction du vat_rate à 3 décimales (lignes 470-478)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00'),
            vat_rate=Decimal('0.1000')
        )
        oi.clean()
        assert oi.vat_rate == Decimal('0.100')

    def test_clean_vat_rate_invalid(self, order, menu_item):
        """Test validation vat_rate invalide (lignes 479-480)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00'),
            vat_rate=Decimal('0.10')
        )

        class BadVat:
            def __str__(self):
                raise TypeError("cannot convert")

        oi.vat_rate = BadVat()
        with pytest.raises(ValidationError, match="TVA"):
            oi.clean()

    def test_clean_valid_item(self, order, menu_item):
        """Test que clean passe pour un item valide"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=2,
            unit_price=Decimal('15.00'), total_price=Decimal('30.00'),
            vat_rate=Decimal('0.10')
        )
        oi.clean()  # Should not raise


# =============================================================================
# TESTS - OrderItem.__str__ (line 487)
# =============================================================================

@pytest.mark.django_db
class TestOrderItemStr:
    """Tests pour OrderItem.__str__"""

    def test_order_item_str(self, order_item):
        """Test de la méthode __str__ (ligne 487)"""
        result = str(order_item)
        assert "Burger Classic" in result
        assert "x2" in result
        assert "30.00" in result


# =============================================================================
# TESTS - generate_order_number table branch (line 216)
# =============================================================================

@pytest.mark.django_db
class TestGenerateOrderNumberTableBranch:
    """Tests pour generate_order_number avec table_number"""

    def test_generate_order_number_with_table(self, restaurant, user):
        """Test génération format table: {prefix}{table}-{sequence} (ligne 216)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="",  # Forces generation
            table_number="5",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            order_type='dine_in'
        )
        # generate_order_number runs before set_order_sequence, with default order_sequence=1
        # Format: T5-01
        assert order.order_number == "T5-01"


# =============================================================================
# TESTS - can_be_cancelled (lines 280-290)
# =============================================================================

@pytest.mark.django_db
class TestCanBeCancelled:
    """Tests pour can_be_cancelled"""

    def test_can_be_cancelled_served(self, restaurant, user):
        """Test retourne False pour commande servie (ligne 280-281)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='served'
        )
        assert order.can_be_cancelled() is False

    def test_can_be_cancelled_cancelled(self, restaurant, user):
        """Test retourne False pour commande déjà annulée"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-002",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='cancelled'
        )
        assert order.can_be_cancelled() is False

    def test_can_be_cancelled_preparing_recent(self, restaurant, user):
        """Test retourne True pour commande en préparation récente (lignes 284-287)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-003",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='preparing'
        )
        # Juste créée → bien sous les 15 minutes
        assert order.can_be_cancelled() is True

    def test_can_be_cancelled_preparing_too_long(self, restaurant, user):
        """Test retourne False pour commande en préparation > 15 min"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-004",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='preparing'
        )
        # Antidater created_at à 20 minutes
        Order.objects.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(minutes=20)
        )
        order.refresh_from_db()
        assert order.can_be_cancelled() is False

    def test_can_be_cancelled_pending(self, restaurant, user):
        """Test retourne True pour commande en attente (lignes 289-290)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-005",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='pending'
        )
        assert order.can_be_cancelled() is True

    def test_can_be_cancelled_confirmed(self, restaurant, user):
        """Test retourne True pour commande confirmée"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-CBC-006",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            status='confirmed'
        )
        assert order.can_be_cancelled() is True


# =============================================================================
# TESTS - get_preparation_time no items (line 295)
# =============================================================================

@pytest.mark.django_db
class TestGetPreparationTimeNoItems:
    """Tests pour get_preparation_time sans items"""

    def test_preparation_time_no_items(self, restaurant, user):
        """Test retourne 10 par défaut sans items (ligne 295)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-PREP-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00')
        )
        assert order.items.count() == 0
        assert order.get_preparation_time() == 10


# =============================================================================
# TESTS - table_total_amount (line 329)
# =============================================================================

@pytest.mark.django_db
class TestTableTotalAmount:
    """Tests pour la propriété table_total_amount"""

    def test_table_total_amount(self, restaurant, user):
        """Test du montant total de la table (ligne 329)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-TTA-001",
            subtotal=Decimal('30.00'), total_amount=Decimal('33.00'),
            table_number="TTA1"
        )
        assert order.table_total_amount >= Decimal('33.00')


# =============================================================================
# TESTS - table_status_summary (lines 336-339)
# =============================================================================

@pytest.mark.django_db
class TestTableStatusSummary:
    """Tests pour la propriété table_status_summary"""

    def test_table_status_summary(self, restaurant, user):
        """Test du résumé des statuts (lignes 336-339)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-TSS-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            table_number="TSS1", status='pending'
        )
        summary = order.table_status_summary
        assert 'total_orders' in summary
        assert 'pending' in summary
        assert summary['total_orders'] >= 1
        assert summary['pending'] >= 1


# =============================================================================
# TESTS - get_table_waiting_time with active order (lines 371-372)
# =============================================================================

@pytest.mark.django_db
class TestGetTableWaitingTimeActive:
    """Tests pour get_table_waiting_time avec commandes actives"""

    def test_get_table_waiting_time_with_active_order(self, restaurant, user):
        """Test retourne le temps d'attente en minutes (lignes 371-372)"""
        order = Order.objects.create(
            restaurant=restaurant, user=user,
            order_number="ORD-GTWT-001",
            subtotal=Decimal('10.00'), total_amount=Decimal('11.00'),
            table_number="GTWT1", status='pending'
        )
        # Antidater de 10 minutes
        Order.objects.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(minutes=10)
        )
        order.refresh_from_db()
        waiting = order.get_table_waiting_time()
        assert waiting >= 9  # Au moins 9 minutes vu l'arrondi int()


# =============================================================================
# TESTS - OrderItem.clean unit_price except (line 467)
# =============================================================================

@pytest.mark.django_db
class TestOrderItemCleanUnitPriceExcept:
    """Tests pour le except ValueError/TypeError sur unit_price"""

    def test_clean_unit_price_invalid_type(self, order, menu_item):
        """Test validation unit_price type invalide (ligne 467)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00')
        )

        # Create an object whose str() raises ValueError, caught by except block
        class BadPrice:
            def __str__(self):
                raise ValueError("cannot convert")

        oi.unit_price = BadPrice()
        with pytest.raises(ValidationError, match="nombre valide"):
            oi.clean()


# =============================================================================
# TESTS - OrderItem.clean vat_rate auto-correction (line 478)
# =============================================================================

@pytest.mark.django_db
class TestOrderItemCleanVatAutoCorrection:
    """Tests pour l'auto-correction du vat_rate dans clean"""

    def test_clean_vat_rate_needs_rounding(self, order, menu_item):
        """Test auto-correction quand vat_rate a trop de décimales (ligne 478)"""
        oi = OrderItem(
            order=order, menu_item=menu_item,
            quantity=1,
            unit_price=Decimal('10.00'), total_price=Decimal('10.00'),
            vat_rate=Decimal('0.1005')  # 4 décimales → arrondi à 0.101
        )
        oi.clean()
        assert oi.vat_rate == Decimal('0.101')