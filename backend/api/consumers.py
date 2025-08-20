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

class OrderConsumer(AsyncWebsocketConsumer):
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
            user = await self.authenticate_user(token)
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
            
            logger.info(f"WebSocket connected: user {user.id}, orders {self.order_ids}")
            
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """Gérer la déconnexion WebSocket"""
        try:
            if hasattr(self, 'order_ids'):
                # Quitter tous les groupes
                for order_id in self.order_ids:
                    group_name = f"order_{order_id}"
                    await self.channel_layer.group_discard(group_name, self.channel_name)
                
                logger.info(f"WebSocket disconnected: user {getattr(self, 'user', {}).get('id', 'unknown')}, code {close_code}")
        except Exception as e:
            logger.error(f"WebSocket disconnect error: {e}")
    
    async def receive(self, text_data):
        """Gérer les messages reçus du client"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                # Répondre au ping
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
            # Vérifier que cette commande concerne ce client
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
    def authenticate_user(self, token):
        """Authentifier un utilisateur depuis un token JWT"""
        try:
            # Valider avec rest_framework_simplejwt
            UntypedToken(token)
            decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = decoded.get("user_id")
            
            if not user_id:
                return None
                
            user = User.objects.get(id=user_id)
            return user
            
        except (InvalidToken, jwt.InvalidTokenError, User.DoesNotExist) as e:
            logger.warning(f"Authentication failed: {e}")
            return None
    
    @database_sync_to_async
    def get_user_accessible_orders(self, user, order_ids):
        """Vérifier l'accès utilisateur aux commandes"""
        try:
            from api.models import Order
            
            # Logique d'autorisation selon votre business logic
            # Exemple : filtrer selon le type d'utilisateur
            accessible = Order.objects.filter(
                id__in=order_ids,
                # Ajustez selon vos règles :
                # customer=user,  # Si c'est un client
                # restaurant__owner=user,  # Si c'est un restaurateur
            ).values_list('id', flat=True)
            
            return list(accessible)
        except Exception as e:
            logger.error(f"Error checking order access: {e}")
            return []
    
    @database_sync_to_async
    def get_orders_initial_status(self):
        """Récupérer le statut initial des commandes"""
        try:
            from api.models import Order
            
            orders = Order.objects.filter(id__in=self.order_ids).values(
                'id', 'status', 'waiting_time', 'updated_at'
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
                    'waiting_time': status_data.get('waiting_time'),
                    'timestamp': time.time()
                }))
        except Exception as e:
            logger.error(f"Error sending initial statuses: {e}")