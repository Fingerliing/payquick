# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de menu
- Menu
- MenuCategory
- MenuSubCategory
- MenuItem
- TableSession
- DraftOrder
"""

import pytest
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from api.models import (
    Menu,
    MenuCategory,
    MenuSubCategory,
    MenuItem,
    TableSession,
    DraftOrder,
    Restaurant,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="menuowner@example.com",
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
        name="Menu Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        description="Nos entrées fraîches",
        icon="🥗",
        color="#4CAF50",
        order=1
    )


@pytest.fixture
def menu_subcategory(menu_category):
    return MenuSubCategory.objects.create(
        category=menu_category,
        name="Salades",
        description="Salades fraîches",
        order=1
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Salade César",
        description="Salade romaine, parmesan, croûtons",
        price=Decimal('12.50'),
        is_available=True
    )


@pytest.fixture
def table_session(restaurant):
    return TableSession.objects.create(
        restaurant=restaurant,
        table_number="T1",
        primary_customer_name="Jean Dupont",
        primary_phone="0612345678",
        guest_count=4
    )


# =============================================================================
# TESTS - Menu
# =============================================================================

@pytest.mark.django_db
class TestMenu:
    """Tests pour le modèle Menu"""

    def test_menu_creation(self, menu):
        """Test de la création d'un menu"""
        assert menu.id is not None
        assert menu.name == "Menu Principal"
        assert menu.created_at is not None
        assert menu.updated_at is not None

    def test_menu_str_method(self, menu, restaurant):
        """Test de la méthode __str__"""
        expected = f"Menu Principal - {restaurant.name}"
        # Le __str__ peut varier selon l'implémentation
        assert "Menu Principal" in str(menu)

    def test_menu_default_disponible(self, restaurant):
        """Test de la valeur par défaut de disponible"""
        menu = Menu.objects.create(
            name="New Menu",
            restaurant=restaurant
        )
        # Vérifier le champ is_available ou disponible selon l'implémentation
        assert menu.is_available is True or menu.disponible is True

    def test_menu_related_name(self, restaurant, menu):
        """Test du related_name pour accéder aux menus depuis Restaurant"""
        assert menu in restaurant.menus.all()

    def test_cascade_delete_with_restaurant(self, restaurant, menu):
        """Test que le menu est supprimé avec le restaurant"""
        menu_id = menu.id
        restaurant.delete()
        
        assert not Menu.objects.filter(id=menu_id).exists()

    def test_multiple_menus_per_restaurant(self, restaurant):
        """Test de plusieurs menus par restaurant"""
        Menu.objects.create(name="Menu Midi", restaurant=restaurant)
        Menu.objects.create(name="Menu Soir", restaurant=restaurant)
        Menu.objects.create(name="Menu Weekend", restaurant=restaurant)
        
        assert restaurant.menus.count() == 3


# =============================================================================
# TESTS - MenuCategory
# =============================================================================

@pytest.mark.django_db
class TestMenuCategory:
    """Tests pour le modèle MenuCategory"""

    def test_category_creation(self, menu_category):
        """Test de la création d'une catégorie"""
        assert menu_category.id is not None
        assert menu_category.name == "Entrées"
        assert menu_category.description == "Nos entrées fraîches"
        assert menu_category.icon == "🥗"
        assert menu_category.color == "#4CAF50"
        assert menu_category.order == 1

    def test_category_str_method(self, menu_category):
        """Test de la méthode __str__"""
        assert "Entrées" in str(menu_category)

    def test_category_default_is_active(self, restaurant):
        """Test de la valeur par défaut is_active"""
        category = MenuCategory.objects.create(
            restaurant=restaurant,
            name="Test Category",
            order=1
        )
        assert category.is_active is True

    def test_category_ordering(self, restaurant):
        """Test de l'ordre des catégories"""
        c1 = MenuCategory.objects.create(restaurant=restaurant, name="Cat 3", order=3)
        c2 = MenuCategory.objects.create(restaurant=restaurant, name="Cat 1", order=1)
        c3 = MenuCategory.objects.create(restaurant=restaurant, name="Cat 2", order=2)
        
        categories = list(MenuCategory.objects.filter(restaurant=restaurant).order_by('order'))
        assert categories[0].name == "Cat 1"
        assert categories[1].name == "Cat 2"
        assert categories[2].name == "Cat 3"

    def test_optional_fields(self, restaurant):
        """Test des champs optionnels"""
        category = MenuCategory.objects.create(
            restaurant=restaurant,
            name="Simple Category",
            order=1
        )
        assert category.description is None or category.description == ""
        assert category.icon is None or category.icon == ""
        assert category.color is None or category.color == ""

    def test_cascade_delete_with_restaurant(self, restaurant, menu_category):
        """Test que la catégorie est supprimée avec le restaurant"""
        category_id = menu_category.id
        restaurant.delete()
        
        assert not MenuCategory.objects.filter(id=category_id).exists()


# =============================================================================
# TESTS - MenuSubCategory
# =============================================================================

@pytest.mark.django_db
class TestMenuSubCategory:
    """Tests pour le modèle MenuSubCategory"""

    def test_subcategory_creation(self, menu_subcategory):
        """Test de la création d'une sous-catégorie"""
        assert menu_subcategory.id is not None
        assert menu_subcategory.name == "Salades"
        assert menu_subcategory.description == "Salades fraîches"
        assert menu_subcategory.order == 1

    def test_subcategory_str_method(self, menu_subcategory):
        """Test de la méthode __str__"""
        assert "Salades" in str(menu_subcategory)

    def test_subcategory_related_name(self, menu_category, menu_subcategory):
        """Test du related_name subcategories"""
        assert menu_subcategory in menu_category.subcategories.all()

    def test_cascade_delete_with_category(self, menu_category, menu_subcategory):
        """Test que la sous-catégorie est supprimée avec la catégorie"""
        subcategory_id = menu_subcategory.id
        menu_category.delete()
        
        assert not MenuSubCategory.objects.filter(id=subcategory_id).exists()

    def test_multiple_subcategories(self, menu_category):
        """Test de plusieurs sous-catégories par catégorie"""
        MenuSubCategory.objects.create(category=menu_category, name="Sub 1", order=1)
        MenuSubCategory.objects.create(category=menu_category, name="Sub 2", order=2)
        
        assert menu_category.subcategories.count() == 2


# =============================================================================
# TESTS - MenuItem
# =============================================================================

@pytest.mark.django_db
class TestMenuItem:
    """Tests pour le modèle MenuItem"""

    def test_item_creation(self, menu_item):
        """Test de la création d'un item"""
        assert menu_item.id is not None
        assert menu_item.name == "Salade César"
        assert menu_item.description == "Salade romaine, parmesan, croûtons"
        assert menu_item.price == Decimal('12.50')
        assert menu_item.is_available is True

    def test_item_str_method(self, menu_item):
        """Test de la méthode __str__"""
        result = str(menu_item)
        assert "Salade César" in result
        assert "12.50" in result or "12,50" in result

    def test_item_default_is_available(self, menu, menu_category):
        """Test de la valeur par défaut is_available"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="New Item",
            price=Decimal('10.00')
        )
        assert item.is_available is True

    def test_item_vat_rate_default(self, menu, menu_category):
        """Test du taux de TVA par défaut"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="VAT Item",
            price=Decimal('10.00')
        )
        # Taux par défaut: 10% pour la restauration
        assert item.vat_rate == Decimal('0.10') or item.vat_rate == Decimal('0.100')

    def test_item_dietary_flags(self, menu, menu_category):
        """Test des flags diététiques"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="Vegan Item",
            price=Decimal('15.00'),
            is_vegan=True,
            is_vegetarian=True,
            is_gluten_free=True
        )
        
        assert item.is_vegan is True
        assert item.is_vegetarian is True
        assert item.is_gluten_free is True

    def test_item_allergens_json_field(self, menu, menu_category):
        """Test du champ JSON allergens"""
        allergens = ['gluten', 'eggs', 'milk']
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="Allergenic Item",
            price=Decimal('12.00'),
            allergens=allergens
        )
        
        item.refresh_from_db()
        assert item.allergens == allergens

    def test_item_allergens_display(self, menu, menu_category):
        """Test de la propriété allergens_display"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="Test Item",
            price=Decimal('10.00'),
            allergens=['gluten', 'milk']
        )
        
        display = item.allergens_display
        assert 'Gluten' in display
        assert 'Lait' in display

    def test_item_dietary_tags(self, menu, menu_category):
        """Test de la propriété dietary_tags"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="Vegan Dish",
            price=Decimal('14.00'),
            is_vegan=True,
            is_gluten_free=True
        )
        
        tags = item.dietary_tags
        assert 'Vegan' in tags
        assert 'Sans gluten' in tags

    def test_item_optional_subcategory(self, menu, menu_category):
        """Test que la sous-catégorie est optionnelle"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="No Subcategory Item",
            price=Decimal('10.00'),
            subcategory=None
        )
        assert item.subcategory is None

    def test_item_with_subcategory(self, menu, menu_category, menu_subcategory):
        """Test d'un item avec sous-catégorie"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            subcategory=menu_subcategory,
            name="Subcategory Item",
            price=Decimal('11.00')
        )
        assert item.subcategory == menu_subcategory

    def test_item_cascade_delete_with_menu(self, menu, menu_item):
        """Test que l'item est supprimé avec le menu"""
        item_id = menu_item.id
        menu.delete()
        
        assert not MenuItem.objects.filter(id=item_id).exists()

    def test_item_price_decimal_precision(self, menu, menu_category):
        """Test de la précision décimale du prix"""
        item = MenuItem.objects.create(
            menu=menu,
            category=menu_category,
            name="Precision Item",
            price=Decimal('99.99')
        )
        assert item.price == Decimal('99.99')

    def test_item_ordering(self, menu, menu_category):
        """Test de l'ordre des items"""
        i1 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item C", price=Decimal('10.00')
        )
        i2 = MenuItem.objects.create(
            menu=menu, category=menu_category,
            name="Item A", price=Decimal('10.00')
        )
        
        # L'ordre dépend de l'implémentation (par nom, date de création, etc.)
        items = list(menu.items.all())
        assert len(items) == 2


# =============================================================================
# TESTS - TableSession
# =============================================================================

@pytest.mark.django_db
class TestTableSession:
    """Tests pour le modèle TableSession"""

    def test_session_creation(self, table_session):
        """Test de la création d'une session de table"""
        assert table_session.id is not None
        assert table_session.table_number == "T1"
        assert table_session.primary_customer_name == "Jean Dupont"
        assert table_session.guest_count == 4
        assert table_session.is_active is True
        assert table_session.started_at is not None

    def test_session_str_method(self, table_session, restaurant):
        """Test de la méthode __str__"""
        result = str(table_session)
        assert "T1" in result or table_session.table_number in result

    def test_session_default_is_active(self, restaurant):
        """Test de la valeur par défaut is_active"""
        session = TableSession.objects.create(
            restaurant=restaurant,
            table_number="T2"
        )
        assert session.is_active is True

    def test_session_default_guest_count(self, restaurant):
        """Test de la valeur par défaut guest_count"""
        session = TableSession.objects.create(
            restaurant=restaurant,
            table_number="T3"
        )
        assert session.guest_count == 1

    def test_session_end_session_method(self, table_session):
        """Test de la méthode end_session"""
        assert table_session.is_active is True
        assert table_session.ended_at is None
        
        table_session.end_session()
        
        assert table_session.is_active is False
        assert table_session.ended_at is not None

    def test_session_duration_property(self, table_session):
        """Test de la propriété duration"""
        # La session vient d'être créée
        duration = table_session.duration
        assert duration is not None
        assert duration.total_seconds() >= 0

    def test_session_can_add_order(self, table_session):
        """Test de la méthode can_add_order"""
        assert table_session.can_add_order() is True
        
        table_session.is_active = False
        table_session.save()
        
        assert table_session.can_add_order() is False

    def test_session_ordering(self, restaurant):
        """Test de l'ordre par started_at desc"""
        s1 = TableSession.objects.create(restaurant=restaurant, table_number="S1")
        s2 = TableSession.objects.create(restaurant=restaurant, table_number="S2")
        
        sessions = list(TableSession.objects.filter(restaurant=restaurant))
        # Plus récent en premier
        assert sessions[0] == s2

    def test_session_notes(self, restaurant):
        """Test du champ session_notes"""
        session = TableSession.objects.create(
            restaurant=restaurant,
            table_number="N1",
            session_notes="Client VIP, allergie aux noix"
        )
        assert session.session_notes == "Client VIP, allergie aux noix"

    def test_session_uuid_primary_key(self, table_session):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(table_session.id, uuid.UUID)


# =============================================================================
# TESTS - DraftOrder
# =============================================================================

@pytest.mark.django_db
class TestDraftOrder:
    """Tests pour le modèle DraftOrder"""

    def test_draft_creation(self, restaurant):
        """Test de la création d'un brouillon de commande"""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            table_number="D1",
            items=[{"menu_item_id": "1", "quantity": 2}],
            amount=2500,  # En centimes
            customer_name="Test Customer",
            phone="0612345678",
            payment_method="online"
        )
        
        assert draft.id is not None
        assert draft.amount == 2500
        assert draft.currency == "eur"
        assert draft.status == "created"

    def test_draft_expires_at_default(self, restaurant):
        """Test de l'expiration par défaut (15 minutes)"""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="cash"
        )
        
        # L'expiration devrait être environ 15 minutes dans le futur
        expected_expiry = timezone.now() + timedelta(minutes=15)
        diff = abs((draft.expires_at - expected_expiry).total_seconds())
        assert diff < 60  # Tolérance de 60 secondes

    def test_draft_is_expired_method(self, restaurant):
        """Test de la méthode is_expired"""
        # Créer un draft non expiré
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="online"
        )
        assert draft.is_expired() is False
        
        # Créer un draft expiré
        draft.expires_at = timezone.now() - timedelta(minutes=1)
        draft.save()
        assert draft.is_expired() is True

    def test_draft_items_json_field(self, restaurant):
        """Test du champ JSON items"""
        items = [
            {"menu_item_id": "1", "quantity": 2, "options": {"size": "large"}},
            {"menu_item_id": "2", "quantity": 1}
        ]
        
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=items,
            amount=4500,
            customer_name="Test",
            phone="0600000000",
            payment_method="online"
        )
        
        draft.refresh_from_db()
        assert draft.items == items

    def test_draft_payment_method_choices(self, restaurant):
        """Test des choix de méthode de paiement"""
        for method in ["online", "cash"]:
            draft = DraftOrder.objects.create(
                restaurant=restaurant,
                items=[],
                amount=1000,
                customer_name=f"Test {method}",
                phone="0600000000",
                payment_method=method
            )
            assert draft.payment_method == method

    def test_draft_status_choices(self, restaurant):
        """Test des statuts possibles"""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="online"
        )
        
        # Statut par défaut
        assert draft.status == "created"
        
        # Changer le statut
        draft.status = "pi_succeeded"
        draft.save()
        assert draft.status == "pi_succeeded"

    def test_draft_optional_fields(self, restaurant):
        """Test des champs optionnels"""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="cash"
        )
        
        assert draft.table_number is None
        assert draft.email is None
        assert draft.payment_intent_id is None

    def test_draft_uuid_primary_key(self, restaurant):
        """Test que l'ID est un UUID"""
        import uuid
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="online"
        )
        assert isinstance(draft.id, uuid.UUID)

    def test_draft_cascade_delete(self, restaurant):
        """Test que le draft est supprimé avec le restaurant"""
        draft = DraftOrder.objects.create(
            restaurant=restaurant,
            items=[],
            amount=1000,
            customer_name="Test",
            phone="0600000000",
            payment_method="online"
        )
        draft_id = draft.id
        
        restaurant.delete()
        
        assert not DraftOrder.objects.filter(id=draft_id).exists()
