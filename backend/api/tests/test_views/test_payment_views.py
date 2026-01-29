# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de paiement (payment_views.py)

IMPORTANT - Model field notes:
- Table: Use 'number' field (not 'identifiant' which is a read-only property)
- Order: Uses 'payment_status' field (not 'is_paid' boolean)
- Order: Uses 'table_number' CharField (not 'table' ForeignKey)
- Order: Does NOT have 'restaurateur' field
- MenuItem: 'category' should be a MenuCategory object (not a string)
"""

import pytest
import stripe
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Order, Menu, MenuItem, MenuCategory, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch, MagicMock


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def auth_restaurateur_client(db):
    """Authenticated restaurateur client with profile"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="stripechef", password="pass123")
    user.groups.add(group)
    profile = RestaurateurProfile.objects.create(user=user, siret="90909090909090")
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, profile


@pytest.fixture
def restaurant(auth_restaurateur_client):
    """Test restaurant"""
    _, profile = auth_restaurateur_client
    return Restaurant.objects.create(
        name="StripeResto", 
        description="Paye vite", 
        owner=profile, 
        siret="12121212121212"
    )


@pytest.fixture
def table(restaurant):
    """
    Test table.
    NOTE: 'identifiant' is a read-only property on Table model.
    Use 'number' field instead.
    """
    return Table.objects.create(
        restaurant=restaurant, 
        number="S1"  # Use 'number', NOT 'identifiant'
    )


@pytest.fixture
def menu(restaurant):
    """Test menu"""
    return Menu.objects.create(name="StripeMenu", restaurant=restaurant)


@pytest.fixture
def menu_category(restaurant):
    """Test menu category - required for MenuItem"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Test menu item with proper category FK"""
    return MenuItem.objects.create(
        menu=menu, 
        name="Burger", 
        price=Decimal('12.00'),
        category=menu_category,  # Must be a MenuCategory object, not string
        is_available=True
    )


@pytest.fixture
def order_with_item(restaurant, table, menu_item):
    """
    Test order with items.
    
    NOTE: Order model uses:
    - restaurant (ForeignKey)
    - table_number (CharField, NOT a FK to Table)
    - order_number (required, unique)
    - subtotal, total_amount (required DecimalFields)
    
    Order does NOT have: restaurateur field, table FK, is_paid field
    """
    order = Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,  # CharField, not FK
        order_number="ORD-STRIPE-001",
        subtotal=Decimal('12.00'),
        tax_amount=Decimal('1.20'),
        total_amount=Decimal('13.20'),
        status='pending',
        payment_status='pending'
    )
    OrderItem.objects.create(
        order=order, 
        menu_item=menu_item, 
        quantity=1,
        unit_price=menu_item.price,
        total_price=menu_item.price
    )
    return order


# =============================================================================
# TESTS - CreateCheckoutSessionView
# =============================================================================

@pytest.mark.django_db
@patch("api.views.payment_views.stripe.checkout.Session.create")
def test_checkout_session_success(mock_create, auth_restaurateur_client, order_with_item):
    """Test successful checkout session creation"""
    client, _ = auth_restaurateur_client
    order = order_with_item
    
    # Get profile from order's restaurant to ensure correct fixture chain
    profile = order.restaurant.owner
    profile.stripe_account_id = "acct_test_123"
    profile.save()

    mock_create.return_value = type("Session", (), {"url": "https://checkout.stripe.test/session"})()

    url = f"/api/v1/payments/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 200
    assert "checkout_url" in response.data


@pytest.mark.django_db
def test_checkout_order_already_paid(auth_restaurateur_client, order_with_item):
    """Test checkout fails for already paid order"""
    client, _ = auth_restaurateur_client
    order = order_with_item
    # Use payment_status field, not is_paid
    order.payment_status = 'paid'
    order.save()

    url = f"/api/v1/payments/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_checkout_no_stripe_account(auth_restaurateur_client, order_with_item):
    """Test checkout fails when no Stripe account is linked"""
    client, _ = auth_restaurateur_client
    
    # Ensure profile has no stripe account (in case shared fixtures set one)
    profile = order_with_item.restaurant.owner
    profile.stripe_account_id = None
    profile.save()
    
    url = f"/api/v1/payments/create_checkout_session/{order_with_item.id}/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_checkout_order_not_found(auth_restaurateur_client):
    """Test checkout fails for non-existent order"""
    client, _ = auth_restaurateur_client
    url = "/api/v1/payments/create_checkout_session/9999/"
    response = client.post(url)
    assert response.status_code == 404
    assert "error" in response.data


@patch("api.views.payment_views.stripe.checkout.Session.create", side_effect=Exception("stripe down"))
@pytest.mark.django_db
def test_checkout_unexpected_exception(mock_stripe, auth_restaurateur_client, order_with_item):
    """Test checkout handles unexpected exceptions"""
    client, _ = auth_restaurateur_client
    
    # Get profile from order's restaurant to ensure correct fixture chain
    profile = order_with_item.restaurant.owner
    profile.stripe_account_id = "acct_456"
    profile.save()

    url = f"/api/v1/payments/create_checkout_session/{order_with_item.id}/"
    response = client.post(url)
    assert response.status_code == 500
    assert "error" in response.data


# =============================================================================
# TESTS - StripeWebhookView
# =============================================================================

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@pytest.mark.django_db
def test_stripe_webhook_checkout_completed(mock_construct_event, restaurant, table):
    """Test webhook handles checkout.session.completed event"""
    # Create a real order instead of mocking Order.objects.get
    order = Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-WEBHOOK-001",
        subtotal=Decimal('50.00'),
        tax_amount=Decimal('5.00'),
        total_amount=Decimal('55.00'),
        status='pending',
        payment_status='pending'
    )

    mock_construct_event.return_value = {
        "type": "checkout.session.completed",
        "data": {"object": {"metadata": {"order_id": str(order.id)}}}
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    
    assert response.status_code == 200
    
    # Verify order was marked as paid
    order.refresh_from_db()
    assert order.payment_status == 'paid'


@patch("api.views.payment_views.stripe.Webhook.construct_event", side_effect=ValueError("invalid payload"))
@pytest.mark.django_db
def test_stripe_webhook_value_error(mock_construct):
    """Test webhook handles ValueError from invalid payload"""
    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 400


@patch("api.views.payment_views.stripe.Webhook.construct_event", side_effect=stripe.SignatureVerificationError("bad", "sig_header"))
@pytest.mark.django_db
def test_stripe_webhook_signature_verification_error(mock_construct):
    """Test webhook handles SignatureVerificationError"""
    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 400


@patch("api.views.payment_views.stripe.Webhook.construct_event")
@pytest.mark.django_db
def test_stripe_webhook_order_does_not_exist(mock_construct_event):
    """Test webhook handles non-existent order gracefully"""
    mock_construct_event.return_value = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {
                    "order_id": "99999"  # Non-existent order
                }
            }
        }
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format="json",
                           HTTP_STRIPE_SIGNATURE="dummy")
    assert response.status_code == 200  # Webhook handled despite missing order


# =============================================================================
# TESTS - CreateStripeAccountView
# =============================================================================

@pytest.mark.django_db
def test_create_stripe_account_already_exists(auth_restaurateur_client):
    """Test create account fails when account already exists"""
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
    """Test successful Stripe account creation"""
    client, profile = auth_restaurateur_client
    mock_account_create.return_value = type("Account", (), {"id": "acct_new", "email": profile.user.email})()
    mock_link_create.return_value = type("Link", (), {"url": "https://stripe.test/onboarding"})()

    response = client.post("/api/v1/payments/create_stripe_account/")
    assert response.status_code == 200
    assert "onboarding_url" in response.data


# =============================================================================
# TESTS - StripeAccountStatusView
# =============================================================================

@pytest.mark.django_db
def test_stripe_status_no_account(auth_restaurateur_client):
    """Test status endpoint fails when no Stripe account"""
    client, profile = auth_restaurateur_client
    profile.stripe_account_id = None
    profile.save()

    response = client.get("/api/v1/payments/account_status/")
    assert response.status_code == 400
    assert "error" in response.data


@patch("api.views.payment_views.stripe.Account.retrieve")
@pytest.mark.django_db
def test_stripe_status_success(mock_retrieve, auth_restaurateur_client):
    """Test successful Stripe account status retrieval"""
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


# =============================================================================
# TESTS - StripeIdentitySessionView
# =============================================================================

@patch("api.views.payment_views.stripe.identity.VerificationSession.create")
@pytest.mark.django_db
def test_stripe_identity_session_success(mock_create, auth_restaurateur_client):
    """Test successful identity verification session creation"""
    client, _ = auth_restaurateur_client

    mock_create.return_value = type("Session", (), {"url": "https://stripe.test/identity/session"})()

    response = client.post("/api/v1/payments/stripe/identity/")

    assert response.status_code == 201
    assert "verification_url" in response.data
    assert response.data["verification_url"].startswith("https://stripe.test")


@patch("api.views.payment_views.stripe.identity.VerificationSession.create", side_effect=Exception("Stripe down"))
@pytest.mark.django_db
def test_stripe_identity_session_failure(mock_create, auth_restaurateur_client):
    """Test identity session creation handles errors"""
    client, _ = auth_restaurateur_client

    response = client.post("/api/v1/payments/stripe/identity/")

    assert response.status_code == 500
    assert "error" in response.data


# =============================================================================
# TESTS - Identity Verification Webhook
# =============================================================================

@patch("api.views.payment_views.stripe.Webhook.construct_event")
@pytest.mark.django_db
def test_stripe_webhook_identity_verified(mock_construct_event, auth_restaurateur_client):
    """Test webhook handles identity.verification_session.verified event"""
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
    """Test webhook handles identity verification for unknown restaurateur"""
    mock_construct_event.return_value = {
        "type": "identity.verification_session.verified",
        "data": {
            "object": {
                "metadata": {
                    "restaurateur_id": "99999"  # Non-existent
                }
            }
        }
    }

    client = APIClient()
    response = client.post("/api/v1/payments/webhook/", data={}, format='json',
                           HTTP_STRIPE_SIGNATURE="dummy")

    assert response.status_code == 200  # Webhook handled even if restaurateur not found