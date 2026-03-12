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

# ── Ticket SSE à usage unique ─────────────────────────────────────────────────
# EventSource (browser) ne peut pas envoyer de header Authorization.
# Passer le JWT en query param exposerait le token dans les logs nginx,
# l'historique navigateur et les outils de debug réseau.
#
# Solution : ticket court-vivant (UUID, 30 s, usage unique).
#   1. Le client POST /orders/sse-ticket/ avec son JWT en header → reçoit un ticket UUID.
#   2. Le client ouvre EventSource sur /orders/status-stream/?ticket=<uuid>.
#   3. order_status_stream échange le ticket contre l'identité, l'invalide immédiatement.
#      Le JWT ne touche jamais une URL.

SSE_TICKET_TTL = 30  # secondes — suffisant pour ouvrir l'EventSource

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_sse_ticket(request):
    """
    Génère un ticket SSE à usage unique (valable {TTL} s).

    Le client doit fournir la liste des order_ids qu'il souhaite écouter.
    Le ticket est stocké dans le cache Redis avec le user_id et la liste validée.

    Requête : { "order_ids": [1, 2, 3] }
    Réponse : { "ticket": "<uuid>" }
    """
    import uuid
    from django.core.cache import cache

    order_ids_raw = request.data.get("order_ids", [])
    if not isinstance(order_ids_raw, list) or not order_ids_raw:
        return Response({"error": "order_ids doit être une liste non vide"}, status=400)

    try:
        order_ids = [int(i) for i in order_ids_raw]
    except (ValueError, TypeError):
        return Response({"error": "order_ids invalides"}, status=400)

    # Vérifier l'accès dès la création du ticket — pas au moment du stream.
    accessible = get_user_accessible_orders(request.user, order_ids)
    if not accessible:
        return Response({"error": "Aucune commande accessible"}, status=403)

    ticket = str(uuid.uuid4())
    cache.set(
        f"sse_ticket:{ticket}",
        {"user_id": request.user.id, "order_ids": accessible},
        timeout=SSE_TICKET_TTL,
    )
    logger.info("SSE ticket créé pour user_id=%s orders=%s", request.user.id, accessible)
    return Response({"ticket": ticket})


def _redeem_sse_ticket(ticket: str):
    """
    Échange un ticket SSE contre (user, order_ids) et l'invalide immédiatement
    (usage unique — delete-on-read).

    Retourne (None, None) si le ticket est absent, expiré ou déjà consommé.
    """
    from django.core.cache import cache

    key = f"sse_ticket:{ticket}"
    data = cache.get(key)
    if not data:
        return None, None

    cache.delete(key)  # Usage unique — invalider avant tout traitement

    user_id = data.get("user_id")
    order_ids = data.get("order_ids", [])

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None, None

    return user, order_ids


@api_view(['GET'])
@permission_classes([])  # Auth via ticket SSE (voir _redeem_sse_ticket)
def order_status_stream(request):
    """
    Endpoint SSE pour les mises à jour de commandes.

    Authentification via ticket à usage unique obtenu depuis POST /orders/sse-ticket/.
    Le ticket est passé en query param (?ticket=<uuid>) — durée de vie 30 s,
    invalide après la première connexion.
    """
    try:
        # 1. Authentification par ticket SSE (usage unique)
        ticket = request.GET.get("ticket", "").strip()
        if not ticket:
            return JsonResponse({"error": "Paramètre ticket requis"}, status=401)

        user, accessible_orders = _redeem_sse_ticket(ticket)
        if not user:
            return JsonResponse({"error": "Ticket invalide ou expiré"}, status=401)

        if not accessible_orders:
            return JsonResponse({"error": "Aucune commande accessible"}, status=403)
        
        # 2. Créer le stream SSE
        # (order_ids et autorisation déjà vérifiés lors de la création du ticket)
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
    """
    Vérifie l'accès utilisateur aux commandes demandées.

    Deux chemins légitimes (OR) :
    - Client authentifié : order.user == user
    - Restaurateur      : order.restaurant.owner == user.restaurateur_profile

    Toute commande qui ne satisfait ni l'un ni l'autre est silencieusement
    exclue du résultat — l'appelant recevra un 403 si la liste est vide.
    """
    from django.db.models import Q
    from api.models import Order

    try:
        ownership_filter = Q(user=user)

        # Ajouter le chemin restaurateur uniquement si le profil existe,
        # pour ne pas lever d'exception sur un utilisateur sans profil.
        try:
            profile = user.restaurateur_profile
            ownership_filter |= Q(restaurant__owner=profile)
        except Exception:
            pass  # Utilisateur sans profil restaurateur — seul le chemin client s'applique

        accessible = (
            Order.objects
            .filter(Q(id__in=order_ids) & ownership_filter)
            .values_list('id', flat=True)
        )
        return list(accessible)

    except Exception:
        logger.exception("Erreur lors de la vérification d'accès aux commandes SSE")
        return []

def get_orders_initial_status(order_ids):
    """
    Récupère le statut initial des commandes pour l'envoi SSE de connexion.

    `waiting_time` n'est pas un champ du modèle Order — c'est la méthode
    `get_table_waiting_time()`. On récupère donc les objets complets pour
    pouvoir appeler la méthode, puis on sérialise manuellement.
    """
    from api.models import Order

    try:
        orders = Order.objects.filter(id__in=order_ids).select_related("restaurant")
        result = []
        for order in orders:
            try:
                waiting_time = order.get_table_waiting_time()
            except Exception:
                waiting_time = None
            result.append({
                "id": order.id,
                "status": order.status,
                "waiting_time": waiting_time,
                "updated_at": order.updated_at.isoformat() if order.updated_at else None,
            })
        return result
    except Exception:
        logger.exception("Erreur get_orders_initial_status pour order_ids=%s", order_ids)
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
        logger.exception("Erreur récupération statut WebSocket")
        return Response({
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
        logger.exception("Erreur test_notification")
        return Response({'error': 'Erreur lors de l\'envoi de la notification de test.'}, status=500)