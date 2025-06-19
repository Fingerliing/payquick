# ---------------------------------------------------------------------
# Tests for AdminRestaurateurViewSet (admin-only actions)
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from api.models import RestaurateurProfile
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(username="admin", password="supersecret", email="admin@example.com")
    token = RefreshToken.for_user(admin)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_profile():
    user = User.objects.create_user(username="resto", password="pass")
    id_card = SimpleUploadedFile("id.pdf", b"doc", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"doc", content_type="application/pdf")
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234",
        id_card=id_card,
        kbis=kbis
    )


@pytest.mark.django_db
def test_validate_documents(admin_client, restaurateur_profile):
    url = f"/api/v1/admin/restaurateurs/{restaurateur_profile.id}/validate_documents/"
    response = admin_client.post(url)
    assert response.status_code == 200
    restaurateur_profile.refresh_from_db()
    assert restaurateur_profile.is_validated is True


@pytest.mark.django_db
def test_activate_account(admin_client, restaurateur_profile):
    url = f"/api/v1/admin/restaurateurs/{restaurateur_profile.id}/activate_account/"
    response = admin_client.post(url)
    assert response.status_code == 200
    restaurateur_profile.refresh_from_db()
    assert restaurateur_profile.is_active is True


@pytest.mark.django_db
def test_stripe_status_success(admin_client, restaurateur_profile):
    restaurateur_profile.stripe_account_id = "acct_test_123"
    restaurateur_profile.save()

    mock_account = MagicMock()
    mock_account.charges_enabled = True
    mock_account.payouts_enabled = True
    mock_account.requirements = {}

    with patch("stripe.Account.retrieve", return_value=mock_account) as mock_retrieve:
        url = f"/api/v1/admin/restaurateurs/{restaurateur_profile.id}/stripe_status/"
        response = admin_client.get(url)

    assert response.status_code == 200
    restaurateur_profile.refresh_from_db()
    assert restaurateur_profile.stripe_verified is True
    mock_retrieve.assert_called_once()


@pytest.mark.django_db
def test_stripe_status_no_account(admin_client, restaurateur_profile):
    url = f"/api/v1/admin/restaurateurs/{restaurateur_profile.id}/stripe_status/"
    response = admin_client.get(url)
    assert response.status_code == 400
    assert "error" in response.data
