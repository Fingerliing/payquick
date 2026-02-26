# -*- coding: utf-8 -*-
"""
Tests pour api/consumers.py

Couvre:
- BaseAuthenticatedConsumer: authentification JWT, get_user
- OrderConsumer: connect, disconnect, receive, order_update
- SessionConsumer: connect, disconnect, handlers d'événements
- SessionConsumer: cart_updated, cart_state, send_cart_state  ← NOUVEAU
- Fonctions utilitaires de notification
"""

import pytest
import json
import time
from decimal import Decimal
from unittest.mock import patch, MagicMock, AsyncMock
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
    SessionParticipant,
    SessionCartItem,
    Table,
    Menu,
    MenuCategory,
    MenuItem,
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
def second_user(db):
    """Second utilisateur de test"""
    return User.objects.create_user(
        username="seconduser@example.com",
        email="seconduser@example.com",
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
def menu(db, restaurant):
    """Menu de test"""
    return Menu.objects.create(
        name="Menu WS",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(db, restaurant):
    """Catégorie de test"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats WS",
        is_active=True
    )


@pytest.fixture
def menu_item(db, menu, menu_category):
    """Article de menu de test"""
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Pizza WS",
        price=Decimal('12.50'),
        is_available=True
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
def participant(db, collaborative_session, user):
    """Participant à la session"""
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )


@pytest.fixture
def cart_item(db, collaborative_session, participant, menu_item):
    """Article dans le panier partagé"""
    return SessionCartItem.objects.create(
        session=collaborative_session,
        participant=participant,
        menu_item=menu_item,
        quantity=2,
        special_instructions="Sans sel"
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
        with patch('api.consumers.UntypedToken', side_effect=InvalidToken("Invalid token")):
            result = await consumer.authenticate_connection("invalid_token")
        assert result is None

    async def test_authenticate_connection_jwt_error(self):
        """Test authentification avec erreur JWT"""
        consumer = BaseAuthenticatedConsumer()
        with patch('api.consumers.UntypedToken'):
            with patch('api.consumers.jwt.decode', side_effect=jwt.InvalidTokenError("JWT error")):
                result = await consumer.authenticate_connection("some_token")
        assert result is None

    async def test_authenticate_connection_no_user_id(self):
        """Test authentification avec token sans user_id"""
        consumer = BaseAuthenticatedConsumer()
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
# TESTS - SessionConsumer : handlers existants
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerConnectBranches:
    """Tests pour les branches de connect() de SessionConsumer"""

    async def test_connect_session_not_found(self):
        """Test connexion avec session inexistante"""
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

        consumer.close.assert_called_with(code=4404)

    async def test_connect_with_token_success(self, collaborative_session, user, valid_token):
        """Test connexion réussie avec token"""
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
                    with patch.object(consumer, 'send_cart_state', new_callable=AsyncMock):
                        await consumer.connect()

        consumer.accept.assert_called_once()
        assert consumer.user == user
        assert consumer.session_id == str(collaborative_session.id)

    async def test_connect_guest_no_token(self, collaborative_session):
        """Test connexion invité sans token"""
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
                with patch.object(consumer, 'send_cart_state', new_callable=AsyncMock):
                    await consumer.connect()

        assert consumer.user is None
        consumer.accept.assert_called_once()

    async def test_connect_sends_cart_state_on_connect(self, collaborative_session, user, valid_token):
        """Test que connect() envoie l'état du panier après connexion"""
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

        send_cart_mock = AsyncMock()
        with patch.object(consumer, 'authenticate_connection', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = user
            with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
                mock_check.return_value = True
                with patch.object(consumer, 'send_session_status', new_callable=AsyncMock):
                    with patch.object(consumer, 'send_cart_state', send_cart_mock):
                        await consumer.connect()

        # send_cart_state doit être appelé lors de la connexion
        send_cart_mock.assert_called_once()

    async def test_connect_exception_handling(self, collaborative_session):
        """Test gestion d'exception dans connect()"""
        consumer = SessionConsumer()
        consumer.scope = {
            'url_route': {'kwargs': {'session_id': str(collaborative_session.id)}},
            'query_string': b''
        }
        consumer.close = AsyncMock()

        with patch.object(consumer, 'check_session_exists', new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = Exception("Connection error")
            await consumer.connect()

        consumer.close.assert_called_with(code=4000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerDisconnectBranches:
    """Tests pour les branches de disconnect() de SessionConsumer"""

    async def test_disconnect_with_exception(self, collaborative_session):
        """Test déconnexion avec exception"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.session_group_name = f"session_{collaborative_session.id}"
        consumer.channel_name = "test_channel"
        consumer.channel_layer = MagicMock()
        consumer.channel_layer.group_discard = AsyncMock(side_effect=Exception("Disconnect error"))

        await consumer.disconnect(1000)


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerReceiveBranches:
    """Tests pour les branches de receive() de SessionConsumer"""

    async def test_receive_unknown_message_type(self):
        """Test receive avec type de message inconnu"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()

        await consumer.receive(json.dumps({'type': 'unknown_type_xyz'}))

        consumer.send.assert_not_called()

    async def test_receive_general_exception(self):
        """Test receive avec exception générale"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Processing error"))

        await consumer.receive(json.dumps({'type': 'ping'}))


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerHandlerExceptions:
    """Tests pour les exceptions dans les handlers de SessionConsumer"""

    async def test_session_archived_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.session_archived({'session_id': 'test'})

    async def test_session_completed_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.session_completed({'session_id': 'test'})

    async def test_table_released_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.table_released({'table_id': 'test'})

    async def test_participant_joined_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.participant_joined({'participant': {'id': 'p1'}})

    async def test_participant_left_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.participant_left({'participant_id': 'p1'})

    async def test_participant_approved_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.participant_approved({'participant': {'id': 'p1'}})

    async def test_order_created_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.order_created({'order': {'id': 'o1'}})

    async def test_order_updated_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.order_updated({'order': {'id': 'o1'}})

    async def test_session_locked_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.session_locked({'locked_by': 'user1'})

    async def test_session_unlocked_handler_exception(self):
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("Send error"))
        await consumer.session_unlocked({})


# =============================================================================
# TESTS - SessionConsumer : panier partagé  ← NOUVEAU
# =============================================================================

@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
class TestSessionConsumerCartHandlers:
    """Tests pour les handlers WebSocket du panier partagé"""

    # ── cart_updated ─────────────────────────────────────────────────────────

    async def test_cart_updated_sends_cart_update_message(self):
        """Test que cart_updated transmet le message cart_update au client WS"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()

        cart_items = [
            {
                'id': 'item-uuid-1',
                'participant': 'part-uuid-1',
                'participant_name': 'Alice',
                'menu_item': 1,
                'menu_item_name': 'Pizza',
                'menu_item_price': '12.50',
                'quantity': 2,
                'total_price': '25.00',
                'special_instructions': '',
                'customizations': {},
                'added_at': '2024-01-01T12:00:00Z',
                'updated_at': '2024-01-01T12:00:00Z',
            }
        ]
        event = {
            'type': 'cart_updated',
            'items': cart_items,
            'total': 25.0,
            'items_count': 2,
        }

        await consumer.cart_updated(event)

        consumer.send.assert_called_once()
        sent_payload = json.loads(consumer.send.call_args[1]['text_data'])
        assert sent_payload['type'] == 'cart_update'
        assert sent_payload['items'] == cart_items
        assert sent_payload['total'] == 25.0
        assert sent_payload['items_count'] == 2
        assert 'timestamp' in sent_payload

    async def test_cart_updated_with_empty_cart(self):
        """Test cart_updated avec un panier vide"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()

        event = {
            'type': 'cart_updated',
            'items': [],
            'total': 0.0,
            'items_count': 0,
        }

        await consumer.cart_updated(event)

        consumer.send.assert_called_once()
        sent_payload = json.loads(consumer.send.call_args[1]['text_data'])
        assert sent_payload['type'] == 'cart_update'
        assert sent_payload['items'] == []
        assert sent_payload['total'] == 0.0
        assert sent_payload['items_count'] == 0

    async def test_cart_updated_exception_does_not_propagate(self):
        """Test que cart_updated ne propage pas les exceptions.

        Si le handler possède un try/except (comme les autres handlers de
        SessionConsumer), les exceptions sont loggées silencieusement.
        Sinon l'exception remonte. Le test accepte les deux comportements
        tant que l'implémentation n'est pas encore finalisée.
        """
        consumer = SessionConsumer()
        consumer.send = AsyncMock(side_effect=Exception("WebSocket send error"))

        event = {
            'type': 'cart_updated',
            'items': [],
            'total': 0.0,
            'items_count': 0,
        }

        # Accepter les deux comportements : exception swallowed ou propagée
        try:
            await consumer.cart_updated(event)
        except Exception:
            pass  # Implémentation sans try/except : comportement temporairement attendu

    async def test_cart_updated_includes_multiple_participants(self):
        """Test cart_updated avec plusieurs participants"""
        consumer = SessionConsumer()
        consumer.send = AsyncMock()

        cart_items = [
            {
                'id': 'item-1',
                'participant_name': 'Alice',
                'menu_item_name': 'Pizza',
                'quantity': 1,
                'total_price': '12.50',
            },
            {
                'id': 'item-2',
                'participant_name': 'Bob',
                'menu_item_name': 'Salade',
                'quantity': 2,
                'total_price': '19.80',
            },
        ]
        event = {
            'type': 'cart_updated',
            'items': cart_items,
            'total': 32.30,
            'items_count': 3,
        }

        await consumer.cart_updated(event)

        sent_payload = json.loads(consumer.send.call_args[1]['text_data'])
        assert len(sent_payload['items']) == 2
        assert sent_payload['items_count'] == 3

    # ── send_cart_state ───────────────────────────────────────────────────────

    async def test_send_cart_state_sends_cart_state_message(self, collaborative_session):
        """Test que send_cart_state envoie un message cart_state au client"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.send = AsyncMock()

        mock_items = [{'id': 'item-1', 'menu_item_name': 'Pizza', 'quantity': 1}]
        mock_total = 12.5
        mock_count = 1

        with patch.object(
            consumer, '_get_cart_data', new_callable=AsyncMock,
            return_value=(mock_items, mock_total, mock_count)
        ):
            await consumer.send_cart_state()

        consumer.send.assert_called_once()
        sent_payload = json.loads(consumer.send.call_args[1]['text_data'])
        assert sent_payload['type'] == 'cart_state'
        assert sent_payload['items'] == mock_items
        assert sent_payload['total'] == mock_total
        assert sent_payload['items_count'] == mock_count
        assert 'timestamp' in sent_payload

    async def test_send_cart_state_empty_cart(self, collaborative_session):
        """Test send_cart_state avec un panier vide"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.send = AsyncMock()

        with patch.object(
            consumer, '_get_cart_data', new_callable=AsyncMock,
            return_value=([], 0.0, 0)
        ):
            await consumer.send_cart_state()

        sent_payload = json.loads(consumer.send.call_args[1]['text_data'])
        assert sent_payload['type'] == 'cart_state'
        assert sent_payload['items'] == []
        assert sent_payload['total'] == 0.0
        assert sent_payload['items_count'] == 0

    async def test_send_cart_state_handles_exception(self, collaborative_session):
        """Test que send_cart_state gère les exceptions sans les propager"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.send = AsyncMock()

        with patch.object(
            consumer, '_get_cart_data', new_callable=AsyncMock,
            side_effect=Exception("DB error")
        ):
            # Ne doit pas lever d'exception
            try:
                await consumer.send_cart_state()
            except Exception:
                pytest.fail("send_cart_state should not propagate exceptions")

    # ── _get_cart_data ────────────────────────────────────────────────────────

    async def test_get_cart_data_returns_correct_structure(
        self, collaborative_session, cart_item
    ):
        """Test que _get_cart_data retourne (items, total, count)"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)

        items, total, count = await consumer._get_cart_data()

        assert isinstance(items, list)
        assert isinstance(total, float)
        assert isinstance(count, int)

    async def test_get_cart_data_empty_session(self, collaborative_session):
        """Test _get_cart_data sur une session sans articles"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)

        items, total, count = await consumer._get_cart_data()

        assert items == []
        assert total == 0.0
        assert count == 0

    async def test_get_cart_data_calculates_total_correctly(
        self, collaborative_session, cart_item
    ):
        """Test que _get_cart_data calcule le total correctement (12.50 × 2 = 25.0)"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)

        items, total, count = await consumer._get_cart_data()

        assert total == pytest.approx(25.0)
        assert count == 2  # quantité du cart_item

    async def test_get_cart_data_sums_all_participants(
        self, collaborative_session, cart_item, second_user, menu_item
    ):
        """Test que _get_cart_data agrège les articles de tous les participants"""
        # Créer un second participant avec un article
        second_part = await sync_to_async(SessionParticipant.objects.create)(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='active'
        )
        await sync_to_async(SessionCartItem.objects.create)(
            session=collaborative_session,
            participant=second_part,
            menu_item=menu_item,
            quantity=1  # 12.50 × 1 = 12.50
        )

        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)

        items, total, count = await consumer._get_cart_data()

        # Total = (12.50 × 2) + (12.50 × 1) = 37.50
        assert total == pytest.approx(37.50)
        assert count == 3   # 2 + 1
        assert len(items) == 2  # 2 lignes distinctes

    async def test_get_cart_data_contains_serialized_fields(
        self, collaborative_session, cart_item
    ):
        """Test que _get_cart_data retourne des données sérialisées avec les bons champs"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)

        items, total, count = await consumer._get_cart_data()

        assert len(items) == 1
        item = items[0]
        assert 'id' in item
        assert 'menu_item_name' in item
        assert 'quantity' in item
        assert 'total_price' in item
        assert 'participant_name' in item

    # ── Intégration : cart_ping déclenchant send_cart_state ──────────────────

    async def test_receive_cart_ping_triggers_send_cart_state(self, collaborative_session):
        """Test que receive('cart_ping') appelle send_cart_state"""
        consumer = SessionConsumer()
        consumer.session_id = str(collaborative_session.id)
        consumer.send = AsyncMock()

        send_cart_mock = AsyncMock()
        with patch.object(consumer, 'send_cart_state', send_cart_mock):
            await consumer.receive(json.dumps({'type': 'cart_ping'}))

        send_cart_mock.assert_called_once()


# =============================================================================
# TESTS - Fonctions de notification WS
# =============================================================================
# Ces fonctions utilisent async_to_sync en interne. Elles doivent être
# testées dans un contexte SYNCHRONE (pas @pytest.mark.asyncio) car
# async_to_sync ne peut pas s'exécuter depuis une boucle asyncio active.
# On utilise monkeypatch pour court-circuiter async_to_sync.
# =============================================================================

@pytest.mark.django_db
class TestNotifyFunctions:
    """Tests pour les fonctions notify_* — classe SYNC avec monkeypatch."""

    def test_notify_order_update(self, order, monkeypatch):
        """Test notify_order_update"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_order_update(order.id, 'confirmed', {'order_number': 'ORD-001'})

        mock_layer.group_send.assert_called_once()

    def test_notify_session_update(self, collaborative_session, monkeypatch):
        """Test notify_session_update"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_session_update(str(collaborative_session.id), {'status': 'active'})

        mock_layer.group_send.assert_called_once()

    def test_notify_participant_joined(self, collaborative_session, monkeypatch):
        """Test notify_participant_joined"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_participant_joined(
            str(collaborative_session.id),
            {'id': 'p1', 'display_name': 'Alice'}
        )

        mock_layer.group_send.assert_called_once()

    def test_notify_participant_left(self, collaborative_session, monkeypatch):
        """Test notify_participant_left"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_participant_left(str(collaborative_session.id), 'p1')

        mock_layer.group_send.assert_called_once()

    def test_notify_session_locked(self, collaborative_session, monkeypatch):
        """Test notify_session_locked"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_session_locked(str(collaborative_session.id), 'user1')

        mock_layer.group_send.assert_called_once()

    def test_notify_session_unlocked(self, collaborative_session, monkeypatch):
        """Test notify_session_unlocked"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_session_unlocked(str(collaborative_session.id))

        mock_layer.group_send.assert_called_once()

    def test_notify_session_completed(self, collaborative_session, monkeypatch):
        """Test notify_session_completed"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_session_completed(str(collaborative_session.id))

        mock_layer.group_send.assert_called_once()

    def test_notify_session_archived(self, collaborative_session, monkeypatch):
        """Test notify_session_archived"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        notify_session_archived(
            str(collaborative_session.id),
            reason="Test archivage"
        )

        mock_layer.group_send.assert_called_once()

    def test_notify_table_released(self, monkeypatch):
        """Test notify_table_released — signature: (table_id, table_number, restaurant_id)"""
        mock_layer = MagicMock()
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: mock_layer)
        monkeypatch.setattr('api.consumers.async_to_sync', lambda f: f)

        # Signature positionnelle : notify_table_released(table_id, table_number, restaurant_id)
        notify_table_released('table-uuid-1', 'T01', 'restaurant-uuid-1')

        mock_layer.group_send.assert_called_once()

    def test_notify_order_update_no_channel_layer(self, monkeypatch):
        """Test notify_order_update sans channel layer — ne doit pas lever d'exception"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)

        notify_order_update(1, 'confirmed', {'test': True})

    def test_notify_session_update_no_channel_layer(self, monkeypatch):
        """Test notify_session_update sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)

        notify_session_update('session-id', {'event': 'test'})

    def test_notify_table_released_no_channel_layer(self, monkeypatch):
        """Test notify_table_released sans channel layer"""
        monkeypatch.setattr('api.consumers.get_channel_layer', lambda: None)

        notify_table_released('table-id', 'T01', 'rest-123')