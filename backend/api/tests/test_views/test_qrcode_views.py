import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import RestaurateurProfile, Restaurant, Table
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch, MagicMock


@pytest.fixture
def restaurateur_client(db):
    """Authenticated restaurateur client"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="qruser", password="strongpass")
    user.groups.add(group)
    profile = RestaurateurProfile.objects.create(user=user, siret="81818181818181")
    token = RefreshToken.for_user(user)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user, profile


@pytest.mark.django_db
@patch("api.views.qrcode_views.generate_qr_for_table")
def test_generate_qr_code_success(mock_generate, restaurateur_client):
    """
    Test successful QR code generation.
    
    NOTE: Table model uses 'number' field (CharField).
    'identifiant' is a read-only property (alias for qr_code).
    """
    client, _, profile = restaurateur_client
    restaurant = Restaurant.objects.create(name="QR Bistro", description="Scan & Go", owner=profile, siret="56565656565656")
    
    # Use 'number' field, NOT 'identifiant' (which is a read-only property)
    table1 = Table.objects.create(restaurant=restaurant, number="T1")
    table2 = Table.objects.create(restaurant=restaurant, number="T2")
    
    # Mock the side effect to simulate qr_code_file being set
    def mock_qr_generation(table):
        # Simulate what generate_qr_for_table does - sets qr_code_file
        table.qr_code_file = MagicMock()
        table.qr_code_file.url = f"/media/qr_{table.identifiant}.png"
    
    mock_generate.side_effect = mock_qr_generation

    url = f"/api/v1/qrcode/factory/{restaurant.id}/"
    response = client.post(url)

    assert response.status_code == 200
    assert "generated" in response.data
    assert len(response.data["generated"]) == 2
    mock_generate.assert_called()


@pytest.mark.django_db
def test_generate_qr_code_forbidden_if_not_owner(restaurateur_client):
    client, _, _ = restaurateur_client

    other_user = User.objects.create_user(username="intrus", password="test")
    group, _ = Group.objects.get_or_create(name="restaurateur")
    other_user.groups.add(group)
    profile = RestaurateurProfile.objects.create(user=other_user, siret="99999999999999")

    restaurant = Restaurant.objects.create(name="Not Yours", description="Hackable", owner=profile, siret="88888888888888")

    url = f"/api/v1/qrcode/factory/{restaurant.id}/"
    response = client.post(url)

    assert response.status_code == 403
    assert "error" in response.data


@pytest.mark.django_db
def test_generate_qr_code_unauthenticated():
    client = APIClient()
    url = "/api/v1/qrcode/factory/1/"
    response = client.post(url)
    assert response.status_code == 401