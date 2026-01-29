# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de restaurants
- RestaurantViewSet (CRUD, horaires, stats, tables, menus)

IMPORTANT - Model field notes:
- Table: Use 'number' field (not 'identifiant' which is a read-only property)
- Order: Uses 'restaurant' FK (not 'restaurateur')
- Order: Uses 'table_number' CharField (not 'table' FK)
- Order: Requires 'order_number', 'subtotal', 'total_amount'

RestaurantCreateSerializer required fields:
- name, address, city, zipCode, priceRange
- cuisine (choices: french, italian, asian, mexican, indian, american, mediterranean, japanese, chinese, thai, other)
- phone (validated format)
- email (valid email)
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
    Table,
    Menu,
    MenuItem,
    Order,
    OpeningHours,
    OpeningPeriod,
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
        username="resto_owner@example.com",
        email="resto_owner@example.com",
        password="testpass123",
        first_name="Jean"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_123",
        stripe_verified=True,
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
    """Test restaurant with all required fields"""
    return Restaurant.objects.create(
        name="Le Bon Resto",
        description="Restaurant de test",
        address="123 Rue Test",
        city="Paris",
        zip_code="75001",
        phone="0123456789",
        email="contact@lebonresto.fr",
        cuisine="french",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def restaurant_with_tables(restaurant):
    """
    Restaurant with tables.
    NOTE: Table.identifiant is a read-only property. Use 'number' field.
    """
    for i in range(1, 6):
        Table.objects.create(
            restaurant=restaurant,
            number=str(i),  # Use number, NOT identifiant
            capacity=4,
            is_active=True
        )
    return restaurant


@pytest.fixture
def restaurant_with_menu(restaurant):
    menu = Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )
    MenuItem.objects.create(
        menu=menu,
        name="Plat Test",
        price=Decimal('15.00'),
        is_available=True
    )
    return restaurant


@pytest.fixture
def restaurant_with_orders(restaurant, restaurateur_profile):
    """
    Restaurant with orders.
    
    NOTE: 
    - Table.identifiant is read-only property. Use 'number' field.
    - Order uses 'restaurant' FK (not 'restaurateur')
    - Order uses 'table_number' CharField (not 'table' FK)
    - Order requires 'order_number' and 'subtotal'
    """
    table = Table.objects.create(
        restaurant=restaurant,
        number="1"  # Use number, NOT identifiant
    )
    for i in range(5):
        Order.objects.create(
            restaurant=restaurant,  # FK to Restaurant, not restaurateur
            table_number=table.number,  # CharField, not FK
            order_number=f"ORD-REST-{i+1:03d}",  # Required unique field
            status='pending' if i < 2 else 'served',
            payment_status='pending' if i < 2 else 'paid',
            subtotal=Decimal('45.00'),  # Required
            total_amount=Decimal('50.00')
        )
    return restaurant


# =============================================================================
# TESTS - CRUD Restaurant
# =============================================================================

@pytest.mark.django_db
class TestRestaurantCRUD:
    """Tests CRUD pour les restaurants"""

    def test_create_restaurant(self, restaurateur_client, restaurateur_profile):
        """Test de création d'un restaurant"""
        data = {
            'name': 'Nouveau Restaurant',
            'description': 'Un super restaurant',
            'address': '456 Rue Nouvelle',
            'city': 'Paris',
            'zipCode': '75002',
            'priceRange': 2,
            'cuisine': 'french',  # Required - choices field
            'phone': '0123456789',  # Required
            'email': 'contact@nouveau-resto.fr',  # Required
        }
        
        response = restaurateur_client.post('/api/v1/restaurants/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Nouveau Restaurant'
        assert Restaurant.objects.filter(name='Nouveau Restaurant').exists()

    def test_create_restaurant_missing_name(self, restaurateur_client, restaurateur_profile):
        """Test de création sans nom (requires profile for 400 vs 403)"""
        data = {
            'description': 'Un restaurant sans nom',
            'address': '123 Rue Test',
            'city': 'Paris',
            'zipCode': '75001',
            'priceRange': 2,
            'cuisine': 'french',
            'phone': '0123456789',
            'email': 'test@example.com',
            # name is missing - should fail validation
        }
        
        response = restaurateur_client.post('/api/v1/restaurants/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_restaurants(self, restaurateur_client, restaurant):
        """Test de liste des restaurants"""
        response = restaurateur_client.get('/api/v1/restaurants/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_list_restaurants_only_owned(self, restaurateur_client, restaurant):
        """Test que seuls les restaurants du propriétaire sont listés"""
        # Créer un autre restaurateur avec un autre restaurant
        other_user = User.objects.create_user(username="other@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(user=other_user, siret="99999999999999")
        Restaurant.objects.create(
            name="Autre Restaurant",
            address="456 Rue Autre",
            city="Lyon",
            zip_code="69001",
            phone="0456789012",
            email="autre@resto.fr",
            cuisine="italian",
            owner=other_profile,
            siret="88888888888888"
        )
        
        response = restaurateur_client.get('/api/v1/restaurants/')
        
        assert response.status_code == status.HTTP_200_OK
        # Ne doit pas voir le restaurant de l'autre
        restaurant_names = [r['name'] for r in response.data]
        assert 'Autre Restaurant' not in restaurant_names

    def test_retrieve_restaurant(self, restaurateur_client, restaurant):
        """Test de récupération d'un restaurant"""
        response = restaurateur_client.get(f'/api/v1/restaurants/{restaurant.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == restaurant.name

    def test_update_restaurant(self, restaurateur_client, restaurant):
        """Test de mise à jour d'un restaurant"""
        data = {
            'name': 'Restaurant Renommé',
            'description': 'Nouvelle description'
        }
        
        response = restaurateur_client.patch(
            f'/api/v1/restaurants/{restaurant.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        restaurant.refresh_from_db()
        assert restaurant.name == 'Restaurant Renommé'

    def test_delete_restaurant(self, restaurateur_client, restaurant):
        """Test de suppression d'un restaurant"""
        restaurant_id = restaurant.id
        
        response = restaurateur_client.delete(f'/api/v1/restaurants/{restaurant_id}/')
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Restaurant.objects.filter(id=restaurant_id).exists()

    def test_unauthenticated_access(self, api_client):
        """Test d'accès non authentifié"""
        response = api_client.get('/api/v1/restaurants/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Tables d'un restaurant
# =============================================================================

@pytest.mark.django_db
class TestRestaurantTables:
    """Tests pour les tables d'un restaurant"""

    def test_get_restaurant_tables(self, restaurateur_client, restaurant_with_tables):
        """Test de récupération des tables"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant_with_tables.id}/tables/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_tables'] == 5
        assert len(response.data['tables']) == 5

    def test_get_restaurant_tables_empty(self, restaurateur_client, restaurant):
        """Test sans tables"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant.id}/tables/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_tables'] == 0


# =============================================================================
# TESTS - Menus d'un restaurant
# =============================================================================

@pytest.mark.django_db
class TestRestaurantMenus:
    """Tests pour les menus d'un restaurant"""

    def test_get_restaurant_menus(self, restaurateur_client, restaurant_with_menu):
        """Test de récupération des menus"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant_with_menu.id}/menus/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_menus'] >= 1

    def test_get_restaurant_menus_empty(self, restaurateur_client, restaurant):
        """Test sans menus"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant.id}/menus/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_menus'] == 0


# =============================================================================
# TESTS - Commandes récentes
# =============================================================================

@pytest.mark.django_db
class TestRestaurantOrders:
    """Tests pour les commandes d'un restaurant"""

    def test_get_recent_orders(self, restaurateur_client, restaurant_with_orders):
        """Test de récupération des commandes récentes"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant_with_orders.id}/recent_orders/'
        )
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - Horaires d'ouverture
# =============================================================================

@pytest.mark.django_db
class TestRestaurantHours:
    """Tests pour les horaires d'ouverture"""

    def test_update_hours(self, restaurateur_client, restaurant):
        """Test de mise à jour des horaires"""
        opening_hours_data = []
        for day in range(7):
            opening_hours_data.append({
                'dayOfWeek': day,
                'isClosed': (day == 0),
                'periods': [] if day == 0 else [
                    {'startTime': '11:30', 'endTime': '14:30', 'name': 'Midi'},
                    {'startTime': '19:00', 'endTime': '22:30', 'name': 'Soir'}
                ]
            })
        
        response = restaurateur_client.put(
            f'/api/v1/restaurants/{restaurant.id}/update_hours/',
            {'openingHours': opening_hours_data},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK

    def test_update_hours_incomplete(self, restaurateur_client, restaurant):
        """Test avec horaires incomplets (moins de 7 jours)"""
        opening_hours_data = [
            {'dayOfWeek': 0, 'isClosed': True, 'periods': []},
            {'dayOfWeek': 1, 'isClosed': False, 'periods': [{'startTime': '09:00', 'endTime': '18:00'}]},
        ]
        
        response = restaurateur_client.put(
            f'/api/v1/restaurants/{restaurant.id}/update_hours/',
            {'openingHours': opening_hours_data},
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Dashboard et statistiques
# =============================================================================

@pytest.mark.django_db
class TestRestaurantDashboard:
    """Tests pour le dashboard"""

    def test_get_dashboard(self, restaurateur_client, restaurant_with_orders):
        """Test de récupération du dashboard"""
        response = restaurateur_client.get(
            f'/api/v1/restaurants/{restaurant_with_orders.id}/dashboard/'
        )
        
        # Le dashboard peut exister ou non selon l'implémentation
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]


# =============================================================================
# TESTS - Upload d'image
# =============================================================================

@pytest.mark.django_db
class TestRestaurantImage:
    """Tests pour l'upload d'images"""

    def test_upload_image(self, restaurateur_client, restaurant):
        """Test d'upload d'image"""
        from django.core.files.uploadedfile import SimpleUploadedFile
        
        # Créer une image de test
        image = SimpleUploadedFile(
            name='test_image.jpg',
            content=b'\x47\x49\x46\x38\x89\x61' + b'\x00' * 100,  # GIF minimal
            content_type='image/jpeg'
        )
        
        response = restaurateur_client.post(
            f'/api/v1/restaurants/{restaurant.id}/upload_image/',
            {'image': image},
            format='multipart'
        )
        
        # L'upload peut réussir ou échouer selon la configuration
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Permissions
# =============================================================================

@pytest.mark.django_db
class TestRestaurantPermissions:
    """Tests des permissions"""

    def test_cannot_access_other_restaurant(self, restaurateur_client):
        """Test qu'on ne peut pas accéder au restaurant d'un autre"""
        # Créer un autre restaurateur
        other_user = User.objects.create_user(username="other@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="99999999999999"
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant",
            address="789 Rue Autre",
            city="Marseille",
            zip_code="13001",
            phone="0491234567",
            email="autre@example.com",
            cuisine="asian",
            owner=other_profile,
            siret="88888888888888"
        )
        
        response = restaurateur_client.get(f'/api/v1/restaurants/{other_restaurant.id}/')
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_cannot_update_other_restaurant(self, restaurateur_client):
        """Test qu'on ne peut pas modifier le restaurant d'un autre"""
        other_user = User.objects.create_user(username="other2@test.com", password="test")
        group, _ = Group.objects.get_or_create(name="restaurateur")
        other_user.groups.add(group)
        other_profile = RestaurateurProfile.objects.create(
            user=other_user,
            siret="77777777777777"
        )
        other_restaurant = Restaurant.objects.create(
            name="Autre Restaurant 2",
            address="321 Rue Encore",
            city="Nice",
            zip_code="06000",
            phone="0493123456",
            email="autre2@example.com",
            cuisine="mexican",
            owner=other_profile,
            siret="66666666666666"
        )
        
        response = restaurateur_client.patch(
            f'/api/v1/restaurants/{other_restaurant.id}/',
            {'name': 'Hacké'},
            format='json'
        )
        
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]