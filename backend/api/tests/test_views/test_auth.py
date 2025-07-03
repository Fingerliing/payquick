# ---------------------------------------------------------------------
# Tests for authentication views (RegisterView, MeView)
# ---------------------------------------------------------------------

import pytest
from django.contrib.auth.models import User
from api.models import ClientProfile, RestaurateurProfile
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken


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
        "username": "",  # invalide
        "password": "123"  # probablement trop faible selon les validateurs
    }

    response = client.post("/api/v1/auth/register/", data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "username" in response.data or "password" in response.data


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
