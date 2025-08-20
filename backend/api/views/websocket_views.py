from django.http import StreamingHttpResponse, JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import UntypedToken
from django.contrib.auth import get_user_model
from django.conf import settings
import json
import time
import queue
import threading
import logging
import jwt

logger = logging.getLogger(__name__)
User = get_user_model()

# Gestionnaire global des connexions SSE
class SSEConnectionManager:
    """Gestionnaire simple des connexions SSE"""
    
    def __init__(self):
        self.connections = {}  # {connection_id: {'user_id': int, 'order_ids': set, 'queue': Queue}}
        self.lock = threading.Lock()
    
    def add_connection(self, connection_id, user_id, order_ids):
        """Ajouter une connexion SSE"""
        with self.lock:
            self.connections[connection_id] = {
                'user_id': user_id,
                'order_ids': set(order_ids),
                'queue': queue.Queue(),
                'created_at': time.time()
            }
    
    def remove_connection(self, connection_id):
        """Supprimer une connexion SSE"""
        with self.lock:
            self.connections.pop(connection_id, None)
    
    def broadcast_to_order(self, order_id, message):
        """Diffuser un message à toutes les connexions intéressées par cette commande"""
        with self.lock:
            for conn_id, conn_data in self.connections.items():
                if order_id in conn_data['order_ids']:
                    try:
                        conn_data['queue'].put(message, timeout=1)
                    except queue.Full:
                        logger.warning(f"Queue full for SSE connection {conn_id}")
    
    def get_connection_count(self):
        """Obtenir le nombre de connexions actives"""
        with self.lock:
            return len(self.connections)

# Instance globale
sse_manager = SSEConnectionManager()

def authenticate_user_from_token(token):
    """Authentifier un utilisateur depuis un token JWT"""
    try:
        UntypedToken(token)  # Valider avec rest_framework_simplejwt
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = decoded.get("user_id")
        
        if not user_id:
            return None
            
        user = User.objects.get(id=user_id)
        return user
        
    except (InvalidToken, jwt.InvalidTokenError, User.DoesNotExist):
        return None

@api_view(['GET'])
def order_status_stream(request):
    """
    Endpoint SSE pour les mises à jour de commandes
    Supporte l'authentification via token URL ou header
    """
    try:
        # 1. Authentification - support token URL et header
        user = None
        
        # Essayer le token depuis l'URL (pour EventSource)
        token = request.GET.get('token')
        if token:
            user = authenticate_user_from_token(token)
        
        # Fallback vers l'authentification standard (header Authorization)
        if not user and request.user.is_authenticated:
            user = request.user
        
        if not user:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        
        # 2. Extraire les IDs des commandes
        order_ids_param = request.GET.get('orders', '')
        if not order_ids_param:
            return JsonResponse({'error': 'Parameter "orders" is required'}, status=400)
        
        try:
            order_ids = [int(id.strip()) for id in order_ids_param.split(',') if id.strip()]
        except ValueError:
            return JsonResponse({'error': 'Invalid order IDs format'}, status=400)
        
        if not order_ids:
            return JsonResponse({'error': 'No valid order IDs provided'}, status=400)
        
        # 3. Vérifier l'accès aux commandes
        accessible_orders = get_user_accessible_orders(user, order_ids)
        if not accessible_orders:
            return JsonResponse({'error': 'No accessible orders'}, status=403)
        
        # 4. Créer le stream SSE
        response = StreamingHttpResponse(
            event_stream_generator(user.id, accessible_orders),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['Connection'] = 'keep-alive'
        response['X-Accel-Buffering'] = 'no'  # Pour Nginx
        response['Access-Control-Allow-Origin'] = '*'  # Pour CORS
        response['Access-Control-Allow-Headers'] = 'Cache-Control'
        
        return response
        
    except Exception as e:
        logger.error(f"SSE endpoint error: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

def event_stream_generator(user_id, order_ids):
    """Générateur pour le stream SSE"""
    connection_id = f"sse_{user_id}_{int(time.time())}"
    
    try:
        # Enregistrer la connexion
        sse_manager.add_connection(connection_id, user_id, order_ids)
        
        # Envoyer les statuts initiaux
        initial_statuses = get_orders_initial_status(order_ids)
        for status_data in initial_statuses:
            yield format_sse_message({
                'type': 'initial_status',
                'order_id': status_data['id'],
                'status': status_data.get('status'),
                'waiting_time': status_data.get('waiting_time'),
                'timestamp': time.time()
            })
        
        # Confirmer la connexion
        yield format_sse_message({
            'type': 'connected',
            'message': 'SSE connection established',
            'order_ids': order_ids
        })
        
        # Boucle d'écoute
        connection = sse_manager.connections.get(connection_id)
        if connection:
            while True:
                try:
                    # Attendre un message avec timeout
                    message = connection['queue'].get(timeout=30)
                    yield format_sse_message(message)
                except queue.Empty:
                    # Envoyer un ping pour maintenir la connexion
                    yield format_sse_message({
                        'type': 'ping',
                        'timestamp': time.time()
                    })
                
    except GeneratorExit:
        logger.info(f"SSE connection {connection_id} closed")
    except Exception as e:
        logger.error(f"SSE stream error for {connection_id}: {e}")
    finally:
        sse_manager.remove_connection(connection_id)

def format_sse_message(data):
    """Formater un message SSE"""
    return f"data: {json.dumps(data)}\n\n"

def get_user_accessible_orders(user, order_ids):
    """Vérifier l'accès utilisateur aux commandes - ADAPTEZ selon votre modèle"""
    try:
        # Importez votre modèle Order
        from api.models import Order  # Ajustez selon votre structure
        
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

def get_orders_initial_status(order_ids):
    """Récupérer le statut initial des commandes"""
    try:
        from api.models import Order  # Ajustez selon votre structure
        
        orders = Order.objects.filter(id__in=order_ids).values(
            'id', 'status', 'waiting_time', 'updated_at'
        )
        return list(orders)
    except Exception as e:
        logger.error(f"Error getting initial status: {e}")
        return []

# Fonction pour intégrer SSE avec les signaux
def broadcast_to_sse(order_id, message):
    """Diffuser un message via SSE (appelé depuis signals.py)"""
    sse_manager.broadcast_to_order(order_id, message)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def websocket_status(request):
    """Endpoint pour vérifier l'état du système temps réel"""
    try:
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        
        return Response({
            'websocket_enabled': channel_layer is not None,
            'sse_connections': sse_manager.get_connection_count(),
            'channels_backend': str(type(channel_layer)) if channel_layer else None
        })
    except Exception as e:
        return Response({
            'error': str(e),
            'websocket_enabled': False,
            'sse_connections': sse_manager.get_connection_count()
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_notification(request):
    """Endpoint pour tester les notifications (développement uniquement)"""
    if not getattr(settings, 'DEBUG', False):
        return Response({'error': 'Only available in debug mode'}, status=403)
    
    order_id = request.data.get('order_id')
    message = request.data.get('message', 'Test notification')
    
    if not order_id:
        return Response({'error': 'order_id is required'}, status=400)
    
    try:
        from api.signals import notify_order_update
        
        success = notify_order_update(
            order_id=order_id,
            status='test',
            data={'message': message, 'test': True}
        )
        
        return Response({
            'success': success,
            'message': f'Test notification sent for order {order_id}'
        })
    except Exception as e:
        return Response({'error': str(e)}, status=500)