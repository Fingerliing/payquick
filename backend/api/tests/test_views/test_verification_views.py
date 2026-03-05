# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de vérification par email (verification_views.py)

Teste les endpoints:
- POST /api/v1/auth/email/send-code/ - Envoyer un code de vérification email
- POST /api/v1/auth/email/verify/    - Vérifier un code email
"""

import pytest
from unittest.mock import patch
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import EmailVerification, ClientProfile


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
    ClientProfile.objects.create(user=user, phone="0612345678")
    return user


@pytest.fixture
def auth_client(user):
    """Client API authentifié"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def auth_client_with_profile(user_with_client_profile):
    """Client API authentifié avec profil client"""
    token = RefreshToken.for_user(user_with_client_profile)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


# =============================================================================
# TESTS - SendVerificationCodeView (Authentifié)
# =============================================================================

@pytest.mark.django_db
class TestSendVerificationCodeViewAuthenticated:
    """Tests pour POST /api/v1/auth/email/send-code/ avec utilisateur authentifié"""

    url = "/api/v1/auth/email/send-code/"

    def test_send_code_missing_email(self, auth_client):
        """Test envoi sans email — 400"""
        response = auth_client.post(self.url, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_send_code_invalid_email(self, auth_client):
        """Test envoi avec email invalide — 400"""
        data = {'email': 'not-an-email'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_success(self, mock_send, auth_client, user):
        """Test envoi réussi pour utilisateur authentifié"""
        mock_send.return_value = True

        data = {'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        assert 'verification_id' in response.data
        assert 'expires_in' in response.data
        mock_send.assert_called_once()

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_creates_email_verification(self, mock_send, auth_client, user):
        """Test que la vérification email est bien créée en base"""
        mock_send.return_value = True

        data = {'email': 'verifyuser@example.com'}
        auth_client.post(self.url, data, format='json')

        assert EmailVerification.objects.filter(user=user, is_verified=False).exists()

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_email_failure(self, mock_send, auth_client):
        """Test comportement quand l'envoi email échoue — 500"""
        mock_send.return_value = False

        data = {'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        # La vérification ne doit pas être conservée en base
        assert not EmailVerification.objects.filter(is_verified=False).exists()

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_cooldown(self, mock_send, auth_client, user, settings):
        """Test cooldown entre deux envois — 429"""
        mock_send.return_value = True
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60

        # Créer une vérification récente
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='123456',
            last_resend_at=timezone.now()  # Envoi à l'instant
        )

        data = {'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert 'retry_after' in response.data


# =============================================================================
# TESTS - SendVerificationCodeView (Non authentifié)
# =============================================================================

@pytest.mark.django_db
class TestSendVerificationCodeViewAnonymous:
    """Tests pour POST /api/v1/auth/email/send-code/ sans authentification"""

    url = "/api/v1/auth/email/send-code/"

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_anonymous_success(self, mock_send, api_client):
        """Test envoi réussi sans authentification"""
        mock_send.return_value = True

        data = {'email': 'anonymous@example.com'}
        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'verification_id' in response.data

        # Vérification sans user associé
        verification = EmailVerification.objects.filter(
            email='anonymous@example.com',
            user__isnull=True
        ).first()
        assert verification is not None

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_normalizes_email(self, mock_send, api_client):
        """Test que l'email est normalisé en minuscules"""
        mock_send.return_value = True

        data = {'email': 'Test@Example.COM'}
        api_client.post(self.url, data, format='json')

        assert EmailVerification.objects.filter(email='test@example.com').exists()

    @patch('api.views.verification_views.email_verification_service.send_verification_code')
    def test_send_code_cooldown_anonymous(self, mock_send, api_client, settings):
        """Test cooldown pour utilisateur anonyme — 429"""
        mock_send.return_value = True
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60

        EmailVerification.objects.create(
            user=None,
            email='anon@example.com',
            code='654321',
            last_resend_at=timezone.now()
        )

        data = {'email': 'anon@example.com'}
        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# =============================================================================
# TESTS - VerifyEmailCodeView (Authentifié)
# =============================================================================

@pytest.mark.django_db
class TestVerifyEmailCodeViewAuthenticated:
    """Tests pour POST /api/v1/auth/email/verify/ avec utilisateur authentifié"""

    url = "/api/v1/auth/email/verify/"

    def test_verify_missing_code(self, auth_client):
        """Test vérification sans code — 400"""
        data = {'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_missing_identifier(self, auth_client):
        """Test vérification sans email ni verification_id — 400"""
        data = {'code': '123456'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_non_digit_code(self, auth_client):
        """Test code non numérique — 400"""
        data = {'code': 'abcdef', 'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_no_pending_verification(self, auth_client):
        """Test vérification sans vérification en cours — 404"""
        data = {'code': '123456', 'email': 'noone@example.com'}
        response = auth_client.post(self.url, data, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_correct_code_success(self, auth_client, user):
        """Test vérification réussie avec code correct"""
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='123456'
        )

        data = {'code': '123456', 'verification_id': verification.id}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True
        assert response.data['email'] == 'verifyuser@example.com'

        verification.refresh_from_db()
        assert verification.is_verified is True

    def test_verify_wrong_code_increments_attempts(self, auth_client, user):
        """Test que le mauvais code incrémente les tentatives"""
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='123456'
        )

        data = {'code': '000000', 'verification_id': verification.id}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'attempts_remaining' in response.data

        verification.refresh_from_db()
        assert verification.attempts == 1

    def test_verify_expired_code(self, auth_client, user, settings):
        """Test code expiré — 400"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='123456'
        )
        verification.created_at = timezone.now() - timedelta(minutes=15)
        verification.save()

        data = {'code': '123456', 'verification_id': verification.id}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'expiré' in response.data['error']

    def test_verify_too_many_attempts(self, auth_client, user, settings):
        """Test trop de tentatives — 429"""
        settings.SMS_MAX_ATTEMPTS = 3
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='123456',
            attempts=3
        )

        data = {'code': '000000', 'verification_id': verification.id}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_verify_by_email_field(self, auth_client, user):
        """Test vérification en passant l'email plutôt que verification_id"""
        verification = EmailVerification.objects.create(
            user=user,
            email='verifyuser@example.com',
            code='654321'
        )

        data = {'code': '654321', 'email': 'verifyuser@example.com'}
        response = auth_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - VerifyEmailCodeView (Non authentifié)
# =============================================================================

@pytest.mark.django_db
class TestVerifyEmailCodeViewAnonymous:
    """Tests pour POST /api/v1/auth/email/verify/ sans authentification"""

    url = "/api/v1/auth/email/verify/"

    def test_verify_anonymous_by_id(self, api_client):
        """Test vérification anonyme par verification_id"""
        verification = EmailVerification.objects.create(
            user=None,
            email='anon@example.com',
            code='111111'
        )

        data = {'code': '111111', 'verification_id': verification.id}
        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['verified'] is True

    def test_verify_anonymous_by_email(self, api_client):
        """Test vérification anonyme par email"""
        EmailVerification.objects.create(
            user=None,
            email='anon2@example.com',
            code='222222'
        )

        data = {'code': '222222', 'email': 'anon2@example.com'}
        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_verify_already_verified_not_found(self, api_client):
        """Test qu'une vérification déjà complétée n'est pas trouvée"""
        verification = EmailVerification.objects.create(
            user=None,
            email='done@example.com',
            code='333333',
            is_verified=True
        )

        data = {'code': '333333', 'verification_id': verification.id}
        response = api_client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND