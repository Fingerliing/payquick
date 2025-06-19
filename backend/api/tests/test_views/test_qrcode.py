# ---------------------------------------------------------------------
# Tests for QRCodeFactoryView
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import RestaurateurProfile, Restaurant, Table
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch


@pytest.fixture
def restaurateur_client():
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="qruser", password="strongpass")
    user.groups.add(group)
    id_card = SimpleUploadedFile("id.pdf", b"doc", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"doc", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(user=user, siret="81818181818181", id_card=id_card, kbis=kbis)
    token = RefreshToken.for_user(user)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user, profile


@pytest.mark.django_db
@patch("api.views.qrcode_views.generate_qr_for_table")
def test_generate_qr_code_success(mock_generate, restaurateur_client):
    client, _, profile = restaurateur_client
    restaurant = Restaurant.objects.create(name="QR Bistro", description="Scan & Go", owner=profile, siret="56565656565656")
    table1 = Table.objects.create(restaurant=restaurant, identifiant="T1")
    table2 = Table.objects.create(restaurant=restaurant, identifiant="T2")

    url = f"/api/v1/qrcode/factory/{restaurant.id}/"
    response = client.post(url)

    assert response.status_code == 200
    assert "generated" in response.data
    assert len(response.data["generated"]) == 2
    mock_generate.assert_called()


@pytest.mark.django_db
def test_generate_qr_code_forbidden_if_not_owner(restaurateur_client):
    client, _, _ = restaurateur_client

    # Restaurant sans lien avec l'utilisateur authentifié
    other_user = User.objects.create_user(username="intrus", password="test")
    restaurant = Restaurant.objects.create(name="Not Yours", description="Hackable", owner=None, siret="99999999999999")

    url = f"/api/v1/qrcode/factory/{restaurant.id}/"
    response = client.post(url)

    assert response.status_code == 403
    assert "error" in response.data


@pytest.mark.django_db
def test_generate_qr_code_unauthenticated():
    client = APIClient()
    response = client.post("/api/v1/qrcode/1/")
    assert response.status_code == 401
