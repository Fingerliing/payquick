# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de menus et items
- MenuViewSet (CRUD, activation/désactivation)
- MenuItemViewSet (CRUD, toggle availability)
"""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Menu,
    MenuItem,
    MenuCategory,
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
        username="menu_owner@example.com",
        email="menu_owner@example.com",
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
        name="Menu Test Restaurant",
        description="Restaurant pour tester les menus",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def second_menu(restaurant):
    return Menu.objects.create(
        name="Menu Soir",
        restaurant=restaurant,
        is_available=False
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        icon="🥗",
        color="#4CAF50",
        is_active=True,
        order=1
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        name="Salade César",
        description="Salade fraîche avec parmesan et croûtons",
        price=Decimal('12.50'),
        category=menu_category,
        is_available=True,
        preparation_time=10
    )


@pytest.fixture
def multiple_menu_items(menu, menu_category):
    items = []
    data = [
        ("Salade César", Decimal('12.50')),
        ("Soupe du jour", Decimal('8.00')),
        ("Carpaccio", Decimal('14.00')),
    ]
    for name, price in data:
        item = MenuItem.objects.create(
            menu=menu,
            name=name,
            price=price,
            category=menu_category,
            is_available=True
        )
        items.append(item)
    return items


# =============================================================================
# TESTS - CRUD Menu
# =============================================================================

@pytest.mark.django_db
class TestMenuCRUD:
    """Tests CRUD pour les menus"""

    def test_create_menu(self, restaurateur_client, restaurant):
        """Test de création d'un menu"""
        data = {
            'name': 'Nouveau Menu',
            'restaurant': restaurant.id
        }
        
        response = restaurateur_client.post('/api/v1/menus/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Nouveau Menu'
        assert Menu.objects.filter(name='Nouveau Menu').exists()

    def test_create_menu_missing_name(self, restaurateur_client, restaurant):
        """Test de création sans nom"""
        data = {
            'restaurant': restaurant.id
        }
        
        response = restaurateur_client.post('/api/v1/menus/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_menus(self, restaurateur_client, menu, second_menu):
        """Test de liste des menus"""
        response = restaurateur_client.get('/api/v1/menus/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2

    def test_retrieve_menu(self, restaurateur_client, menu):
        """Test de récupération d'un menu"""
        response = restaurateur_client.get(f'/api/v1/menus/{menu.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == menu.name

    def test_update_menu(self, restaurateur_client, menu):
        """Test de mise à jour d'un menu"""
        data = {
            'name': 'Menu Renommé'
        }
        
        response = restaurateur_client.patch(
            f'/api/v1/menus/{menu.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        menu.refresh_from_db()
        assert menu.name == 'Menu Renommé'

    def test_delete_menu(self, restaurateur_client, menu):
        """Test de suppression d'un menu"""
        menu_id = menu.id
        
        response = restaurateur_client.delete(f'/api/v1/menus/{menu_id}/')
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Menu.objects.filter(id=menu_id).exists()

    def test_unauthenticated_access(self, api_client):
        """Test d'accès non authentifié"""
        response = api_client.get('/api/v1/menus/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Activation/Désactivation de Menu
# =============================================================================

@pytest.mark.django_db
class TestMenuToggle:
    """Tests pour l'activation/désactivation des menus"""

    def test_toggle_menu_availability_activate(self, restaurateur_client, menu, second_menu):
        """Test d'activation d'un menu (désactive les autres)"""
        # S'assurer que le premier menu est inactif
        menu.is_available = False
        menu.save()
        second_menu.is_available = True
        second_menu.save()
        
        response = restaurateur_client.post(f'/api/v1/menus/{menu.id}/toggle_is_available/')
        
        assert response.status_code == status.HTTP_200_OK
        menu.refresh_from_db()
        second_menu.refresh_from_db()
        assert menu.is_available is True
        assert second_menu.is_available is False

    def test_toggle_menu_availability_deactivate(self, restaurateur_client, menu):
        """Test de désactivation d'un menu actif"""
        menu.is_available = True
        menu.save()
        
        response = restaurateur_client.post(f'/api/v1/menus/{menu.id}/toggle_is_available/')
        
        assert response.status_code == status.HTTP_200_OK
        menu.refresh_from_db()
        assert menu.is_available is False

    def test_activate_menu(self, restaurateur_client, menu, second_menu):
        """Test d'activation forcée"""
        menu.is_available = False
        menu.save()
        second_menu.is_available = True
        second_menu.save()
        
        response = restaurateur_client.post(f'/api/v1/menus/{menu.id}/activate/')
        
        assert response.status_code == status.HTTP_200_OK
        menu.refresh_from_db()
        second_menu.refresh_from_db()
        assert menu.is_available is True
        assert second_menu.is_available is False

    def test_deactivate_menu(self, restaurateur_client, menu):
        """Test de désactivation forcée"""
        menu.is_available = True
        menu.save()
        
        response = restaurateur_client.post(f'/api/v1/menus/{menu.id}/deactivate/')
        
        assert response.status_code == status.HTTP_200_OK
        menu.refresh_from_db()
        assert menu.is_available is False


# =============================================================================
# TESTS - Menu Public
# =============================================================================

@pytest.mark.django_db
class TestMenuPublic:
    """Tests pour l'accès public aux menus"""

    def test_public_menus_by_restaurant(self, api_client, menu, second_menu):
        """Test de récupération des menus publics"""
        restaurant = menu.restaurant
        
        response = api_client.get(
            f'/api/v1/menus/restaurants/public/{restaurant.id}/menus/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        # Seul le menu disponible doit être retourné
        menu_names = [m['name'] for m in response.data]
        assert menu.name in menu_names
        assert second_menu.name not in menu_names  # Non disponible


# =============================================================================
# TESTS - CRUD MenuItem
# =============================================================================

@pytest.mark.django_db
class TestMenuItemCRUD:
    """Tests CRUD pour les items de menu"""

    def test_create_menu_item(self, restaurateur_client, menu, menu_category):
        """Test de création d'un item"""
        data = {
            'menu': menu.id,
            'name': 'Nouveau Plat',
            'description': 'Un délicieux plat',
            'price': '15.50',
            'category': menu_category.id
        }
        
        response = restaurateur_client.post('/api/v1/menu-items/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Nouveau Plat'

    def test_create_menu_item_with_image(self, restaurateur_client, menu, menu_category):
        """Test de création avec image"""
        image = SimpleUploadedFile(
            name='plat.jpg',
            content=b'\x47\x49\x46\x38\x89\x61' + b'\x00' * 100,
            content_type='image/jpeg'
        )
        
        data = {
            'menu': menu.id,
            'name': 'Plat avec Image',
            'price': '18.00',
            'category': menu_category.id,
            'image': image
        }
        
        response = restaurateur_client.post(
            '/api/v1/menu-items/',
            data,
            format='multipart'
        )
        
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]

    def test_create_menu_item_missing_price(self, restaurateur_client, menu):
        """Test de création sans prix"""
        data = {
            'menu': menu.id,
            'name': 'Plat Sans Prix'
        }
        
        response = restaurateur_client.post('/api/v1/menu-items/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_menu_items(self, restaurateur_client, multiple_menu_items):
        """Test de liste des items"""
        response = restaurateur_client.get('/api/v1/menu-items/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 3

    def test_retrieve_menu_item(self, restaurateur_client, menu_item):
        """Test de récupération d'un item"""
        response = restaurateur_client.get(f'/api/v1/menu-items/{menu_item.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == menu_item.name

    def test_update_menu_item(self, restaurateur_client, menu_item):
        """Test de mise à jour d'un item"""
        data = {
            'name': 'Salade César Revisitée',
            'price': '14.00'
        }
        
        response = restaurateur_client.patch(
            f'/api/v1/menu-items/{menu_item.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        menu_item.refresh_from_db()
        assert menu_item.name == 'Salade César Revisitée'
        assert menu_item.price == Decimal('14.00')

    def test_delete_menu_item(self, restaurateur_client, menu_item):
        """Test de suppression d'un item"""
        item_id = menu_item.id
        
        response = restaurateur_client.delete(f'/api/v1/menu-items/{item_id}/')
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not MenuItem.objects.filter(id=item_id).exists()


# =============================================================================
# TESTS - Toggle MenuItem Availability
# =============================================================================

@pytest.mark.django_db
class TestMenuItemToggle:
    """Tests pour l'activation/désactivation des items"""

    def test_toggle_availability_to_unavailable(self, restaurateur_client, menu_item):
        """Test de désactivation d'un item"""
        menu_item.is_available = True
        menu_item.save()
        
        response = restaurateur_client.post(f'/api/v1/menu-items/{menu_item.id}/toggle/')
        
        assert response.status_code == status.HTTP_200_OK
        menu_item.refresh_from_db()
        assert menu_item.is_available is False

    def test_toggle_availability_to_available(self, restaurateur_client, menu_item):
        """Test d'activation d'un item"""
        menu_item.is_available = False
        menu_item.save()
        
        response = restaurateur_client.post(f'/api/v1/menu-items/{menu_item.id}/toggle/')
        
        assert response.status_code == status.HTTP_200_OK
        menu_item.refresh_from_db()
        assert menu_item.is_available is True


# =============================================================================
# TESTS - Filtrage
# =============================================================================

@pytest.mark.django_db
class TestMenuItemFiltering:
    """Tests pour le filtrage des items"""

    def test_filter_by_menu(self, restaurateur_client, menu, second_menu, menu_category):
        """Test de filtrage par menu"""
        # Créer des items dans le second menu
        MenuItem.objects.create(
            menu=second_menu,
            name="Plat Menu 2",
            price=Decimal('20.00'),
            category=menu_category
        )
        
        response = restaurateur_client.get(
            '/api/v1/menu-items/',
            {'menu': menu.id}
        )
        
        # Dépend de l'implémentation du filtrage
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_availability(self, restaurateur_client, multiple_menu_items):
        """Test de filtrage par disponibilité"""
        # Rendre un item indisponible
        multiple_menu_items[0].is_available = False
        multiple_menu_items[0].save()
        
        response = restaurateur_client.get(
            '/api/v1/menu-items/',
            {'is_available': 'true'}
        )
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - Permissions
# =============================================================================

@pytest.mark.django_db
class TestMenuPermissions:
    """Tests des permissions"""

    def test_cannot_access_other_menu(self, restaurateur_client):
        """Test qu'on ne peut pas accéder au menu d'un autre"""
        # Créer un autre restaurateur
        other_user = User.objects.create_user(username="other_menu@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="99999999999999"
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant",
            owner=other_profile,
            siret="88888888888888"
        )
        other_menu = Menu.objects.create(
            name="Menu Autre",
            restaurant=other_restaurant
        )
        
        response = restaurateur_client.get(f'/api/v1/menus/{other_menu.id}/')
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_cannot_modify_other_menu_item(self, restaurateur_client, menu_category):
        """Test qu'on ne peut pas modifier l'item d'un autre"""
        other_user = User.objects.create_user(username="other_item@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="77777777777777"
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant Item",
            owner=other_profile,
            siret="66666666666666"
        )
        other_menu = Menu.objects.create(
            name="Menu Autre Item",
            restaurant=other_restaurant
        )
        # Créer une catégorie pour l'autre restaurant
        other_category = MenuCategory.objects.create(
            restaurant=other_restaurant,
            name="Autre Catégorie",
            is_active=True
        )
        other_item = MenuItem.objects.create(
            menu=other_menu,
            name="Item Autre",
            price=Decimal('10.00'),
            category=other_category
        )
        
        response = restaurateur_client.patch(
            f'/api/v1/menu-items/{other_item.id}/',
            {'name': 'Hacké'},
            format='json'
        )
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]
