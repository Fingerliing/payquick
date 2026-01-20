# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de menu du jour
"""

import pytest
from decimal import Decimal
from datetime import date, timedelta
from unittest.mock import MagicMock, Mock
from django.contrib.auth.models import User, Group
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from api.models import (
    Restaurant,
    Menu,
    MenuItem,
    MenuCategory,
    DailyMenu,
    DailyMenuItem,
    DailyMenuTemplate,
    DailyMenuTemplateItem,
    RestaurateurProfile,
)
from api.serializers import (
    DailyMenuItemSerializer,
    DailyMenuListSerializer,
    DailyMenuDetailSerializer,
    DailyMenuCreateSerializer,
    DailyMenuPublicSerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def factory():
    return APIRequestFactory()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="dailymenuserialuser",
        email="dailymenuserialuser@test.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="dailymenurestaurateur",
        email="dailymenurestaurateur@test.com",
        password="testpass123"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(db, restaurateur_profile):
    return Restaurant.objects.create(
        name="Daily Menu Serial Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def menu(db, restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(db, restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        description="Nos plats principaux",
        icon="🍽️",
        is_active=True,
        order=1
    )


@pytest.fixture
def menu_item(db, menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Plat du jour",
        description="Délicieux plat maison",
        price=Decimal('15.00'),
        is_available=True,
        is_vegetarian=False,
        is_vegan=False,
        is_gluten_free=True
    )


@pytest.fixture
def second_menu_item(db, menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Dessert du jour",
        description="Dessert maison",
        price=Decimal('8.00'),
        is_available=True,
        is_vegetarian=True
    )


@pytest.fixture
def daily_menu(db, restaurant, user):
    return DailyMenu.objects.create(
        restaurant=restaurant,
        date=date.today(),
        title="Menu du Jour",
        description="Nos suggestions du jour",
        special_price=Decimal('14.50'),
        is_active=True,
        created_by=user
    )


@pytest.fixture
def daily_menu_item(db, daily_menu, menu_item):
    return DailyMenuItem.objects.create(
        daily_menu=daily_menu,
        menu_item=menu_item,
        special_price=Decimal('12.00'),
        is_available=True,
        display_order=1,
        special_note="Fait maison"
    )


@pytest.fixture
def daily_menu_item_no_discount(db, daily_menu, second_menu_item):
    """Item sans prix spécial (pas de réduction)"""
    return DailyMenuItem.objects.create(
        daily_menu=daily_menu,
        menu_item=second_menu_item,
        special_price=None,
        is_available=True,
        display_order=2
    )


@pytest.fixture
def mock_request(factory, restaurateur_user):
    """Requête mockée avec utilisateur authentifié"""
    request = factory.post('/')
    request.user = restaurateur_user
    return request


# =============================================================================
# TESTS - DailyMenuItemSerializer
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuItemSerializer:
    """Tests pour DailyMenuItemSerializer"""

    def test_serialize_daily_menu_item(self, daily_menu_item):
        """Test de sérialisation d'un item du menu du jour"""
        serializer = DailyMenuItemSerializer(daily_menu_item)
        data = serializer.data

        assert 'id' in data
        assert data['menu_item_name'] == "Plat du jour"
        assert data['special_price'] == '12.00'
        assert data['is_available'] is True
        assert data['display_order'] == 1
        assert data['special_note'] == "Fait maison"

    def test_serialize_includes_original_price(self, daily_menu_item):
        """Test que le prix original est inclus"""
        serializer = DailyMenuItemSerializer(daily_menu_item)
        data = serializer.data

        assert data['original_price'] == '15.00'

    def test_serialize_effective_price_with_discount(self, daily_menu_item):
        """Test du prix effectif avec réduction"""
        serializer = DailyMenuItemSerializer(daily_menu_item)
        data = serializer.data

        assert data['effective_price'] == Decimal('12.00')
        assert data['has_discount'] is True
        assert data['discount_percentage'] == 20  # (15-12)/15 * 100

    def test_serialize_effective_price_without_discount(self, daily_menu_item_no_discount):
        """Test du prix effectif sans réduction"""
        serializer = DailyMenuItemSerializer(daily_menu_item_no_discount)
        data = serializer.data

        assert data['effective_price'] == Decimal('8.00')
        assert data['has_discount'] is False
        assert data['discount_percentage'] == 0

    def test_serialize_includes_dietary_info(self, daily_menu_item):
        """Test que les infos diététiques sont incluses"""
        serializer = DailyMenuItemSerializer(daily_menu_item)
        data = serializer.data

        assert 'is_vegetarian' in data
        assert 'is_vegan' in data
        assert 'is_gluten_free' in data
        assert data['is_gluten_free'] is True

    def test_serialize_includes_category_info(self, daily_menu_item):
        """Test que les infos de catégorie sont incluses"""
        serializer = DailyMenuItemSerializer(daily_menu_item)
        data = serializer.data

        assert data['menu_item_category'] == "Plats"
        assert data['menu_item_category_icon'] == "🍽️"


# =============================================================================
# TESTS - DailyMenuListSerializer
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuListSerializer:
    """Tests pour DailyMenuListSerializer"""

    def test_serialize_daily_menu_list(self, daily_menu):
        """Test de sérialisation pour la liste"""
        serializer = DailyMenuListSerializer(daily_menu)
        data = serializer.data

        assert 'id' in data
        assert data['title'] == "Menu du Jour"
        assert data['description'] == "Nos suggestions du jour"
        assert data['is_active'] is True
        assert str(data['date']) == str(date.today())

    def test_serialize_includes_restaurant_name(self, daily_menu):
        """Test que le nom du restaurant est inclus"""
        serializer = DailyMenuListSerializer(daily_menu)
        data = serializer.data

        assert data['restaurant_name'] == "Daily Menu Serial Test Restaurant"

    def test_serialize_includes_computed_fields(self, daily_menu, daily_menu_item):
        """Test des champs calculés"""
        serializer = DailyMenuListSerializer(daily_menu)
        data = serializer.data

        assert 'total_items_count' in data
        assert 'is_today' in data
        assert 'is_future' in data
        assert data['is_today'] is True

    def test_serialize_special_price(self, daily_menu):
        """Test du prix spécial menu"""
        serializer = DailyMenuListSerializer(daily_menu)
        data = serializer.data

        assert data['special_price'] == '14.50'

    def test_serialize_timestamps(self, daily_menu):
        """Test des timestamps"""
        serializer = DailyMenuListSerializer(daily_menu)
        data = serializer.data

        assert 'created_at' in data
        assert 'updated_at' in data


# =============================================================================
# TESTS - DailyMenuDetailSerializer
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuDetailSerializer:
    """Tests pour DailyMenuDetailSerializer"""

    def test_serialize_daily_menu_detail(self, daily_menu, daily_menu_item):
        """Test de sérialisation détaillée"""
        serializer = DailyMenuDetailSerializer(daily_menu)
        data = serializer.data

        assert data['title'] == "Menu du Jour"
        assert 'daily_menu_items' in data
        assert len(data['daily_menu_items']) == 1

    def test_serialize_includes_items_detail(self, daily_menu, daily_menu_item):
        """Test que les détails des items sont inclus"""
        serializer = DailyMenuDetailSerializer(daily_menu)
        data = serializer.data

        item = data['daily_menu_items'][0]
        assert item['menu_item_name'] == "Plat du jour"
        assert item['special_price'] == '12.00'

    def test_serialize_includes_computed_totals(self, daily_menu, daily_menu_item):
        """Test des totaux calculés"""
        serializer = DailyMenuDetailSerializer(daily_menu)
        data = serializer.data

        assert 'total_items_count' in data
        assert 'estimated_total_price' in data

    def test_serialize_items_by_category(self, daily_menu, daily_menu_item):
        """Test du groupement par catégorie"""
        serializer = DailyMenuDetailSerializer(daily_menu)
        data = serializer.data

        assert 'items_by_category' in data
        # Vérifie la structure
        if data['items_by_category']:
            category = data['items_by_category'][0]
            assert 'name' in category
            assert 'icon' in category
            assert 'items' in category

    def test_serialize_multiple_items(self, daily_menu, daily_menu_item, daily_menu_item_no_discount):
        """Test avec plusieurs items"""
        serializer = DailyMenuDetailSerializer(daily_menu)
        data = serializer.data

        assert len(data['daily_menu_items']) == 2


# =============================================================================
# TESTS - DailyMenuCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuCreateSerializer:
    """Tests pour DailyMenuCreateSerializer"""

    def test_validate_valid_data(self, restaurant, mock_request):
        """Test de validation avec données valides"""
        data = {
            'restaurant': restaurant.id,
            'date': date.today() + timedelta(days=1),
            'title': 'Nouveau Menu',
            'description': 'Description test',
            'is_active': True,
            'special_price': '15.00'
        }

        serializer = DailyMenuCreateSerializer(
            data=data,
            context={'request': mock_request}
        )

        assert serializer.is_valid(), serializer.errors

    def test_validate_date_not_too_old(self, restaurant, mock_request):
        """Test que la date ne peut pas être trop ancienne"""
        data = {
            'restaurant': restaurant.id,
            'date': date.today() - timedelta(days=10),
            'title': 'Menu Passé',
            'is_active': True
        }

        serializer = DailyMenuCreateSerializer(
            data=data,
            context={'request': mock_request}
        )

        assert not serializer.is_valid()
        assert 'date' in serializer.errors

    def test_validate_duplicate_date(self, restaurant, daily_menu, mock_request):
        """Test qu'on ne peut pas créer deux menus pour la même date"""
        data = {
            'restaurant': restaurant.id,
            'date': date.today(),  # Même date que daily_menu
            'title': 'Menu Dupliqué',
            'is_active': True
        }

        serializer = DailyMenuCreateSerializer(
            data=data,
            context={'request': mock_request}
        )

        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors

    def test_create_menu_with_items(self, restaurant, menu_item, mock_request):
        """Test de création avec items"""
        data = {
            'restaurant': restaurant.id,
            'date': date.today() + timedelta(days=2),
            'title': 'Menu avec Items',
            'is_active': True,
            'items': [
                {
                    'menu_item': menu_item.id,
                    'special_price': '10.00',
                    'display_order': 1,
                    'is_available': True
                }
            ]
        }

        serializer = DailyMenuCreateSerializer(
            data=data,
            context={'request': mock_request}
        )

        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.title == 'Menu avec Items'
        assert instance.daily_menu_items.count() == 1

    def test_create_sets_created_by(self, restaurant, mock_request):
        """Test que created_by est automatiquement défini"""
        data = {
            'restaurant': restaurant.id,
            'date': date.today() + timedelta(days=3),
            'title': 'Menu Test Creator',
            'is_active': True
        }

        serializer = DailyMenuCreateSerializer(
            data=data,
            context={'request': mock_request}
        )

        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.created_by == mock_request.user


# =============================================================================
# TESTS - DailyMenuPublicSerializer
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuPublicSerializer:
    """Tests pour DailyMenuPublicSerializer (API client)"""

    def test_serialize_public_menu(self, daily_menu, daily_menu_item):
        """Test de sérialisation publique"""
        serializer = DailyMenuPublicSerializer(daily_menu)
        data = serializer.data

        assert data['title'] == "Menu du Jour"
        assert data['restaurant_name'] == "Daily Menu Serial Test Restaurant"

    def test_serialize_excludes_sensitive_fields(self, daily_menu):
        """Test que les champs sensibles sont exclus"""
        serializer = DailyMenuPublicSerializer(daily_menu)
        data = serializer.data

        # Ces champs ne doivent pas être exposés au public
        assert 'created_by' not in data
        assert 'created_at' not in data
        assert 'updated_at' not in data

    def test_serialize_includes_computed_fields(self, daily_menu, daily_menu_item):
        """Test des champs calculés pour le client"""
        serializer = DailyMenuPublicSerializer(daily_menu)
        data = serializer.data

        assert 'total_items_count' in data
        assert 'estimated_total_price' in data
        assert 'items_by_category' in data

    def test_serialize_items_by_category_structure(self, daily_menu, daily_menu_item):
        """Test de la structure des items par catégorie"""
        serializer = DailyMenuPublicSerializer(daily_menu)
        data = serializer.data

        if data['items_by_category']:
            category = data['items_by_category'][0]
            assert 'name' in category
            assert 'icon' in category
            assert 'items' in category

            if category['items']:
                item = category['items'][0]
                assert 'id' in item
                assert 'name' in item

    def test_serialize_only_available_items(self, daily_menu, menu_item, second_menu_item):
        """Test que seuls les items disponibles sont inclus"""
        # Créer un item non disponible
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            is_available=False,
            display_order=1
        )
        # Créer un item disponible
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=second_menu_item,
            is_available=True,
            display_order=2
        )

        serializer = DailyMenuPublicSerializer(daily_menu)
        data = serializer.data

        # Compter les items dans items_by_category
        total_items = sum(
            len(cat['items'])
            for cat in data['items_by_category']
        )

        assert total_items == 1  # Seul l'item disponible