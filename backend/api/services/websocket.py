class WebSocketNotificationService:
    """Service pour gérer les notifications WebSocket"""
    
    @staticmethod
    def notify_order_change(order):
        """Notifier un changement de commande"""
        from api.consumers import notify_order_update, notify_session_order_updated
        from api.serializers import OrderSerializer
        
        # Notification standard
        notify_order_update(
            order.id,
            order.status,
            {
                'order_number': order.order_number,
                'total_amount': float(order.total_amount)
            }
        )
        
        # Notification session si applicable
        if order.collaborative_session:
            order_data = OrderSerializer(order).data
            notify_session_order_updated(
                str(order.collaborative_session_id),
                order_data
            )
    
    @staticmethod
    def notify_session_change(session, change_type, **kwargs):
        """Notifier un changement de session"""
        from api.consumers import (
            notify_session_locked,
            notify_session_unlocked,
            notify_session_completed,
            notify_session_update
        )
        
        if change_type == 'lock':
            notify_session_locked(str(session.id), kwargs.get('locked_by'))
        elif change_type == 'unlock':
            notify_session_unlocked(str(session.id))
        elif change_type == 'complete':
            notify_session_completed(str(session.id))
        elif change_type == 'update':
            notify_session_update(str(session.id), kwargs.get('data', {}))
    
    @staticmethod
    def notify_participant_change(session_id, participant, change_type):
        """Notifier un changement de participant"""
        from api.consumers import (
            notify_participant_joined,
            notify_participant_left,
            notify_participant_approved
        )
        from api.serializers.collaborative_session_serializers import (
            SessionParticipantSerializer
        )
        
        participant_data = SessionParticipantSerializer(participant).data
        
        if change_type == 'join':
            notify_participant_joined(str(session_id), participant_data)
        elif change_type == 'leave':
            notify_participant_left(str(session_id), str(participant.id))
        elif change_type == 'approve':
            notify_participant_approved(str(session_id), participant_data)