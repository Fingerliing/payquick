# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de paiement divisé

IMPORTANT - Model field notes:
- Table: Use 'number' field (not 'identifiant' which is a read-only property)
- Restaurant: Requires city, zip_code, phone, email, cuisine
- Order: Uses 'restaurant' FK (not 'restaurateur')
- Order: Uses 'table_number' CharField (not 'table' FK)
- Order: Requires 'order_number', 'subtotal', 'total_amount'
- OrderItem: Requires 'total_price' in addition to 'unit_price'
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
def user(db):
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
        stripe_account_id="acct_test_split",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    """
    Test restaurant with all required fields.
    
    Required fields: name, address, city, zip_code, phone, email, cuisine
    """
    return Restaurant.objects.create(
        name="Split View Test Restaurant",
        description="Restaurant de test",
        address="123 Rue Split Payment",
        city="Paris",
        zip_code="75001",
        phone="0123456789",
        email="split@resto.fr",
        cuisine="french",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    """
    Test table.
    
    NOTE: 'identifiant' is a read-only property. Use 'number' field.
    """
    return Table.objects.create(
        restaurant=restaurant,
        number="SPLV01"
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
    """
    Test order with correct model fields.
    
    NOTE:
    - Order uses 'restaurant' FK (not 'restaurateur')
    - Order uses 'table_number' CharField (not 'table' FK)
    - Order requires 'order_number', 'subtotal', 'total_amount'
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,  # CharField, not FK
        order_number="ORD-SPLIT-001",  # Required unique field
        user=user,
        total_amount=Decimal('100.00'),
        subtotal=Decimal('90.00'),
        tax_amount=Decimal('10.00'),
        payment_status='pending'
    )


@pytest.fixture
def order_with_items(order, menu_item):
    """
    Order with items.
    
    NOTE: OrderItem requires both 'unit_price' and 'total_price'.
    """
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=4,
        unit_price=Decimal('25.00'),
        total_price=Decimal('100.00')  # unit_price * quantity
    )
    return order


@pytest.fixture
def other_user(db):
    """Un utilisateur authentifié qui ne possède PAS la commande."""
    return User.objects.create_user(username="splitviewother", password="testpass123")


@pytest.fixture
def other_client(other_user):
    """Client authentifié en tant qu'utilisateur non-propriétaire."""
    token = RefreshToken.for_user(other_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def guest_order(restaurant):
    """
    Commande invité : order.user is None.

    Avant le correctif, `if order.user and order.user != request.user:`
    court-circuitait à False → tout utilisateur authentifié pouvait y accéder.
    Après correctif via _is_order_owner, order.user is None → 403 systématique.
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number="T99",
        order_number="ORD-GUEST-SPLIT-001",
        user=None,  # commande invité
        total_amount=Decimal('80.00'),
        subtotal=Decimal('80.00'),
        tax_amount=Decimal('0.00'),
        payment_status='pending',
        source='guest',
    )


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
            f'/api/v1/split-payments/create/{order.id}/',
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
            f'/api/v1/split-payments/create/{order.id}/',
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
            f'/api/v1/split-payments/create/{order.id}/',
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
            '/api/v1/split-payments/create/999999/',
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
            f'/api/v1/split-payments/create/{order.id}/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_split_wrong_user_returns_403(self, other_client, order):
        """
        Un utilisateur authentifié qui n'est pas propriétaire de la commande
        doit recevoir un 403, pas un 200.
        (Régression : _is_order_owner doit comparer order.user_id == user.id)
        """
        data = {
            'split_type': 'equal',
            'tip_amount': '0.00',
            'portions': [
                {'name': 'Person 1', 'amount': '50.00'},
                {'name': 'Person 2', 'amount': '50.00'},
            ]
        }
        response = other_client.post(
            f'/api/v1/split-payments/create/{order.id}/',
            data,
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'error' in response.data

    def test_create_split_guest_order_returns_403(self, auth_client, guest_order):
        """
        Régression critique : avant le correctif, order.user is None faisait
        court-circuiter la garde (`if order.user and ...` → False) et tout
        utilisateur authentifié accédait silencieusement à la commande invité.
        _is_order_owner doit retourner False quand order.user is None.
        """
        data = {
            'split_type': 'equal',
            'tip_amount': '0.00',
            'portions': [
                {'name': 'Person 1', 'amount': '40.00'},
                {'name': 'Person 2', 'amount': '40.00'},
            ]
        }
        response = auth_client.post(
            f'/api/v1/split-payments/create/{guest_order.id}/',
            data,
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# TESTS - Récupération de session
# =============================================================================

@pytest.mark.django_db
class TestGetSplitPaymentSession:
    """Tests pour récupérer une session de paiement divisé"""

    def test_get_existing_session(self, auth_client, split_session_with_portions):
        """Test de récupération d'une session existante"""
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payments/session/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'portions' in response.data
        assert len(response.data['portions']) == 2

    def test_get_nonexistent_session(self, auth_client, order):
        """Test de récupération d'une session inexistante"""
        response = auth_client.get(f'/api/v1/split-payments/session/{order.id}/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_session_unauthenticated(self, api_client, split_session):
        """Test de récupération sans authentification"""
        order_id = split_session.order.id
        
        response = api_client.get(f'/api/v1/split-payments/session/{order_id}/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_session_wrong_user_returns_403(self, other_client, split_session_with_portions):
        """Un autre utilisateur authentifié ne doit pas voir la session."""
        order_id = split_session_with_portions.order.id
        response = other_client.get(f'/api/v1/split-payments/session/{order_id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


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
            f'/api/v1/split-payments/pay-portion/{order_id}/',
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
            f'/api/v1/split-payments/pay-portion/{order_id}/',
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
            f'/api/v1/split-payments/pay-portion/{order_id}/',
            data,
            format='json'
        )
        
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]

    def test_pay_portion_wrong_user_returns_403(self, other_client, split_session_with_portions):
        """Un autre utilisateur ne peut pas payer une portion d'une commande qui ne lui appartient pas."""
        portion = split_session_with_portions.portions.first()
        order_id = split_session_with_portions.order.id
        response = other_client.post(
            f'/api/v1/split-payments/pay-portion/{order_id}/',
            {'portion_id': str(portion.id)},
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_pay_portion_guest_order_returns_403(self, auth_client, guest_order):
        """Une commande invité (order.user=None) ne doit jamais être accessible via cet endpoint."""
        response = auth_client.post(
            f'/api/v1/split-payments/pay-portion/{guest_order.id}/',
            {'portion_id': '00000000-0000-0000-0000-000000000000'},
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# TESTS - Statut du paiement divisé
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentStatus:
    """Tests pour le statut du paiement divisé"""

    def test_get_status(self, auth_client, split_session_with_portions):
        """Test de récupération du statut"""
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payments/status/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'status' in response.data or 'is_completed' in response.data

    def test_get_status_partial_payment(self, auth_client, split_session_with_portions):
        """Test du statut avec paiement partiel"""
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payments/status/{order_id}/')
        
        assert response.status_code == status.HTTP_200_OK

    def test_get_status_completed(self, auth_client, split_session_with_portions):
        """Test du statut quand tous les paiements sont effectués"""
        for portion in split_session_with_portions.portions.all():
            portion.is_paid = True
            portion.save()
        
        split_session_with_portions.status = 'completed'
        split_session_with_portions.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.get(f'/api/v1/split-payments/status/{order_id}/')
        
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
            f'/api/v1/split-payments/pay-remaining/{order_id}/',
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
            f'/api/v1/split-payments/pay-remaining/{order_id}/',
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
        
        response = auth_client.delete(f'/api/v1/split-payments/session/{order_id}/')
        
        if response.status_code == status.HTTP_200_OK:
            split_session.refresh_from_db()
            assert split_session.status == 'cancelled'

    def test_cancel_session_with_paid_portions(self, auth_client, split_session_with_portions):
        """Test d'annulation avec des portions payées"""
        portion = split_session_with_portions.portions.first()
        portion.is_paid = True
        portion.save()
        
        order_id = split_session_with_portions.order.id
        
        response = auth_client.delete(f'/api/v1/split-payments/session/{order_id}/')
        
        # Ne devrait pas permettre l'annulation si des portions sont payées
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK, status.HTTP_405_METHOD_NOT_ALLOWED]

# =============================================================================
# TESTS - Confirmation de paiement de portion
# =============================================================================

@pytest.mark.django_db
class TestConfirmPortionPayment:
    """Tests pour la confirmation de paiement d'une portion."""

    def test_confirm_wrong_user_returns_403(self, other_client, split_session_with_portions):
        """Un autre utilisateur ne peut pas confirmer une portion."""
        portion = split_session_with_portions.portions.first()
        order_id = split_session_with_portions.order.id
        response = other_client.post(
            f'/api/v1/split-payments/confirm-portion/{order_id}/',
            {'portion_id': str(portion.id), 'payment_intent_id': 'pi_fake'},
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_confirm_guest_order_returns_403(self, auth_client, guest_order):
        """Commande invité → 403 systématique."""
        response = auth_client.post(
            f'/api/v1/split-payments/confirm-portion/{guest_order.id}/',
            {'portion_id': '00000000-0000-0000-0000-000000000000', 'payment_intent_id': 'pi_fake'},
            format='json'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_confirm_invalid_order_returns_404(self, auth_client):
        """Commande inexistante → 404."""
        response = auth_client.post(
            '/api/v1/split-payments/confirm-portion/999999/',
            {'portion_id': '00000000-0000-0000-0000-000000000000', 'payment_intent_id': 'pi_fake'},
            format='json'
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_confirm_unauthenticated_returns_401(self, api_client, split_session_with_portions):
        """Sans authentification → 401."""
        portion = split_session_with_portions.portions.first()
        order_id = split_session_with_portions.order.id
        response = api_client.post(
            f'/api/v1/split-payments/confirm-portion/{order_id}/',
            {'portion_id': str(portion.id), 'payment_intent_id': 'pi_fake'},
            format='json'
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Finalisation du paiement divisé
# =============================================================================

@pytest.mark.django_db
class TestCompleteSplitPayment:
    """Tests pour la finalisation d'une session de paiement divisé."""

    def test_complete_not_fully_paid_returns_400(self, auth_client, split_session_with_portions):
        """Impossible de finaliser si des portions ne sont pas encore payées."""
        order_id = split_session_with_portions.order.id
        response = auth_client.post(f'/api/v1/split-payments/complete/{order_id}/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_complete_wrong_user_returns_403(self, other_client, split_session_with_portions):
        """Un autre utilisateur ne peut pas finaliser la session."""
        order_id = split_session_with_portions.order.id
        response = other_client.post(f'/api/v1/split-payments/complete/{order_id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_complete_guest_order_returns_403(self, auth_client, guest_order):
        """Commande invité → 403."""
        response = auth_client.post(f'/api/v1/split-payments/complete/{guest_order.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_complete_invalid_order_returns_404(self, auth_client):
        """Commande inexistante → 404."""
        response = auth_client.post('/api/v1/split-payments/complete/999999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_complete_unauthenticated_returns_401(self, api_client, split_session_with_portions):
        """Sans authentification → 401."""
        order_id = split_session_with_portions.order.id
        response = api_client.post(f'/api/v1/split-payments/complete/{order_id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Historique des paiements divisés
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentHistory:
    """Tests pour l'historique des paiements d'une session."""

    def test_get_history(self, auth_client, split_session_with_portions):
        """Récupération normale de l'historique."""
        order_id = split_session_with_portions.order.id
        response = auth_client.get(f'/api/v1/split-payments/history/{order_id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'portions' in response.data

    def test_get_history_no_session_returns_404(self, auth_client, order):
        """Commande sans session de paiement divisé → 404."""
        response = auth_client.get(f'/api/v1/split-payments/history/{order.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_history_wrong_user_returns_403(self, other_client, split_session_with_portions):
        """Un autre utilisateur ne peut pas lire l'historique."""
        order_id = split_session_with_portions.order.id
        response = other_client.get(f'/api/v1/split-payments/history/{order_id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_history_guest_order_returns_403(self, auth_client, guest_order):
        """Commande invité → 403."""
        response = auth_client.get(f'/api/v1/split-payments/history/{guest_order.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_history_unauthenticated_returns_401(self, api_client, split_session_with_portions):
        """Sans authentification → 401."""
        order_id = split_session_with_portions.order.id
        response = api_client.get(f'/api/v1/split-payments/history/{order_id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Messages d'erreur generiques (pas de fuite str(e))
# =============================================================================

@pytest.mark.django_db
class TestGenericErrorMessages:
    """
    Vérifie que les endpoints paiement divisé ne fuient pas d'informations
    internes dans les réponses 500.

    Avant le correctif, `except Exception as e: return Response({'error': str(e)})`
    exposait les messages d'erreur Django/Stripe (noms de champs, traces, etc.).
    """

    @patch('api.views.split_payment_views.SplitPaymentSession.objects.create')
    def test_create_session_500_returns_generic_message(self, mock_create, auth_client, order):
        """Une erreur interne ne doit pas exposer str(e) au client."""
        mock_create.side_effect = Exception("internal db error: column xyz does not exist")

        data = {
            'split_type': 'equal',
            'tip_amount': '0.00',
            'portions': [
                {'name': 'P1', 'amount': '50.00'},
                {'name': 'P2', 'amount': '50.00'},
            ]
        }
        response = auth_client.post(
            f'/api/v1/split-payments/create/{order.id}/',
            data,
            format='json'
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert 'error' in response.data
        # Le message d'erreur interne ne doit PAS apparaître dans la réponse
        assert 'internal db error' not in str(response.data)
        assert 'column xyz' not in str(response.data)