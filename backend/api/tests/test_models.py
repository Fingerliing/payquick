# -*- coding: utf-8 -*-
import pytest
from rest_framework.test import APIClient
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Menu,
    MenuItem,
    validate_siret
)
from .factories import (
    RestaurantFactory,
    OrderFactory,
    TableFactory,
    MenuFactory,
    RestaurateurProfileFactory
)

# ---------------------------------------------------------------------
# Tests for the RestaurateurProfile model
# ---------------------------------------------------------------------

@pytest.mark.django_db
def test_validate_siret_valid():
    validate_siret("12345678901234")

@pytest.mark.django_db
@pytest.mark.parametrize("invalid_siret", [
    "abc45678901234",  # contient lettres
    "123",             # trop court
    "1234567890123456" # trop long
])
def test_validate_siret_invalid(invalid_siret):
    with pytest.raises(ValidationError):
        validate_siret(invalid_siret)

@pytest.fixture
def user():
    return User.objects.create_user(username="testuser", password="pass")

@pytest.fixture
def restaurateur(user):
    fake_id_card = SimpleUploadedFile("test_id.pdf", b"dummy content", content_type="application/pdf")
    fake_kbis = SimpleUploadedFile("test_kbis.pdf", b"dummy content", content_type="application/pdf")
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234",
        id_card=fake_id_card,
        kbis=fake_kbis,
        is_validated=True,
        is_active=True,
        stripe_verified=True,
        stripe_account_id="acct_123456789"
    )

@pytest.mark.django_db
def test_restaurateurprofile_str(restaurateur):
    assert str(restaurateur) == f"{restaurateur.user.username} - {restaurateur.siret}"

@pytest.mark.django_db
def test_restaurant_model(restaurateur):
    restaurant = Restaurant.objects.create(
        name="Test Resto",
        description="Cuisine test",
        owner=restaurateur,
        address="1 rue test",
        siret="98765432109876"
    )
    assert str(restaurant.name) == "Test Resto"
    assert restaurant.owner == restaurateur

@pytest.mark.django_db
def test_menu_str(restaurateur):
    resto = Restaurant.objects.create(
        name="Le Food",
        description="Test",
        owner=restaurateur,
        siret="11112222333344"
    )
    menu = Menu.objects.create(name="Menu du jour", restaurant=resto)
    assert str(menu) == "Menu de Le Food"

@pytest.mark.django_db
def test_menu_item_model(restaurateur):
    resto = Restaurant.objects.create(
        name="Chez Test",
        description="Test",
        owner=restaurateur,
        siret="99998888777766"
    )
    menu = Menu.objects.create(name="Midi", restaurant=resto)
    item = MenuItem.objects.create(menu=menu, name="Plat test", price=12.5, is_available=True)
    assert item.menu == menu
    assert item.name == "Plat test"
    assert item.price == 12.5
    assert item.is_available is True

@pytest.mark.django_db
def test_restaurateurprofile_default_fields(user):
    fake_id_card = SimpleUploadedFile("id.pdf", b"data", content_type="application/pdf")
    fake_kbis = SimpleUploadedFile("kbis.pdf", b"data", content_type="application/pdf")
    profile = RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234",
        id_card=fake_id_card,
        kbis=fake_kbis
    )

    assert profile.is_validated is False
    assert profile.is_active is False
    assert profile.stripe_verified is False
    assert profile.stripe_account_id is None

# ---------------------------------------------------------------------
# Tests for the Restaurant model
# ---------------------------------------------------------------------

@pytest.fixture
def restaurateur_user():
    return User.objects.create_user(username="resto_owner", password="secure")

@pytest.fixture
def restaurateur_profile(restaurateur_user):
    fake_id_card = SimpleUploadedFile("id.pdf", b"123", content_type="application/pdf")
    fake_kbis = SimpleUploadedFile("kbis.pdf", b"456", content_type="application/pdf")
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="11111111111111",
        id_card=fake_id_card,
        kbis=fake_kbis
    )

@pytest.mark.django_db
def test_restaurant_creation(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="La Bonne Table",
        description="Cuisine locale et de saison.",
        owner=restaurateur_profile,
        siret="22222222222222"
    )
    
    assert restaurant.name == "La Bonne Table"
    assert restaurant.description == "Cuisine locale et de saison."
    assert restaurant.address == "Adresse temporaire"  # valeur par défaut
    assert restaurant.owner == restaurateur_profile
    assert restaurant.siret == "22222222222222"

# ---------------------------------------------------------------------
# Tests for the Menu model
# ---------------------------------------------------------------------

import pytest
from api.models import Menu, Restaurant

@pytest.mark.django_db
def test_menu_creation(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Chez Mario",
        description="Pizzeria napolitaine",
        owner=restaurateur_profile,
        siret="33333333333333"
    )
    
    menu = Menu.objects.create(name="Menu Midi", restaurant=restaurant)

    assert menu.name == "Menu Midi"
    assert menu.restaurant == restaurant
    assert menu.created_at is not None
    assert menu.updated_at is not None

@pytest.mark.django_db
def test_menu_str(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Chez Anna",
        description="Cuisine végétarienne",
        owner=restaurateur_profile,
        siret="44444444444444"
    )
    menu = Menu.objects.create(name="Végé Dégustation", restaurant=restaurant)
    assert str(menu) == f"Menu de {restaurant.name}"

# ---------------------------------------------------------------------
# Tests for the MenuItem model
# ---------------------------------------------------------------------

import pytest
from api.models import MenuItem

@pytest.mark.django_db
def test_menu_item_creation(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Ô Délices",
        description="Fusion asiatique",
        owner=restaurateur_profile,
        siret="55555555555555"
    )
    menu = Menu.objects.create(name="Menu Soir", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu,
        name="Gyoza",
        description="Raviolis japonais grillés",
        price=6.90,
        category="Entrée"
    )

    assert item.menu == menu
    assert item.name == "Gyoza"
    assert item.description == "Raviolis japonais grillés"
    assert item.price == 6.90
    assert item.category == "Entrée"
    assert item.is_available is True
    assert item.created_at is not None
    assert item.updated_at is not None

@pytest.mark.django_db
def test_menu_item_str(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Les Saveurs",
        description="Cuisine traditionnelle",
        owner=restaurateur_profile,
        siret="66666666666666"
    )
    menu = Menu.objects.create(name="Menu Classique", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu,
        name="Boeuf Bourguignon",
        price=12.50,
        description="",
        category="Plat"
    )

    assert str(item) == "Boeuf Bourguignon - 12.50€"

# ---------------------------------------------------------------------
# Tests for the ClientProfile model
# ---------------------------------------------------------------------

import pytest
from api.models import ClientProfile
from django.contrib.auth.models import User

@pytest.mark.django_db
def test_client_profile_creation():
    user = User.objects.create_user(username="client", password="123456")
    profile = ClientProfile.objects.create(user=user, phone="0612345678")

    assert profile.user == user
    assert profile.phone == "0612345678"

@pytest.mark.django_db
def test_client_profile_str():
    user = User.objects.create_user(username="alice", password="pwd")
    profile = ClientProfile.objects.create(user=user, phone="0699887766")

    assert str(profile) == "alice - 0699887766"

# ---------------------------------------------------------------------
# Tests for the Table model
# ---------------------------------------------------------------------

import pytest
from api.models import Table

@pytest.mark.django_db
def test_table_creation(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Le Gourmet",
        description="Cuisine française",
        owner=restaurateur_profile,
        siret="77777777777777"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="A12"
    )

    assert table.restaurant == restaurant
    assert table.identifiant == "A12"
    assert table.qr_code_file is None or not table.qr_code_file.name
    assert table.created_at is not None

@pytest.mark.django_db
def test_table_str(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Bistro Régent",
        description="Bistrot moderne",
        owner=restaurateur_profile,
        siret="88888888888888"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="R5"
    )

    assert str(table) == f"Table R5 ({restaurant.name})"

# ---------------------------------------------------------------------
# Tests for the Order model
# ---------------------------------------------------------------------

import pytest
from api.models import Order

@pytest.mark.django_db
def test_order_creation(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="La Terrasse",
        description="Brasserie moderne",
        owner=restaurateur_profile,
        siret="99999999999999"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="T1"
    )

    order = Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table
    )

    assert order.restaurateur == restaurateur_profile
    assert order.restaurant == restaurant
    assert order.table == table
    assert order.status == "pending"
    assert order.is_paid is False
    assert order.created_at is not None

@pytest.mark.django_db
def test_order_str_method(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Café Central",
        description="Petit déjeuner et déjeuner",
        owner=restaurateur_profile,
        siret="12312312312312"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="A5"
    )
    order = Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        status="served",
        is_paid=True
    )

    expected = f"Table {table.identifiant} - Servie - Payée"
    assert str(order) == expected

# ---------------------------------------------------------------------
# Tests for the OrderItem model
# ---------------------------------------------------------------------

import pytest
from api.models import OrderItem

@pytest.mark.django_db
def test_order_item_creation(restaurateur_profile):
    # Création restaurant, table, menu et menu item
    restaurant = Restaurant.objects.create(
        name="Food Corner",
        description="Fast casual",
        owner=restaurateur_profile,
        siret="23423423423423"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="B1"
    )
    menu = Menu.objects.create(name="Express", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu,
        name="Wrap Poulet",
        price=7.50,
        description="Wrap croustillant",
        category="Plat"
    )
    order = Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table
    )
    order_item = OrderItem.objects.create(
        order=order,
        menu_item=item,
        quantity=3
    )

    assert order_item.order == order
    assert order_item.menu_item == item
    assert order_item.quantity == 3

@pytest.mark.django_db
def test_order_item_str(restaurateur_profile):
    restaurant = Restaurant.objects.create(
        name="Chez Léo",
        description="Cuisine bio",
        owner=restaurateur_profile,
        siret="34534534534534"
    )
    table = Table.objects.create(
        restaurant=restaurant,
        identifiant="C3"
    )
    menu = Menu.objects.create(name="BioMenu", restaurant=restaurant)
    item = MenuItem.objects.create(
        menu=menu,
        name="Soupe verte",
        price=5.00,
        description="Légumes bio",
        category="Entrée"
    )
    order = Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table
    )
    order_item = OrderItem.objects.create(
        order=order,
        menu_item=item,
        quantity=2
    )

    assert str(order_item) == f"2x {item.name} (Commande #{order.id})"

# ---------------------------------------------------------------------
# Tests for the menu_save
# ---------------------------------------------------------------------

@pytest.mark.django_db
def test_toggle_disponible_disables_other_menus():
    profile = RestaurateurProfileFactory()
    client = APIClient()
    client.force_authenticate(user=profile.user)

    # Crée 3 menus pour le même restaurant
    menu1 = MenuFactory(restaurant__owner=profile)
    menu2 = MenuFactory(restaurant=menu1.restaurant)
    menu3 = MenuFactory(restaurant=menu1.restaurant)

    url = reverse("menus-toggle-disponible", kwargs={"pk": menu2.id})
    response = client.post(url)

    assert response.status_code == 200
    menu1.refresh_from_db()
    menu2.refresh_from_db()
    menu3.refresh_from_db()

    assert menu2.disponible is True
    assert not menu1.disponible
    assert not menu3.disponible