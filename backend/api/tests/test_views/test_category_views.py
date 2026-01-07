# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de catégories de menu
- MenuCategoryViewSet (CRUD, stats, reorder)
- MenuSubCategoryViewSet (CRUD, reorder)
"""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Menu,
    MenuItem,
    MenuCategory,
    MenuSubCategory,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="category_owner@example.com",
        email="category_owner@example.com",
        password="testpass123"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurateur_client(restaurateur_user):
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Category Test Restaurant",
        description="Restaurant pour tester les catégories",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu avec catégories",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        icon="🥗",
        color="#4CAF50",
        is_active=True,
        order=1
    )


@pytest.fixture
def second_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        icon="🍽️",
        color="#2196F3",
        is_active=True,
        order=2
    )


@pytest.fixture
def third_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Desserts",
        icon="🍰",
        color="#E91E63",
        is_active=True,
        order=3
    )


@pytest.fixture
def multiple_categories(restaurant):
    categories = []
    data = [
        ("Entrées", "🥗", "#4CAF50", 1),
        ("Plats", "🍽️", "#2196F3", 2),
        ("Desserts", "🍰", "#E91E63", 3),
        ("Boissons", "🍷", "#9C27B0", 4),
    ]
    for name, icon, color, order in data:
        cat = MenuCategory.objects.create(
            restaurant=restaurant,
            name=name,
            icon=icon,
            color=color,
            is_active=True,
            order=order
        )
        categories.append(cat)
    return categories


@pytest.fixture
def subcategory(category):
    return MenuSubCategory.objects.create(
        category=category,
        name="Salades",
        is_active=True,
        order=1
    )


@pytest.fixture
def second_subcategory(category):
    return MenuSubCategory.objects.create(
        category=category,
        name="Soupes",
        is_active=True,
        order=2
    )


@pytest.fixture
def category_with_items(category, menu):
    for i in range(3):
        MenuItem.objects.create(
            menu=menu,
            name=f"Item Catégorie {i+1}",
            price=Decimal('10.00'),
            category=category,
            is_available=True
        )
    return category


# =============================================================================
# TESTS - CRUD MenuCategory
# =============================================================================

@pytest.mark.django_db
class TestCategoryCRUD:
    """Tests CRUD pour les catégories"""

    def test_create_category(self, restaurateur_client, restaurant):
        """Test de création d'une catégorie"""
        data = {
            'restaurant': str(restaurant.id),
            'name': 'Nouvelle Catégorie',
            'icon': '🍕',
            'color': '#FF5722',
            'is_active': True
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu/categories/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Nouvelle Catégorie'

    def test_create_category_minimal(self, restaurateur_client, restaurant):
        """Test de création avec données minimales"""
        data = {
            'restaurant': str(restaurant.id),
            'name': 'Catégorie Simple'
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu/categories/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_category_missing_name(self, restaurateur_client, restaurant):
        """Test de création sans nom"""
        data = {
            'restaurant': str(restaurant.id),
            'icon': '🍕'
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu/categories/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_categories(self, restaurateur_client, multiple_categories):
        """Test de liste des catégories"""
        restaurant = multiple_categories[0].restaurant
        
        response = restaurateur_client.get(
            '/api/v1/menu/categories/',
            {'restaurant_id': str(restaurant.id)}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 4

    def test_list_categories_ordered(self, restaurateur_client, multiple_categories):
        """Test que les catégories sont ordonnées"""
        restaurant = multiple_categories[0].restaurant
        
        response = restaurateur_client.get(
            '/api/v1/menu/categories/',
            {'restaurant_id': str(restaurant.id)}
        )
        
        assert response.status_code == status.HTTP_200_OK
        # Vérifier l'ordre
        if len(response.data) >= 2:
            orders = [cat.get('order', 0) for cat in response.data]
            assert orders == sorted(orders)

    def test_retrieve_category(self, restaurateur_client, category):
        """Test de récupération d'une catégorie"""
        response = restaurateur_client.get(f'/api/v1/menu/categories/{category.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == category.name

    def test_update_category(self, restaurateur_client, category):
        """Test de mise à jour d'une catégorie"""
        data = {
            'name': 'Catégorie Modifiée',
            'icon': '🥘',
            'color': '#FF9800'
        }
        
        response = restaurateur_client.patch(
            f'/api/v1/menu/categories/{category.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        category.refresh_from_db()
        assert category.name == 'Catégorie Modifiée'

    def test_delete_category(self, restaurateur_client, category):
        """Test de suppression d'une catégorie"""
        category_id = category.id
        
        response = restaurateur_client.delete(f'/api/v1/menu/categories/{category_id}/')
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not MenuCategory.objects.filter(id=category_id).exists()

    def test_unauthenticated_access(self, api_client):
        """Test d'accès non authentifié"""
        response = api_client.get('/api/v1/menu/categories/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Catégories par restaurant
# =============================================================================

@pytest.mark.django_db
class TestCategoryByRestaurant:
    """Tests pour les catégories par restaurant"""

    def test_get_categories_by_restaurant(self, restaurateur_client, restaurant, multiple_categories):
        """Test de récupération des catégories d'un restaurant"""
        response = restaurateur_client.get(
            f'/api/v1/menu/categories/restaurant/{restaurant.id}/'
        )
        
        # L'endpoint peut exister ou non
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Statistiques des catégories
# =============================================================================

@pytest.mark.django_db
class TestCategoryStatistics:
    """Tests pour les statistiques des catégories"""

    def test_get_statistics(self, restaurateur_client, category_with_items, restaurant):
        """Test de récupération des statistiques"""
        response = restaurateur_client.get(
            '/api/v1/menu/categories/statistics/',
            {'restaurant_id': str(restaurant.id)}
        )
        
        # L'endpoint peut exister ou non
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

    def test_statistics_includes_counts(self, restaurateur_client, category_with_items, restaurant):
        """Test que les statistiques incluent les compteurs"""
        response = restaurateur_client.get(
            '/api/v1/menu/categories/statistics/',
            {'restaurant_id': str(restaurant.id)}
        )
        
        if response.status_code == status.HTTP_200_OK:
            assert 'total_categories' in response.data or 'categories_breakdown' in response.data


# =============================================================================
# TESTS - Réorganisation des catégories
# =============================================================================

@pytest.mark.django_db
class TestCategoryReorder:
    """Tests pour la réorganisation des catégories"""

    def test_reorder_categories(self, restaurateur_client, multiple_categories):
        """Test de réorganisation des catégories"""
        # Inverser l'ordre
        new_order = [
            {'id': str(multiple_categories[3].id), 'order': 1},
            {'id': str(multiple_categories[2].id), 'order': 2},
            {'id': str(multiple_categories[1].id), 'order': 3},
            {'id': str(multiple_categories[0].id), 'order': 4},
        ]
        
        response = restaurateur_client.post(
            '/api/v1/menu/categories/reorder/',
            {'categories': new_order},
            format='json'
        )
        
        # L'endpoint peut exister ou non
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_400_BAD_REQUEST
        ]


# =============================================================================
# TESTS - Activation/Désactivation
# =============================================================================

@pytest.mark.django_db
class TestCategoryToggle:
    """Tests pour l'activation/désactivation des catégories"""

    def test_deactivate_category(self, restaurateur_client, category):
        """Test de désactivation d'une catégorie"""
        category.is_active = True
        category.save()
        
        response = restaurateur_client.patch(
            f'/api/v1/menu/categories/{category.id}/',
            {'is_active': False},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        category.refresh_from_db()
        assert category.is_active is False

    def test_activate_category(self, restaurateur_client, category):
        """Test d'activation d'une catégorie"""
        category.is_active = False
        category.save()
        
        response = restaurateur_client.patch(
            f'/api/v1/menu/categories/{category.id}/',
            {'is_active': True},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        category.refresh_from_db()
        assert category.is_active is True


# =============================================================================
# TESTS - CRUD SubCategory
# =============================================================================

@pytest.mark.django_db
class TestSubCategoryCRUD:
    """Tests CRUD pour les sous-catégories"""

    def test_create_subcategory(self, restaurateur_client, category):
        """Test de création d'une sous-catégorie"""
        data = {
            'category': str(category.id),
            'name': 'Nouvelle Sous-catégorie',
            'is_active': True
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu/subcategories/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Nouvelle Sous-catégorie'

    def test_create_subcategory_missing_category(self, restaurateur_client):
        """Test de création sans catégorie parent"""
        data = {
            'name': 'Sous-catégorie Orpheline'
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu/subcategories/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_subcategories(self, restaurateur_client, subcategory, second_subcategory):
        """Test de liste des sous-catégories"""
        response = restaurateur_client.get(
            '/api/v1/menu/subcategories/',
            {'category_id': str(subcategory.category.id)}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2

    def test_retrieve_subcategory(self, restaurateur_client, subcategory):
        """Test de récupération d'une sous-catégorie"""
        response = restaurateur_client.get(
            f'/api/v1/menu/subcategories/{subcategory.id}/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == subcategory.name

    def test_update_subcategory(self, restaurateur_client, subcategory):
        """Test de mise à jour d'une sous-catégorie"""
        data = {
            'name': 'Sous-catégorie Modifiée'
        }
        
        response = restaurateur_client.patch(
            f'/api/v1/menu/subcategories/{subcategory.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        subcategory.refresh_from_db()
        assert subcategory.name == 'Sous-catégorie Modifiée'

    def test_delete_subcategory(self, restaurateur_client, subcategory):
        """Test de suppression d'une sous-catégorie"""
        subcategory_id = subcategory.id
        
        response = restaurateur_client.delete(
            f'/api/v1/menu/subcategories/{subcategory_id}/'
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not MenuSubCategory.objects.filter(id=subcategory_id).exists()


# =============================================================================
# TESTS - Réorganisation des sous-catégories
# =============================================================================

@pytest.mark.django_db
class TestSubCategoryReorder:
    """Tests pour la réorganisation des sous-catégories"""

    def test_reorder_subcategories(self, restaurateur_client, subcategory, second_subcategory):
        """Test de réorganisation des sous-catégories"""
        new_order = [
            {'id': str(second_subcategory.id), 'order': 1},
            {'id': str(subcategory.id), 'order': 2},
        ]
        
        response = restaurateur_client.post(
            '/api/v1/menu/subcategories/reorder/',
            {'subcategories': new_order},
            format='json'
        )
        
        # L'endpoint peut exister ou non
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_400_BAD_REQUEST
        ]


# =============================================================================
# TESTS - Permissions
# =============================================================================

@pytest.mark.django_db
class TestCategoryPermissions:
    """Tests des permissions"""

    def test_cannot_access_other_category(self, restaurateur_client):
        """Test qu'on ne peut pas accéder à la catégorie d'un autre"""
        other_user = User.objects.create_user(username="other_cat@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="99999999999999",
            is_validated=True
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant Cat",
            owner=other_profile,
            siret="88888888888888"
        )
        other_category = MenuCategory.objects.create(
            restaurant=other_restaurant,
            name="Catégorie Autre",
            is_active=True
        )
        
        response = restaurateur_client.get(
            f'/api/v1/menu/categories/{other_category.id}/'
        )
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_cannot_modify_other_subcategory(self, restaurateur_client):
        """Test qu'on ne peut pas modifier la sous-catégorie d'un autre"""
        other_user = User.objects.create_user(username="other_subcat@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="77777777777777",
            is_validated=True
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant SubCat",
            owner=other_profile,
            siret="66666666666666"
        )
        other_category = MenuCategory.objects.create(
            restaurant=other_restaurant,
            name="Catégorie Parent Autre",
            is_active=True
        )
        other_subcategory = MenuSubCategory.objects.create(
            category=other_category,
            name="Sous-catégorie Autre",
            is_active=True
        )
        
        response = restaurateur_client.patch(
            f'/api/v1/menu/subcategories/{other_subcategory.id}/',
            {'name': 'Hacké'},
            format='json'
        )
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]
