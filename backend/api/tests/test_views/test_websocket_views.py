# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues websocket/SSE.
"""

import pytest
from decimal import Decimal
from unittest.mock import Mock
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import Order


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
def auth_client(user):
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def order(restaurant, table, user):
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-WS-001",
        user=user,
        customer_name="Client WS",
        phone="0612345678",
        order_type='dine_in',
        status='pending',
        payment_status='pending',
        subtotal=Decimal('25.00'),
        tax_amount=Decimal('2.50'),
        total_amount=Decimal('27.50')
    )


def test_order_status_stream_requires_auth(api_client):
    response = api_client.get("/api/v1/orders/status-stream/")

    assert response.status_code == 401


def test_order_status_stream_requires_orders_param(auth_client):
    response = auth_client.get("/api/v1/orders/status-stream/")

    assert response.status_code == 400
    assert response.json()["error"] == 'Parameter "orders" is required'


def test_order_status_stream_rejects_invalid_orders(auth_client):
    response = auth_client.get("/api/v1/orders/status-stream/?orders=abc,1")

    assert response.status_code == 400
    assert response.json()["error"] == "Invalid order IDs format"


def test_order_status_stream_no_accessible_orders(auth_client, monkeypatch):
    def fake_accessible_orders(user, order_ids):
        return []

    monkeypatch.setattr(
        "api.views.websocket_views.get_user_accessible_orders",
        fake_accessible_orders
    )

    response = auth_client.get("/api/v1/orders/status-stream/?orders=1")

    assert response.status_code == 403
    assert response.json()["error"] == "No accessible orders"


def test_order_status_stream_success_with_token(api_client, user, order, monkeypatch):
    token = RefreshToken.for_user(user).access_token

    def fake_accessible_orders(user_obj, order_ids):
        return [order.id]

    def fake_event_stream_generator(user_id, order_ids):
        yield "data: {\"type\": \"connected\"}\n\n"

    monkeypatch.setattr(
        "api.views.websocket_views.get_user_accessible_orders",
        fake_accessible_orders
    )
    monkeypatch.setattr(
        "api.views.websocket_views.event_stream_generator",
        fake_event_stream_generator
    )

    response = api_client.get(
        f"/api/v1/orders/status-stream/?orders={order.id}&token={token}"
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "text/event-stream"
    assert response["Cache-Control"] == "no-cache"
    assert response["Connection"] == "keep-alive"
    assert response["X-Accel-Buffering"] == "no"


def test_websocket_status_authenticated(auth_client, monkeypatch):
    channel_layer = Mock()

    def fake_get_channel_layer():
        return channel_layer

    monkeypatch.setattr(
        "channels.layers.get_channel_layer",
        fake_get_channel_layer
    )

    response = auth_client.get("/api/v1/orders/realtime/status/")

    assert response.status_code == 200
    assert response.data["websocket_enabled"] is True
    assert response.data["sse_connections"] >= 0
    assert "channels_backend" in response.data


def test_test_notification_requires_debug(auth_client, settings):
    settings.DEBUG = False

    response = auth_client.post("/api/v1/orders/realtime/test/", {"order_id": 1})

    assert response.status_code == 403
    assert response.data["error"] == "Only available in debug mode"


def test_test_notification_missing_order_id(auth_client, settings):
    settings.DEBUG = True

    response = auth_client.post("/api/v1/orders/realtime/test/", {})

    assert response.status_code == 400
    assert response.data["error"] == "order_id is required"


def test_test_notification_success(auth_client, settings, monkeypatch):
    settings.DEBUG = True

    def fake_notify_order_update(order_id, status, data):
        return True

    monkeypatch.setattr(
        "api.signals.notify_order_update",
        fake_notify_order_update
    )

    response = auth_client.post(
        "/api/v1/orders/realtime/test/",
        {"order_id": 123, "message": "Bonjour"}
    )

    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["message"] == "Test notification sent for order 123"
