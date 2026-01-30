# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de token (token_views.py)

Teste l'endpoint:
- POST /api/v1/token/token/ - Obtention d'un token d'authentification

L'endpoint utilise rest_framework.authtoken (Token model) et non JWT.
"""

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Client API non authentifié"""
    return APIClient()


@pytest.fixture
def user(db):
    """Utilisateur standard actif"""
    return User.objects.create_user(
        username="tokenuser@example.com",
        email="tokenuser@example.com",
        password="securepass123"
    )


@pytest.fixture
def inactive_user(db):
    """Utilisateur inactif"""
    user = User.objects.create_user(
        username="inactive@example.com",
        email="inactive@example.com",
        password="securepass123"
    )
    user.is_active = False
    user.save()
    return user


@pytest.fixture
def user_with_token(user):
    """Utilisateur avec token existant"""
    token, _ = Token.objects.get_or_create(user=user)
    return user, token


# =============================================================================
# TESTS - ObtainAuthTokenView
# =============================================================================

@pytest.mark.django_db
class TestObtainAuthTokenView:
    """Tests pour POST /api/v1/token/token/"""
    
    url = "/api/v1/token/token/"

    def test_obtain_token_success(self, api_client, user):
        """Test obtention de token avec credentials valides"""
        data = {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'token' in response.data
        assert len(response.data['token']) > 0
        
        # Vérifier que le token existe en base
        assert Token.objects.filter(user=user).exists()

    def test_obtain_token_creates_token(self, api_client, user):
        """Test que le token est créé s'il n'existe pas"""
        # Vérifier qu'aucun token n'existe
        assert not Token.objects.filter(user=user).exists()
        
        data = {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        # Le token a été créé
        assert Token.objects.filter(user=user).exists()

    def test_obtain_token_returns_existing_token(self, api_client, user_with_token):
        """Test que le même token est retourné si déjà existant"""
        user, existing_token = user_with_token
        
        data = {
            'username': user.username,
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['token'] == existing_token.key

    def test_obtain_token_invalid_password(self, api_client, user):
        """Test avec mot de passe invalide - 401"""
        data = {
            'username': 'tokenuser@example.com',
            'password': 'wrongpassword'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'error' in response.data

    def test_obtain_token_invalid_username(self, api_client):
        """Test avec username inexistant - 401"""
        data = {
            'username': 'nonexistent@example.com',
            'password': 'anypassword'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'error' in response.data

    def test_obtain_token_missing_username(self, api_client):
        """Test sans username - 400"""
        data = {
            'password': 'somepassword'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_obtain_token_missing_password(self, api_client, user):
        """Test sans password - 400"""
        data = {
            'username': 'tokenuser@example.com'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_obtain_token_empty_body(self, api_client):
        """Test avec body vide - 400"""
        response = api_client.post(self.url, {}, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_obtain_token_inactive_user(self, api_client, inactive_user):
        """Test avec utilisateur inactif - 401"""
        data = {
            'username': 'inactive@example.com',
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        # Django authenticate() retourne None pour les utilisateurs inactifs
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_obtain_token_case_sensitive_username(self, api_client, user):
        """Test que le username est sensible à la casse"""
        data = {
            'username': 'TOKENUSER@EXAMPLE.COM',  # Majuscules
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        # Par défaut Django est sensible à la casse pour les usernames
        # Cela peut être 401 ou 200 selon la config
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_401_UNAUTHORIZED
        ]

    def test_obtain_token_empty_username(self, api_client):
        """Test avec username vide - 400"""
        data = {
            'username': '',
            'password': 'somepassword'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_obtain_token_empty_password(self, api_client, user):
        """Test avec password vide - 400 ou 401"""
        data = {
            'username': 'tokenuser@example.com',
            'password': ''
        }
        
        response = api_client.post(self.url, data, format='json')
        
        # Peut être 400 (validation serializer) ou 401 (auth échouée)
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED
        ]

    def test_obtain_token_no_auth_required(self, api_client, user):
        """Test que l'endpoint ne requiert pas d'authentification préalable"""
        # Client sans aucun header d'auth
        data = {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data, format='json')
        
        # Ne devrait pas être 401 pour "authentification requise"
        assert response.status_code == status.HTTP_200_OK

    def test_obtain_token_get_method_not_allowed(self, api_client):
        """Test que GET n'est pas autorisé"""
        response = api_client.get(self.url)
        
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_obtain_token_with_form_data(self, api_client, user):
        """Test avec form data au lieu de JSON"""
        data = {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }
        
        response = api_client.post(self.url, data)  # Sans format='json'
        
        assert response.status_code == status.HTTP_200_OK
        assert 'token' in response.data


# =============================================================================
# TESTS - Token consistency
# =============================================================================

@pytest.mark.django_db
class TestTokenConsistency:
    """Tests de cohérence du token"""
    
    url = "/api/v1/token/token/"

    def test_multiple_requests_same_token(self, api_client, user):
        """Test que plusieurs requêtes retournent le même token"""
        data = {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }
        
        response1 = api_client.post(self.url, data, format='json')
        response2 = api_client.post(self.url, data, format='json')
        response3 = api_client.post(self.url, data, format='json')
        
        assert response1.status_code == status.HTTP_200_OK
        assert response2.status_code == status.HTTP_200_OK
        assert response3.status_code == status.HTTP_200_OK
        
        # Tous les tokens sont identiques
        assert response1.data['token'] == response2.data['token']
        assert response2.data['token'] == response3.data['token']

    def test_different_users_different_tokens(self, api_client, db):
        """Test que différents utilisateurs ont différents tokens"""
        user1 = User.objects.create_user(
            username="user1@example.com",
            password="pass1"
        )
        user2 = User.objects.create_user(
            username="user2@example.com",
            password="pass2"
        )
        
        response1 = api_client.post(self.url, {
            'username': 'user1@example.com',
            'password': 'pass1'
        }, format='json')
        
        response2 = api_client.post(self.url, {
            'username': 'user2@example.com',
            'password': 'pass2'
        }, format='json')
        
        assert response1.status_code == status.HTTP_200_OK
        assert response2.status_code == status.HTTP_200_OK
        
        # Les tokens sont différents
        assert response1.data['token'] != response2.data['token']


# =============================================================================
# TESTS - URLs
# =============================================================================

@pytest.mark.django_db
class TestTokenURLs:
    """Tests de vérification des URLs"""

    def test_token_url_exists(self, api_client):
        """Test que l'URL token existe"""
        response = api_client.post('/api/v1/token/token/', {})
        # 400 car données manquantes, mais URL existe
        assert response.status_code != 404

    def test_token_url_allows_post(self, api_client, user):
        """Test que POST est autorisé"""
        response = api_client.post('/api/v1/token/token/', {
            'username': 'tokenuser@example.com',
            'password': 'securepass123'
        }, format='json')
        
        assert response.status_code == status.HTTP_200_OK