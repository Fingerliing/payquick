"""
Notifications WebSocket du plan de salle.

Module autonome (pas de dépendance à websocket_notifications.py) — importable
depuis les vues, le webhook Stripe, les tâches Celery et les signaux.

Usage :
    from api.utils.floorplan_notifications import notify_floorplan_update
    notify_floorplan_update(restaurant_id, event='table_occupied', table_id=table.id)

Fire-and-forget : ne lève JAMAIS — un échec de broadcast (Redis down, channel
layer absent en tests) ne doit jamais faire échouer un paiement, un check-in
ou une tâche Celery. L'erreur est loggée, le client se rattrapera au prochain
polling de secours.

Événements émis dans le code :
    reservation_created / reservation_confirmed / reservation_cancelled
    reservation_seated / reservation_no_show / reservation_reassigned
    kitchen_fired
    table_occupied / table_released / table_extended
    layout_changed / order_activity
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

logger = logging.getLogger(__name__)


def notify_floorplan_update(restaurant_id, event='update', table_id=None):
    """Pousse un événement léger au groupe floorplan_{restaurant_id}.

    Le payload ne contient AUCUNE donnée métier : le client refait un
    GET /floor-plan/ (débounce). Simple, toujours cohérent.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"floorplan_{restaurant_id}",
            {
                'type': 'floorplan.update',
                'event': event,
                'table_id': str(table_id) if table_id else None,
                'timestamp': timezone.now().isoformat(),
            },
        )
    except Exception as e:
        logger.warning(
            "Broadcast floorplan échoué (restaurant %s, event %s): %s",
            restaurant_id, event, e,
        )
