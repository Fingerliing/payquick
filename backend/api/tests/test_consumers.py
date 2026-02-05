# -*- coding: utf-8 -*-
"""
Tests pour api/consumers.py

Couvre:
- BaseAuthenticatedConsumer: authentification JWT, get_user
- OrderConsumer: connect, disconnect, receive, order_update
- SessionConsumer: connect, disconnect, handlers d'événements
- Fonctions utilitaires de notification
"""

import pytest
import json
import time
from unittest.mock import patch, MagicMock, AsyncMock
from decimal import Decimal
from django.contrib.auth.models import User
from django.conf import settings
from channels.testing import WebsocketCommunicator
from channels.layers import get_channel_layer
from asgiref.sync import sync_to_async
from rest_framework_simplejwt.exceptions import InvalidToken
import jwt

from api.consumers import (
    BaseAuthenticatedConsumer,
    OrderConsumer,
    SessionConsumer,
    notify_order_update,
    notify_session_update,
    notify_participant_joined,
    notify_participant_left,
    notify_participant_approved,
    notify_session_order_created,
    notify_session_order_updated,
    notify_session_locked,
    notify_session_unlocked,
    notify_session_completed,
    notify_session_archived,
    notify_table_released,
)
from api.models import (
    Restaurant,
    RestaurateurProfile,
    Order,
    CollaborativeTableSession,
    Table,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user(db):
    """Utilisateur de test"""
    return User.objects.create_user(
        username="testuser@example.com",
        email="testuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    """Utilisateur restaurateur"""
    return User.objects.create_user(
        username="resto@example.com",
        email="resto@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    """Profil restaurateur"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurant(db, restaurateur_profile):
    """Restaurant de test"""
    return Restaurant.objects.create(
        name="Test Restaurant WS",
        description="Restaurant pour tests WebSocket",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(db, restaurant):
    """Table de test"""
    return Table.objects.create(
        restaurant=restaurant,
        number="WS01",
        qr_code="WSTEST01",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def order(db, restaurant, user):
    """Commande de test"""
    return Order.objects.create(
        order_number="ORD-WS-001",
        restaurant=restaurant,
        user=user,
        table_number="WS01",
        subtotal=Decimal("25.00"),
        tax_amount=Decimal("2.50"),
        total_amount=Decimal("27.50"),
        status="pending",
        payment_status="unpaid",
        payment_method="card"
    )


@pytest.fixture
def collaborative_session(db, restaurant, table):
    """Session collaborative de test"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="WS01",
        status="active"
    )


@pytest.fixture
def valid_token(user):
    """Token JWT valide pour l'utilisateur"""
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


# =============================================================================
# TESTS - BaseAuthenticatedConsumer
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestBaseAuthenticatedConsumer:
    """Tests pour BaseAuthenticatedConsumer"""

    async def test_authenticate_connection_valid_token(self, user, valid_token):
        """Test authentification avec token valide"""
        consumer = BaseAuthenticatedConsumer()
        
        result = await consumer.authenticate_connection(valid_token)
        
        assert result is not None
        assert result.id == user.id

    async def test_authenticate_connection_invalid_token(self):
        """Test authentification avec token invalide"""
        consumer = BaseAuthenticatedConsumer()
        
        # Patcher UntypedToken pour simuler un token invalide
        with patch('api.consumers.UntypedToken', side_effect=InvalidToken("Invalid token")):
            result = await consumer.authenticate_connection("invalid_token")
        
        assert result is None

    async def test_authenticate_connection_jwt_error(self):
        """Test authentification avec erreur JWT"""
        consumer = BaseAuthenticatedConsumer()
        
        # Patcher pour simuler une erreur JWT après validation UntypedToken
        with patch('api.consumers.UntypedToken'):
            with patch('api.consumers.jwt.decode', side_effect=jwt.InvalidTokenError("JWT error")):
                result = await consumer.authenticate_connection("some_token")
        
        assert result is None

    async def test_authenticate_connection_no_user_id(self):
        """Test authentification avec token sans user_id"""
        consumer = BaseAuthenticatedConsumer()
        
        # Patcher pour retourner un payload sans user_id
        with patch('api.consumers.UntypedToken'):
            with patch('api.consumers.jwt.decode', return_value={'some_data': 'value'}):
                result = await consumer.authenticate_connection("some_token")
        
        assert result is None

    async def test_get_user_exists(self, user):
        """Test récupération d'un utilisateur existant"""
        consumer = BaseAuthenticatedConsumer()
        
        result = await consumer.get_user(user.id)
        
        assert result is not None
        assert result.id == user.id

    async def test_get_user_not_exists(self):
        """Test récupération d'un utilisateur inexistant"""
        consumer = BaseAuthenticatedConsumer()
        
        result = await consumer.get_user(99999)
        
        assert result is None


# =============================================================================
# TESTS - OrderConsumer
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestOrderConsumer:
    """Tests pour OrderConsumer"""

    async def test_connect_no_token(self):
        """Test connexion sans token"""
        communicator = WebsocketCommunicator(
            OrderConsumer.as_asgi(),
            "/ws/orders/"
        )
        
        connected, subprotocol = await communicator.connect()
        
        # Doit fermer avec code 4001
        assert connected is False or await communicator.receive_output() == {'type': 'websocket.close', 'code': 4001}
        
        await communicator.disconnect()

    async def test_connect_no_order_ids(self, valid_token):
        """Test connexion sans order_ids"""
        communicator = WebsocketCommunicator(
            OrderConsumer.as_asgi(),
            f"/ws/orders/?token={valid_token}"
        )
        
        connected, _ = await communicator.connect()
        
        # Doit fermer avec code 4002
        assert connected is False
        
        await communicator.disconnect()

    async def test_connect_invalid_token(self):
        """Test connexion avec token invalide"""
        communicator = WebsocketCommunicator(
            OrderConsumer.as_asgi(),
            "/ws/orders/?token=invalid&orders=1,2,3"
        )
        
        connected, _ = await communicator.connect()
        
        # Doit fermer avec code 4003
        assert connected is False
        
        await communicator.disconnect()

    async def test_connect_invalid_order_ids_format(self, valid_token):
        """Test connexion avec format order_ids invalide"""
        communicator = WebsocketCommunicator(
            OrderConsumer.as_asgi(),
            f"/ws/orders/?token={valid_token}&orders=abc,def"
        )
        
        connected, _ = await communicator.connect()
        
        # Doit fermer avec code 4004
        assert connected is False
        
        await communicator.disconnect()

    async def test_receive_ping(self, user, order, valid_token):
        """Test réception d'un ping"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        
        # Mock send
        consumer.send = AsyncMock()
        
        await consumer.receive(json.dumps({'type': 'ping'}))
        
        consumer.send.assert_called_once()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'pong'
        assert 'timestamp' in call_args

    async def test_receive_unknown_type(self, user, order, valid_token):
        """Test réception d'un type inconnu"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock()
        
        # Ne doit pas lever d'exception
        await consumer.receive(json.dumps({'type': 'unknown_type'}))

    async def test_receive_invalid_json(self, user, order):
        """Test réception de JSON invalide"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock()
        
        # Ne doit pas lever d'exception
        await consumer.receive("not valid json")

    async def test_order_update_handler(self, user, order):
        """Test handler order_update"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock()
        
        event = {
            'order_id': order.id,
            'status': 'confirmed',
            'waiting_time': 15,
            'timestamp': time.time(),
            'data': {'message': 'Test'}
        }
        
        await consumer.order_update(event)
        
        consumer.send.assert_called_once()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'order_update'
        assert call_args['order_id'] == order.id
        assert call_args['status'] == 'confirmed'

    async def test_order_update_handler_wrong_order(self, user, order):
        """Test handler order_update avec mauvais order_id"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock()
        
        event = {
            'order_id': 99999,  # Pas dans la liste
            'status': 'confirmed'
        }
        
        await consumer.order_update(event)
        
        # Ne doit pas envoyer car order_id pas dans la liste
        consumer.send.assert_not_called()

    async def test_disconnect_with_order_ids(self, user, order):
        """Test déconnexion avec order_ids"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.channel_name = "test_channel"
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock()
        
        await consumer.disconnect(1000)
        
        consumer.channel_layer.group_discard.assert_called()

    async def test_disconnect_without_order_ids(self):
        """Test déconnexion sans order_ids (pas encore connecté)"""
        consumer = OrderConsumer()
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock()
        
        # Ne doit pas lever d'exception
        await consumer.disconnect(1000)

    async def test_get_user_accessible_orders_client(self, user, order):
        """Test get_user_accessible_orders pour un client"""
        consumer = OrderConsumer()
        
        result = await consumer.get_user_accessible_orders(user, [order.id])
        
        assert order.id in result

    async def test_get_user_accessible_orders_restaurateur(
        self, restaurateur_user, restaurateur_profile, order
    ):
        """Test get_user_accessible_orders pour un restaurateur"""
        consumer = OrderConsumer()
        
        result = await consumer.get_user_accessible_orders(restaurateur_user, [order.id])
        
        # Le restaurateur peut voir les commandes de son restaurant
        assert order.id in result

    async def test_get_orders_initial_status(self, user, order):
        """Test get_orders_initial_status"""
        consumer = OrderConsumer()
        consumer.order_ids = [order.id]
        
        result = await consumer.get_orders_initial_status()
        
        assert len(result) == 1
        assert result[0]['id'] == order.id
        assert result[0]['status'] == 'pending'

    async def test_send_initial_statuses(self, user, order):
        """Test send_initial_statuses"""
        consumer = OrderConsumer()
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock()
        
        await consumer.send_initial_statuses()
        
        consumer.send.assert_called()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'initial_status'


# =============================================================================
# TESTS - SessionConsumer
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumer:
    """Tests pour SessionConsumer"""

    async def test_check_session_exists_true(self, collaborative_session):
        """Test check_session_exists avec session existante"""
        consumer = SessionConsumer()
        
        result = await consumer.check_session_exists(str(collaborative_session.id))
        
        assert result is True

    async def test_check_session_exists_false(self):
        """Test check_session_exists avec session inexistante"""
        consumer = SessionConsumer()
        
        result = await consumer.check_session_exists("00000000-0000-0000-0000-000000000000")
        
        assert result is False

    async def test_get_session_data(self, collaborative_session):
        """Test get_session_data"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        
        result = await consumer.get_session_data()
        
        assert result is not None
        assert result['id'] == str(collaborative_session.id)
        assert result['status'] == 'active'

    async def test_disconnect_with_group(self, collaborative_session):
        """Test déconnexion avec groupe"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.session_group_name = f"session_{collaborative_session.id}"
        consumer.channel_name = "test_channel"
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock()
        
        await consumer.disconnect(1000)
        
        consumer.channel_layer.group_discard.assert_called_once()

    async def test_disconnect_without_group(self):
        """Test déconnexion sans groupe"""
        consumer = SessionConsumer()
        consumer.channel_layer = MagicMock()
        
        # Ne doit pas lever d'exception
        await consumer.disconnect(1000)

    async def test_receive_ping(self):
        """Test réception ping"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        await consumer.receive(json.dumps({'type': 'ping'}))
        
        consumer.send.assert_called_once()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'pong'

    async def test_receive_invalid_json(self):
        """Test réception JSON invalide"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        # Ne doit pas lever d'exception
        await consumer.receive("invalid json {")

    async def test_session_update_handler(self):
        """Test handler session_update"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {
            'session_id': 'test-id',
            'event': 'status_change',
            'actor': 'user1',
            'timestamp': time.time(),
            'data': {'new_status': 'active'}
        }
        
        await consumer.session_update(event)
        
        consumer.send.assert_called_once()

    async def test_session_archived_handler(self):
        """Test handler session_archived"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {
            'session_id': 'test-id',
            'message': 'Session archivée',
            'reason': 'completed',
            'timestamp': time.time()
        }
        
        await consumer.session_archived(event)
        
        consumer.send.assert_called_once()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'session_archived'
        assert call_args['redirect_suggested'] is True

    async def test_session_completed_handler(self):
        """Test handler session_completed"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {
            'session_id': 'test-id',
            'message': 'Session terminée',
            'will_archive_in': 300,
            'timestamp': time.time()
        }
        
        await consumer.session_completed(event)
        
        consumer.send.assert_called_once()

    async def test_table_released_handler(self):
        """Test handler table_released"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {
            'table_id': 'table-123',
            'table_number': 'T01',
            'message': 'Table libérée',
            'timestamp': time.time()
        }
        
        await consumer.table_released(event)
        
        consumer.send.assert_called_once()

    async def test_participant_joined_handler(self):
        """Test handler participant_joined"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'participant': {'id': 'p1', 'name': 'Guest'}}
        
        await consumer.participant_joined(event)
        
        consumer.send.assert_called_once()

    async def test_participant_left_handler(self):
        """Test handler participant_left"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'participant_id': 'p1'}
        
        await consumer.participant_left(event)
        
        consumer.send.assert_called_once()

    async def test_participant_approved_handler(self):
        """Test handler participant_approved"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'participant': {'id': 'p1', 'name': 'Guest'}}
        
        await consumer.participant_approved(event)
        
        consumer.send.assert_called_once()

    async def test_order_created_handler(self):
        """Test handler order_created"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'order': {'id': 'o1', 'total': 25.00}}
        
        await consumer.order_created(event)
        
        consumer.send.assert_called_once()

    async def test_order_updated_handler(self):
        """Test handler order_updated"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'order': {'id': 'o1', 'status': 'confirmed'}}
        
        await consumer.order_updated(event)
        
        consumer.send.assert_called_once()

    async def test_session_locked_handler(self):
        """Test handler session_locked"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        event = {'locked_by': 'user1'}
        
        await consumer.session_locked(event)
        
        consumer.send.assert_called_once()

    async def test_session_unlocked_handler(self):
        """Test handler session_unlocked"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        await consumer.session_unlocked({})
        
        consumer.send.assert_called_once()

    async def test_send_session_status(self, collaborative_session):
        """Test send_session_status"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.send = AsyncMock()
        
        await consumer.send_session_status()
        
        consumer.send.assert_called_once()
        call_args = json.loads(consumer.send.call_args[1]['text_data'])
        assert call_args['type'] == 'session_status'


# =============================================================================
# TESTS - Fonctions de notification
# =============================================================================

@pytest.mark.django_db
class TestNotificationFunctions:
    """Tests pour les fonctions de notification"""

    def test_notify_order_update_no_channel_layer(self, monkeypatch):
        """Test notify_order_update sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        # Ne doit pas lever d'exception
        notify_order_update(1, 'confirmed', {'test': True})

    def test_notify_order_update_with_channel_layer(self, monkeypatch):
        """Test notify_order_update avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_order_update(123, 'confirmed', {'message': 'test'})
        
        mock_channel_layer.group_send.assert_called_once()
        call_args = mock_channel_layer.group_send.call_args
        assert call_args[0][0] == 'order_123'
        assert call_args[0][1]['type'] == 'order_update'

    def test_notify_session_update_no_channel_layer(self, monkeypatch):
        """Test notify_session_update sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_update('session-id', {'event': 'test'})

    def test_notify_session_update_with_channel_layer(self, monkeypatch):
        """Test notify_session_update avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_update('sess-123', {'event': 'update', 'data': {}})
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_participant_joined_no_channel_layer(self, monkeypatch):
        """Test notify_participant_joined sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_participant_joined('session-id', {'id': 'p1'})

    def test_notify_participant_joined_with_channel_layer(self, monkeypatch):
        """Test notify_participant_joined avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_participant_joined('sess-123', {'id': 'p1', 'name': 'Guest'})
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_participant_left_no_channel_layer(self, monkeypatch):
        """Test notify_participant_left sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_participant_left('session-id', 'participant-id')

    def test_notify_participant_left_with_channel_layer(self, monkeypatch):
        """Test notify_participant_left avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_participant_left('sess-123', 'p1')
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_participant_approved_no_channel_layer(self, monkeypatch):
        """Test notify_participant_approved sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_participant_approved('session-id', {'id': 'p1'})

    def test_notify_participant_approved_with_channel_layer(self, monkeypatch):
        """Test notify_participant_approved avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_participant_approved('sess-123', {'id': 'p1'})
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_order_created_no_channel_layer(self, monkeypatch):
        """Test notify_session_order_created sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_order_created('session-id', {'id': 'o1'})

    def test_notify_session_order_created_with_channel_layer(self, monkeypatch):
        """Test notify_session_order_created avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_order_created('sess-123', {'id': 'o1', 'total': 25.00})
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_order_updated_no_channel_layer(self, monkeypatch):
        """Test notify_session_order_updated sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_order_updated('session-id', {'id': 'o1'})

    def test_notify_session_order_updated_with_channel_layer(self, monkeypatch):
        """Test notify_session_order_updated avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_order_updated('sess-123', {'id': 'o1', 'status': 'ready'})
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_locked_no_channel_layer(self, monkeypatch):
        """Test notify_session_locked sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_locked('session-id', 'user1')

    def test_notify_session_locked_with_channel_layer(self, monkeypatch):
        """Test notify_session_locked avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_locked('sess-123', 'user1')
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_unlocked_no_channel_layer(self, monkeypatch):
        """Test notify_session_unlocked sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_unlocked('session-id')

    def test_notify_session_unlocked_with_channel_layer(self, monkeypatch):
        """Test notify_session_unlocked avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_unlocked('sess-123')
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_completed_no_channel_layer(self, monkeypatch):
        """Test notify_session_completed sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_completed('session-id')

    def test_notify_session_completed_with_channel_layer(self, monkeypatch):
        """Test notify_session_completed avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_completed('sess-123')
        
        mock_channel_layer.group_send.assert_called_once()
        call_args = mock_channel_layer.group_send.call_args
        assert call_args[0][1]['will_archive_in'] == 300

    def test_notify_session_archived_no_channel_layer(self, monkeypatch):
        """Test notify_session_archived sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_session_archived('session-id', 'completed')

    def test_notify_session_archived_with_channel_layer(self, monkeypatch):
        """Test notify_session_archived avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_session_archived('sess-123', 'Session terminée')
        
        mock_channel_layer.group_send.assert_called_once()

    def test_notify_session_archived_exception(self, monkeypatch):
        """Test notify_session_archived avec exception"""
        mock_channel_layer = MagicMock()
        mock_channel_layer.group_send = MagicMock(side_effect=Exception("Test error"))
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        # Ne doit pas lever d'exception
        notify_session_archived('sess-123')

    def test_notify_table_released_no_channel_layer(self, monkeypatch):
        """Test notify_table_released sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)
        
        notify_table_released('table-id', 'T01', 'rest-123')

    def test_notify_table_released_with_channel_layer(self, monkeypatch):
        """Test notify_table_released avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        notify_table_released('table-123', 'T01', 'rest-456')
        
        mock_channel_layer.group_send.assert_called_once()
        call_args = mock_channel_layer.group_send.call_args
        assert call_args[0][0] == 'restaurant_rest-456'

    def test_notify_table_released_exception(self, monkeypatch):
        """Test notify_table_released avec exception"""
        mock_channel_layer = MagicMock()
        mock_channel_layer.group_send = MagicMock(side_effect=Exception("Test error"))
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)
        
        # Ne doit pas lever d'exception
        notify_table_released('table-123', 'T01', 'rest-456')


# =============================================================================
# TESTS - Handlers d'erreur
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestConsumerErrorHandling:
    """Tests pour la gestion des erreurs dans les consumers"""

    async def test_order_update_handler_exception(self):
        """Test order_update avec exception"""
        consumer = OrderConsumer()
        consumer.order_ids = [1]
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.order_update({'order_id': 1, 'status': 'test'})

    async def test_session_update_handler_exception(self):
        """Test session_update avec exception"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.session_update({'session_id': 'test'})

    async def test_participant_update_handler_exception(self):
        """Test participant_update avec exception"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.participant_update({'participant_id': 'test'})

    async def test_get_user_accessible_orders_exception(self, user):
        """Test get_user_accessible_orders avec exception"""
        consumer = OrderConsumer()
        
        with patch('api.models.Order.objects') as mock_objects:
            mock_objects.filter.side_effect = Exception("DB error")
            result = await consumer.get_user_accessible_orders(user, [1, 2, 3])
        
        assert result == []

    async def test_get_orders_initial_status_exception(self):
        """Test get_orders_initial_status avec exception"""
        consumer = OrderConsumer()
        consumer.order_ids = [1]
        
        with patch('api.models.Order.objects') as mock_objects:
            mock_objects.filter.side_effect = Exception("DB error")
            result = await consumer.get_orders_initial_status()
        
        assert result == []

    async def test_check_session_exists_exception(self):
        """Test check_session_exists avec exception"""
        consumer = SessionConsumer()
        
        with patch('api.models.CollaborativeTableSession.all_objects') as mock_objects:
            mock_objects.filter.side_effect = Exception("DB error")
            result = await consumer.check_session_exists('test-id')
        
        assert result is False

    async def test_get_session_data_exception(self):
        """Test get_session_data avec exception"""
        consumer = SessionConsumer()
        consumer.session_id = 'test-id'
        
        with patch('api.models.CollaborativeTableSession.all_objects') as mock_objects:
            mock_objects.get.side_effect = Exception("DB error")
            result = await consumer.get_session_data()
        
        assert result is None

    async def test_send_initial_statuses_exception(self):
        """Test send_initial_statuses avec exception"""
        consumer = OrderConsumer()
        consumer.order_ids = [1]
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        with patch.object(consumer, 'get_orders_initial_status', new_callable=AsyncMock) as mock:
            mock.return_value = [{'id': 1, 'status': 'pending'}]
            await consumer.send_initial_statuses()

    async def test_send_session_status_exception(self):
        """Test send_session_status avec exception"""
        consumer = SessionConsumer()
        consumer.session_id = 'test-id'
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        with patch.object(consumer, 'get_session_data', new_callable=AsyncMock) as mock:
            mock.return_value = {'id': 'test', 'status': 'active'}
            await consumer.send_session_status()


# =============================================================================
# TESTS SUPPLÉMENTAIRES - Couverture des branches manquantes
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestOrderConsumerConnectBranches:
    """Tests pour les branches de connect() de OrderConsumer"""

    async def test_connect_auth_failure(self, user, order, valid_token):
        """Test connexion avec échec d'authentification (lignes 72-74)"""
        consumer = OrderConsumer()
        consumer.scope = {
            'query_string': b'token=valid_token&orders=1,2,3'
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_name = "test_channel"
        consumer.close = AsyncMock()
        
        # Simuler échec d'authentification
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = None  # Auth échoue
            await consumer.connect()
        
        # Doit fermer avec code 4003
        consumer.close.assert_called_with(code=4003)

    async def test_connect_empty_order_ids_after_parse(self, user, valid_token):
        """Test connexion avec order_ids vides après parsing (lignes 84-87)"""
        consumer = OrderConsumer()
        consumer.scope = {
            'query_string': f'token={valid_token}&orders=,,,'.encode()
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_name = "test_channel"
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = user
            await consumer.connect()
        
        # Doit fermer avec code 4005 (no valid order IDs)
        consumer.close.assert_called_with(code=4005)

    async def test_connect_no_accessible_orders(self, user, valid_token):
        """Test connexion sans commandes accessibles (lignes 91-94)"""
        consumer = OrderConsumer()
        consumer.scope = {
            'query_string': f'token={valid_token}&orders=99999'.encode()
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_name = "test_channel"
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = user
            with patch.object(consumer, 'get_user_accessible_orders', new_callable=AsyncMock) as mock_orders:
                mock_orders.return_value = []  # Aucune commande accessible
                await consumer.connect()
        
        # Doit fermer avec code 4006
        consumer.close.assert_called_with(code=4006)

    async def test_connect_full_success(self, user, order, valid_token):
        """Test connexion réussie complète (lignes 97-119)"""
        consumer = OrderConsumer()
        consumer.scope = {
            'query_string': f'token={valid_token}&orders={order.id}'.encode()
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_add = AsyncMock()
        consumer.channel_name = "test_channel"
        consumer.accept = AsyncMock()
        consumer.send = AsyncMock()
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = user
            with patch.object(consumer, 'get_user_accessible_orders', new_callable=AsyncMock) as mock_orders:
                mock_orders.return_value = [order.id]
                with patch.object(consumer, 'send_initial_statuses', new_callable=AsyncMock):
                    await consumer.connect()
        
        # Vérifie que la connexion est acceptée
        consumer.accept.assert_called_once()
        # Vérifie que le groupe est rejoint
        consumer.channel_layer.group_add.assert_called()
        # Vérifie que les infos sont stockées
        assert consumer.user == user
        assert consumer.order_ids == [order.id]

    async def test_connect_exception_handling(self, valid_token):
        """Test gestion d'exception dans connect()"""
        consumer = OrderConsumer()
        consumer.scope = {
            'query_string': f'token={valid_token}&orders=1'.encode()
        }
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.side_effect = Exception("Connection error")
            await consumer.connect()
        
        # Doit fermer avec code 4000
        consumer.close.assert_called_with(code=4000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestOrderConsumerDisconnectBranches:
    """Tests pour les branches de disconnect() de OrderConsumer"""

    async def test_disconnect_with_exception(self, user, order):
        """Test déconnexion avec exception (lignes 134-135)"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.channel_name = "test_channel"
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock(side_effect=Exception("Disconnect error"))
        
        # Ne doit pas lever d'exception
        await consumer.disconnect(1000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestOrderConsumerReceiveBranches:
    """Tests pour les branches de receive() de OrderConsumer"""

    async def test_receive_general_exception(self, user, order):
        """Test receive avec exception générale (lignes 153-154)"""
        consumer = OrderConsumer()
        consumer.user = user
        consumer.order_ids = [order.id]
        consumer.send = AsyncMock(side_effect=Exception("Processing error"))
        
        # Ne doit pas lever d'exception (même avec un ping qui échoue)
        await consumer.receive(json.dumps({'type': 'ping'}))


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerConnectBranches:
    """Tests pour les branches de connect() de SessionConsumer"""

    async def test_connect_session_not_found(self):
        """Test connexion avec session inexistante (lignes 252-255)"""
        consumer = SessionConsumer()
        consumer.scope = {
            'url_route': {'kwargs': {'session_id': '00000000-0000-0000-0000-000000000000'}},
            'query_string': b''
        }
        consumer.channel_layer = MagicMock()
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
            mock_check.return_value = False
            await consumer.connect()
        
        # Doit fermer avec code 4404
        consumer.close.assert_called_with(code=4404)

    async def test_connect_with_token_success(self, collaborative_session, user, valid_token):
        """Test connexion réussie avec token (lignes 234-277)"""
        consumer = SessionConsumer()
        consumer.scope = {
            'url_route': {'kwargs': {'session_id': str(collaborative_session.id)}},
            'query_string': f'token={valid_token}'.encode()
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_add = AsyncMock()
        consumer.channel_name = "test_channel"
        consumer.accept = AsyncMock()
        consumer.send = AsyncMock()
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = user
            with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
                mock_check.return_value = True
                with patch.object(consumer, 'send_session_status', new_callable=AsyncMock):
                    await consumer.connect()
        
        # Vérifie que la connexion est acceptée
        consumer.accept.assert_called_once()
        assert consumer.user == user
        assert consumer.session_id == str(collaborative_session.id)

    async def test_connect_guest_no_token(self, collaborative_session):
        """Test connexion invité sans token (lignes 247-248)"""
        consumer = SessionConsumer()
        consumer.scope = {
            'url_route': {'kwargs': {'session_id': str(collaborative_session.id)}},
            'query_string': b''
        }
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_add = AsyncMock()
        consumer.channel_name = "test_channel"
        consumer.accept = AsyncMock()
        consumer.send = AsyncMock()
        
        with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
            mock_check.return_value = True
            with patch.object(consumer, 'send_session_status', new_callable=AsyncMock):
                await consumer.connect()
        
        # Vérifie que l'utilisateur est None (invité)
        assert consumer.user is None
        consumer.accept.assert_called_once()

    async def test_connect_exception_handling(self, collaborative_session):
        """Test gestion d'exception dans connect() (lignes 279-281)"""
        consumer = SessionConsumer()
        consumer.scope = {
            'url_route': {'kwargs': {'session_id': str(collaborative_session.id)}},
            'query_string': b''
        }
        consumer.close = AsyncMock()
        
        with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = Exception("Connection error")
            await consumer.connect()
        
        # Doit fermer avec code 4000
        consumer.close.assert_called_with(code=4000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerDisconnectBranches:
    """Tests pour les branches de disconnect() de SessionConsumer"""

    async def test_disconnect_with_exception(self, collaborative_session):
        """Test déconnexion avec exception (lignes 292-293)"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.session_group_name = f"session_{collaborative_session.id}"
        consumer.channel_name = "test_channel"
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock(side_effect=Exception("Disconnect error"))
        
        # Ne doit pas lever d'exception
        await consumer.disconnect(1000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerReceiveBranches:
    """Tests pour les branches de receive() de SessionConsumer"""

    async def test_receive_unknown_message_type(self):
        """Test receive avec type de message inconnu (ligne 307)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()
        
        # Ne doit pas lever d'exception, juste logger
        await consumer.receive(json.dumps({'type': 'unknown_type_xyz'}))
        
        # send n'est pas appelé pour un type inconnu
        consumer.send.assert_not_called()

    async def test_receive_general_exception(self):
        """Test receive avec exception générale (lignes 311-312)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Processing error"))
        
        # Ne doit pas lever d'exception
        await consumer.receive(json.dumps({'type': 'ping'}))


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerHandlerExceptions:
    """Tests pour les exceptions dans les handlers de SessionConsumer"""

    async def test_session_archived_handler_exception(self):
        """Test session_archived avec exception (lignes 348-349)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.session_archived({'session_id': 'test'})

    async def test_session_completed_handler_exception(self):
        """Test session_completed avec exception (lignes 364-365)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.session_completed({'session_id': 'test'})

    async def test_table_released_handler_exception(self):
        """Test table_released avec exception (lignes 380-381)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.table_released({'table_id': 'test'})

    async def test_participant_joined_handler_exception(self):
        """Test participant_joined avec exception (lignes 406-407)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.participant_joined({'participant': {'id': 'p1'}})

    async def test_participant_left_handler_exception(self):
        """Test participant_left avec exception (lignes 417-418)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.participant_left({'participant_id': 'p1'})

    async def test_participant_approved_handler_exception(self):
        """Test participant_approved avec exception (lignes 428-429)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.participant_approved({'participant': {'id': 'p1'}})

    async def test_order_created_handler_exception(self):
        """Test order_created avec exception (lignes 439-440)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.order_created({'order': {'id': 'o1'}})

    async def test_order_updated_handler_exception(self):
        """Test order_updated avec exception (lignes 450-451)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.order_updated({'order': {'id': 'o1'}})

    async def test_session_locked_handler_exception(self):
        """Test session_locked avec exception (lignes 461-462)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.session_locked({'locked_by': 'user1'})

    async def test_session_unlocked_handler_exception(self):
        """Test session_unlocked avec exception (lignes 471-472)"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        
        # Ne doit pas lever d'exception
        await consumer.session_unlocked({})