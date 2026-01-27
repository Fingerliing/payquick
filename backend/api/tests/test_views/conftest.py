# -*- coding: utf-8 -*-
"""
Fixtures partagées pour les tests des vues

Ce fichier centralise toutes les fixtures communes utilisées dans les tests de vues.
Les fichiers de test individuels ne devraient définir que les fixtures spécifiques
à leur domaine.
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User, Group
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    ClientProfile,
    Restaurant,
    Table,
    Menu,
    MenuItem,
    MenuCategory,
    MenuSubCategory,
    Order,
    OrderItem,
    OpeningHours,
    OpeningPeriod,
    DraftOrder,
    CollaborativeTableSession,
    SessionParticipant,
)


# =============================================================================
# FIXTURES - Utilisateurs
# =============================================================================

@pytest.fixture
def api_client():
    """Client API non authentifié"""
    return APIClient()


@pytest.fixture
def user(db):
    """Utilisateur standard"""
    return User.objects.create_user(
        username="testuser@example.com",
        email="testuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def second_user(db):
    """Deuxième utilisateur pour tests multi-users"""
    return User.objects.create_user(
        username="seconduser@example.com",
        email="seconduser@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def restaurateur_user(db, restaurateur_group):
    """Utilisateur restaurateur"""
    user = User.objects.create_user(
        username="restaurateur@example.com",
        email="restaurateur@example.com",
        password="testpass123",
        first_name="Jean",
        last_name="Restaurateur"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    """Profil restaurateur complet"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_123",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def client_profile(user):
    """Profil client"""
    return ClientProfile.objects.create(user=user)


# =============================================================================
# FIXTURES - Clients authentifiés
# =============================================================================

@pytest.fixture
def auth_client(user):
    """Client API authentifié (utilisateur standard)"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_client(restaurateur_user, restaurateur_profile):
    """
    Client API authentifié (restaurateur)
    
    IMPORTANT: Cette fixture dépend de restaurateur_profile pour garantir
    que le profil existe avant toute requête API. Sans cela, les permissions
    comme IsValidatedRestaurateur échouent avec 403.
    """
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def admin_client(db):
    """Client API authentifié (admin)"""
    admin = User.objects.create_superuser(
        username="admin@example.com",
        email="admin@example.com",
        password="adminpass123"
    )
    token = RefreshToken.for_user(admin)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


# =============================================================================
# FIXTURES - Restaurant et entités liées
# =============================================================================

@pytest.fixture
def restaurant(restaurateur_profile):
    """Restaurant de test"""
    return Restaurant.objects.create(
        name="Le Bon Resto",
        description="Restaurant de test",
        address="123 Rue Test, 75001 Paris",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def second_restaurant(restaurateur_profile):
    """Deuxième restaurant pour le même restaurateur"""
    return Restaurant.objects.create(
        name="Le Deuxième Resto",
        description="Deuxième restaurant de test",
        address="456 Rue Test, 75002 Paris",
        owner=restaurateur_profile,
        siret="11111111111111",
        is_active=True
    )


@pytest.fixture
def inactive_restaurant(restaurateur_profile):
    """Restaurant inactif pour tests"""
    return Restaurant.objects.create(
        name="Restaurant Inactif",
        description="Restaurant inactif",
        owner=restaurateur_profile,
        siret="22222222222222",
        is_active=False
    )


@pytest.fixture
def table(restaurant):
    """Table de test"""
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        identifiant="T001",
        qr_code="R1T001",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def multiple_tables(restaurant):
    """Plusieurs tables pour un restaurant"""
    tables = []
    for i in range(1, 6):
        t = Table.objects.create(
            restaurant=restaurant,
            number=i,
            identifiant=f"T{str(i).zfill(3)}",
            qr_code=f"R{restaurant.id}T{str(i).zfill(3)}",
            capacity=4,
            is_active=True
        )
        tables.append(t)
    return tables


# =============================================================================
# FIXTURES - Menu et Items
# =============================================================================

@pytest.fixture
def menu(restaurant):
    """Menu de test"""
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def second_menu(restaurant):
    """Deuxième menu"""
    return Menu.objects.create(
        name="Menu Soir",
        restaurant=restaurant,
        is_available=False
    )


@pytest.fixture
def menu_category(restaurant):
    """Catégorie de menu"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        icon="🥗",
        color="#4CAF50",
        is_active=True,
        order=1
    )


@pytest.fixture
def menu_subcategory(menu_category):
    """Sous-catégorie de menu"""
    return MenuSubCategory.objects.create(
        category=menu_category,
        name="Salades",
        is_active=True,
        order=1
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Item de menu"""
    return MenuItem.objects.create(
        menu=menu,
        name="Salade César",
        description="Salade fraîche avec parmesan",
        price=Decimal('12.50'),
        category=menu_category,
        is_available=True,
        preparation_time=10
    )


@pytest.fixture
def multiple_menu_items(menu, menu_category):
    """Plusieurs items de menu"""
    items = []
    item_data = [
        ("Salade César", Decimal('12.50'), 10),
        ("Soupe du jour", Decimal('8.00'), 5),
        ("Steak Frites", Decimal('22.00'), 20),
        ("Tiramisu", Decimal('9.50'), 5),
    ]
    for name, price, prep_time in item_data:
        item = MenuItem.objects.create(
            menu=menu,
            name=name,
            price=price,
            category=menu_category,
            is_available=True,
            preparation_time=prep_time
        )
        items.append(item)
    return items


# =============================================================================
# FIXTURES - Commandes
# =============================================================================

@pytest.fixture
def order(restaurateur_profile, restaurant, table, user):
    """Commande de test"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='pending',
        total_amount=Decimal('50.00'),
        subtotal=Decimal('45.45'),
        tax_amount=Decimal('4.55')
    )


@pytest.fixture
def order_with_items(order, menu_item):
    """Commande avec items"""
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=2,
        unit_price=menu_item.price
    )
    return order


@pytest.fixture
def preparing_order(restaurateur_profile, restaurant, table, user):
    """Commande en préparation"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='preparing',
        total_amount=Decimal('50.00'),
        subtotal=Decimal('45.45'),
        tax_amount=Decimal('4.55')
    )


# =============================================================================
# FIXTURES - Sessions collaboratives
# =============================================================================

@pytest.fixture
def collaborative_session(restaurant, table, user):
    """Session collaborative de test"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        host=user,
        host_name="Hôte Test",
        max_participants=6,
        status='active'
    )


@pytest.fixture
def session_with_participant(collaborative_session, user):
    """Session avec participant"""
    SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )
    return collaborative_session


# =============================================================================
# FIXTURES - Horaires
# =============================================================================

@pytest.fixture
def opening_hours(restaurant):
    """Horaires d'ouverture complets"""
    hours = []
    for day in range(7):
        oh = OpeningHours.objects.create(
            restaurant=restaurant,
            day_of_week=day,
            is_closed=(day == 0)  # Fermé le dimanche
        )
        if day != 0:
            OpeningPeriod.objects.create(
                opening_hours=oh,
                start_time="11:30",
                end_time="14:30",
                name="Service midi"
            )
            OpeningPeriod.objects.create(
                opening_hours=oh,
                start_time="19:00",
                end_time="22:30",
                name="Service soir"
            )
        hours.append(oh)
    return hours


# =============================================================================
# FIXTURES - Draft Orders (Guest)
# =============================================================================

@pytest.fixture
def draft_order(restaurant):
    """Brouillon de commande invité"""
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table_number="T001",
        items=[
            {"menu_item_id": 1, "quantity": 2}
        ],
        customer_name="Jean Invité",
        phone="+33612345678",
        email="guest@example.com",
        payment_method="cash",
        amount_cents=2500,
        status="pending"
    )


# =============================================================================
# HELPERS
# =============================================================================

@pytest.fixture
def create_authenticated_client():
    """Factory pour créer des clients authentifiés"""
    def _create_client(user):
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client
    return _create_client