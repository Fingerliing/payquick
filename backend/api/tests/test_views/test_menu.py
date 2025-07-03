# ---------------------------------------------------------------------
# Tests for MenuViewSet and MenuItemViewSet
# ---------------------------------------------------------------------

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from django.contrib.auth.models import User, Group
from api.models import RestaurateurProfile, Restaurant, Menu, MenuItem
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.fixture
def auth_client_restaurateur(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="chef", password="secret123")
    user.groups.add(group)

    id_card = SimpleUploadedFile("id.pdf", b"file", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"file", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(
        user=user, siret="12345678901234", id_card=id_card, kbis=kbis
    )

    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    return client, user, profile


@pytest.mark.django_db
def test_create_menu(auth_client_restaurateur):
    client, user, profile = auth_client_restaurateur

    restaurant = Restaurant.objects.create(
        name="Le Local",
        description="Cuisine maison",
        owner=profile,
        siret="11111111111111"
    )

    response = client.post("/api/v1/menus/", {
        "name": "Midi Gourmand",
        "restaurant": restaurant.id
    })

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["name"] == "Midi Gourmand"


@pytest.mark.django_db
def test_toggle_disponible(auth_client_restaurateur):
    client, _, profile = auth_client_restaurateur

    restaurant = Restaurant.objects.create(name="Bistro", description="Déjeuner", owner=profile, siret="22222222222222")
    menu1 = Menu.objects.create(name="Menu 1", restaurant=restaurant)
    menu2 = Menu.objects.create(name="Menu 2", restaurant=restaurant)

    response = client.post(f"/api/v1/menus/{menu2.id}/toggle_disponible/")

    assert response.status_code == 200
    menu2.refresh_from_db()
    menu1.refresh_from_db()
    assert menu2.disponible is True
    assert menu1.disponible is False


@pytest.mark.django_db
def test_toggle_menuitem_availability(auth_client_restaurateur):
    client, _, profile = auth_client_restaurateur

    restaurant = Restaurant.objects.create(name="Snack", description="Rapide", owner=profile, siret="33333333333333")
    menu = Menu.objects.create(name="Express", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu, name="Sandwich", price=5.0, description="Thon crudités", category="Plat"
    )

    assert item.is_available is True
    response = client.post(f"/api/v1/menus/items/{item.id}/toggle/")
    assert response.status_code == 200

    item.refresh_from_db()
    assert item.is_available is False

@pytest.mark.django_db
def test_restaurateur_sees_only_own_menus(restaurateur_user_factory, menu_factory):
    user1 = restaurateur_user_factory()
    user2 = restaurateur_user_factory()

    menu_factory(restaurant__owner=user1.restaurateur_profile)
    menu_factory(restaurant__owner=user2.restaurateur_profile)

    client = APIClient()
    client.force_authenticate(user=user1)

    url = reverse('menus-list')
    response = client.get(url)

    assert response.status_code == 200
    for item in response.json():
        assert item["restaurant_owner_id"] == user1.restaurateur_profile.id
