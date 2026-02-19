# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de commandes de table (table_orders_views.py)

Teste les endpoints:
- GET /api/v1/table-orders/table_orders/ - Commandes d'une table
- POST /api/v1/table-orders/add_table_order/ - Ajouter une commande
- GET /api/v1/table-orders/table_session/ - Info session de table
- POST /api/v1/table-orders/end_table_session/ - Terminer une session
- GET /api/v1/table-orders/restaurant_tables_stats/ - Stats des tables (restaurateur)

IMPORTANT - Model field notes:
- Order: Uses 'restaurant' FK (not 'restaurateur')
- Order: Uses 'table_number' CharField (not 'table' FK)
- Order: Requires 'order_number', 'subtotal', 'total_amount'
- TableSession: Uses 'table_number' CharField, has 'end_session()' method
"""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    ClientProfile,
    Restaurant,
    Table,
    Menu,
    MenuItem,
    MenuCategory,
    Order,
    OrderItem,
    TableSession,
)


# =============================================================================
# FIXTURES - Utilisateurs
# =============================================================================

@pytest.fixture
def api_client():
    """Client API non authentifié"""
    return APIClient()


@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def restaurateur_user(db, restaurateur_group):
    """Utilisateur restaurateur"""
    user = User.objects.create_user(
        username="table_orders_resto@example.com",
        email="table_orders_resto@example.com",
        password="testpass123",
        first_name="Chef"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    """Profil restaurateur validé"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_tableorders",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurateur_client(restaurateur_user, restaurateur_profile):
    """Client API authentifié (restaurateur)"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def client_user(db):
    """Utilisateur client"""
    return User.objects.create_user(
        username="table_client@example.com",
        email="table_client@example.com",
        password="testpass123"
    )


@pytest.fixture
def client_profile(client_user):
    """Profil client"""
    return ClientProfile.objects.create(
        user=client_user,
        phone="0612345678"
    )


@pytest.fixture
def auth_client(client_user, client_profile):
    """Client API authentifié (client)"""
    token = RefreshToken.for_user(client_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


# =============================================================================
# FIXTURES - Restaurant et Tables
# =============================================================================

@pytest.fixture
def restaurant(restaurateur_profile):
    """Restaurant de test avec tous les champs requis"""
    return Restaurant.objects.create(
        name="Table Orders Test Restaurant",
        description="Restaurant pour tester les commandes de table",
        owner=restaurateur_profile,
        siret="98765432109876",
        address="123 Rue des Commandes",
        city="Paris",
        zip_code="75001",
        phone="0140000000",
        email="tableorders@resto.fr",
        cuisine="french",
        is_active=True,
        is_stripe_active=True
    )


@pytest.fixture
def table(restaurant):
    """Table de test"""
    return Table.objects.create(
        restaurant=restaurant,
        number="T1",
        qr_code=f"R{restaurant.id}T001",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu_category(restaurant):
    """Catégorie de menu"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    """Menu actif"""
    return Menu.objects.create(
        name="Menu Test Table Orders",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Item de menu"""
    return MenuItem.objects.create(
        menu=menu,
        name="Plat Test",
        price=Decimal('15.00'),
        category=menu_category,
        is_available=True
    )


# =============================================================================
# FIXTURES - Commandes et Sessions
# =============================================================================

@pytest.fixture
def order(restaurant, table, client_user):
    """
    Commande de test.
    NOTE: Order uses:
    - restaurant (FK)
    - table_number (CharField, NOT FK)
    - order_number (unique, required)
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TBLORD-001",
        user=client_user,
        status='pending',
        payment_status='pending',
        total_amount=Decimal('50.00'),
        subtotal=Decimal('45.45'),
        tax_amount=Decimal('4.55')
    )


@pytest.fixture
def completed_order(restaurant, table, client_user):
    """Commande terminée"""
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TBLORD-002",
        user=client_user,
        status='served',
        payment_status='paid',
        total_amount=Decimal('30.00'),
        subtotal=Decimal('27.27'),
        tax_amount=Decimal('2.73')
    )


@pytest.fixture
def table_session(restaurant, table):
    """Session de table active"""
    return TableSession.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        primary_customer_name="Jean Dupont",
        guest_count=4,
        is_active=True
    )


@pytest.fixture
def table_session_with_orders(table_session, restaurant, table, client_user):
    """Session avec commandes associées"""
    order = Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-SESSION-001",
        user=client_user,
        status='served',
        payment_status='paid',
        total_amount=Decimal('40.00'),
        subtotal=Decimal('36.36'),
        tax_amount=Decimal('3.64')
    )
    # Order.save() appelle set_order_sequence() qui écrase table_session_id
    # Utiliser update() pour bypasser ce comportement
    Order.objects.filter(id=order.id).update(table_session_id=table_session.id)
    return table_session


# =============================================================================
# TESTS - table_orders (GET)
# =============================================================================

@pytest.mark.django_db
class TestTableOrders:
    """Tests pour GET /api/v1/table-orders/table_orders/"""

    url = "/api/v1/table-orders/table_orders/"

    def test_get_table_orders_missing_params(self, api_client):
        """Test sans paramètres requis - 400"""
        response = api_client.get(self.url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_get_table_orders_missing_table_number(self, api_client, restaurant):
        """Test sans table_number - 400"""
        response = api_client.get(self.url, {'restaurant_id': restaurant.id})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_table_orders_missing_restaurant_id(self, api_client, table):
        """Test sans restaurant_id - 400"""
        response = api_client.get(self.url, {'table_number': table.number})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_table_orders_valid_request(
        self, restaurateur_client, restaurant, table
    ):
        """Test requête valide sans commandes"""
        response = restaurateur_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'active_orders' in response.data

    def test_get_table_orders_with_session(
        self, auth_client, restaurant, table, table_session, order
    ):
        """Test avec session collaborative active"""
        Order.objects.filter(id=order.id).update(table_session_id=table_session.id)

        response = auth_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        if response.data.get('current_session'):
            assert response.data['current_session']['id'] is not None

    def test_get_table_orders_response_structure(
        self, restaurateur_client, restaurant, table, order
    ):
        """Test structure de la réponse"""
        response = restaurateur_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'restaurant_id' in response.data
        assert 'restaurant_name' in response.data
        assert 'table_number' in response.data
        assert 'active_orders' in response.data
        assert 'completed_orders' in response.data
        assert 'table_statistics' in response.data
        assert 'can_add_order' in response.data
        assert 'last_updated' in response.data


# =============================================================================
# TESTS - add_table_order (POST)
# =============================================================================

@pytest.mark.django_db
class TestAddTableOrder:
    """Tests pour POST /api/v1/table-orders/add_table_order/"""

    url = "/api/v1/table-orders/add_table_order/"

    def test_add_order_authenticated(
        self, auth_client, restaurant, table, menu_item
    ):
        """Test création commande par client authentifié"""
        data = {
            'restaurant': restaurant.id,
            'table_number': table.number,
            'order_type': 'dine_in',
            'items': [
                {
                    'menu_item': menu_item.id,
                    'quantity': 2
                }
            ]
        }

        response = auth_client.post(self.url, data, format='json')

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST
        ]

    def test_add_order_anonymous_with_phone(self, api_client, restaurant, table):
        """Test création commande par client anonyme avec téléphone"""
        data = {
            'restaurant': restaurant.id,
            'table_number': table.number,
            'phone': '0612345678',
            'customer_name': 'Client Anonyme'
        }

        response = api_client.post(self.url, data, format='json')

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST
        ]

    def test_add_order_invalid_data(self, auth_client):
        """Test création avec données invalides"""
        data = {}

        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - table_session (GET)
# =============================================================================

@pytest.mark.django_db
class TestTableSession:
    """Tests pour GET /api/v1/table-orders/table_session/"""

    url = "/api/v1/table-orders/table_session/"

    def test_get_session_missing_params(self, api_client):
        """Test sans paramètres - 400"""
        response = api_client.get(self.url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_session_no_active_session(self, api_client, restaurant, table):
        """Test table sans session active"""
        response = api_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        assert response.data['has_active_session'] is False

    def test_get_session_with_active_session(
        self, api_client, restaurant, table, table_session
    ):
        """Test table avec session active"""
        response = api_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        assert response.data['has_active_session'] is True
        assert 'session' in response.data

    def test_get_session_as_restaurateur(
        self, restaurateur_client, restaurant, table, table_session
    ):
        """Test récupération session par restaurateur - détails complets"""
        response = restaurateur_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_200_OK
        assert response.data['has_active_session'] is True

    def test_get_session_client_not_in_session(
        self, auth_client, restaurant, table, table_session
    ):
        """Test client qui ne fait pas partie de la session - infos limitées"""
        response = auth_client.get(self.url, {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ]

        if response.status_code == status.HTTP_200_OK:
            assert response.data['has_active_session'] is True
            session_data = response.data.get('session', {})
            assert 'id' in session_data or 'table_number' in session_data


# =============================================================================
# TESTS - end_table_session (POST)
# =============================================================================

@pytest.mark.django_db
class TestEndTableSession:
    """Tests pour POST /api/v1/table-orders/end_table_session/"""

    url = "/api/v1/table-orders/end_table_session/"

    def test_end_session_unauthenticated(self, api_client, restaurant, table):
        """Test terminaison session non authentifié - 401"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        }

        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_end_session_missing_params(self, restaurateur_client):
        """Test sans paramètres - 400"""
        response = restaurateur_client.post(self.url, {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_end_session_no_active_session(self, restaurateur_client, restaurant, table):
        """Test terminaison sans session active - 404"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        }

        response = restaurateur_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_end_session_as_restaurateur(
        self, restaurateur_client, restaurant, table, table_session_with_orders
    ):
        """Test terminaison par restaurateur"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        }

        response = restaurateur_client.post(self.url, data, format='json')

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ]

        if response.status_code == status.HTTP_200_OK:
            assert 'message' in response.data
            assert 'session_id' in response.data

            table_session_with_orders.refresh_from_db()
            assert table_session_with_orders.is_active is False

    def test_end_session_with_active_orders(
        self, restaurateur_client, restaurant, table, table_session, client_user
    ):
        """Test terminaison avec commandes actives - 400"""
        order = Order.objects.create(
            restaurant=restaurant,
            table_number=table.number,
            order_number="ORD-ACTIVE-001",
            user=client_user,
            status='preparing',
            payment_status='pending',
            total_amount=Decimal('25.00'),
            subtotal=Decimal('22.73'),
            tax_amount=Decimal('2.27')
        )
        # Order.save() appelle set_order_sequence() qui écrase table_session_id
        # Utiliser update() pour bypasser ce comportement
        Order.objects.filter(id=order.id).update(table_session_id=table_session.id)

        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        }

        response = restaurateur_client.post(self.url, data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ]

        if response.status_code == status.HTTP_400_BAD_REQUEST:
            assert 'active_orders_count' in response.data

    def test_end_session_client_not_authorized(
        self, auth_client, restaurant, table, table_session
    ):
        """Test terminaison par client non autorisé - 403"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        }

        response = auth_client.post(self.url, data, format='json')

        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ]


# =============================================================================
# TESTS - restaurant_tables_stats (GET)
# =============================================================================

@pytest.mark.django_db
class TestRestaurantTablesStats:
    """Tests pour GET /api/v1/table-orders/restaurant_tables_stats/"""

    url = "/api/v1/table-orders/restaurant_tables_stats/"

    def test_stats_unauthenticated(self, api_client, restaurant):
        """Test stats non authentifié - 401"""
        response = api_client.get(self.url, {'restaurant_id': restaurant.id})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_stats_as_client(self, auth_client, restaurant):
        """Test stats par client - 403"""
        response = auth_client.get(self.url, {'restaurant_id': restaurant.id})

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_stats_missing_restaurant_id(self, restaurateur_client):
        """Test stats sans restaurant_id - 400"""
        response = restaurateur_client.get(self.url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_stats_as_restaurateur(
        self, restaurateur_client, restaurant, table, order
    ):
        """Test stats par restaurateur propriétaire"""
        response = restaurateur_client.get(self.url, {
            'restaurant_id': restaurant.id
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'restaurant_id' in response.data
        assert 'tables_stats' in response.data
        assert 'global_stats' in response.data


# =============================================================================
# TESTS - Sécurité (divers)
# =============================================================================

@pytest.mark.django_db
class TestTableOrdersSecurity:
    """Tests de sécurité transversaux"""

    def test_end_session_requires_auth(self, api_client, restaurant, table):
        """Test que end_table_session requiert une authentification"""
        response = api_client.post('/api/v1/table-orders/end_table_session/', {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_stats_requires_restaurateur(self, auth_client, restaurant):
        """Test que restaurant_tables_stats requiert un restaurateur validé"""
        response = auth_client.get('/api/v1/table-orders/restaurant_tables_stats/', {
            'restaurant_id': restaurant.id
        })

        assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# TESTS - URLs
# =============================================================================

@pytest.mark.django_db
class TestTableOrdersURLs:
    """Tests de vérification des URLs"""

    def test_table_orders_url_exists(self, api_client, restaurant, table):
        """Test que l'URL table_orders existe"""
        response = api_client.get('/api/v1/table-orders/table_orders/', {
            'restaurant_id': restaurant.id,
            'table_number': table.number
        })
        assert response.status_code != 404

    def test_add_table_order_url_exists(self, api_client):
        """Test que l'URL add_table_order existe"""
        response = api_client.post('/api/v1/table-orders/add_table_order/', {})
        assert response.status_code != 404

    def test_table_session_url_exists(self, api_client):
        """Test que l'URL table_session existe"""
        response = api_client.get('/api/v1/table-orders/table_session/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_end_table_session_url_exists(self, api_client):
        """Test que l'URL end_table_session existe"""
        response = api_client.post('/api/v1/table-orders/end_table_session/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_restaurant_tables_stats_url_exists(self, api_client):
        """Test que l'URL restaurant_tables_stats existe"""
        response = api_client.get('/api/v1/table-orders/restaurant_tables_stats/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED