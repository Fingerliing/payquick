# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues websocket/SSE.

Architecture SSE en deux temps :
  1. POST /api/v1/orders/sse-ticket/   (JWT en header Authorization)
     → { "ticket": "<uuid>" }  — valide 30 s, usage unique
  2. GET  /api/v1/orders/status-stream/?ticket=<uuid>
     → text/event-stream       — le ticket est consommé immédiatement

Le JWT ne transite jamais en query param.
"""

import pytest
import uuid
from decimal import Decimal
from unittest.mock import Mock, patch
from django.contrib.auth.models import User, Group
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import Order, Restaurant, RestaurateurProfile, Table


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="ws_user@example.com",
        email="ws_user@example.com",
        password="testpass123"
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="ws_other@example.com",
        email="ws_other@example.com",
        password="testpass123"
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
def restaurateur_profile(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    resto_user = User.objects.create_user(
        username="ws_resto@example.com",
        email="ws_resto@example.com",
        password="testpass123"
    )
    resto_user.groups.add(group)
    return RestaurateurProfile.objects.create(
        user=resto_user,
        siret="12345678901234",
        is_validated=True,
        is_active=True,
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="WS Test Restaurant",
        description="Restaurant de test",
        address="1 Rue du Test",
        city="Paris",
        zip_code="75001",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True,
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(restaurant=restaurant, number="5")


@pytest.fixture
def order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-WS-001",
        user=user,
        customer_name="Client WS",
        phone="0612345678",
        order_type="dine_in",
        status="pending",
        payment_status="pending",
        subtotal=Decimal("25.00"),
        tax_amount=Decimal("2.50"),
        total_amount=Decimal("27.50"),
    )


def _make_ticket(user_id: int, order_ids: list, ttl: int = 30) -> str:
    """Helper : insère directement un ticket en cache pour les tests GET."""
    ticket = str(uuid.uuid4())
    cache.set(
        f"sse_ticket:{ticket}",
        {"user_id": user_id, "order_ids": order_ids},
        timeout=ttl,
    )
    return ticket


# =============================================================================
# POST /api/v1/orders/sse-ticket/ — création du ticket
# =============================================================================

@pytest.mark.django_db
class TestCreateSseTicket:
    """Tests pour create_sse_ticket (POST /orders/sse-ticket/)"""

    URL = "/api/v1/orders/sse-ticket/"

    def test_requires_authentication(self, api_client, order):
        """Client non authentifié → 401"""
        response = api_client.post(self.URL, {"order_ids": [order.id]}, format="json")
        assert response.status_code == 401

    def test_missing_order_ids(self, auth_client):
        """Body sans order_ids → 400"""
        response = auth_client.post(self.URL, {}, format="json")
        assert response.status_code == 400
        assert "order_ids" in response.data["error"]

    def test_empty_order_ids(self, auth_client):
        """order_ids vide → 400"""
        response = auth_client.post(self.URL, {"order_ids": []}, format="json")
        assert response.status_code == 400

    def test_invalid_order_ids_type(self, auth_client):
        """order_ids non liste → 400"""
        response = auth_client.post(self.URL, {"order_ids": "1,2"}, format="json")
        assert response.status_code == 400

    def test_invalid_order_ids_values(self, auth_client):
        """order_ids contenant des non-entiers → 400"""
        response = auth_client.post(self.URL, {"order_ids": ["abc", 1]}, format="json")
        assert response.status_code == 400

    def test_no_accessible_orders(self, auth_client, other_user, order):
        """order_ids valides mais appartenant à un autre utilisateur → 403"""
        # other_user tente d'accéder à une commande de `user`
        response = auth_client.post(
            self.URL, {"order_ids": [order.id + 9999]}, format="json"
        )
        assert response.status_code == 403
        assert "accessible" in response.data["error"].lower()

    def test_success_returns_ticket(self, auth_client, order):
        """Propriétaire de la commande → 200 + ticket UUID"""
        response = auth_client.post(
            self.URL, {"order_ids": [order.id]}, format="json"
        )
        assert response.status_code == 200
        assert "ticket" in response.data
        ticket = response.data["ticket"]
        # Vérifier que c'est un UUID valide
        uuid.UUID(ticket)  # lève ValueError si invalide

    def test_ticket_stored_in_cache(self, auth_client, order):
        """Le ticket est bien stocké en cache Redis"""
        response = auth_client.post(
            self.URL, {"order_ids": [order.id]}, format="json"
        )
        assert response.status_code == 200
        ticket = response.data["ticket"]
        cached = cache.get(f"sse_ticket:{ticket}")
        assert cached is not None
        assert cached["user_id"] == order.user.id
        assert order.id in cached["order_ids"]

    def test_ticket_filters_inaccessible_orders(self, auth_client, order, other_user):
        """Les order_ids inaccessibles sont silencieusement exclus du ticket"""
        fake_id = order.id + 9999  # n'existe pas
        response = auth_client.post(
            self.URL, {"order_ids": [order.id, fake_id]}, format="json"
        )
        assert response.status_code == 200
        cached = cache.get(f"sse_ticket:{response.data['ticket']}")
        assert order.id in cached["order_ids"]
        assert fake_id not in cached["order_ids"]

    def test_other_user_cannot_get_ticket_for_foreign_order(
        self, other_auth_client, order
    ):
        """Utilisateur étranger → 403 (commande appartient à `user`)"""
        response = other_auth_client.post(
            self.URL, {"order_ids": [order.id]}, format="json"
        )
        assert response.status_code == 403


# =============================================================================
# GET /api/v1/orders/status-stream/ — consommation du ticket
# =============================================================================

@pytest.mark.django_db
class TestOrderStatusStream:
    """Tests pour order_status_stream (GET /orders/status-stream/)"""

    URL = "/api/v1/orders/status-stream/"

    def _fake_generator(self, user_id, order_ids):
        yield 'data: {"type": "connected"}\n\n'

    def test_missing_ticket_param(self, api_client):
        """Absence du paramètre ticket → 401"""
        response = api_client.get(self.URL)
        assert response.status_code == 401
        assert "ticket" in response.json()["error"].lower()

    def test_invalid_ticket(self, api_client):
        """Ticket inconnu (absent du cache) → 401"""
        response = api_client.get(f"{self.URL}?ticket=ticket-inexistant")
        assert response.status_code == 401
        assert "invalide" in response.json()["error"].lower()

    def test_expired_ticket(self, api_client, user, order):
        """Ticket expiré (TTL=0) → 401"""
        ticket = _make_ticket(user.id, [order.id], ttl=1)
        # Supprimer manuellement pour simuler l'expiration
        cache.delete(f"sse_ticket:{ticket}")
        response = api_client.get(f"{self.URL}?ticket={ticket}")
        assert response.status_code == 401

    def test_ticket_is_single_use(self, api_client, user, order):
        """Le ticket est invalide après la première connexion réussie"""
        ticket = _make_ticket(user.id, [order.id])

        with patch(
            "api.views.websocket_views.event_stream_generator",
            self._fake_generator,
        ):
            first = api_client.get(f"{self.URL}?ticket={ticket}")
            assert first.status_code == 200

        # Deuxième tentative avec le même ticket → 401
        second = api_client.get(f"{self.URL}?ticket={ticket}")
        assert second.status_code == 401

    def test_success_returns_event_stream(self, api_client, user, order):
        """Ticket valide → 200 text/event-stream avec headers SSE corrects"""
        ticket = _make_ticket(user.id, [order.id])

        with patch(
            "api.views.websocket_views.event_stream_generator",
            self._fake_generator,
        ):
            response = api_client.get(f"{self.URL}?ticket={ticket}")

        assert response.status_code == 200
        assert response["Content-Type"] == "text/event-stream"
        assert response["Cache-Control"] == "no-cache"
        assert response["Connection"] == "keep-alive"
        assert response["X-Accel-Buffering"] == "no"

    def test_jwt_in_query_param_rejected(self, user, api_client):
        """
        L'ancien mode ?token=<jwt> ne doit plus fonctionner.
        Le stream exige un ticket, pas un JWT direct.
        """
        token = str(RefreshToken.for_user(user).access_token)
        response = api_client.get(f"{self.URL}?token={token}")
        # Pas de ticket → 401, peu importe le ?token=
        assert response.status_code == 401


# =============================================================================
# Flux complet POST ticket → GET stream
# =============================================================================

@pytest.mark.django_db
class TestSseFullFlow:
    """Vérifie le flux bout-en-bout : création ticket + consommation stream"""

    TICKET_URL = "/api/v1/orders/sse-ticket/"
    STREAM_URL = "/api/v1/orders/status-stream/"

    def _fake_generator(self, user_id, order_ids):
        yield 'data: {"type": "connected"}\n\n'

    def test_full_flow(self, auth_client, api_client, user, order):
        """Étape 1 (JWT) → ticket ; Étape 2 (ticket) → stream"""
        # Étape 1 : créer le ticket avec le JWT en header (normal)
        ticket_resp = auth_client.post(
            self.TICKET_URL, {"order_ids": [order.id]}, format="json"
        )
        assert ticket_resp.status_code == 200
        ticket = ticket_resp.data["ticket"]

        # Étape 2 : ouvrir le stream avec le ticket (pas de JWT)
        with patch(
            "api.views.websocket_views.event_stream_generator",
            self._fake_generator,
        ):
            stream_resp = api_client.get(f"{self.STREAM_URL}?ticket={ticket}")

        assert stream_resp.status_code == 200
        assert stream_resp["Content-Type"] == "text/event-stream"

    def test_ticket_not_reusable_after_stream(self, auth_client, api_client, order):
        """Un même ticket ne peut pas ouvrir deux streams"""
        ticket_resp = auth_client.post(
            self.TICKET_URL, {"order_ids": [order.id]}, format="json"
        )
        ticket = ticket_resp.data["ticket"]

        with patch(
            "api.views.websocket_views.event_stream_generator",
            self._fake_generator,
        ):
            first = api_client.get(f"{self.STREAM_URL}?ticket={ticket}")
            assert first.status_code == 200

        second = api_client.get(f"{self.STREAM_URL}?ticket={ticket}")
        assert second.status_code == 401


# =============================================================================
# Endpoints auxiliaires
# =============================================================================

@pytest.mark.django_db
class TestWebsocketStatus:
    """Tests pour websocket_status (GET /orders/realtime/status/)"""

    URL = "/api/v1/orders/realtime/status/"

    def test_requires_authentication(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == 401

    def test_success(self, auth_client, monkeypatch):
        channel_layer = Mock()
        monkeypatch.setattr("channels.layers.get_channel_layer", lambda: channel_layer)

        response = auth_client.get(self.URL)

        assert response.status_code == 200
        assert response.data["websocket_enabled"] is True
        assert response.data["sse_connections"] >= 0
        assert "channels_backend" in response.data


@pytest.mark.django_db
class TestTestNotification:
    """Tests pour test_notification (POST /orders/realtime/test/)"""

    URL = "/api/v1/orders/realtime/test/"

    def test_requires_authentication(self, api_client, settings):
        settings.DEBUG = True
        response = api_client.post(self.URL, {"order_id": 1})
        assert response.status_code == 401

    def test_blocked_in_production(self, auth_client, settings):
        settings.DEBUG = False
        response = auth_client.post(self.URL, {"order_id": 1})
        assert response.status_code == 403
        assert response.data["error"] == "Only available in debug mode"

    def test_missing_order_id(self, auth_client, settings):
        settings.DEBUG = True
        response = auth_client.post(self.URL, {})
        assert response.status_code == 400
        assert response.data["error"] == "order_id is required"

    def test_success(self, auth_client, settings, monkeypatch):
        settings.DEBUG = True

        monkeypatch.setattr(
            "api.signals.notify_order_update",
            lambda order_id, status, data: True,
        )

        response = auth_client.post(
            self.URL, {"order_id": 123, "message": "Bonjour"}, format="json"
        )

        assert response.status_code == 200
        assert response.data["success"] is True
        assert "123" in response.data["message"]