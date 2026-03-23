import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken
from django.conf import settings
from django.utils import timezone
import jwt
import time

logger = logging.getLogger(__name__)
User = get_user_model()


class BaseAuthenticatedConsumer(AsyncWebsocketConsumer):
    """Classe de base pour les consumers avec authentification"""
    
    async def authenticate_connection(self, token):
        """Authentifier la connexion avec un token JWT"""
        try:
            UntypedToken(token)
            decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = decoded.get("user_id")
            
            if not user_id:
                return None
                
            user = await self.get_user(user_id)
            return user
            
        except (InvalidToken, jwt.InvalidTokenError) as e:
            logger.warning(f"Authentication failed: {e}")
            return None
    
    @database_sync_to_async
    def get_user(self, user_id):
        """Récupérer un utilisateur"""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None


class OrderConsumer(BaseAuthenticatedConsumer):
    """Consumer WebSocket pour les mises à jour de commandes en temps réel"""
    
    async def connect(self):
        """Gérer la connexion WebSocket"""
        try:
            # 1. Récupérer et valider le token
            query_string = self.scope.get('query_string', b'').decode()
            query_params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            
            token = query_params.get('token')
            order_ids_param = query_params.get('orders', '')
            
            if not token:
                logger.warning("WebSocket: No token provided")
                await self.close(code=4001)
                return
                
            if not order_ids_param:
                logger.warning("WebSocket: No order IDs provided")
                await self.close(code=4002)
                return
            
            # 2. Authentifier l'utilisateur
            user = await self.authenticate_connection(token)
            if not user:
                logger.warning("WebSocket: Authentication failed")
                await self.close(code=4003)
                return
            
            # 3. Parser les IDs de commandes
            try:
                order_ids = [int(id.strip()) for id in order_ids_param.split(',') if id.strip()]
            except ValueError:
                logger.warning("WebSocket: Invalid order IDs format")
                await self.close(code=4004)
                return
            
            if not order_ids:
                logger.warning("WebSocket: No valid order IDs")
                await self.close(code=4005)
                return
            
            # 4. Vérifier l'accès aux commandes
            accessible_orders = await self.get_user_accessible_orders(user, order_ids)
            if not accessible_orders:
                logger.warning(f"WebSocket: No accessible orders for user {user.id}")
                await self.close(code=4006)
                return
            
            # 5. Stocker les informations de la connexion
            self.user = user
            self.order_ids = accessible_orders
            
            # 6. Rejoindre les groupes pour chaque commande
            for order_id in self.order_ids:
                group_name = f"order_{order_id}"
                await self.channel_layer.group_add(group_name, self.channel_name)
            
            # 7. Accepter la connexion
            await self.accept()
            
            # 8. Envoyer les statuts initiaux
            await self.send_initial_statuses()
            
            # 9. Confirmer la connexion
            await self.send(text_data=json.dumps({
                'type': 'connected',
                'message': 'WebSocket connection established',
                'order_ids': self.order_ids,
                'timestamp': time.time()
            }))
            
            logger.info(f"OrderWS connected: user {user.id}, orders {self.order_ids}")
            
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """Gérer la déconnexion WebSocket"""
        try:
            if hasattr(self, 'order_ids'):
                for order_id in self.order_ids:
                    group_name = f"order_{order_id}"
                    await self.channel_layer.group_discard(group_name, self.channel_name)
                
                logger.info(f"OrderWS disconnected: user {getattr(self, 'user', None)}, code {close_code}")
        except Exception as e:
            logger.error(f"WebSocket disconnect error: {e}")
    
    async def receive(self, text_data):
        """Gérer les messages reçus du client"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': time.time()
                }))
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    async def order_update(self, event):
        """Envoyer une mise à jour de commande au client"""
        try:
            order_id = event.get('order_id')
            if order_id in self.order_ids:
                await self.send(text_data=json.dumps({
                    'type': 'order_update',
                    'order_id': order_id,
                    'status': event.get('status'),
                    'waiting_time': event.get('waiting_time'),
                    'timestamp': event.get('timestamp'),
                    'data': event.get('data', {})
                }))
        except Exception as e:
            logger.error(f"Error sending order update: {e}")
    
    @database_sync_to_async
    def get_user_accessible_orders(self, user, order_ids):
        """Vérifier l'accès utilisateur aux commandes"""
        try:
            from api.models import Order
            
            # Filtrer selon les permissions
            accessible = Order.objects.filter(
                id__in=order_ids
            )
            
            # Si c'est un restaurateur, vérifier qu'il possède le restaurant
            if hasattr(user, 'restaurateur_profile'):
                accessible = accessible.filter(
                    restaurant__owner=user.restaurateur_profile
                )
            else:
                # Si c'est un client, vérifier que c'est sa commande
                accessible = accessible.filter(user=user)
            
            return list(accessible.values_list('id', flat=True))
        except Exception as e:
            logger.error(f"Error checking order access: {e}")
            return []
    
    @database_sync_to_async
    def get_orders_initial_status(self):
        """Récupérer le statut initial des commandes"""
        try:
            from api.models import Order
            
            orders = Order.objects.filter(id__in=self.order_ids).values(
                'id', 'status', 'created_at', 'updated_at'
            )
            return list(orders)
        except Exception as e:
            logger.error(f"Error getting initial status: {e}")
            return []
    
    async def send_initial_statuses(self):
        """Envoyer les statuts initiaux des commandes"""
        try:
            initial_statuses = await self.get_orders_initial_status()
            for status_data in initial_statuses:
                await self.send(text_data=json.dumps({
                    'type': 'initial_status',
                    'order_id': status_data['id'],
                    'status': status_data.get('status'),
                    'timestamp': time.time()
                }))
        except Exception as e:
            logger.error(f"Error sending initial statuses: {e}")


class SessionConsumer(BaseAuthenticatedConsumer):
    """
    Consumer WebSocket pour les sessions collaboratives de table
    AVEC support des notifications d'archivage
    """
    
    async def connect(self):
        """Gérer la connexion WebSocket pour une session"""
        try:
            # Récupérer le session_id depuis l'URL
            self.session_id = self.scope['url_route']['kwargs']['session_id']
            self.session_group_name = f'session_{self.session_id}'
            
            # Récupérer et valider le token (optionnel pour les invités)
            query_string = self.scope.get('query_string', b'').decode()
            query_params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            token = query_params.get('token')
            
            # Authentifier si token présent
            if token:
                self.user = await self.authenticate_connection(token)
            else:
                self.user = None  # Invité
            
            # Vérifier que la session existe
            session_exists = await self.check_session_exists(self.session_id)
            if not session_exists:
                logger.warning(f"Session {self.session_id} not found")
                await self.close(code=4404)
                return
            
            # Rejoindre le groupe de la session
            await self.channel_layer.group_add(
                self.session_group_name,
                self.channel_name
            )
            
            # Accepter la connexion
            await self.accept()
            
            # Envoyer le statut initial
            await self.send_session_status()
            
            # Envoyer l'état actuel du panier
            await self.send_cart_state()
            
            # Confirmer la connexion
            await self.send(text_data=json.dumps({
                'type': 'connected',
                'message': 'Connected to session',
                'session_id': self.session_id,
                'timestamp': time.time()
            }))
            
            logger.info(f"SessionWS connected: session {self.session_id}, user {getattr(self.user, 'id', 'guest')}")
            
        except Exception as e:
            logger.error(f"SessionWS connection error: {e}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """Gérer la déconnexion"""
        try:
            if hasattr(self, 'session_group_name'):
                await self.channel_layer.group_discard(
                    self.session_group_name,
                    self.channel_name
                )
                logger.info(f"SessionWS disconnected: session {self.session_id}, code {close_code}")
        except Exception as e:
            logger.error(f"SessionWS disconnect error: {e}")
    
    async def receive(self, text_data):
        """Gérer les messages reçus"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': time.time()
                }))
            elif message_type == 'cart_ping':
                # Le client demande l'état actuel du panier
                await self.send_cart_state()
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    # ==================== HANDLERS POUR ÉVÉNEMENTS SESSION ====================
    
    async def session_update(self, event):
        """
        Handler pour les mises à jour générales de session
        Appelé par notify_session_update()
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'session_update',
                'session_id': event.get('session_id'),
                'event': event.get('event'),
                'actor': event.get('actor'),
                'timestamp': event.get('timestamp'),
                'data': event.get('data', {})
            }))
        except Exception as e:
            logger.error(f"Error sending session update: {e}")
    
    async def session_archived(self, event):
        """
        🆕 Handler pour notification d'archivage de session
        Appelé par notify_session_archived()
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'session_archived',
                'session_id': event.get('session_id'),
                'message': event.get('message'),
                'reason': event.get('reason'),
                'timestamp': event.get('timestamp'),
                'redirect_suggested': True  # Suggère au client de rediriger
            }))
            logger.info(f"✅ Sent session_archived notification for session {event.get('session_id')}")
        except Exception as e:
            logger.error(f"Error sending session_archived: {e}")
    
    async def session_completed(self, event):
        """
        Handler pour notification de completion de session
        Appelé par notify_session_completed()
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'session_completed',
                'session_id': event.get('session_id'),
                'message': event.get('message'),
                'will_archive_in': event.get('will_archive_in', 300),  # 5 minutes
                'timestamp': event.get('timestamp')
            }))
        except Exception as e:
            logger.error(f"Error sending session_completed: {e}")
    
    async def table_released(self, event):
        """
        🆕 Handler pour notification de libération de table
        Appelé par notify_table_released()
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'table_released',
                'table_id': event.get('table_id'),
                'table_number': event.get('table_number'),
                'message': event.get('message'),
                'timestamp': event.get('timestamp')
            }))
        except Exception as e:
            logger.error(f"Error sending table_released: {e}")

    async def split_payment_initiated(self, event):
        """
        Handler pour notification de paiement divisé initié par l'hôte.
        Redirige tous les membres de la session vers leur page de paiement.
        Appelé par notify_split_payment_initiated().
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'split_payment_initiated',
                'order_id': event.get('order_id'),
                'session_id': event.get('session_id'),
                'portions_count': event.get('portions_count'),
                'total_amount': event.get('total_amount'),
                'timestamp': event.get('timestamp'),
            }))
        except Exception as e:
            logger.error(f"Error sending split_payment_initiated: {e}")
    
    async def participant_update(self, event):
        """
        Handler pour mises à jour de participants
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'participant_update',
                'session_id': event.get('session_id'),
                'participant_id': event.get('participant_id'),
                'action': event.get('action'),  # joined, left, approved, etc.
                'timestamp': event.get('timestamp')
            }))
        except Exception as e:
            logger.error(f"Error sending participant update: {e}")
    
    async def participant_joined(self, event):
        """Handler pour participant qui rejoint"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'participant_joined',
                'participant': event.get('participant'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending participant_joined: {e}")
    
    async def participant_left(self, event):
        """Handler pour participant qui part"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'participant_left',
                'participant_id': event.get('participant_id'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending participant_left: {e}")
    
    async def participant_approved(self, event):
        """Handler pour participant approuvé"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'participant_approved',
                'participant': event.get('participant'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending participant_approved: {e}")
    
    async def order_created(self, event):
        """Handler pour commande créée"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'order_created',
                'order': event.get('order'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending order_created: {e}")
    
    async def order_updated(self, event):
        """Handler pour commande mise à jour"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'order_updated',
                'order': event.get('order'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending order_updated: {e}")
    
    async def session_locked(self, event):
        """Handler pour session verrouillée"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'session_locked',
                'locked_by': event.get('locked_by'),
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending session_locked: {e}")
    
    async def session_unlocked(self, event):
        """Handler pour session déverrouillée"""
        try:
            await self.send(text_data=json.dumps({
                'type': 'session_unlocked',
                'timestamp': time.time()
            }))
        except Exception as e:
            logger.error(f"Error sending session_unlocked: {e}")

    # ==================== HANDLERS POUR ÉVÉNEMENTS SESSION PANIER ====================

    async def cart_updated(self, event):
        """
        Reçoit un événement 'cart_updated' depuis le channel layer
        et le propage à tous les clients WebSocket connectés.
        """
        try:
            await self.send(text_data=json.dumps({
                'type': 'cart_update',
                'items': event.get('items', []),
                'total': event.get('total', 0),
                'items_count': event.get('items_count', 0),
                'timestamp': time.time(),
            }))
        except Exception as e:
            logger.warning(f"cart_updated: impossible d'envoyer au client: {e}")


    async def send_cart_state(self):
        """
        Envoie l'état actuel du panier de la session au client qui vient
        de se connecter (appelé depuis connect()).
        """
        if not getattr(self, 'session_id', None):
            return
        try:
            items, total, count = await self._get_cart_data()
            await self.send(text_data=json.dumps({
                'type': 'cart_state',
                'items': items,
                'total': total,
                'items_count': count,
                'timestamp': time.time(),
            }))
        except Exception as e:
            logger.error(f"Error sending cart state: {e}")


    @database_sync_to_async
    def _get_cart_data(self):
        """Récupère les données du panier depuis la base."""
        import json as _json
        from api.models import SessionCartItem
        from api.serializers.collaborative_session_serializers import SessionCartItemSerializer

        items = SessionCartItem.objects.filter(
            session_id=self.session_id
        ).select_related('participant', 'participant__user', 'menu_item')

        serializer = SessionCartItemSerializer(items, many=True)
        # Convertir UUID/Decimal/datetime en types JSON natifs via round-trip
        items_data = _json.loads(_json.dumps(list(serializer.data), default=str))
        total = float(sum(float(item.get('total_price', 0)) for item in items_data))
        count = sum(int(item.get('quantity', 0)) for item in items_data)
        return items_data, total, count
    
    # ==================== HELPERS ====================
    
    @database_sync_to_async
    def check_session_exists(self, session_id):
        """Vérifier qu'une session existe"""
        try:
            from api.models import CollaborativeTableSession
            # Utiliser all_objects pour accéder même aux sessions archivées
            return CollaborativeTableSession.all_objects.filter(id=session_id).exists()
        except Exception as e:
            logger.error(f"Error checking session: {e}")
            return False
    
    @database_sync_to_async
    def get_session_data(self):
        """Récupérer les données de la session"""
        try:
            from api.models import CollaborativeTableSession
            session = CollaborativeTableSession.all_objects.get(id=self.session_id)
            return {
                'id': str(session.id),
                'share_code': session.share_code,
                'status': session.status,
                'is_archived': session.is_archived,
                'participant_count': session.participant_count,
                'table_number': session.table_number,
            }
        except Exception as e:
            logger.error(f"Error getting session data: {e}")
            return None
    
    async def send_session_status(self):
        """Envoyer le statut actuel de la session"""
        try:
            session_data = await self.get_session_data()
            if session_data:
                await self.send(text_data=json.dumps({
                    'type': 'session_status',
                    'session': session_data,
                    'timestamp': time.time()
                }))
        except Exception as e:
            logger.error(f"Error sending session status: {e}")


# ==================== FONCTIONS UTILITAIRES POUR NOTIFICATIONS ====================

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def notify_order_update(order_id, status, data=None):
    """Envoie une notification de mise à jour de commande"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'order_{order_id}',
        {
            'type': 'order_update',
            'order_id': order_id,
            'status': status,
            'timestamp': time.time(),
            'data': data or {}
        }
    )


def notify_session_update(session_id, data):
    """Envoie une notification de mise à jour de session"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_update',
            'session_id': str(session_id),
            'event': data.get('event', 'update'),
            'actor': data.get('actor'),
            'timestamp': timezone.now().isoformat(),
            'data': data.get('data', {})
        }
    )


def notify_participant_joined(session_id, participant_data):
    """Notifie qu'un participant a rejoint"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'participant_joined',
            'participant': participant_data
        }
    )


def notify_participant_left(session_id, participant_id):
    """Notifie qu'un participant est parti"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'participant_left',
            'participant_id': str(participant_id)
        }
    )


def notify_participant_approved(session_id, participant_data):
    """Notifie qu'un participant a été approuvé"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'participant_approved',
            'participant': participant_data
        }
    )


def notify_session_order_created(session_id, order_data):
    """Notifie qu'une commande a été créée dans la session"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'order_created',
            'order': order_data
        }
    )


def notify_session_order_updated(session_id, order_data):
    """Notifie qu'une commande a été mise à jour dans la session"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'order_updated',
            'order': order_data
        }
    )


def notify_session_locked(session_id, locked_by=None):
    """Notifie que la session a été verrouillée"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_locked',
            'locked_by': locked_by
        }
    )


def notify_session_unlocked(session_id):
    """Notifie que la session a été déverrouillée"""
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_unlocked'
        }
    )


def notify_session_completed(session_id):
    """
    Notifie que la session est terminée
    (archivage automatique dans 5 minutes)
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_completed',
            'session_id': str(session_id),
            'message': 'Session terminée - archivage automatique dans 5 minutes',
            'will_archive_in': 300,  # secondes
            'timestamp': timezone.now().isoformat()
        }
    )


def notify_session_archived(session_id, reason=None):
    """
    🆕 Notifie que une session a été archivée
    
    Args:
        session_id: UUID de la session archivée
        reason: Raison de l'archivage (optionnel)
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    try:
        async_to_sync(channel_layer.group_send)(
            f'session_{session_id}',
            {
                'type': 'session_archived',
                'session_id': str(session_id),
                'message': 'Cette session a été archivée et la table est maintenant disponible',
                'reason': reason or 'Session terminée',
                'timestamp': timezone.now().isoformat()
            }
        )
        logger.info(f"✅ Notification archivage envoyée pour session {session_id}")
    except Exception as e:
        logger.error(f"❌ Erreur notification archivage: {e}")


def notify_table_released(table_id, table_number, restaurant_id):
    """
    🆕 Notifie que une table a été libérée
    
    Args:
        table_id: UUID de la table
        table_number: Numéro de la table
        restaurant_id: ID du restaurant
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return
    
    try:
        # Envoyer au groupe du restaurant
        async_to_sync(channel_layer.group_send)(
            f'restaurant_{restaurant_id}',
            {
                'type': 'table_released',
                'table_id': str(table_id),
                'table_number': table_number,
                'message': f'Table {table_number} libérée',
                'timestamp': timezone.now().isoformat()
            }
        )
        logger.info(f"✅ Notification libération table {table_number}")
    except Exception as e:
        logger.error(f"❌ Erreur notification table: {e}")


def notify_split_payment_initiated(session_id, order_id, portions_count, total_amount):
    """
    Notifie tous les membres d'une session collaborative que l'hôte
    a initié un paiement divisé — les membres doivent payer leur part.
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("Channel layer not available")
        return

    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'split_payment_initiated',
            'order_id': str(order_id),
            'session_id': str(session_id),
            'portions_count': portions_count,
            'total_amount': str(total_amount),
            'timestamp': timezone.now().isoformat(),
        }
    )