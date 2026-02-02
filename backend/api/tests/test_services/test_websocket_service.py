from decimal import Decimal

import pytest

from api.models import CollaborativeTableSession, Order, SessionParticipant, Table
from api.services.websocket import WebSocketNotificationService
from api.tests.factories import RestaurantFactory


@pytest.mark.django_db
def test_notify_order_change_sends_updates(monkeypatch):
    calls = {}

    def fake_notify_order_update(order_id, status, payload):
        calls["order"] = (order_id, status, payload)

    def fake_notify_session_order_updated(session_id, data):
        calls["session"] = (session_id, data)

    class DummySerializer:
        def __init__(self, order):
            self.data = {"order_id": str(order.id)}

    monkeypatch.setattr("api.consumers.notify_order_update", fake_notify_order_update)
    monkeypatch.setattr("api.consumers.notify_session_order_updated", fake_notify_session_order_updated)
    import api.serializers as serializers
    monkeypatch.setattr(serializers, "OrderSerializer", DummySerializer, raising=False)

    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="1")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="1",
        status="active",
    )
    order = Order.objects.create(
        order_number="ORD-1",
        restaurant=restaurant,
        subtotal=Decimal("10.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("10.00"),
        payment_status="unpaid",
        payment_method="card",
        collaborative_session=session,
    )

    WebSocketNotificationService.notify_order_change(order)

    assert calls["order"][0] == order.id
    assert calls["order"][1] == order.status
    assert calls["session"][0] == str(session.id)


@pytest.mark.django_db
def test_notify_participant_change_routes(monkeypatch):
    calls = {"joined": None, "left": None}

    def fake_joined(session_id, participant_data):
        calls["joined"] = (session_id, participant_data)

    def fake_left(session_id, participant_id):
        calls["left"] = (session_id, participant_id)

    class DummyParticipantSerializer:
        def __init__(self, participant):
            self.data = {"participant_id": str(participant.id)}

    monkeypatch.setattr("api.consumers.notify_participant_joined", fake_joined)
    monkeypatch.setattr("api.consumers.notify_participant_left", fake_left)
    monkeypatch.setattr(
        "api.serializers.collaborative_session_serializers.SessionParticipantSerializer",
        DummyParticipantSerializer,
    )

    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="2")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="2",
        status="active",
    )
    participant = SessionParticipant.objects.create(
        session=session,
        guest_name="Guest",
        role="member",
        status="active",
    )

    WebSocketNotificationService.notify_participant_change(session.id, participant, "join")
    WebSocketNotificationService.notify_participant_change(session.id, participant, "leave")

    assert calls["joined"][0] == str(session.id)
    assert calls["left"] == (str(session.id), str(participant.id))
