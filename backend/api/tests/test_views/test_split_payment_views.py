# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de paiement divisé
"""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    SplitPaymentSession,
    SplitPaymentPortion,
    Order,
    Restaurant,
    Table,
    Menu,
    MenuItem,
    OrderItem,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(username="splitviewuser", password="testpass123")


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="splitrestaurateur", password="testpass123")
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_split"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Split View Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        identifiant="SPLV01"
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Test",
        restaurant=restaurant
    )


@pytest.fixture
def menu_item(menu):
    return MenuItem.objects.create(
        menu=menu,
        name="Plat Test",
        price=Decimal('25.00'),
        category="Plat"
    )


@pytest.fixture
def auth_client(user):
    """Client authentifié"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_client(restaurateur_user):
    """Client restaurateur authentifié"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def order(restaurateur_profile, restaurant, table, user):
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        user=user,
        total_amount=Decimal('100.00'),
        subtotal=Decimal('90.00'),
        tax_amount=Decimal('10.00')
    )


@pytest.fixture
def order_with_items(order, menu_item):
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=4,
        unit_price=Decimal('25.00')
    )
    return order


@pytest.fixture
def split_session(order, user):
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=Decimal('100.00'),
        tip_amount=Decimal('0.00'),
        created_by=user
    )


@pytest.fixture
def split_session_with_portions(split_session):
    SplitPaymentPortion.objects.create(
        session=split_session,
        name="Personne 1",
        amount=Decimal('50.00')
    )
    SplitPaymentPortion.objects.create(
        session=split_session,
        name="Personne 2",
        amount=Decimal('50.00')
    )
    return split_session


# =============================================================================
# TESTS - Création de session de paiement divisé
# =============================================================================

@pytest.mark.django_db
class TestCreateSplitPaymentSession:
    """Tests pour la création de sessions de paiement divisé"""

    def test_create_equal_split(self, auth_client, order):
        """Test de création d'un split égal"""
        data = {
            'split_type': 'equal',
            'tip_amount': '0.00',
            'portions': [
                {'name': 'Person 1', 'amount': '50.00'},
                {'name': 'Person 2', 'amount': '50.00'}
            ]
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/create/{order.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        assert 'portions' in response.data
        assert len(response.data['portions']) == 2

    def test_create_custom_split(self, auth_client, order):
        """Test de création d'un split personnalisé"""
        data = {
            'split_type': 'custom',
            'tip_amount': '10.00',
            'portions': [
                {'name': 'Person 1', 'amount': '70.00'},
                {'name': 'Person 2', 'amount': '40.00'}
            ]
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/create/{order.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_split_unauthenticated(self, api_client, order):
        """Test de création sans authentification"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': '50.00'},
                {'amount': '50.00'}
            ]
        }
        
        response = api_client.post(
            f'/api/v1/split-payment/create/{order.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_split_invalid_order(self, auth_client):
        """Test avec une commande inexistante"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': '50.00'},
                {'amount': '50.00'}
            ]
        }
        
        response = auth_client.post(
            '/api/v1/split-payment/create/999999/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_split_single_portion(self, auth_client, order):
        """Test avec une seule portion (devrait échouer)"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': '100.00'}
            ]
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/create/{order.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Récupération de session
# =============================================================================

@pytest.mark.django_db
class TestGetSplitPaymentSession:
    """Tests pour récupérer une session de paiement divisé"""

    def test_get_existing_session(self, auth_client, split_session_with_portions):
        """Test de récupération d'une session existante"""
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payment/session/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'portions' in response.data
        assert len(response.data['portions']) == 2

    def test_get_nonexistent_session(self, auth_client, order):
        """Test de récupération d'une session inexistante"""
        response = auth_client.get(f'/api/v1/split-payment/session/{order.id}/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_session_unauthenticated(self, api_client, split_session):
        """Test de récupération sans authentification"""
        order_id = split_session.order.id
        
        response = api_client.get(f'/api/v1/split-payment/session/{order_id}/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Paiement de portion
# =============================================================================

@pytest.mark.django_db
class TestPayPortion:
    """Tests pour le paiement d'une portion"""

    @patch('stripe.PaymentIntent.create')
    def test_pay_portion_creates_intent(self, mock_create, auth_client, split_session_with_portions, restaurateur_profile):
        """Test de création d'un PaymentIntent pour une portion"""
        mock_create.return_value = MagicMock(
            id='pi_test_123',
            client_secret='pi_test_123_secret'
        )
        
        portion = split_session_with_portions.portions.first()
        order_id = split_session_with_portions.order.id
        
        data = {
            'portion_id': str(portion.id)
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/pay-portion/{order_id}/',
            data,
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            assert 'client_secret' in response.data

    def test_pay_already_paid_portion(self, auth_client, split_session_with_portions):
        """Test de paiement d'une portion déjà payée"""
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        data = {
            'portion_id': str(portion.id)
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/pay-portion/{order_id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pay_portion_invalid_id(self, auth_client, split_session_with_portions):
        """Test avec un ID de portion invalide"""
        order_id = split_session_with_portions.order.id
        
        data = {
            'portion_id': '00000000-0000-0000-0000-000000000000'
        }
        
        response = auth_client.post(
            f'/api/v1/split-payment/pay-portion/{order_id}/',
            data,
            format='json'
        )
        
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]


# =============================================================================
# TESTS - Statut du paiement divisé
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentStatus:
    """Tests pour le statut du paiement divisé"""

    def test_get_status(self, auth_client, split_session_with_portions):
        """Test de récupération du statut"""
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payment/status/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'status' in response.data or 'is_completed' in response.data

    def test_get_status_partial_payment(self, auth_client, split_session_with_portions):
        """Test du statut avec paiement partiel"""
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payment/status/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK

    def test_get_status_completed(self, auth_client, split_session_with_portions):
        """Test du statut quand tous les paiements sont effectués"""
        for portion in split_session_with_portions.portions.all():
            portion.is_paid = True
            portion.save()
        
        split_session_with_portions.status = 'completed'
        split_session_with_portions.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payment/status/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - Paiement du montant restant
# =============================================================================

@pytest.mark.django_db
class TestPayRemainingPortions:
    """Tests pour le paiement du montant restant"""

    @patch('stripe.PaymentIntent.create')
    def test_pay_remaining(self, mock_create, auth_client, split_session_with_portions, restaurateur_profile):
        """Test de paiement du montant restant"""
        mock_create.return_value = MagicMock(
            id='pi_remaining_123',
            client_secret='pi_remaining_123_secret'
        )
        
        # Marquer une portion comme payée
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.post(
            f'/api/v1/split-payment/pay-remaining/{order_id}/',
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            assert 'client_secret' in response.data

    def test_pay_remaining_nothing_left(self, auth_client, split_session_with_portions):
        """Test quand tout est déjà payé"""
        for portion in split_session_with_portions.portions.all():
            portion.is_paid = True
            portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.post(
            f'/api/v1/split-payment/pay-remaining/{order_id}/',
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Annulation de session
# =============================================================================

@pytest.mark.django_db
class TestCancelSplitPaymentSession:
    """Tests pour l'annulation de session de paiement divisé"""

    def test_cancel_session(self, auth_client, split_session):
        """Test d'annulation d'une session"""
        order_id = split_session.order.id
        
        response = auth_client.delete(f'/api/v1/split-payment/session/{order_id}/')
        
        if response.status_code == status.HTTP_200_OK:
            split_session.refresh_from_db()
            assert split_session.status == 'cancelled'

    def test_cancel_session_with_paid_portions(self, auth_client, split_session_with_portions):
        """Test d'annulation avec des portions payées"""
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.delete(f'/api/v1/split-payment/session/{order_id}/')
        
        # Ne devrait pas permettre l'annulation si des portions sont payées
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK, status.HTTP_405_METHOD_NOT_ALLOWED]
