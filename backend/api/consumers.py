import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken
from django.conf import settings
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
    """
    
    async def connect(self):
        """Connexion au WebSocket de session"""
        try:
            # Récupérer l'ID de session depuis l'URL
            self.session_id = self.scope['url_route']['kwargs']['session_id']
            self.session_group_name = f'session_{self.session_id}'
            
            # Token optionnel (pour les utilisateurs authentifiés)
            query_string = self.scope.get('query_string', b'').decode()
            query_params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            token = query_params.get('token')
            
            # Authentifier si token présent
            if token:
                self.user = await self.authenticate_connection(token)
            else:
                self.user = None
            
            # Vérifier que la session existe et qu'on peut y accéder
            can_access = await self.check_session_access()
            
            if not can_access:
                logger.warning(f"SessionWS: Access denied to session {self.session_id}")
                await self.close(code=4007)
                return
            
            # Rejoindre le groupe de la session
            await self.channel_layer.group_add(
                self.session_group_name,
                self.channel_name
            )
            
            await self.accept()
            
            # Envoyer l'état initial de la session
            await self.send_session_state()
            
            # Confirmer la connexion
            await self.send(text_data=json.dumps({
                'type': 'connected',
                'message': 'Session WebSocket connected',
                'session_id': self.session_id,
                'timestamp': time.time()
            }))
            
            logger.info(f"SessionWS connected: session {self.session_id}, user {getattr(self.user, 'id', 'guest')}")
            
        except Exception as e:
            logger.error(f"SessionWS connection error: {e}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """Déconnexion du WebSocket"""
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
        """Réception d'un message du client"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': time.time()
                }))
            
            elif message_type == 'request_update':
                await self.send_session_state()
            
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    # Handlers pour les événements envoyés au groupe
    
    async def session_update(self, event):
        """Mise à jour de session"""
        await self.send(text_data=json.dumps({
            'type': 'session_update',
            'data': event['data'],
            'timestamp': time.time()
        }))
    
    async def participant_joined(self, event):
        """Notification qu'un participant a rejoint"""
        await self.send(text_data=json.dumps({
            'type': 'participant_joined',
            'participant': event['participant'],
            'timestamp': time.time()
        }))
    
    async def participant_left(self, event):
        """Notification qu'un participant est parti"""
        await self.send(text_data=json.dumps({
            'type': 'participant_left',
            'participant_id': event['participant_id'],
            'timestamp': time.time()
        }))
    
    async def participant_approved(self, event):
        """Notification qu'un participant a été approuvé"""
        await self.send(text_data=json.dumps({
            'type': 'participant_approved',
            'participant': event['participant'],
            'timestamp': time.time()
        }))
    
    async def order_created(self, event):
        """Notification de nouvelle commande dans la session"""
        await self.send(text_data=json.dumps({
            'type': 'order_created',
            'order': event['order'],
            'timestamp': time.time()
        }))
    
    async def order_updated(self, event):
        """Notification de mise à jour de commande"""
        await self.send(text_data=json.dumps({
            'type': 'order_updated',
            'order': event['order'],
            'timestamp': time.time()
        }))
    
    async def session_locked(self, event):
        """Notification de verrouillage de session"""
        await self.send(text_data=json.dumps({
            'type': 'session_locked',
            'locked_by': event.get('locked_by'),
            'timestamp': time.time()
        }))
    
    async def session_unlocked(self, event):
        """Notification de déverrouillage de session"""
        await self.send(text_data=json.dumps({
            'type': 'session_unlocked',
            'timestamp': time.time()
        }))
    
    async def session_completed(self, event):
        """Notification de fin de session"""
        await self.send(text_data=json.dumps({
            'type': 'session_completed',
            'timestamp': time.time()
        }))
    
    @database_sync_to_async
    def check_session_access(self):
        """Vérifie si l'utilisateur peut accéder à cette session"""
        try:
            from api.models import CollaborativeTableSession, SessionParticipant
            
            session = CollaborativeTableSession.objects.get(id=self.session_id)
            
            # Les sessions actives sont accessibles à tous
            if session.status in ['active', 'locked']:
                return True
            
            # Pour les sessions terminées, vérifier qu'on était participant
            if self.user:
                return SessionParticipant.objects.filter(
                    session=session,
                    user=self.user
                ).exists()
            
            return False
            
        except CollaborativeTableSession.DoesNotExist:
            return False
        except Exception as e:
            logger.error(f"Error checking session access: {e}")
            return False
    
    @database_sync_to_async
    def get_session_data(self):
        """Récupère les données complètes de la session"""
        try:
            from api.models import CollaborativeTableSession
            from api.serializers.collaborative_session_serializers import (
                CollaborativeSessionSerializer
            )
            
            session = CollaborativeTableSession.objects.select_related(
                'restaurant', 'table'
            ).prefetch_related(
                'participants', 'orders'
            ).get(id=self.session_id)
            
            serializer = CollaborativeSessionSerializer(session)
            return serializer.data
            
        except Exception as e:
            logger.error(f"Error getting session data: {e}")
            return None
    
    async def send_session_state(self):
        """Envoie l'état complet de la session"""
        try:
            session_data = await self.get_session_data()
            if session_data:
                await self.send(text_data=json.dumps({
                    'type': 'session_state',
                    'data': session_data,
                    'timestamp': time.time()
                }))
        except Exception as e:
            logger.error(f"Error sending session state: {e}")


# Fonctions utilitaires pour envoyer des notifications

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def notify_order_update(order_id, status, data=None):
    """Envoie une notification de mise à jour de commande"""
    channel_layer = get_channel_layer()
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
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_update',
            'data': data
        }
    )


def notify_participant_joined(session_id, participant_data):
    """Notifie qu'un participant a rejoint"""
    channel_layer = get_channel_layer()
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
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_unlocked'
        }
    )


def notify_session_completed(session_id):
    """Notifie que la session est terminée"""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'session_{session_id}',
        {
            'type': 'session_completed'
        }
    )