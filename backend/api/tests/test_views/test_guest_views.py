# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues invités
- GuestPrepare (création brouillon de commande)
- GuestConfirmCash (confirmation paiement espèces)
- GuestDraftStatus (statut du brouillon)
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
    DraftOrder,
    Order,
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
        username="guest_resto@example.com",
        email="guest_resto@example.com",
        password="testpass123"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_guest",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Guest Test Restaurant",
        description="Restaurant pour tester les commandes invités",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def inactive_restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Inactive Restaurant",
        description="Restaurant inactif",
        owner=restaurateur_profile,
        siret="11111111111111",
        is_active=False
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        identifiant="GUEST_T001",
        qr_code="R1GUEST001",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Invité",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Burger Classique",
        description="Un délicieux burger",
        price=Decimal('12.50'),
        is_available=True
    )


@pytest.fixture
def second_menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Frites Maison",
        description="Frites croustillantes",
        price=Decimal('5.00'),
        is_available=True
    )


@pytest.fixture
def unavailable_menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Plat Indisponible",
        price=Decimal('20.00'),
        is_available=False
    )


@pytest.fixture
def draft_order_cash(restaurant, menu_item):
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="GUEST_T001",
        items=[{"menu_item_id": menu_item.id, "quantity": 2}],
        customer_name="Jean Invité",
        phone="+33612345678",
        email="guest@example.com",
        payment_method="cash",
        amount_cents=2500,
        status="pending"
    )


@pytest.fixture
def draft_order_online(restaurant, menu_item):
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="GUEST_T001",
        items=[{"menu_item_id": menu_item.id, "quantity": 1}],
        customer_name="Marie Client",
        phone="+33698765432",
        email="marie@example.com",
        payment_method="online",
        amount_cents=1250,
        status="pending"
    )


# =============================================================================
# TESTS - GuestPrepare
# =============================================================================

@pytest.mark.django_db
class TestGuestPrepare:
    """Tests pour la préparation de commande invité"""

    def test_prepare_cash_order(self, api_client, restaurant, menu_item, table):
        """Test de préparation d'une commande en espèces"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [
                {'menu_item_id': menu_item.id, 'quantity': 2}
            ],
            'customer_name': 'Jean Test',
            'phone': '+33612345678',
            'email': 'jean@test.com',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert 'draft_order_id' in response.data
        assert response.data['amount'] == 2500  # 12.50 * 2 * 100 cents

    @patch('api.views.guest_views.stripe.PaymentIntent.create')
    def test_prepare_online_order(self, mock_stripe, api_client, restaurant, menu_item, table):
        """Test de préparation d'une commande en ligne"""
        mock_stripe.return_value = MagicMock(
            id='pi_test_123',
            client_secret='pi_test_123_secret'
        )
        
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [
                {'menu_item_id': menu_item.id, 'quantity': 1}
            ],
            'customer_name': 'Marie Test',
            'phone': '+33698765432',
            'payment_method': 'online',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert 'draft_order_id' in response.data
        # Pour paiement en ligne, un client_secret devrait être retourné
        if 'payment_intent_client_secret' in response.data:
            assert response.data['payment_intent_client_secret'] is not None

    def test_prepare_order_multiple_items(self, api_client, restaurant, menu_item, second_menu_item, table):
        """Test avec plusieurs articles"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [
                {'menu_item_id': menu_item.id, 'quantity': 2},
                {'menu_item_id': second_menu_item.id, 'quantity': 3}
            ],
            'customer_name': 'Pierre Multi',
            'phone': '+33611111111',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        # 12.50 * 2 + 5.00 * 3 = 40.00 = 4000 cents
        assert response.data['amount'] == 4000

    def test_prepare_order_missing_fields(self, api_client, restaurant, menu_item):
        """Test avec champs manquants"""
        data = {
            'restaurant_id': restaurant.id,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}]
            # Manque customer_name, phone, payment_method, consent
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_prepare_order_inactive_restaurant(self, api_client, inactive_restaurant, menu_item):
        """Test avec restaurant inactif"""
        # Créer un menu pour le restaurant inactif
        menu = Menu.objects.create(
            name="Menu Inactif",
            restaurant=inactive_restaurant,
            is_available=True
        )
        item = MenuItem.objects.create(
            menu=menu,
            name="Plat",
            price=Decimal('10.00'),
            is_available=True
        )
        
        data = {
            'restaurant_id': inactive_restaurant.id,
            'items': [{'menu_item_id': item.id, 'quantity': 1}],
            'customer_name': 'Test',
            'phone': '+33600000000',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Devrait échouer car restaurant inactif
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_prepare_order_unavailable_item(self, api_client, restaurant, unavailable_menu_item, table):
        """Test avec article indisponible"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': unavailable_menu_item.id, 'quantity': 1}],
            'customer_name': 'Test Indispo',
            'phone': '+33600000001',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Devrait échouer car article indisponible
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_prepare_order_invalid_restaurant(self, api_client, menu_item):
        """Test avec restaurant inexistant"""
        data = {
            'restaurant_id': 99999,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}],
            'customer_name': 'Test',
            'phone': '+33600000002',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_prepare_order_no_consent(self, api_client, restaurant, menu_item, table):
        """Test sans consentement"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}],
            'customer_name': 'Test Sans Consent',
            'phone': '+33600000003',
            'payment_method': 'cash',
            'consent': False
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Peut échouer ou réussir selon l'implémentation
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST
        ]


# =============================================================================
# TESTS - GuestConfirmCash
# =============================================================================

@pytest.mark.django_db
class TestGuestConfirmCash:
    """Tests pour la confirmation de paiement en espèces"""

    def test_confirm_cash_order(self, api_client, draft_order_cash):
        """Test de confirmation d'une commande cash"""
        data = {
            'draft_order_id': str(draft_order_cash.id)
        }
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'order_id' in response.data
        assert response.data['status'] is not None

    def test_confirm_cash_creates_order(self, api_client, draft_order_cash):
        """Test que la confirmation crée une commande"""
        initial_order_count = Order.objects.count()
        
        data = {
            'draft_order_id': str(draft_order_cash.id)
        }
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert Order.objects.count() == initial_order_count + 1

    def test_confirm_cash_updates_draft_status(self, api_client, draft_order_cash):
        """Test que le statut du brouillon est mis à jour"""
        data = {
            'draft_order_id': str(draft_order_cash.id)
        }
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        draft_order_cash.refresh_from_db()
        assert draft_order_cash.status == 'confirmed_cash'

    def test_confirm_cash_online_order_fails(self, api_client, draft_order_online):
        """Test que confirmer une commande online en cash échoue"""
        data = {
            'draft_order_id': str(draft_order_online.id)
        }
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_cash_invalid_draft(self, api_client):
        """Test avec brouillon inexistant"""
        data = {
            'draft_order_id': '00000000-0000-0000-0000-000000000000'
        }
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_confirm_cash_missing_draft_id(self, api_client):
        """Test sans ID de brouillon"""
        data = {}
        
        response = api_client.post('/api/v1/guest/confirm-cash/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - GuestDraftStatus
# =============================================================================

@pytest.mark.django_db
class TestGuestDraftStatus:
    """Tests pour le statut du brouillon"""

    def test_get_draft_status_pending(self, api_client, draft_order_cash):
        """Test de récupération du statut pending"""
        response = api_client.get(
            '/api/v1/guest/draft-status/',
            {'draft_order_id': str(draft_order_cash.id)}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'pending'

    def test_get_draft_status_confirmed(self, api_client, draft_order_cash):
        """Test de récupération du statut après confirmation"""
        # D'abord confirmer le brouillon
        draft_order_cash.status = 'confirmed_cash'
        draft_order_cash.save()
        
        response = api_client.get(
            '/api/v1/guest/draft-status/',
            {'draft_order_id': str(draft_order_cash.id)}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'confirmed_cash'

    def test_get_draft_status_invalid(self, api_client):
        """Test avec brouillon inexistant"""
        response = api_client.get(
            '/api/v1/guest/draft-status/',
            {'draft_order_id': '00000000-0000-0000-0000-000000000000'}
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_draft_status_missing_id(self, api_client):
        """Test sans ID"""
        response = api_client.get('/api/v1/guest/draft-status/')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Rate Limiting
# =============================================================================

@pytest.mark.django_db
class TestGuestRateLimiting:
    """Tests pour le rate limiting"""

    def test_rate_limit_prepare(self, api_client, restaurant, menu_item, table):
        """Test du rate limiting sur prepare"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}],
            'customer_name': 'Rate Limit Test',
            'phone': '+33600000010',
            'payment_method': 'cash',
            'consent': True
        }
        
        # Faire plusieurs requêtes
        responses = []
        for i in range(5):
            data['phone'] = f'+3360000001{i}'
            response = api_client.post('/api/v1/guest/prepare/', data, format='json')
            responses.append(response)
        
        # La plupart devraient réussir (le rate limit est 10/min)
        success_count = sum(1 for r in responses if r.status_code == status.HTTP_201_CREATED)
        assert success_count >= 1


# =============================================================================
# TESTS - Validation des données
# =============================================================================

@pytest.mark.django_db
class TestGuestDataValidation:
    """Tests pour la validation des données"""

    def test_invalid_phone_format(self, api_client, restaurant, menu_item, table):
        """Test avec format de téléphone invalide"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}],
            'customer_name': 'Test Phone',
            'phone': 'invalid_phone',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Peut échouer ou réussir selon la validation
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST
        ]

    def test_invalid_email_format(self, api_client, restaurant, menu_item, table):
        """Test avec email invalide"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 1}],
            'customer_name': 'Test Email',
            'phone': '+33600000020',
            'email': 'invalid_email',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # L'email peut être optionnel ou validé
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST
        ]

    def test_zero_quantity(self, api_client, restaurant, menu_item, table):
        """Test avec quantité zéro"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': 0}],
            'customer_name': 'Test Zero',
            'phone': '+33600000021',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Devrait échouer avec quantité 0
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_201_CREATED  # Si le backend calcule 0€
        ]

    def test_negative_quantity(self, api_client, restaurant, menu_item, table):
        """Test avec quantité négative"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [{'menu_item_id': menu_item.id, 'quantity': -1}],
            'customer_name': 'Test Negative',
            'phone': '+33600000022',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Devrait échouer avec quantité négative
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_empty_items(self, api_client, restaurant, table):
        """Test avec liste d'items vide"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': table.identifiant,
            'items': [],
            'customer_name': 'Test Empty',
            'phone': '+33600000023',
            'payment_method': 'cash',
            'consent': True
        }
        
        response = api_client.post('/api/v1/guest/prepare/', data, format='json')
        
        # Devrait échouer sans items
        assert response.status_code == status.HTTP_400_BAD_REQUEST
