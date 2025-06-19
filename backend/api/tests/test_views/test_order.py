# ---------------------------------------------------------------------
# Tests for OrderViewSet and its custom action
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Menu, MenuItem, Order, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.fixture
def auth_restaurateur_client(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="owner", password="strongpass")
    user.groups.add(group)
    id_card = SimpleUploadedFile("id.pdf", b"x", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"x", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(user=user, siret="10101010101010", id_card=id_card, kbis=kbis)
    token = RefreshToken.for_user(user)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user, profile


@pytest.mark.django_db
def test_create_order(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client

    restaurant = Restaurant.objects.create(name="Café du Coin", description="Petit resto", owner=profile, siret="12345678911111")
    table = Table.objects.create(restaurant=restaurant, identifiant="X1")

    response = client.post("/api/v1/orders/", {
        "restaurateur": profile.id,
        "restaurant": restaurant.id,
        "table": table.id,
    })

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["restaurant"] == restaurant.id


@pytest.mark.django_db
def test_list_orders_only_owned(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Chez Toi", description="Cuisine perso", owner=profile, siret="22222222222222")
    table = Table.objects.create(restaurant=restaurant, identifiant="Z9")
    Order.objects.create(restaurateur=profile, restaurant=restaurant, table=table)

    response = client.get("/api/v1/orders/")
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_submit_order_success(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Barato", description="Pas cher", owner=profile, siret="33333333333333")
    table = Table.objects.create(restaurant=restaurant, identifiant="B5")
    menu = Menu.objects.create(name="Menu", restaurant=restaurant)
    item = MenuItem.objects.create(menu=menu, name="Pizza", price=9.90, category="Plat")

    payload = {
        "restaurant": restaurant.id,
        "table_identifiant": "B5",
        "items": [{"menu_item_id": item.id, "quantity": 2}]
    }

    response = client.post("/api/v1/orders/submit_order/", payload, format="json")
    assert response.status_code == 200 or response.status_code == 201


@pytest.mark.django_db
def test_submit_order_missing_fields(auth_restaurateur_client):
    client, _, _ = auth_restaurateur_client

    response = client.post("/api/v1/orders/submit_order/", {}, format="json")
    assert response.status_code == 400
    assert "error" in response.data
