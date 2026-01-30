# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues Stripe Connect (stripe_connect_views.py)

Teste les endpoints:
- POST /api/v1/stripe/create-account/ - Création compte Stripe Connect
- GET /api/v1/stripe/account-status/ - Statut du compte Stripe
- POST /api/v1/stripe/onboarding-link/ - Lien d'onboarding
- POST /api/v1/stripe/webhook/ - Webhook Stripe

IMPORTANT - Model field notes:
- RestaurateurProfile: stripe_account_id, stripe_verified, stripe_onboarding_completed
- ClientProfile: Simple profile, no Stripe fields
- Restaurant: owner is RestaurateurProfile, is_stripe_active field
- User to RestaurateurProfile is OneToOne - each user fixture needs its own user
"""

import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import datetime
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    ClientProfile,
    Restaurant,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Client API non authentifié"""
    return APIClient()


@pytest.fixture
def user(db):
    """Utilisateur standard sans profil"""
    return User.objects.create_user(
        username="stripeuser@example.com",
        email="stripeuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def restaurateur_user(db, restaurateur_group):
    """Utilisateur restaurateur (sans Stripe)"""
    user = User.objects.create_user(
        username="stripe_resto@example.com",
        email="stripe_resto@example.com",
        password="testpass123",
        first_name="Jean"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def restaurateur_user_with_stripe(db, restaurateur_group):
    """Utilisateur restaurateur (avec Stripe existant)"""
    user = User.objects.create_user(
        username="stripe_resto_existing@example.com",
        email="stripe_resto_existing@example.com",
        password="testpass123",
        first_name="Pierre"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def validated_restaurateur_user(db, restaurateur_group):
    """Utilisateur restaurateur (validé)"""
    user = User.objects.create_user(
        username="stripe_resto_validated@example.com",
        email="stripe_resto_validated@example.com",
        password="testpass123",
        first_name="Marie"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    """Profil restaurateur sans compte Stripe"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id=None,
        stripe_verified=False,
        is_validated=False,
        is_active=False
    )


@pytest.fixture
def restaurateur_profile_with_stripe(restaurateur_user_with_stripe):
    """Profil restaurateur avec compte Stripe existant"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user_with_stripe,
        siret="22345678901234",
        stripe_account_id="acct_test_existing",
        stripe_verified=False,
        stripe_onboarding_completed=False,
        is_validated=False,
        is_active=False
    )


@pytest.fixture
def validated_restaurateur_profile(validated_restaurateur_user):
    """Profil restaurateur validé avec Stripe"""
    return RestaurateurProfile.objects.create(
        user=validated_restaurateur_user,
        siret="32345678901234",
        stripe_account_id="acct_test_validated",
        stripe_verified=True,
        stripe_onboarding_completed=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def client_user(db):
    """Utilisateur client"""
    return User.objects.create_user(
        username="stripe_client@example.com",
        email="stripe_client@example.com",
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
def restaurateur_client(restaurateur_user, restaurateur_profile):
    """Client API authentifié (restaurateur sans Stripe)"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_client_with_stripe(restaurateur_user_with_stripe, restaurateur_profile_with_stripe):
    """Client API authentifié (restaurateur avec Stripe)"""
    token = RefreshToken.for_user(restaurateur_user_with_stripe)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def validated_restaurateur_client(validated_restaurateur_user, validated_restaurateur_profile):
    """Client API authentifié (restaurateur validé)"""
    token = RefreshToken.for_user(validated_restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def client_api_client(client_user, client_profile):
    """Client API authentifié (profil client)"""
    token = RefreshToken.for_user(client_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def auth_user_no_profile(user):
    """Client API authentifié (utilisateur sans profil)"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(validated_restaurateur_profile):
    """Restaurant de test"""
    return Restaurant.objects.create(
        name="Stripe Test Restaurant",
        description="Restaurant pour tests Stripe",
        owner=validated_restaurateur_profile,
        siret="98765432109876",
        address="123 Rue Stripe",
        city="Paris",
        zip_code="75001",
        phone="0140000000",
        email="contact@stripetest.fr",
        cuisine="french",
        is_active=True,
        is_stripe_active=True
    )


# =============================================================================
# MOCKS STRIPE
# =============================================================================

@pytest.fixture
def mock_stripe_account():
    """Mock d'un compte Stripe"""
    account = MagicMock()
    account.id = "acct_test_new_123"
    account.charges_enabled = False
    account.details_submitted = False
    account.payouts_enabled = False
    account.requirements = {"currently_due": ["business_profile.url"]}
    return account


@pytest.fixture
def mock_stripe_account_validated():
    """Mock d'un compte Stripe validé"""
    account = MagicMock()
    account.id = "acct_test_validated"
    account.charges_enabled = True
    account.details_submitted = True
    account.payouts_enabled = True
    account.requirements = {"currently_due": []}
    return account


@pytest.fixture
def mock_stripe_account_link():
    """Mock d'un lien d'onboarding Stripe"""
    link = MagicMock()
    link.url = "https://connect.stripe.com/setup/e/acct_test/onboarding"
    return link


# =============================================================================
# TESTS - create_stripe_account
# =============================================================================

@pytest.mark.django_db
class TestCreateStripeAccount:
    """Tests pour POST /api/v1/stripe/create-account/"""
    
    url = "/api/v1/stripe/create-account/"

    def test_unauthenticated_request(self, api_client):
        """Test requête non authentifiée - 401"""
        response = api_client.post(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_client_profile_forbidden(self, client_api_client):
        """Test client (pas restaurateur) - 403"""
        response = client_api_client.post(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "restaurateurs" in response.data["error"].lower()

    def test_user_no_profile_forbidden(self, auth_user_no_profile):
        """Test utilisateur sans profil - 403"""
        response = auth_user_no_profile.post(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_existing_stripe_account_error(self, restaurateur_client_with_stripe):
        """Test compte Stripe déjà existant - 400"""
        response = restaurateur_client_with_stripe.post(self.url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.data["error"]

    @patch("api.views.stripe_connect_views.stripe.Account.create")
    @patch("api.views.stripe_connect_views.stripe.AccountLink.create")
    def test_create_account_success(
        self, 
        mock_account_link_create, 
        mock_account_create, 
        restaurateur_client, 
        restaurateur_profile,
        mock_stripe_account,
        mock_stripe_account_link
    ):
        """Test création compte Stripe réussie"""
        mock_account_create.return_value = mock_stripe_account
        mock_account_link_create.return_value = mock_stripe_account_link
        
        response = restaurateur_client.post(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["account_id"] == "acct_test_new_123"
        assert "onboarding_url" in response.data
        assert response.data["onboarding_url"] == mock_stripe_account_link.url
        
        # Vérifier que le profil a été mis à jour
        restaurateur_profile.refresh_from_db()
        assert restaurateur_profile.stripe_account_id == "acct_test_new_123"
        assert restaurateur_profile.stripe_account_created is not None

    @patch("api.views.stripe_connect_views.stripe.Account.create")
    @patch("api.views.stripe_connect_views.stripe.AccountLink.create")
    def test_create_account_metadata(
        self,
        mock_account_link_create,
        mock_account_create,
        restaurateur_client,
        restaurateur_profile,
        restaurateur_user,
        mock_stripe_account,
        mock_stripe_account_link
    ):
        """Test que les metadata sont correctement passées"""
        mock_account_create.return_value = mock_stripe_account
        mock_account_link_create.return_value = mock_stripe_account_link
        
        restaurateur_client.post(self.url)
        
        # Vérifier les arguments passés à stripe.Account.create
        call_kwargs = mock_account_create.call_args.kwargs
        assert call_kwargs["type"] == "express"
        assert call_kwargs["country"] == "FR"
        assert call_kwargs["email"] == restaurateur_user.email
        assert call_kwargs["metadata"]["user_id"] == str(restaurateur_user.id)
        assert call_kwargs["metadata"]["siret"] == restaurateur_profile.siret
        assert call_kwargs["metadata"]["app"] == "Eat&Go"

    @patch("api.views.stripe_connect_views.stripe.Account.create")
    def test_create_account_stripe_error(
        self,
        mock_account_create,
        restaurateur_client
    ):
        """Test erreur Stripe lors de la création"""
        import stripe
        mock_account_create.side_effect = stripe.error.StripeError("Test error")
        
        response = restaurateur_client.post(self.url)
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Erreur" in response.data["error"]

    @patch("api.views.stripe_connect_views.stripe.Account.create")
    def test_create_account_unexpected_error(
        self,
        mock_account_create,
        restaurateur_client
    ):
        """Test erreur inattendue lors de la création"""
        mock_account_create.side_effect = Exception("Unexpected error")
        
        response = restaurateur_client.post(self.url)
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "inattendue" in response.data["error"]


# =============================================================================
# TESTS - get_stripe_account_status
# =============================================================================

@pytest.mark.django_db
class TestGetStripeAccountStatus:
    """Tests pour GET /api/v1/stripe/account-status/"""
    
    url = "/api/v1/stripe/account-status/"

    def test_unauthenticated_request(self, api_client):
        """Test requête non authentifiée - 401"""
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_client_profile_status(self, client_api_client):
        """Test statut pour profil client"""
        response = client_api_client.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "client_account"
        assert response.data["has_validated_profile"] is True
        assert "message" in response.data

    def test_user_no_profile_status(self, auth_user_no_profile):
        """Test statut pour utilisateur sans profil"""
        response = auth_user_no_profile.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "unknown_user"

    def test_restaurateur_no_stripe_account(self, restaurateur_client):
        """Test restaurateur sans compte Stripe"""
        response = restaurateur_client.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "no_account"
        assert response.data["has_validated_profile"] is False

    @patch("api.views.stripe_connect_views.stripe.Account.retrieve")
    def test_restaurateur_with_stripe_account(
        self,
        mock_account_retrieve,
        restaurateur_client_with_stripe,
        mock_stripe_account
    ):
        """Test restaurateur avec compte Stripe"""
        mock_account_retrieve.return_value = mock_stripe_account
        
        response = restaurateur_client_with_stripe.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "account_exists"
        assert response.data["account_id"] == mock_stripe_account.id
        assert response.data["charges_enabled"] == mock_stripe_account.charges_enabled
        assert response.data["details_submitted"] == mock_stripe_account.details_submitted
        assert response.data["payouts_enabled"] == mock_stripe_account.payouts_enabled

    @patch("api.views.stripe_connect_views.stripe.Account.retrieve")
    def test_restaurateur_validated_account(
        self,
        mock_account_retrieve,
        validated_restaurateur_client,
        mock_stripe_account_validated
    ):
        """Test restaurateur avec compte Stripe validé"""
        mock_account_retrieve.return_value = mock_stripe_account_validated
        
        response = validated_restaurateur_client.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "account_exists"
        assert response.data["charges_enabled"] is True
        assert response.data["details_submitted"] is True
        assert response.data["payouts_enabled"] is True
        assert response.data["has_validated_profile"] is True

    @patch("api.views.stripe_connect_views.stripe.Account.retrieve")
    def test_stripe_retrieve_error(
        self,
        mock_account_retrieve,
        restaurateur_client_with_stripe
    ):
        """Test erreur lors de la récupération du compte Stripe"""
        import stripe
        mock_account_retrieve.side_effect = stripe.error.StripeError("Account not found")
        
        response = restaurateur_client_with_stripe.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert "error" in response.data


# =============================================================================
# TESTS - create_onboarding_link
# =============================================================================

@pytest.mark.django_db
class TestCreateOnboardingLink:
    """Tests pour POST /api/v1/stripe/onboarding-link/"""
    
    url = "/api/v1/stripe/onboarding-link/"

    def test_unauthenticated_request(self, api_client):
        """Test requête non authentifiée - 401"""
        response = api_client.post(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_client_profile_forbidden(self, client_api_client):
        """Test client (pas restaurateur) - 403"""
        response = client_api_client.post(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_restaurateur_no_stripe_account(self, restaurateur_client):
        """Test restaurateur sans compte Stripe - 400"""
        response = restaurateur_client.post(self.url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Aucun compte Stripe" in response.data["error"]

    @patch("api.views.stripe_connect_views.stripe.AccountLink.create")
    def test_create_onboarding_link_success(
        self,
        mock_account_link_create,
        restaurateur_client_with_stripe,
        mock_stripe_account_link
    ):
        """Test création lien onboarding réussie"""
        mock_account_link_create.return_value = mock_stripe_account_link
        
        response = restaurateur_client_with_stripe.post(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        assert "onboarding_url" in response.data
        assert response.data["onboarding_url"] == mock_stripe_account_link.url

    @patch("api.views.stripe_connect_views.stripe.AccountLink.create")
    def test_create_onboarding_link_stripe_error(
        self,
        mock_account_link_create,
        restaurateur_client_with_stripe
    ):
        """Test erreur Stripe lors de la création du lien"""
        import stripe
        mock_account_link_create.side_effect = stripe.error.StripeError("Invalid account")
        
        response = restaurateur_client_with_stripe.post(self.url)
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Erreur" in response.data["error"]


# =============================================================================
# TESTS - stripe_webhook
# =============================================================================

@pytest.mark.django_db
class TestStripeWebhook:
    """Tests pour POST /api/v1/stripe/webhook/"""
    
    url = "/api/v1/stripe/webhook/"

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    def test_invalid_payload(self, mock_construct_event, api_client):
        """Test payload invalide - 400"""
        mock_construct_event.side_effect = ValueError("Invalid payload")
        
        response = api_client.post(
            self.url,
            data="invalid",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test_sig"
        )
        
        assert response.status_code == 400

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    def test_invalid_signature(self, mock_construct_event, api_client):
        """Test signature invalide - 400"""
        import stripe
        mock_construct_event.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig"
        )
        
        response = api_client.post(
            self.url,
            data=json.dumps({"test": "data"}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="invalid_sig"
        )
        
        assert response.status_code == 400

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    @patch("api.views.stripe_connect_views.handle_account_updated")
    def test_account_updated_event(
        self,
        mock_handle_updated,
        mock_construct_event,
        api_client
    ):
        """Test événement account.updated"""
        mock_construct_event.return_value = {
            "type": "account.updated",
            "data": {"object": {"id": "acct_test_123"}}
        }
        
        response = api_client.post(
            self.url,
            data=json.dumps({"type": "account.updated"}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid_sig"
        )
        
        assert response.status_code == 200
        mock_handle_updated.assert_called_once_with({"id": "acct_test_123"})

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    @patch("api.views.stripe_connect_views.handle_account_authorized")
    def test_account_authorized_event(
        self,
        mock_handle_authorized,
        mock_construct_event,
        api_client
    ):
        """Test événement account.application.authorized"""
        mock_construct_event.return_value = {
            "type": "account.application.authorized",
            "data": {"object": {"id": "acct_test_123"}}
        }
        
        response = api_client.post(
            self.url,
            data=json.dumps({}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid_sig"
        )
        
        assert response.status_code == 200
        mock_handle_authorized.assert_called_once()

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    @patch("api.views.stripe_connect_views.handle_account_deauthorized")
    def test_account_deauthorized_event(
        self,
        mock_handle_deauthorized,
        mock_construct_event,
        api_client
    ):
        """Test événement account.application.deauthorized"""
        mock_construct_event.return_value = {
            "type": "account.application.deauthorized",
            "data": {"object": {"id": "acct_test_123"}}
        }
        
        response = api_client.post(
            self.url,
            data=json.dumps({}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid_sig"
        )
        
        assert response.status_code == 200
        mock_handle_deauthorized.assert_called_once()

    @patch("api.views.stripe_connect_views.stripe.Webhook.construct_event")
    def test_unhandled_event(self, mock_construct_event, api_client):
        """Test événement non géré - 200 (accepté mais ignoré)"""
        mock_construct_event.return_value = {
            "type": "payment_intent.created",
            "data": {"object": {"id": "pi_test_123"}}
        }
        
        response = api_client.post(
            self.url,
            data=json.dumps({}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="valid_sig"
        )
        
        assert response.status_code == 200


# =============================================================================
# TESTS - handle_account_updated (fonction helper)
# =============================================================================

@pytest.mark.django_db
class TestHandleAccountUpdated:
    """Tests pour la fonction handle_account_updated"""

    def test_account_validated(self, db, restaurateur_group):
        """Test validation complète du compte"""
        from api.views.stripe_connect_views import handle_account_updated
        
        # Créer un utilisateur et profil isolés pour ce test
        user = User.objects.create_user(
            username="handle_update_user@example.com",
            email="handle_update_user@example.com",
            password="testpass123"
        )
        user.groups.add(restaurateur_group)
        
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="99999999999999",
            stripe_account_id="acct_handle_update_test",
            stripe_verified=False,
            is_validated=False,
            is_active=False
        )
        
        # Créer un restaurant pour ce profil
        restaurant = Restaurant.objects.create(
            name="Handle Update Test Restaurant",
            description="Test",
            owner=profile,
            siret="88888888888888",
            address="Test",
            city="Paris",
            zip_code="75001",
            phone="0100000000",
            email="handle@test.fr",
            cuisine="french",
            is_active=True,
            is_stripe_active=False
        )
        
        account_data = {
            "id": "acct_handle_update_test",
            "charges_enabled": True,
            "details_submitted": True,
            "payouts_enabled": True
        }
        
        handle_account_updated(account_data)
        
        profile.refresh_from_db()
        restaurant.refresh_from_db()
        
        assert profile.stripe_verified is True
        assert profile.stripe_onboarding_completed is True
        assert profile.is_validated is True
        assert profile.is_active is True
        assert restaurant.is_stripe_active is True

    def test_account_not_validated(self, db, restaurateur_group):
        """Test compte non validé (charges_enabled=False)"""
        from api.views.stripe_connect_views import handle_account_updated
        
        # Créer un utilisateur et profil isolés pour ce test
        user = User.objects.create_user(
            username="handle_notvalid_user@example.com",
            email="handle_notvalid_user@example.com",
            password="testpass123"
        )
        user.groups.add(restaurateur_group)
        
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="77777777777777",
            stripe_account_id="acct_handle_notvalid_test",
            stripe_verified=False,
            is_validated=False,
            is_active=False
        )
        
        restaurant = Restaurant.objects.create(
            name="Handle NotValid Test Restaurant",
            description="Test",
            owner=profile,
            siret="66666666666666",
            address="Test",
            city="Paris",
            zip_code="75001",
            phone="0100000001",
            email="handlenotvalid@test.fr",
            cuisine="french",
            is_active=True,
            is_stripe_active=True
        )
        
        account_data = {
            "id": "acct_handle_notvalid_test",
            "charges_enabled": False,
            "details_submitted": True,
            "payouts_enabled": True
        }
        
        handle_account_updated(account_data)
        
        profile.refresh_from_db()
        restaurant.refresh_from_db()
        
        assert profile.stripe_verified is False
        assert restaurant.is_stripe_active is False

    def test_account_not_found(self):
        """Test compte Stripe non trouvé dans la base"""
        from api.views.stripe_connect_views import handle_account_updated
        
        account_data = {
            "id": "acct_nonexistent",
            "charges_enabled": True,
            "details_submitted": True,
            "payouts_enabled": True
        }
        
        # Ne doit pas lever d'exception
        handle_account_updated(account_data)


# =============================================================================
# TESTS - handle_account_deauthorized (fonction helper)
# =============================================================================

@pytest.mark.django_db
class TestHandleAccountDeauthorized:
    """Tests pour la fonction handle_account_deauthorized"""

    def test_account_deauthorized(self, db, restaurateur_group):
        """Test désactivation du compte"""
        from api.views.stripe_connect_views import handle_account_deauthorized
        
        # Créer un utilisateur et profil isolés pour ce test
        user = User.objects.create_user(
            username="handle_deauth_user@example.com",
            email="handle_deauth_user@example.com",
            password="testpass123"
        )
        user.groups.add(restaurateur_group)
        
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="55555555555555",
            stripe_account_id="acct_handle_deauth_test",
            stripe_verified=True,
            stripe_onboarding_completed=True,
            is_validated=True,
            is_active=True
        )
        
        restaurant = Restaurant.objects.create(
            name="Handle Deauth Test Restaurant",
            description="Test",
            owner=profile,
            siret="44444444444444",
            address="Test",
            city="Paris",
            zip_code="75001",
            phone="0100000002",
            email="handledeauth@test.fr",
            cuisine="french",
            is_active=True,
            is_stripe_active=True
        )
        
        account_data = {
            "id": "acct_handle_deauth_test"
        }
        
        handle_account_deauthorized(account_data)
        
        profile.refresh_from_db()
        restaurant.refresh_from_db()
        
        assert profile.stripe_verified is False
        assert profile.stripe_onboarding_completed is False
        assert profile.is_validated is False
        assert profile.is_active is False
        assert restaurant.is_stripe_active is False

    def test_deauthorize_nonexistent_account(self):
        """Test déauthorisation compte non trouvé"""
        from api.views.stripe_connect_views import handle_account_deauthorized
        
        account_data = {
            "id": "acct_nonexistent"
        }
        
        # Ne doit pas lever d'exception
        handle_account_deauthorized(account_data)


# =============================================================================
# TESTS - Intégration URLs
# =============================================================================

@pytest.mark.django_db
class TestStripeURLs:
    """Tests de vérification des URLs Stripe"""

    def test_create_account_url_exists(self, api_client):
        """Test que l'URL create-account existe"""
        response = api_client.post("/api/v1/stripe/create-account/")
        # 401 car non authentifié, mais l'URL existe
        assert response.status_code != 404

    def test_account_status_url_exists(self, api_client):
        """Test que l'URL account-status existe"""
        response = api_client.get("/api/v1/stripe/account-status/")
        assert response.status_code != 404

    def test_onboarding_link_url_exists(self, api_client):
        """Test que l'URL onboarding-link existe"""
        response = api_client.post("/api/v1/stripe/onboarding-link/")
        assert response.status_code != 404

    def test_webhook_url_exists(self, api_client):
        """Test que l'URL webhook existe"""
        response = api_client.post("/api/v1/stripe/webhook/")
        # 400 car payload invalide, mais l'URL existe
        assert response.status_code != 404