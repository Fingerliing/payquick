import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Order, Menu, MenuItem, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch

@pytest.fixture
def auth_restaurateur_client(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="stripechef", password="pass123")
    user.groups.add(group)
    profile = RestaurateurProfile.objects.create(user=user, siret="90909090909090")
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, profile


@pytest.fixture
def order_with_item(auth_restaurateur_client):
    _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="StripeResto", description="Paye vite", owner=profile, siret="12121212121212")
    table = Table.objects.create(restaurant=restaurant, identifiant="S1")
    menu = Menu.objects.create(name="StripeMenu", restaurant=restaurant)
    item = MenuItem.objects.create(menu=menu, name="Burger", price=12.0, category="Plat")
    order = Order.objects.create(restaurateur=profile, restaurant=restaurant, table=table)
    OrderItem.objects.create(order=order, menu_item=item, quantity=1)
    return order


@pytest.mark.django_db
@patch("api.views.payment_views.stripe.checkout.Session.create")
def test_checkout_session_success(mock_create, auth_restaurateur_client, order_with_item):
    client, profile = auth_restaurateur_client
    order = order_with_item
    profile.stripe_account_id = "acct_test_123"
    profile.save()

    mock_create.return_value = type("Session", (), {"url": "https://checkout.stripe.test/session"})()

    url = f"/api/v1/payments/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 200
    assert "checkout_url" in response.data


@pytest.mark.django_db
def test_checkout_order_already_paid(auth_restaurateur_client, order_with_item):
    client, _ = auth_restaurateur_client
    order = order_with_item
    order.is_paid = True
    order.save()

    url = f"/api/v1/payments/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_checkout_no_stripe_account(auth_restaurateur_client, order_with_item):
    client, _ = auth_restaurateur_client
    url = f"/api/v1/payments/create_checkout_session/{order_with_item.id}/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data

@pytest.mark.django_db
def test_checkout_order_not_found(auth_restaurateur_client):
    client, _ = auth_restaurateur_client
    url = "/api/v1/payments/create_checkout_session/9999/"
    response = client.post(url)
    assert response.status_code == 404
    assert "error" in response.data

@patch("api.views.payment_views.stripe.checkout.Session.create", side_effect=Exception("stripe down"))
@pytest.mark.django_db
def test_checkout_unexpected_exception(mock_stripe, auth_restaurateur_client, order_with_item):
    client, profile = auth_restaurateur_client
    profile.stripe_account_id = "acct_456"
    profile.save()

    url = f"/api/v1/payments/create_checkout_session/{order_with_item.id}/"
    response = client.post(url)
    assert response.status_code == 500
    assert "error" in response.data

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@patch("api.views.payment_views.Order.objects.get")
@pytest.mark.django_db
def test_stripe_webhook_checkout_completed(mock_get_order, mock_construct_event):
    mock_order = Order(id=1, is_paid=False)
    mock_order.save = lambda: None
    mock_get_order.return_value = mock_order

    mock_construct_event.return_value = {
        "type": "checkout.session.completed",
        "data": {"object": {"metadata": {"order_id": 1}}}
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 200

@pytest.mark.django_db
def test_create_stripe_account_already_exists(auth_restaurateur_client):
    client, profile = auth_restaurateur_client
    profile.stripe_account_id = "acct_123"
    profile.save()

    response = client.post("/api/v1/payments/create_stripe_account/")
    assert response.status_code == 400
    assert "error" in response.data

@patch("api.views.payment_views.stripe.Account.create")
@patch("api.views.payment_views.stripe.AccountLink.create")
@pytest.mark.django_db
def test_create_stripe_account_success(mock_link_create, mock_account_create, auth_restaurateur_client):
    client, profile = auth_restaurateur_client
    mock_account_create.return_value = type("Account", (), {"id": "acct_new", "email": profile.user.email})()
    mock_link_create.return_value = type("Link", (), {"url": "https://stripe.test/onboarding"})()

    response = client.post("/api/v1/payments/create_stripe_account/")
    assert response.status_code == 200
    assert "onboarding_url" in response.data

@pytest.mark.django_db
def test_stripe_status_no_account(auth_restaurateur_client):
    client, profile = auth_restaurateur_client
    profile.stripe_account_id = None
    profile.save()

    response = client.get("/api/v1/payments/account_status/")
    assert response.status_code == 400
    assert "error" in response.data

@patch("api.views.payment_views.stripe.Account.retrieve")
@pytest.mark.django_db
def test_stripe_status_success(mock_retrieve, auth_restaurateur_client):
    client, profile = auth_restaurateur_client
    profile.stripe_account_id = "acct_live_123"
    profile.save()

    mock_retrieve.return_value = type("Account", (), {
        "charges_enabled": True,
        "payouts_enabled": True,
        "requirements": {}
    })()

    response = client.get("/api/v1/payments/account_status/")
    assert response.status_code == 200
    assert response.data["charges_enabled"] is True

@patch("api.views.payment_views.stripe.Webhook.construct_event", side_effect=ValueError("invalid payload"))
@pytest.mark.django_db
def test_stripe_webhook_value_error(mock_construct):
    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 400

from stripe.error import SignatureVerificationError

@patch("api.views.payment_views.stripe.Webhook.construct_event", side_effect=SignatureVerificationError("bad", "sig_header"))
@pytest.mark.django_db
def test_stripe_webhook_signature_verification_error(mock_construct):
    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 400

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@patch("api.views.payment_views.Order.objects.get", side_effect=Order.DoesNotExist)
@pytest.mark.django_db
def test_stripe_webhook_order_does_not_exist(mock_get_order, mock_construct_event):
    # Webhook valide mais commande inconnue
    mock_construct_event.return_value = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {
                    "order_id": 9999
                }
            }
        }
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format="json",
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 200  # Webhook handled despite missing order

@patch("api.views.payment_views.stripe.identity.VerificationSession.create")
@pytest.mark.django_db
def test_stripe_identity_session_success(mock_create, auth_restaurateur_client):
    client, _ = auth_restaurateur_client

    mock_create.return_value = type("Session", (), {"url": "https://stripe.test/identity/session"})()

    response = client.post("/api/v1/payments/stripe/identity/")

    assert response.status_code == 201
    assert "verification_url" in response.data
    assert response.data["verification_url"].startswith("https://stripe.test")

@patch("api.views.payment_views.stripe.identity.VerificationSession.create", side_effect=Exception("Stripe down"))
@pytest.mark.django_db
def test_stripe_identity_session_failure(mock_create, auth_restaurateur_client):
    client, _ = auth_restaurateur_client

    response = client.post("/api/v1/payments/stripe/identity/")

    assert response.status_code == 500
    assert "error" in response.data

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@pytest.mark.django_db
def test_stripe_webhook_identity_verified(mock_construct_event, auth_restaurateur_client):
    _, profile = auth_restaurateur_client
    rest_id = profile.id

    mock_construct_event.return_value = {
        "type": "identity.verification_session.verified",
        "data": {
            "object": {
                "metadata": {
                    "restaurateur_id": str(rest_id)
                }
            }
        }
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")

    profile.refresh_from_db()
    assert response.status_code == 200
    assert profile.stripe_verified is True

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@pytest.mark.django_db
def test_stripe_webhook_identity_unknown_restaurateur(mock_construct_event):
    mock_construct_event.return_value = {
        "type": "identity.verification_session.verified",
        "data": {
            "object": {
                "metadata": {
                    "restaurateur_id": "99999"
                }
            }
        }
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")

    assert response.status_code == 200  # Webhook handled even if restaurateur not found
