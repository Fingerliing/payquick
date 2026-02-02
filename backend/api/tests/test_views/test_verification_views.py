# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de vérification SMS (verification_views.py)

Teste les endpoints:
- POST /api/v1/auth/phone/send-code/ - Envoyer un code de vérification SMS
- POST /api/v1/auth/phone/verify/ - Vérifier un code SMS

Supporte les cas:
- Utilisateurs authentifiés (vérification de numéro pour compte existant)
- Utilisateurs non authentifiés (vérification lors de l'inscription)
"""

import pytest
from unittest.mock import patch
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import PhoneVerification, ClientProfile


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Client API non authentifié"""
    return APIClient()


@pytest.fixture
def user(db):
    """Utilisateur standard"""
    return User.objects.create_user(
        username="verifyuser@example.com",
        email="verifyuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def user_with_client_profile(db):
    """Utilisateur avec profil client"""
    user = User.objects.create_user(
        username="clientuser@example.com",
        email="clientuser@example.com",
        password="testpass123"
    )
    ClientProfile.objects.create(
        user=user,
        phone="0612345678"
    )
    return user


@pytest.fixture
def auth_client(user):
    """Client API authentifié"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


# =============================================================================
# TESTS - SendVerificationCodeView (Authentifié)
# =============================================================================

@pytest.mark.django_db
class TestSendVerificationCodeViewAuthenticated:
    """Tests pour POST /api/v1/auth/phone/send-code/ avec utilisateur authentifié"""
    
    url = "/api/v1/auth/phone/send-code/"

    def test_send_code_missing_phone(self, auth_client):
        """Test envoi sans numéro de téléphone - 400"""
        response = auth_client.post(self.url, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_send_code_invalid_phone(self, auth_client):
        """Test envoi avec numéro invalide - 400"""
        data = {'phone_number': 'invalid'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_success(self, mock_sms, auth_client, user):
        """Test envoi réussi pour utilisateur authentifié"""
        mock_sms.return_value = True
        
        data = {'phone_number': '+33612345678'}
        response = auth_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        assert 'verification_id' in response.data
        assert 'expires_in' in response.data
        
        # Vérifier qu'une vérification a été créée pour cet utilisateur
        verification = PhoneVerification.objects.filter(
            user=user, 
            phone_number='+33612345678'
        ).first()
        assert verification is not None
        assert verification.user == user

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_sms_failure(self, mock_sms, auth_client):
        """Test échec envoi SMS - 500"""
        mock_sms.return_value = False
        
        data = {'phone_number': '+33698765432'}
        response = auth_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert 'error' in response.data

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_cooldown_active(self, mock_sms, auth_client, user):
        """Test envoi pendant le cooldown - 429"""
        # Créer une vérification récente
        PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="123456",
            is_verified=False,
            last_resend_at=timezone.now()
        )
        
        data = {'phone_number': '+33612345678'}
        response = auth_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert 'retry_after' in response.data
        mock_sms.assert_not_called()


# =============================================================================
# TESTS - SendVerificationCodeView (Non authentifié)
# =============================================================================

@pytest.mark.django_db
class TestSendVerificationCodeViewUnauthenticated:
    """Tests pour POST /api/v1/auth/phone/send-code/ sans authentification"""
    
    url = "/api/v1/auth/phone/send-code/"

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_unauthenticated_success(self, mock_sms, api_client):
        """Test envoi sans authentification (cas inscription)"""
        mock_sms.return_value = True
        
        data = {'phone_number': '+33611111111'}
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'verification_id' in response.data
        assert 'expires_in' in response.data
        
        # Vérifier qu'une vérification sans user a été créée
        verification = PhoneVerification.objects.filter(
            phone_number='+33611111111',
            user__isnull=True
        ).first()
        assert verification is not None
        assert verification.user is None

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_unauthenticated_cooldown(self, mock_sms, api_client):
        """Test cooldown pour utilisateur non authentifié"""
        # Créer une vérification récente sans user
        PhoneVerification.objects.create(
            user=None,
            phone_number="+33622222222",
            code="111111",
            is_verified=False,
            last_resend_at=timezone.now()
        )
        
        data = {'phone_number': '+33622222222'}
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        mock_sms.assert_not_called()

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_send_code_unauthenticated_sms_failure(self, mock_sms, api_client):
        """Test échec SMS pour utilisateur non authentifié"""
        mock_sms.return_value = False
        
        data = {'phone_number': '+33633333333'}
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


# =============================================================================
# TESTS - VerifyPhoneCodeView (Authentifié)
# =============================================================================

@pytest.mark.django_db
class TestVerifyPhoneCodeViewAuthenticated:
    """Tests pour POST /api/v1/auth/phone/verify/ avec utilisateur authentifié"""
    
    url = "/api/v1/auth/phone/verify/"

    def test_verify_code_missing_code(self, auth_client):
        """Test vérification sans code - 400"""
        response = auth_client.post(self.url, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_code_missing_identifier(self, auth_client):
        """Test vérification sans verification_id ni phone_number - 400"""
        data = {'code': '123456'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_code_no_verification_found(self, auth_client):
        """Test vérification sans vérification en cours - 404"""
        data = {
            'code': '123456',
            'phone_number': '+33699999999'
        }
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_code_success_with_phone(self, user):
        """Test vérification réussie avec phone_number"""
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        verification = PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="123456",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '123456',
            'phone_number': '+33612345678'
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True
        assert response.data['phone_number'] == '+33612345678'
        
        verification.refresh_from_db()
        assert verification.is_verified is True
        assert verification.verified_at is not None

    def test_verify_code_success_with_verification_id(self, user):
        """Test vérification réussie avec verification_id"""
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        verification = PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="654321",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '654321',
            'verification_id': str(verification.id)
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True

    def test_verify_code_wrong_code(self, user):
        """Test vérification avec mauvais code - 400"""
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        verification = PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="123456",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '999999',
            'phone_number': '+33612345678'
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data
        assert 'attempts_remaining' in response.data
        
        verification.refresh_from_db()
        assert verification.attempts == 1

    def test_verify_code_expired(self, user):
        """Test vérification avec code expiré - 400"""
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        verification = PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="654321",
            is_verified=False,
            attempts=0
        )
        verification.created_at = timezone.now() - timedelta(minutes=30)
        verification.save(update_fields=['created_at'])
        
        data = {
            'code': '654321',
            'phone_number': '+33612345678'
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'expiré' in response.data['error'].lower()

    def test_verify_code_max_attempts(self, user, settings):
        """Test vérification avec max tentatives - 429"""
        settings.SMS_MAX_ATTEMPTS = 5
        
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        PhoneVerification.objects.create(
            user=user,
            phone_number="+33612345678",
            code="111111",
            is_verified=False,
            attempts=5
        )
        
        data = {
            'code': '111111',
            'phone_number': '+33612345678'
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_verify_code_updates_client_profile(self, user_with_client_profile):
        """Test que la vérification met à jour le profil client"""
        token = RefreshToken.for_user(user_with_client_profile)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        verification = PhoneVerification.objects.create(
            user=user_with_client_profile,
            phone_number="+33698765432",
            code="555555",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '555555',
            'phone_number': '+33698765432'
        }
        response = client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier que le profil client est mis à jour
        profile = user_with_client_profile.clientprofile
        profile.refresh_from_db()
        assert profile.phone == '+33698765432'


# =============================================================================
# TESTS - VerifyPhoneCodeView (Non authentifié)
# =============================================================================

@pytest.mark.django_db
class TestVerifyPhoneCodeViewUnauthenticated:
    """Tests pour POST /api/v1/auth/phone/verify/ sans authentification"""
    
    url = "/api/v1/auth/phone/verify/"

    def test_verify_code_unauthenticated_success_with_id(self, api_client):
        """Test vérification sans authentification avec verification_id"""
        verification = PhoneVerification.objects.create(
            user=None,
            phone_number="+33644444444",
            code="444444",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '444444',
            'verification_id': str(verification.id)
        }
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True
        assert response.data['phone_number'] == '+33644444444'
        
        verification.refresh_from_db()
        assert verification.is_verified is True

    def test_verify_code_unauthenticated_success_with_phone(self, api_client):
        """Test vérification sans authentification avec phone_number"""
        verification = PhoneVerification.objects.create(
            user=None,
            phone_number="+33655555555",
            code="555555",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '555555',
            'phone_number': '+33655555555'
        }
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True

    def test_verify_code_unauthenticated_wrong_code(self, api_client):
        """Test vérification sans authentification avec mauvais code"""
        verification = PhoneVerification.objects.create(
            user=None,
            phone_number="+33666666666",
            code="666666",
            is_verified=False,
            attempts=0
        )
        
        data = {
            'code': '000000',
            'verification_id': str(verification.id)
        }
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        verification.refresh_from_db()
        assert verification.attempts == 1

    def test_verify_code_unauthenticated_not_found(self, api_client):
        """Test vérification sans authentification - vérification non trouvée"""
        data = {
            'code': '123456',
            'phone_number': '+33677777777'
        }
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# TESTS - Intégration
# =============================================================================

@pytest.mark.django_db
class TestVerificationIntegration:
    """Tests d'intégration du flux complet"""

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_full_authenticated_flow(self, mock_sms, user):
        """Test du flux complet pour utilisateur authentifié"""
        mock_sms.return_value = True
        phone_number = '+33612345678'
        
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        # Étape 1: Envoyer le code
        send_response = client.post(
            '/api/v1/auth/phone/send-code/',
            {'phone_number': phone_number},
            format='json'
        )
        
        assert send_response.status_code == status.HTTP_200_OK
        verification_id = send_response.data['verification_id']
        
        # Récupérer le code généré
        verification = PhoneVerification.objects.get(id=verification_id)
        assert verification.user == user
        
        # Étape 2: Vérifier avec le bon code
        verify_response = client.post(
            '/api/v1/auth/phone/verify/',
            {
                'code': verification.code,
                'verification_id': verification_id
            },
            format='json'
        )
        
        assert verify_response.status_code == status.HTTP_200_OK
        assert verify_response.data['verified'] is True

    @patch('api.views.verification_views.sms_service.send_verification_code')
    def test_full_unauthenticated_flow(self, mock_sms, api_client):
        """Test du flux complet sans authentification (cas inscription)"""
        mock_sms.return_value = True
        phone_number = '+33688888888'
        
        # Étape 1: Envoyer le code sans être connecté
        send_response = api_client.post(
            '/api/v1/auth/phone/send-code/',
            {'phone_number': phone_number},
            format='json'
        )
        
        assert send_response.status_code == status.HTTP_200_OK
        verification_id = send_response.data['verification_id']
        
        # Récupérer le code généré
        verification = PhoneVerification.objects.get(id=verification_id)
        assert verification.user is None  # Pas d'utilisateur associé
        
        # Étape 2: Vérifier le code sans être connecté
        verify_response = api_client.post(
            '/api/v1/auth/phone/verify/',
            {
                'code': verification.code,
                'verification_id': verification_id
            },
            format='json'
        )
        
        assert verify_response.status_code == status.HTTP_200_OK
        assert verify_response.data['verified'] is True
        assert verify_response.data['phone_number'] == phone_number


# =============================================================================
# TESTS - URLs
# =============================================================================

@pytest.mark.django_db
class TestVerificationURLs:
    """Tests de vérification des URLs"""

    def test_send_code_url_exists(self, api_client):
        """Test que l'URL send-code existe"""
        response = api_client.post('/api/v1/auth/phone/send-code/', {})
        assert response.status_code != 404

    def test_verify_url_exists(self, api_client):
        """Test que l'URL verify existe"""
        response = api_client.post('/api/v1/auth/phone/verify/', {})
        assert response.status_code != 404

    def test_get_method_not_allowed_send(self, api_client):
        """Test que GET n'est pas autorisé pour send-code"""
        response = api_client.get('/api/v1/auth/phone/send-code/')
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_get_method_not_allowed_verify(self, api_client):
        """Test que GET n'est pas autorisé pour verify"""
        response = api_client.get('/api/v1/auth/phone/verify/')
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED