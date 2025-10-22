from rest_framework import serializers
from api.models import (
    CollaborativeTableSession, SessionParticipant, Order, Restaurant, Table
)
from django.contrib.auth.models import User

class SessionParticipantSerializer(serializers.ModelSerializer):
    """Serializer pour un participant"""
    
    display_name = serializers.CharField(read_only=True)
    is_host = serializers.BooleanField(read_only=True)
    orders_count = serializers.IntegerField(read_only=True)
    total_spent = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    
    class Meta:
        model = SessionParticipant
        fields = [
            'id', 'display_name', 'status', 'role', 'is_host',
            'joined_at', 'last_activity', 'orders_count', 'total_spent',
            'notes'
        ]
        read_only_fields = ['id', 'joined_at', 'last_activity']


class CollaborativeSessionSerializer(serializers.ModelSerializer):
    """Serializer complet pour une session collaborative"""
    
    participants = SessionParticipantSerializer(many=True, read_only=True)
    participant_count = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    can_join = serializers.BooleanField(read_only=True)
    total_orders_count = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    
    restaurant_name = serializers.CharField(
        source='restaurant.name', 
        read_only=True
    )
    table_info = serializers.SerializerMethodField()
    
    class Meta:
        model = CollaborativeTableSession
        fields = [
            'id', 'share_code', 'restaurant', 'restaurant_name',
            'table', 'table_number', 'table_info',
            'session_type', 'status', 'host_name',
            'max_participants', 'require_approval', 
            'split_payment_enabled',
            'participant_count', 'is_full', 'can_join',
            'participants', 'total_orders_count', 'total_amount',
            'created_at', 'locked_at', 'completed_at',
            'session_notes'
        ]
        read_only_fields = [
            'id', 'share_code', 'created_at', 'locked_at', 'completed_at'
        ]
    
    def get_table_info(self, obj):
        """Informations sur la table"""
        if obj.table:
            return {
                'id': str(obj.table.id),
                'number': obj.table.number,
                'capacity': obj.table.capacity
            }
        return None


class SessionCreateSerializer(serializers.Serializer):
    """Serializer pour créer une session collaborative"""
    
    restaurant_id = serializers.IntegerField()
    table_number = serializers.CharField(max_length=10)
    table_id = serializers.IntegerField(required=False)
    
    session_type = serializers.ChoiceField(
        choices=['collaborative', 'individual'],
        default='collaborative'
    )
    host_name = serializers.CharField(max_length=100, required=False)
    max_participants = serializers.IntegerField(
        min_value=2, 
        max_value=20, 
        default=10
    )
    require_approval = serializers.BooleanField(default=False)
    split_payment_enabled = serializers.BooleanField(default=True)
    session_notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate_restaurant_id(self, value):
        """Valider que le restaurant existe"""
        try:
            Restaurant.objects.get(id=value)
        except Restaurant.DoesNotExist:
            raise serializers.ValidationError("Restaurant non trouvé")
        return value
    
    def validate(self, data):
        """Validation croisée"""
        restaurant_id = data.get('restaurant_id')
        table_id = data.get('table_id')
        
        if table_id:
            try:
                table = Table.objects.get(id=table_id, restaurant_id=restaurant_id)
                data['table_number'] = table.number
            except Table.DoesNotExist:
                raise serializers.ValidationError({
                    'table_id': 'Table non trouvée pour ce restaurant'
                })
        
        return data


class SessionJoinSerializer(serializers.Serializer):
    """Serializer pour rejoindre une session"""
    
    share_code = serializers.CharField(max_length=6)
    guest_name = serializers.CharField(max_length=100, required=False)
    guest_phone = serializers.CharField(max_length=20, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate_share_code(self, value):
        """Valider que le code existe"""
        value = value.upper()
        try:
            session = CollaborativeTableSession.objects.get(share_code=value)
            if not session.can_join:
                raise serializers.ValidationError(
                    "Cette session n'accepte plus de nouveaux participants"
                )
        except CollaborativeTableSession.DoesNotExist:
            raise serializers.ValidationError("Code de session invalide")
        
        return value


class SessionActionSerializer(serializers.Serializer):
    """Serializer pour les actions sur une session"""
    
    action = serializers.ChoiceField(
        choices=['lock', 'unlock', 'complete', 'cancel']
    )
    reason = serializers.CharField(required=False, allow_blank=True)


class ParticipantActionSerializer(serializers.Serializer):
    """Serializer pour les actions sur un participant"""
    
    action = serializers.ChoiceField(
        choices=['approve', 'reject', 'remove', 'make_host']
    )
    reason = serializers.CharField(required=False, allow_blank=True)


class SessionOrderSerializer(serializers.ModelSerializer):
    """Serializer pour les commandes dans une session"""
    
    participant_name = serializers.CharField(
        source='participant.display_name', 
        read_only=True
    )
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'participant', 'participant_name',
            'status', 'payment_status', 'total_amount',
            'items_count', 'created_at', 'notes'
        ]
        read_only_fields = ['id', 'order_number', 'created_at']
    
    def get_items_count(self, obj):
        """Nombre d'items dans la commande"""
        return obj.items.count()


class SessionSummarySerializer(serializers.Serializer):
    """Serializer pour le résumé d'une session"""
    
    session = CollaborativeSessionSerializer()
    orders = SessionOrderSerializer(many=True)
    payment_breakdown = serializers.DictField()
    can_finalize = serializers.BooleanField()
    
    # Statistiques
    stats = serializers.DictField()