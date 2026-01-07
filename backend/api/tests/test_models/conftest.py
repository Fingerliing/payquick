# -*- coding: utf-8 -*-
"""
Fichier de configuration pytest avec les fixtures communes pour les tests des modèles.
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User, Group


# =============================================================================
# FIXTURES - Utilisateurs de base
# =============================================================================

@pytest.fixture
def base_user(db):
    """Utilisateur de base pour les tests"""
    return User.objects.create_user(
        username="baseuser@example.com",
        email="baseuser@example.com",
        password="testpass123",
        first_name="Base",
        last_name="User"
    )


@pytest.fixture
def admin_user(db):
    """Utilisateur administrateur"""
    return User.objects.create_superuser(
        username="admin@example.com",
        email="admin@example.com",
        password="adminpass123"
    )


@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def client_group(db):
    """Groupe client"""
    group, _ = Group.objects.get_or_create(name="client")
    return group


# =============================================================================
# FIXTURES - Profils
# =============================================================================

@pytest.fixture
def restaurateur_user(db, restaurateur_group):
    """Utilisateur avec le rôle restaurateur"""
    user = User.objects.create_user(
        username="restaurateur@example.com",
        email="restaurateur@example.com",
        password="testpass123",
        first_name="Restaurateur"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def client_user(db, client_group):
    """Utilisateur avec le rôle client"""
    user = User.objects.create_user(
        username="client@example.com",
        email="client@example.com",
        password="testpass123",
        first_name="Client"
    )
    user.groups.add(client_group)
    return user


# =============================================================================
# FIXTURES - Profils complets
# =============================================================================

@pytest.fixture
def restaurateur_profile_fixture(db, restaurateur_user):
    """Profil restaurateur complet"""
    from api.models import RestaurateurProfile
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        is_validated=True,
        is_active=True,
        stripe_verified=True,
        stripe_account_id="acct_test_123"
    )


@pytest.fixture
def client_profile_fixture(db, client_user):
    """Profil client complet"""
    from api.models import ClientProfile
    return ClientProfile.objects.create(
        user=client_user,
        phone="0612345678"
    )


# =============================================================================
# FIXTURES - Restaurant et dépendances
# =============================================================================

@pytest.fixture
def restaurant_fixture(db, restaurateur_profile_fixture):
    """Restaurant de test"""
    from api.models import Restaurant
    return Restaurant.objects.create(
        name="Test Restaurant",
        description="Un restaurant de test",
        owner=restaurateur_profile_fixture,
        siret="98765432109876",
        address="123 Rue de Test",
        city="Paris",
        zip_code="75001",
        phone="0140000000",
        email="contact@testrestaurant.fr",
        is_active=True
    )


@pytest.fixture
def table_fixture(db, restaurant_fixture):
    """Table de test"""
    from api.models import Table
    return Table.objects.create(
        restaurant=restaurant_fixture,
        number="1",
        capacity=4
    )


# =============================================================================
# FIXTURES - Menu et items
# =============================================================================

@pytest.fixture
def menu_fixture(db, restaurant_fixture):
    """Menu de test"""
    from api.models import Menu
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant_fixture
    )


@pytest.fixture
def menu_category_fixture(db, restaurant_fixture):
    """Catégorie de menu"""
    from api.models import MenuCategory
    return MenuCategory.objects.create(
        restaurant=restaurant_fixture,
        name="Plats",
        order=1
    )


@pytest.fixture
def menu_item_fixture(db, menu_fixture, menu_category_fixture):
    """Item de menu"""
    from api.models import MenuItem
    return MenuItem.objects.create(
        menu=menu_fixture,
        category=menu_category_fixture,
        name="Burger Classic",
        description="Notre burger signature",
        price=Decimal('15.00'),
        vat_rate=Decimal('0.10'),
        is_available=True
    )


# =============================================================================
# FIXTURES - Commandes
# =============================================================================

@pytest.fixture
def order_fixture(db, restaurant_fixture, client_user):
    """Commande de test"""
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant_fixture,
        user=client_user,
        order_number="ORD-TEST-001",
        table_number="1",
        subtotal=Decimal('30.00'),
        tax_amount=Decimal('3.00'),
        total_amount=Decimal('33.00')
    )


@pytest.fixture
def order_item_fixture(db, order_fixture, menu_item_fixture):
    """Item de commande"""
    from api.models import OrderItem
    return OrderItem.objects.create(
        order=order_fixture,
        menu_item=menu_item_fixture,
        quantity=2,
        unit_price=Decimal('15.00'),
        total_price=Decimal('30.00')
    )


# =============================================================================
# FIXTURES - Sessions collaboratives
# =============================================================================

@pytest.fixture
def collaborative_session_fixture(db, restaurant_fixture, table_fixture, restaurateur_user):
    """Session collaborative de test"""
    from api.models import CollaborativeTableSession
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant_fixture,
        table=table_fixture,
        table_number="1",
        host=restaurateur_user,
        host_name="Test Host"
    )


# =============================================================================
# FIXTURES - Paiements
# =============================================================================

@pytest.fixture
def split_payment_session_fixture(db, order_fixture, client_user):
    """Session de paiement divisé"""
    from api.models import SplitPaymentSession
    return SplitPaymentSession.objects.create(
        order=order_fixture,
        split_type='equal',
        total_amount=Decimal('33.00'),
        created_by=client_user
    )


# =============================================================================
# FIXTURES - Notifications
# =============================================================================

@pytest.fixture
def notification_fixture(db, client_user):
    """Notification de test"""
    from api.models import Notification
    return Notification.objects.create(
        user=client_user,
        notification_type='order_ready',
        title="Commande prête",
        body="Votre commande est prête",
        data={'order_id': 123}
    )


@pytest.fixture
def push_token_fixture(db, client_user):
    """Token de notification push"""
    from api.models import PushNotificationToken
    return PushNotificationToken.objects.create(
        user=client_user,
        expo_token="ExponentPushToken[test_token]",
        device_platform="ios"
    )


# =============================================================================
# FIXTURES - API Client
# =============================================================================

@pytest.fixture
def api_client():
    """Client API pour les tests de vues"""
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def authenticated_api_client(db, base_user):
    """Client API authentifié"""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken
    
    client = APIClient()
    token = RefreshToken.for_user(base_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_api_client(db, restaurateur_user, restaurateur_profile_fixture):
    """Client API authentifié en tant que restaurateur"""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken
    
    client = APIClient()
    token = RefreshToken.for_user(restaurateur_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client
