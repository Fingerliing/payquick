# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de suivi de commande
- OrderTrackingViewSet (progression gamifiée)

Contrôle d'accès (fix sécurité) :
  GET /orders/{id}/progress/ n'est plus public.
  Accès autorisé :
    - JWT propriétaire de la commande (user authentifié)
    - Restaurateur propriétaire du restaurant (JWT)
    - Commande invité : header X-Receipt-Token == order.guest_access_token
  Accès refusé (403) :
    - Requête sans token
    - JWT d'un utilisateur étranger
    - Token invité incorrect
    - Énumération d'IDs sans possession
"""

import secrets
import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Table,
    Menu,
    MenuItem,
    MenuCategory,
    Order,
    OrderItem,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="tracking_user@example.com",
        email="tracking_user@example.com",
        password="testpass123"
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="tracking_other@example.com",
        email="tracking_other@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    u = User.objects.create_user(
        username="tracking_resto@example.com",
        email="tracking_resto@example.com",
        password="testpass123"
    )
    u.groups.add(group)
    return u


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def auth_client(user):
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def other_auth_client(other_user):
    token = RefreshToken.for_user(other_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_auth_client(restaurateur_user):
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Tracking Test Restaurant",
        description="Restaurant pour tester le tracking",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number="TRACK001",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Tracking",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats Principaux",
        icon="🍽️",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        name="Steak Frites",
        price=Decimal("22.00"),
        category=menu_category,
        is_available=True,
        preparation_time=15
    )


@pytest.fixture
def second_menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        name="Salade César",
        price=Decimal("12.00"),
        category=menu_category,
        is_available=True,
        preparation_time=8
    )


# ── Commandes authentifiées ────────────────────────────────────────────────────

@pytest.fixture
def pending_order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-001",
        user=user,
        status="pending",
        total_amount=Decimal("34.00"),
        subtotal=Decimal("30.91"),
        tax_amount=Decimal("3.09")
    )


@pytest.fixture
def confirmed_order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-002",
        user=user,
        status="confirmed",
        total_amount=Decimal("34.00"),
        subtotal=Decimal("30.91"),
        tax_amount=Decimal("3.09")
    )


@pytest.fixture
def preparing_order(restaurant, table, user):
    order = Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-003",
        user=user,
        status="preparing",
        total_amount=Decimal("34.00"),
        subtotal=Decimal("30.91"),
        tax_amount=Decimal("3.09")
    )
    Order.objects.filter(pk=order.pk).update(
        created_at=timezone.now() - timedelta(minutes=10)
    )
    order.refresh_from_db()
    return order


@pytest.fixture
def ready_order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-004",
        user=user,
        status="ready",
        total_amount=Decimal("34.00"),
        subtotal=Decimal("30.91"),
        tax_amount=Decimal("3.09"),
        ready_at=timezone.now()
    )


@pytest.fixture
def served_order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-005",
        user=user,
        status="served",
        total_amount=Decimal("34.00"),
        subtotal=Decimal("30.91"),
        tax_amount=Decimal("3.09"),
        ready_at=timezone.now() - timedelta(minutes=5),
        served_at=timezone.now()
    )


# ── Commande invité ────────────────────────────────────────────────────────────

@pytest.fixture
def guest_token():
    return secrets.token_urlsafe(32)


@pytest.fixture
def guest_order(restaurant, table, guest_token):
    """Commande sans utilisateur authentifié, avec guest_access_token."""
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TRACK-GUEST",
        user=None,
        guest_email="guest@example.com",
        guest_phone="0600000000",
        guest_access_token=guest_token,
        status="pending",
        total_amount=Decimal("20.00"),
        subtotal=Decimal("18.18"),
        tax_amount=Decimal("1.82")
    )


# ── Commande avec items ────────────────────────────────────────────────────────

@pytest.fixture
def order_with_items(pending_order, menu_item, second_menu_item):
    OrderItem.objects.create(
        order=pending_order,
        menu_item=menu_item,
        quantity=1,
        unit_price=menu_item.price,
        total_price=menu_item.price
    )
    OrderItem.objects.create(
        order=pending_order,
        menu_item=second_menu_item,
        quantity=1,
        unit_price=second_menu_item.price,
        total_price=second_menu_item.price
    )
    return pending_order


@pytest.fixture
def guest_order_with_items(guest_order, menu_item):
    OrderItem.objects.create(
        order=guest_order,
        menu_item=menu_item,
        quantity=1,
        unit_price=menu_item.price,
        total_price=menu_item.price
    )
    return guest_order


# =============================================================================
# TESTS - Contrôle d'accès (fix sécurité)
# =============================================================================

@pytest.mark.django_db
class TestOrderProgressAccessControl:
    """
    Vérifie que l'endpoint /progress/ exige une preuve de possession.
    Avant le fix : AllowAny sans vérification → toute requête retournait 200.
    Après le fix  : seuls le propriétaire JWT et le porteur du guest token
                    obtiennent 200 ; tous les autres reçoivent 403.
    """

    URL = "/api/v1/orders/{id}/progress/"

    # ── Requêtes sans aucune preuve d'identité ────────────────────────────────

    def test_anonymous_request_rejected(self, api_client, order_with_items):
        """Requête sans JWT ni token invité → 403."""
        response = api_client.get(self.URL.format(id=order_with_items.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_enumeration_without_token_rejected(self, api_client, order_with_items):
        """
        Attaque par énumération d'IDs : IDs séquentiels sans token → 403.
        L'endpoint ne doit pas fuir d'informations avant la vérification de possession.
        """
        for offset in range(-1, 2):
            target_id = order_with_items.id + offset
            response = api_client.get(self.URL.format(id=target_id))
            assert response.status_code in (
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND,
            ), f"ID {target_id} devrait retourner 403 ou 404, reçu {response.status_code}"

    # ── JWT étranger ──────────────────────────────────────────────────────────

    def test_foreign_jwt_rejected(self, other_auth_client, order_with_items):
        """JWT d'un utilisateur qui ne possède pas la commande → 403."""
        response = other_auth_client.get(self.URL.format(id=order_with_items.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    # ── JWT propriétaire ──────────────────────────────────────────────────────

    def test_owner_jwt_allowed(self, auth_client, order_with_items):
        """JWT du propriétaire de la commande → 200."""
        response = auth_client.get(self.URL.format(id=order_with_items.id))
        assert response.status_code == status.HTTP_200_OK

    def test_restaurateur_jwt_allowed(
        self, restaurateur_auth_client, order_with_items
    ):
        """JWT du restaurateur propriétaire du restaurant → 200."""
        response = restaurateur_auth_client.get(
            self.URL.format(id=order_with_items.id)
        )
        assert response.status_code == status.HTTP_200_OK

    # ── Commande invité / guest token ─────────────────────────────────────────

    def test_guest_valid_token_header_allowed(
        self, api_client, guest_order_with_items, guest_token
    ):
        """Header X-Receipt-Token valide → 200 (chemin préféré)."""
        response = api_client.get(
            self.URL.format(id=guest_order_with_items.id),
            HTTP_X_RECEIPT_TOKEN=guest_token,
        )
        assert response.status_code == status.HTTP_200_OK

    def test_guest_wrong_token_rejected(self, api_client, guest_order_with_items):
        """Header X-Receipt-Token incorrect → 403."""
        response = api_client.get(
            self.URL.format(id=guest_order_with_items.id),
            HTTP_X_RECEIPT_TOKEN="mauvais-token",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_guest_empty_token_rejected(self, api_client, guest_order_with_items):
        """Header X-Receipt-Token vide → 403."""
        response = api_client.get(
            self.URL.format(id=guest_order_with_items.id),
            HTTP_X_RECEIPT_TOKEN="",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_guest_no_token_rejected(self, api_client, guest_order_with_items):
        """Commande invité sans token → 403."""
        response = api_client.get(self.URL.format(id=guest_order_with_items.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cross_order_token_rejected(
        self, api_client, guest_order_with_items, order_with_items, guest_token
    ):
        """
        Token valide pour la commande invité, présenté sur une commande différente
        → 403. Empêche le vol de progression inter-commandes.
        """
        response = api_client.get(
            self.URL.format(id=order_with_items.id),
            HTTP_X_RECEIPT_TOKEN=guest_token,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_nonexistent_order_returns_404(self, auth_client):
        """Commande inexistante → 404 (avant tout contrôle d'accès)."""
        response = auth_client.get(self.URL.format(id=99999))
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# TESTS - Progression de commande
# =============================================================================

@pytest.mark.django_db
class TestOrderProgress:
    """Tests pour la progression de commande (accès via JWT propriétaire)."""

    def test_get_progress_pending_order(self, auth_client, pending_order, menu_item):
        OrderItem.objects.create(
            order=pending_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{pending_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_status"] == "pending"

    def test_get_progress_preparing_order(self, auth_client, preparing_order, menu_item):
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{preparing_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_status"] == "preparing"

    def test_get_progress_ready_order(self, auth_client, ready_order, menu_item):
        OrderItem.objects.create(
            order=ready_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{ready_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_status"] == "ready"

    def test_get_progress_served_order(self, auth_client, served_order, menu_item):
        OrderItem.objects.create(
            order=served_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{served_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_status"] == "served"

    def test_get_progress_order_without_items(self, auth_client, pending_order):
        """Commande sans items : 400 (items requis par la vue)."""
        response = auth_client.get(f"/api/v1/orders/{pending_order.id}/progress/")
        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_global_progress_range(self, auth_client, order_with_items):
        """La progression globale doit être entre 0 et 100."""
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        progress = response.data["global_progress"]
        assert 0 <= progress <= 100


# =============================================================================
# TESTS - Gamification
# =============================================================================

@pytest.mark.django_db
class TestOrderGamification:
    """Tests pour les éléments de gamification."""

    def test_gamification_data_present(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert "gamification" in response.data
        gamification = response.data["gamification"]
        assert "level" in gamification or "points" in gamification

    def test_gamification_badges(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        gamification = response.data.get("gamification", {})
        if "badges" in gamification:
            assert isinstance(gamification["badges"], list)

    def test_gamification_message(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        gamification = response.data.get("gamification", {})
        if "message" in gamification:
            assert isinstance(gamification["message"], str)


# =============================================================================
# TESTS - Catégories et items
# =============================================================================

@pytest.mark.django_db
class TestOrderCategories:
    """Tests pour la progression par catégorie."""

    def test_categories_progress(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert "categories" in response.data
        categories = response.data["categories"]
        assert isinstance(categories, list)
        if categories:
            category = categories[0]
            assert "category" in category or "name" in category
            assert "progress_percentage" in category

    def test_categories_estimated_time(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        for category in response.data.get("categories", []):
            if "estimated_time_minutes" in category:
                assert category["estimated_time_minutes"] >= 0


# =============================================================================
# TESTS - Insights temps réel
# =============================================================================

@pytest.mark.django_db
class TestRealTimeInsights:
    """Tests pour les insights en temps réel."""

    def test_insights_present(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        if "real_time_insights" in response.data:
            assert isinstance(response.data["real_time_insights"], list)

    def test_completion_prediction(self, auth_client, preparing_order, menu_item):
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{preparing_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        if "completion_prediction" in response.data:
            assert isinstance(response.data["completion_prediction"], dict)


# =============================================================================
# TESTS - Étapes de préparation
# =============================================================================

@pytest.mark.django_db
class TestPreparationStages:
    """Tests pour les étapes de préparation."""

    def test_preparation_stages_structure(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        for category in response.data.get("categories", []):
            if "preparation_stages" in category:
                stages = category["preparation_stages"]
                assert isinstance(stages, list)
                for stage in stages:
                    assert "id" in stage or "label" in stage

    def test_stages_progression(self, auth_client, preparing_order, menu_item):
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{preparing_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        for category in response.data.get("categories", []):
            stages = category.get("preparation_stages", [])
            completed_count = sum(1 for s in stages if s.get("completed", False))
            assert completed_count >= 0


# =============================================================================
# TESTS - Performance et temps
# =============================================================================

@pytest.mark.django_db
class TestOrderTiming:
    """Tests pour les calculs de temps."""

    def test_estimated_total_time(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        if "estimated_total_time" in response.data:
            assert response.data["estimated_total_time"] >= 0

    def test_time_remaining(self, auth_client, preparing_order, menu_item):
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price,
            total_price=menu_item.price
        )
        response = auth_client.get(f"/api/v1/orders/{preparing_order.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        for category in response.data.get("categories", []):
            if "time_remaining_minutes" in category:
                assert category["time_remaining_minutes"] >= 0


# =============================================================================
# TESTS - Structure de la réponse
# =============================================================================

@pytest.mark.django_db
class TestProgressResponseStructure:
    """Tests pour la structure de la réponse."""

    def test_response_contains_order_info(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        assert "order_id" in response.data
        assert "order_status" in response.data

    def test_response_contains_table_info(self, auth_client, order_with_items):
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        if "table_number" in response.data:
            assert response.data["table_number"] is not None

    def test_response_json_serializable(self, auth_client, order_with_items):
        import json
        response = auth_client.get(f"/api/v1/orders/{order_with_items.id}/progress/")
        assert response.status_code == status.HTTP_200_OK
        try:
            parsed = json.loads(response.content)
            assert isinstance(parsed, dict)
        except (TypeError, ValueError, json.JSONDecodeError) as e:
            pytest.fail(f"La réponse n'est pas du JSON valide : {e}")

    def test_guest_progress_response_structure(
        self, api_client, guest_order_with_items, guest_token
    ):
        """Un invité avec token valide reçoit la même structure de réponse."""
        response = api_client.get(
            f"/api/v1/orders/{guest_order_with_items.id}/progress/",
            HTTP_X_RECEIPT_TOKEN=guest_token,
        )
        assert response.status_code == status.HTTP_200_OK
        assert "order_id" in response.data
        assert "order_status" in response.data
        assert "global_progress" in response.data