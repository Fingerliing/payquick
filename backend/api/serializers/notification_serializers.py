"""
Serializers pour les notifications push EatQuickeR
"""

from rest_framework import serializers
from api.models import (
    PushNotificationToken,
    NotificationPreferences,
    Notification
)


class PushTokenSerializer(serializers.ModelSerializer):
    """Serializer pour les tokens push"""
    
    class Meta:
        model = PushNotificationToken
        fields = [
            'id',
            'expo_token',
            'device_id',
            'device_name',
            'device_platform',
            'is_active',
            'created_at',
            'last_used_at'
        ]
        read_only_fields = ['id', 'created_at', 'last_used_at']


class RegisterTokenSerializer(serializers.Serializer):
    """Serializer pour l'enregistrement d'un token push"""
    
    expo_token = serializers.CharField(
        max_length=255,
        help_text="Token Expo Push (format: ExponentPushToken[xxx])"
    )
    device_id = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        help_text="Identifiant unique de l'appareil"
    )
    device_name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        help_text="Nom de l'appareil"
    )
    device_platform = serializers.ChoiceField(
        choices=['ios', 'android', 'web'],
        default='android',
        help_text="Plateforme de l'appareil"
    )
    guest_phone = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        help_text="Numéro de téléphone pour les invités"
    )
    
    def validate_expo_token(self, value):
        """Valider le format du token Expo"""
        if not value:
            raise serializers.ValidationError("Token requis")
        
        if not (value.startswith("ExponentPushToken[") or value.startswith("ExpoPushToken[")):
            raise serializers.ValidationError(
                "Format de token invalide. Attendu: ExponentPushToken[xxx] ou ExpoPushToken[xxx]"
            )
        
        return value


class NotificationPreferencesSerializer(serializers.ModelSerializer):
    """Serializer pour les préférences de notification"""
    
    class Meta:
        model = NotificationPreferences
        fields = [
            'order_updates',
            'order_ready',
            'payment_received',
            'new_orders',
            'promotions',
            'quiet_hours_enabled',
            'quiet_hours_start',
            'quiet_hours_end',
            'sound_enabled',
            'vibration_enabled',
            'updated_at'
        ]
        read_only_fields = ['updated_at']
    
    def validate(self, data):
        """Valider les heures silencieuses"""
        quiet_enabled = data.get('quiet_hours_enabled', self.instance.quiet_hours_enabled if self.instance else False)
        
        if quiet_enabled:
            start = data.get('quiet_hours_start', self.instance.quiet_hours_start if self.instance else None)
            end = data.get('quiet_hours_end', self.instance.quiet_hours_end if self.instance else None)
            
            if not start or not end:
                raise serializers.ValidationError({
                    'quiet_hours': 'Les heures de début et de fin sont requises quand les heures silencieuses sont activées'
                })
        
        return data


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer pour une notification"""
    
    type_display = serializers.SerializerMethodField()
    priority_display = serializers.SerializerMethodField()
    time_ago = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'notification_type',
            'type_display',
            'title',
            'body',
            'data',
            'priority',
            'priority_display',
            'is_read',
            'read_at',
            'order_id',
            'restaurant_id',
            'created_at',
            'time_ago'
        ]
        read_only_fields = fields
    
    def get_type_display(self, obj):
        """Obtenir le libellé du type"""
        return dict(Notification.NOTIFICATION_TYPES).get(obj.notification_type, obj.notification_type)
    
    def get_priority_display(self, obj):
        """Obtenir le libellé de la priorité"""
        return dict(Notification.PRIORITY_CHOICES).get(obj.priority, obj.priority)
    
    def get_time_ago(self, obj):
        """Calculer le temps écoulé"""
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        diff = now - obj.created_at
        
        if diff < timedelta(minutes=1):
            return "À l'instant"
        elif diff < timedelta(hours=1):
            minutes = int(diff.total_seconds() / 60)
            return f"Il y a {minutes} min"
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            return f"Il y a {hours}h"
        elif diff < timedelta(days=7):
            days = diff.days
            return f"Il y a {days} jour{'s' if days > 1 else ''}"
        else:
            return obj.created_at.strftime("%d/%m/%Y")


class NotificationListSerializer(serializers.Serializer):
    """Serializer pour la liste paginée de notifications"""
    
    results = NotificationSerializer(many=True)
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()


class UnreadCountSerializer(serializers.Serializer):
    """Serializer pour le compteur de non lues"""
    
    unread_count = serializers.IntegerField()


class NotificationActionSerializer(serializers.Serializer):
    """Serializer pour les actions sur les notifications"""
    
    notification_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text="Liste des IDs de notifications (optionnel pour marquer tout)"
    )
    action = serializers.ChoiceField(
        choices=['mark_read', 'mark_unread', 'delete'],
        help_text="Action à effectuer"
    )


# =============================================================================
# SERIALIZERS POUR LES WEBHOOKS ET ÉVÉNEMENTS
# =============================================================================

class OrderNotificationDataSerializer(serializers.Serializer):
    """Données de notification pour une commande"""
    
    order_id = serializers.IntegerField()
    order_number = serializers.CharField(required=False)
    status = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    restaurant_name = serializers.CharField(required=False)
    table_number = serializers.CharField(required=False)
    action = serializers.CharField(required=False)
    screen = serializers.CharField(required=False)


class SessionNotificationDataSerializer(serializers.Serializer):
    """Données de notification pour une session collaborative"""
    
    session_id = serializers.UUIDField()
    participant_name = serializers.CharField(required=False)
    participant_count = serializers.IntegerField(required=False)
    action = serializers.CharField(required=False)


class PaymentNotificationDataSerializer(serializers.Serializer):
    """Données de notification pour un paiement"""
    
    order_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_method = serializers.CharField(required=False)
    portions_paid = serializers.IntegerField(required=False)
    total_portions = serializers.IntegerField(required=False)