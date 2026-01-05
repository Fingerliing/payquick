# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de catégories
"""

import pytest
from django.contrib.auth.models import User
from api.models import (
    Restaurant,
    RestaurateurProfile,
    MenuCategory,
    MenuSubCategory,
    Menu,
    MenuItem,
)
from api.serializers.category_serializers import (
    MenuCategorySerializer,
    MenuCategoryCreateSerializer,
    MenuSubCategorySerializer,
    MenuSubCategoryCreateSerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="catuser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Category Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
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
        description="Salades fraîches de saison",
        order=1
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant
    )


@pytest.fixture
def menu_item(menu, menu_category, menu_subcategory):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        subcategory=menu_subcategory,
        name="Salade César",
        price=12.50,
        description="Salade romaine, parmesan, croûtons"
    )


# =============================================================================
# TESTS - MenuSubCategorySerializer
# =============================================================================

@pytest.mark.django_db
class TestMenuSubCategorySerializer:
    """Tests pour MenuSubCategorySerializer"""

    def test_serializer_fields(self, menu_subcategory):
        """Test des champs du serializer"""
        serializer = MenuSubCategorySerializer(menu_subcategory)
        data = serializer.data
        
        assert 'id' in data
        assert 'name' in data
        assert 'description' in data
        assert 'is_active' in data
        assert 'order' in data
        assert 'menu_items_count' in data
        assert 'restaurant_id' in data

    def test_name_serialization(self, menu_subcategory):
        """Test de la sérialisation du nom"""
        serializer = MenuSubCategorySerializer(menu_subcategory)
        assert serializer.data['name'] == "Salades"

    def test_is_active_default(self, menu_subcategory):
        """Test de la valeur par défaut is_active"""
        serializer = MenuSubCategorySerializer(menu_subcategory)
        assert serializer.data['is_active'] is True

    def test_read_only_fields(self, menu_subcategory):
        """Test des champs en lecture seule"""
        serializer = MenuSubCategorySerializer(menu_subcategory)
        read_only = serializer.Meta.read_only_fields
        
        assert 'id' in read_only
        assert 'created_at' in read_only
        assert 'updated_at' in read_only
        assert 'menu_items_count' in read_only

    def test_validate_name_too_short(self):
        """Test de la validation du nom trop court"""
        data = {
            'name': 'A',  # Trop court
            'order': 1
        }
        serializer = MenuSubCategorySerializer(data=data)
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_validate_name_strips_whitespace(self, menu_category):
        """Test que le nom est nettoyé et capitalisé"""
        data = {
            'name': '  salades  ',
            'order': 1
        }
        serializer = MenuSubCategorySerializer(data=data)
        if serializer.is_valid():
            assert serializer.validated_data['name'] == 'Salades'


# =============================================================================
# TESTS - MenuSubCategoryCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestMenuSubCategoryCreateSerializer:
    """Tests pour MenuSubCategoryCreateSerializer"""

    def test_valid_data(self, menu_category):
        """Test avec des données valides"""
        data = {
            'name': 'Soupes',
            'description': 'Soupes maison',
            'category': menu_category.id,
            'order': 2
        }
        serializer = MenuSubCategoryCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_name(self):
        """Test que le nom est requis"""
        data = {
            'order': 1
        }
        serializer = MenuSubCategoryCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'name' in serializer.errors


# =============================================================================
# TESTS - MenuCategorySerializer
# =============================================================================

@pytest.mark.django_db
class TestMenuCategorySerializer:
    """Tests pour MenuCategorySerializer"""

    def test_serializer_fields(self, menu_category):
        """Test des champs du serializer"""
        serializer = MenuCategorySerializer(menu_category)
        data = serializer.data
        
        assert 'id' in data
        assert 'name' in data
        assert 'description' in data
        assert 'icon' in data
        assert 'color' in data
        assert 'is_active' in data
        assert 'order' in data
        assert 'restaurant' in data
        assert 'restaurant_name' in data
        assert 'subcategories' in data

    def test_subcategories_nested(self, menu_category, menu_subcategory):
        """Test que les sous-catégories sont sérialisées"""
        serializer = MenuCategorySerializer(menu_category)
        
        subcategories = serializer.data['subcategories']
        assert len(subcategories) == 1
        assert subcategories[0]['name'] == "Salades"

    def test_restaurant_name(self, menu_category):
        """Test que le nom du restaurant est inclus"""
        serializer = MenuCategorySerializer(menu_category)
        assert serializer.data['restaurant_name'] == "Category Test Restaurant"

    def test_icon_and_color(self, menu_category):
        """Test des champs icon et color"""
        serializer = MenuCategorySerializer(menu_category)
        assert serializer.data['icon'] == "🥗"
        assert serializer.data['color'] == "#4CAF50"

    def test_ordering_field(self, menu_category):
        """Test du champ order"""
        serializer = MenuCategorySerializer(menu_category)
        assert serializer.data['order'] == 1


# =============================================================================
# TESTS - MenuCategoryCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestMenuCategoryCreateSerializer:
    """Tests pour MenuCategoryCreateSerializer"""

    def test_valid_data(self, restaurant):
        """Test avec des données valides"""
        data = {
            'name': 'Plats Principaux',
            'description': 'Nos plats signatures',
            'restaurant': restaurant.id,
            'order': 2
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_name(self, restaurant):
        """Test que le nom est requis"""
        data = {
            'restaurant': restaurant.id,
            'order': 1
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_required_restaurant(self):
        """Test que le restaurant est requis"""
        data = {
            'name': 'Test Category',
            'order': 1
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'restaurant' in serializer.errors

    def test_optional_icon(self, restaurant):
        """Test que l'icône est optionnelle"""
        data = {
            'name': 'Desserts',
            'restaurant': restaurant.id,
            'order': 3
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_optional_color(self, restaurant):
        """Test que la couleur est optionnelle"""
        data = {
            'name': 'Boissons',
            'restaurant': restaurant.id,
            'order': 4,
            'color': '#FF5722'
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_default_is_active(self, restaurant):
        """Test de la valeur par défaut is_active"""
        data = {
            'name': 'Vins',
            'restaurant': restaurant.id,
            'order': 5
        }
        serializer = MenuCategoryCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
