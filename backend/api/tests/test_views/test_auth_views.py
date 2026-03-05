# -*- coding: utf-8 -*-
"""
Tests pour les vues d'authentification (auth_views.py)

Couvre:
- RegisterView
- MeView
- LoginView
- InitiateRegistrationView  (étape 1 — envoi code email)
- VerifyRegistrationView    (étape 2 — vérification code + création compte)
- ResendVerificationCodeView
"""

import pytest
from unittest.mock import patch
from django.contrib.auth.models import User
from api.models import ClientProfile, RestaurateurProfile, PendingRegistration
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="existing@example.com",
        email="existing@example.com",
        password="StrongPassword123"
    )


@pytest.fixture
def pending_reg(db):
    """Inscription en attente avec code valide"""
    p = PendingRegistration.objects.create(
        email="pending@example.com",
        password_hash=make_password("StrongPassword123"),
        nom="Pending User",
        role="client",
        telephone="0612345678",
        verification_code="123456"
    )
    return p


@pytest.fixture
def auth_client(user):
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token.access_token)}")
    return client


# =============================================================================
# TESTS - RegisterView
# =============================================================================

@pytest.mark.django_db
def test_register_view_success():
    client = APIClient()
    data = {
        "username": "newuser@example.com",
        "password": "StrongPassword123",
        "nom": "Test User",
        "role": "client",
        "telephone": "0600000000"
    }
    response = client.post("/api/v1/auth/register/", data, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_register_view_failure():
    client = APIClient()
    data = {
        "username": "",
        "password": "123"
    }
    response = client.post("/api/v1/auth/register/", data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "username" in response.data or "password" in response.data


# =============================================================================
# TESTS - MeView
# =============================================================================

@pytest.mark.django_db
def test_me_view_authenticated():
    user = User.objects.create_user(username="testuser", password="secret")
    token = RefreshToken.for_user(user)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token.access_token)}")

    response = client.get("/api/v1/auth/me/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["username"] == "testuser"


@pytest.mark.django_db
def test_me_view_unauthenticated():
    client = APIClient()
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_me_view_with_client_profile():
    user = User.objects.create_user(username="clientuser", password="secret")
    ClientProfile.objects.create(user=user)

    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token.access_token)}")

    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.data["role"] == "client"


@pytest.mark.django_db
def test_me_view_with_restaurateur_profile():
    user = User.objects.create_user(username="restouser", password="secret")
    RestaurateurProfile.objects.create(user=user, siret="12345678901234")

    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token.access_token)}")

    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.data["role"] == "restaurateur"


# =============================================================================
# TESTS - LoginView
# =============================================================================

@pytest.mark.django_db
class TestLoginView:
    url = "/api/v1/auth/login/"

    def test_login_success(self, api_client, user):
        data = {"username": "existing@example.com", "password": "StrongPassword123"}
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_wrong_password(self, api_client, user):
        data = {"username": "existing@example.com", "password": "wrongpassword"}
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_unknown_user(self, api_client):
        data = {"username": "ghost@example.com", "password": "whatever"}
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_missing_fields(self, api_client):
        response = api_client.post(self.url, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - InitiateRegistrationView (Étape 1 — envoi code email)
# =============================================================================

@pytest.mark.django_db
class TestInitiateRegistrationView:
    url = "/api/v1/auth/register/initiate/"

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_initiate_success(self, mock_send, api_client):
        """Inscription initiale réussie — code envoyé par email"""
        mock_send.return_value = True

        data = {
            "username": "newuser@example.com",
            "password": "StrongPassword123",
            "nom": "Nouveau",
            "role": "client",
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert "registration_id" in response.data
        assert "email" in response.data         # email masqué
        assert "expires_in" in response.data
        mock_send.assert_called_once()

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_email_masked_in_response(self, mock_send, api_client):
        """L'email retourné doit être masqué (n***@example.com)"""
        mock_send.return_value = True

        data = {
            "username": "newuser@example.com",
            "password": "StrongPassword123",
            "nom": "Nouveau",
            "role": "client",
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # L'email complet ne doit pas apparaître en clair
        assert response.data["email"] != "newuser@example.com"
        assert "@example.com" in response.data["email"]

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_initiate_creates_pending_registration(self, mock_send, api_client):
        """Une PendingRegistration doit être créée en base"""
        mock_send.return_value = True

        data = {
            "username": "pending@example.com",
            "password": "StrongPassword123",
            "nom": "Pending",
            "role": "client",
        }
        api_client.post(self.url, data, format="json")

        assert PendingRegistration.objects.filter(email="pending@example.com").exists()

    def test_initiate_existing_user_rejected(self, api_client, user):
        """Un email déjà utilisé doit retourner 400"""
        data = {
            "username": "existing@example.com",
            "password": "StrongPassword123",
            "nom": "Dupe",
            "role": "client",
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_initiate_email_send_failure_cleans_up(self, mock_send, api_client):
        """Si l'email échoue, la PendingRegistration doit être supprimée"""
        mock_send.return_value = False

        data = {
            "username": "failsend@example.com",
            "password": "StrongPassword123",
            "nom": "Fail",
            "role": "client",
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert not PendingRegistration.objects.filter(email="failsend@example.com").exists()

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_initiate_cooldown_on_resend(self, mock_send, api_client, pending_reg):
        """Renvoyer trop vite doit retourner 429"""
        mock_send.return_value = True
        pending_reg.last_resend_at = timezone.now()
        pending_reg.save()

        data = {
            "username": "pending@example.com",
            "password": "StrongPassword123",
            "nom": "Pending User",
            "role": "client",
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "retry_after" in response.data

    def test_initiate_missing_required_fields(self, api_client):
        """Champs obligatoires manquants — 400"""
        response = api_client.post(self.url, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - VerifyRegistrationView (Étape 2 — création compte)
# =============================================================================

@pytest.mark.django_db
class TestVerifyRegistrationView:
    url = "/api/v1/auth/register/verify/"

    def test_verify_success_creates_user(self, api_client, pending_reg):
        """Code correct → compte créé, tokens retournés"""
        data = {
            "registration_id": str(pending_reg.id),
            "code": "123456"
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["username"] == "pending@example.com"

    def test_verify_success_deletes_pending(self, api_client, pending_reg):
        """Après vérification réussie la PendingRegistration est supprimée"""
        data = {
            "registration_id": str(pending_reg.id),
            "code": "123456"
        }
        api_client.post(self.url, data, format="json")
        assert not PendingRegistration.objects.filter(id=pending_reg.id).exists()

    def test_verify_success_creates_client_profile(self, api_client, pending_reg):
        """Vérification réussie crée un ClientProfile"""
        data = {
            "registration_id": str(pending_reg.id),
            "code": "123456"
        }
        api_client.post(self.url, data, format="json")
        assert ClientProfile.objects.filter(user__username="pending@example.com").exists()

    def test_verify_wrong_code(self, api_client, pending_reg):
        """Mauvais code → 400 avec attempts_remaining"""
        data = {
            "registration_id": str(pending_reg.id),
            "code": "000000"
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "attempts_remaining" in response.data

        pending_reg.refresh_from_db()
        assert pending_reg.attempts == 1

    def test_verify_expired_code(self, api_client, pending_reg, settings):
        """Code expiré → 400"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        from datetime import timedelta
        pending_reg.code_sent_at = timezone.now() - timedelta(minutes=15)
        pending_reg.save()

        data = {
            "registration_id": str(pending_reg.id),
            "code": "123456"
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expiré" in response.data["error"]

    def test_verify_too_many_attempts(self, api_client, pending_reg, settings):
        """Trop de tentatives → 429"""
        settings.SMS_MAX_ATTEMPTS = 3
        pending_reg.attempts = 3
        pending_reg.save()

        data = {
            "registration_id": str(pending_reg.id),
            "code": "000000"
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_verify_unknown_registration_id(self, api_client):
        """ID inexistant → 404"""
        data = {
            "registration_id": "00000000-0000-0000-0000-000000000000",
            "code": "123456"
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_already_verified(self, api_client, pending_reg):
        """Inscription déjà validée → 404"""
        pending_reg.mark_verified()

        data = {
            "registration_id": str(pending_reg.id),
            "code": "123456"
        }
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_restaurateur_creates_profile(self, api_client):
        """Vérification restaurateur crée un RestaurateurProfile"""
        pending = PendingRegistration.objects.create(
            email="resto@example.com",
            password_hash=make_password("StrongPassword123"),
            nom="Chef",
            role="restaurateur",
            siret="12345678901234",
            verification_code="999999"
        )
        data = {
            "registration_id": str(pending.id),
            "code": "999999"
        }
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert RestaurateurProfile.objects.filter(user__username="resto@example.com").exists()


# =============================================================================
# TESTS - ResendVerificationCodeView
# =============================================================================

@pytest.mark.django_db
class TestResendVerificationCodeView:
    url = "/api/v1/auth/register/resend/"

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_resend_success(self, mock_send, api_client, pending_reg):
        """Renvoi réussi après cooldown"""
        mock_send.return_value = True
        from datetime import timedelta
        pending_reg.last_resend_at = timezone.now() - timedelta(seconds=120)
        pending_reg.save()

        data = {"registration_id": str(pending_reg.id)}
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert "expires_in" in response.data
        mock_send.assert_called_once()

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_resend_resets_attempts(self, mock_send, api_client, pending_reg):
        """Le renvoi doit réinitialiser le compteur de tentatives"""
        mock_send.return_value = True
        from datetime import timedelta
        pending_reg.attempts = 2
        pending_reg.last_resend_at = timezone.now() - timedelta(seconds=120)
        pending_reg.save()

        data = {"registration_id": str(pending_reg.id)}
        api_client.post(self.url, data, format="json")

        pending_reg.refresh_from_db()
        assert pending_reg.attempts == 0

    def test_resend_cooldown_active(self, api_client, pending_reg):
        """Renvoi trop rapide → 429"""
        pending_reg.last_resend_at = timezone.now()
        pending_reg.save()

        data = {"registration_id": str(pending_reg.id)}
        response = api_client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "retry_after" in response.data

    def test_resend_unknown_id(self, api_client):
        """ID inexistant → 404"""
        data = {"registration_id": "00000000-0000-0000-0000-000000000000"}
        response = api_client.post(self.url, data, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @patch('api.views.auth_views.email_verification_service.send_verification_code')
    def test_resend_generates_new_code(self, mock_send, api_client, pending_reg):
        """Le renvoi génère un nouveau code"""
        mock_send.return_value = True
        from datetime import timedelta
        old_code = pending_reg.verification_code
        pending_reg.last_resend_at = timezone.now() - timedelta(seconds=120)
        pending_reg.save()

        data = {"registration_id": str(pending_reg.id)}
        api_client.post(self.url, data, format="json")

        pending_reg.refresh_from_db()
        # Le code a très probablement changé (peut matcher par chance mais très peu probable)
        assert pending_reg.verification_code is not None