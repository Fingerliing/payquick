# ---------------------------------------------------------------------
# Tests for CreateCheckoutSessionView (Stripe Checkout integration)
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Order, Menu, MenuItem, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch


@pytest.fixture
def auth_restaurateur_client(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="stripechef", password="pass123")
    user.groups.add(group)
    id_card = SimpleUploadedFile("id.pdf", b"x", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"x", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(user=user, siret="90909090909090", id_card=id_card, kbis=kbis)
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

    mock_create.return_value = {"url": "https://checkout.stripe.test/session"}

    url = f"/api/v1/payment/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 200
    assert "url" in response.data


@pytest.mark.django_db
def test_checkout_order_already_paid(auth_restaurateur_client, order_with_item):
    client, _ = auth_restaurateur_client
    order = order_with_item
    order.is_paid = True
    order.save()

    url = f"/api/v1/payment/create_checkout_session/{order.id}/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_checkout_no_stripe_account(auth_restaurateur_client, order_with_item):
    client, _ = auth_restaurateur_client
    url = f"/api/v1/payment/{order_with_item.id}/checkout/"
    response = client.post(url)

    assert response.status_code == 400
    assert "error" in response.data
