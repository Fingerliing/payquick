# ---------------------------------------------------------------------
# Tests for TableQRRouterView
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from api.models import Restaurant, Table, Menu, MenuItem


@pytest.fixture
def setup_table_and_menu(db):
    restaurant = Restaurant.objects.create(name="PublicResto", description="Sans login", owner=None, siret="12345678999999")
    table = Table.objects.create(restaurant=restaurant, identifiant="T-QR")
    menu = Menu.objects.create(name="Menu Public", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu, name="Salade", price=5.0, category="Entrée", is_available=True
    )
    return restaurant, table, menu, item


@pytest.mark.django_db
def test_table_qr_router_success(setup_table_and_menu):
    _, table, menu, _ = setup_table_and_menu
    menu.disponible = True
    menu.save()

    client = APIClient()
    response = client.get(f"/api/v1/table/{table.identifiant}/")

    assert response.status_code == 200
    assert response.data["restaurant_name"] == table.restaurant.name
    assert response.data["table_id"] == table.identifiant
    assert response.data["menu"]["menu_name"] == menu.name
    assert len(response.data["menu"]["items"]) == 1


@pytest.mark.django_db
def test_table_qr_router_no_menu(setup_table_and_menu):
    _, table, _, _ = setup_table_and_menu  # menu non marqué comme disponible

    client = APIClient()
    response = client.get(f"/api/v1/table/{table.identifiant}/")

    assert response.status_code == 404
    assert "error" in response.data


@pytest.mark.django_db
def test_table_qr_router_invalid_identifiant():
    client = APIClient()
    response = client.get("/api/v1/table/UNKNOWN123/")

    assert response.status_code == 404
