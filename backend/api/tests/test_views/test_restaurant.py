# ---------------------------------------------------------------------
# Tests for RestaurantViewSet
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import RestaurateurProfile, Restaurant
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.fixture
def restaurateur_client():
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="resto_user", password="safePass")
    user.groups.add(group)
    id_card = SimpleUploadedFile("id.pdf", b"doc", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"doc", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(user=user, siret="77777777777777", id_card=id_card, kbis=kbis)
    token = RefreshToken.for_user(user)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user, profile


@pytest.mark.django_db
def test_create_restaurant(restaurateur_client):
    client, user, _ = restaurateur_client

    response = client.post("/api/v1/restaurants/", {
        "name": "Le Coin",
        "description": "Bistrot du quartier",
        "siret": "88888888888888",
        "address": "123 rue du Centre"
    })

    assert response.status_code == 201
    restaurant = Restaurant.objects.get(name="Le Coin")
    assert restaurant.owner == user.restaurateur_profile


@pytest.mark.django_db
def test_list_restaurants(restaurateur_client):
    client, _, profile = restaurateur_client

    Restaurant.objects.create(name="Test", description="Desc", owner=profile, siret="12121212121212")

    response = client.get("/api/v1/restaurants/")
    assert response.status_code == 200
    assert any(r["name"] == "Test" for r in response.data)


@pytest.mark.django_db
def test_create_restaurant_unauthenticated():
    client = APIClient()
    response = client.post("/api/v1/restaurants/", {
        "name": "Hors ligne",
        "description": "Accès refusé",
        "siret": "99999999999999",
        "address": "Ailleurs"
    })

    assert response.status_code == 401
