# ---------------------------------------------------------------------
# Tests for OrderViewSet and its custom action
# ---------------------------------------------------------------------

import pytest
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Menu, MenuItem, Order, OrderItem
)
from api.tests.factories import (
    UserFactory, RestaurantFactory, TableFactory,
    MenuItemFactory, MenuFactory
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
        "restaurant": restaurant.id,
        "table": table.id,
    }, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["table_number"] == "X1"

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

def test_submit_order_restaurant_not_found(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    response = client.post("/api/v1/orders/submit_order/", {
        "restaurant": 9999,
        "table_identifiant": "Z1",
        "items": [{"menu_item_id": 1, "quantity": 1}]
    }, format="json")
    assert response.status_code == 404

def test_submit_order_table_not_found(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Fake", description="x", siret="99999999999999", owner=profile)
    response = client.post("/api/v1/orders/submit_order/", {
        "restaurant": restaurant.id,
        "table_identifiant": "T404",
        "items": [{"menu_item_id": 1, "quantity": 1}]
    }, format="json")
    assert response.status_code == 404

def test_mark_order_paid(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Test", description="x", siret="11111111111111", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T1")
    order = Order.objects.create(restaurant=restaurant, table=table, restaurateur=profile)

    url = f"/api/v1/orders/{order.id}/mark_paid/"
    response = client.post(url)
    assert response.status_code == 200
    order.refresh_from_db()
    assert order.is_paid is True

def test_mark_order_in_progress(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Test", description="x", siret="22222222222222", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T2")
    order = Order.objects.create(restaurant=restaurant, table=table, restaurateur=profile)

    url = f"/api/v1/orders/{order.id}/mark_in_progress/"
    response = client.post(url)
    assert response.status_code == 200
    order.refresh_from_db()
    assert order.status == "in_progress"

def test_mark_order_served(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Test", description="x", siret="33333333333333", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T3")
    order = Order.objects.create(restaurant=restaurant, table=table, restaurateur=profile)

    url = f"/api/v1/orders/{order.id}/mark_served/"
    response = client.post(url)
    assert response.status_code == 200
    order.refresh_from_db()
    assert order.status == "served"

def test_order_details(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Details", description="x", siret="44444444444444", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T4")
    menu = Menu.objects.create(name="Détail Menu", restaurant=restaurant)
    item = MenuItem.objects.create(menu=menu, name="Plat", price=8.5)
    order = Order.objects.create(restaurant=restaurant, table=table, restaurateur=profile)
    OrderItem.objects.create(order=order, menu_item=item, quantity=2)

    url = f"/api/v1/orders/{order.id}/details/"
    response = client.get(url)
    assert response.status_code == 200
    assert response.data["order"] == order.id

def test_by_restaurant_returns_orders(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="Target", description="x", siret="55555555555555", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T5")
    Order.objects.create(restaurant=restaurant, table=table, restaurateur=profile)

    response = client.get(f"/api/v1/orders/by_restaurant/?restaurant_id={restaurant.id}")
    assert response.status_code == 200
    assert len(response.data) == 1

def test_menu_by_table_no_menu(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client
    restaurant = Restaurant.objects.create(name="QRMenu", description="x", siret="66666666666666", owner=profile)
    table = Table.objects.create(restaurant=restaurant, identifiant="T6")

    response = client.get(f"/api/v1/orders/menu/table/{table.identifiant}/")
    assert response.status_code == 404

@pytest.mark.django_db
def test_user_without_profile_should_raise():
    user = UserFactory()
    RestaurateurProfile.objects.filter(user=user).delete()
    assert not RestaurateurProfile.objects.filter(user=user).exists()

    # Test direct
    with pytest.raises(RestaurateurProfile.DoesNotExist):
        RestaurateurProfile.objects.get(user=user)

@pytest.mark.django_db
def test_by_restaurant_id_with_no_orders_returns_empty_list(auth_restaurateur_client):
    client, _, _ = auth_restaurateur_client
    response = client.get("/api/v1/orders/by_restaurant/?restaurant_id=999999")
    assert response.status_code == 200
    assert response.data == []

@pytest.mark.django_db
def test_by_restaurant_path_missing_query_param_returns_400(auth_restaurateur_client):
    client, _, _ = auth_restaurateur_client
    url = "/api/v1/orders/by_restaurant/"
    response = client.get(url)
    assert response.status_code == 400
    assert response.data["error"] == "Missing restaurant_id"

@pytest.mark.django_db
def test_menu_by_table_returns_available_items(auth_restaurateur_client):
    client, _, profile = auth_restaurateur_client

    # 1. Crée restaurant + table
    restaurant = RestaurantFactory(owner=profile)
    table = TableFactory(restaurant=restaurant, identifiant="T100")

    # 2. Crée menu disponible
    menu = MenuFactory(restaurant=restaurant, disponible=True)

    # 3. Crée items disponibles et non disponibles
    item1 = MenuItemFactory(menu=menu, name="Pizza", is_available=True)
    item2 = MenuItemFactory(menu=menu, name="Salade", is_available=False)

    # 4. Appel de l'endpoint
    response = client.get(f"/api/v1/orders/menu/table/{table.identifiant}/")

    assert response.status_code == 200
    assert response.data["menu"] == menu.name
    assert len(response.data["items"]) == 1
    assert response.data["items"][0]["name"] == "Pizza"