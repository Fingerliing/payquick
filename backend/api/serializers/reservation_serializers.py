from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from api.models import Reservation


class ReservationSerializer(serializers.ModelSerializer):
    table_number = serializers.CharField(source='table.number', read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    pre_order_id = serializers.PrimaryKeyRelatedField(
        source='pre_order', read_only=True
    )
    pre_order_total = serializers.SerializerMethodField()
    is_refundable = serializers.SerializerMethodField()
    free_cancellation_deadline = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            'id', 'restaurant', 'restaurant_name', 'table_number',
            'customer_name', 'customer_phone', 'customer_email',
            'starts_at', 'ends_at', 'duration_minutes', 'party_size',
            'status', 'special_requests',
            'pre_order_id', 'pre_order_total',
            'is_refundable', 'free_cancellation_deadline',
            'checked_in_at', 'expires_at', 'created_at',
        ]
        read_only_fields = fields

    def get_pre_order_total(self, obj):
        if obj.pre_order:
            return str(obj.pre_order.total_amount)
        return None

    def get_is_refundable(self, obj):
        return obj.is_refundable()

    def get_free_cancellation_deadline(self, obj):
        if obj.pre_order:
            return obj.free_cancellation_deadline()
        return None


class ReservationCreateSerializer(serializers.Serializer):
    restaurant = serializers.IntegerField()
    starts_at = serializers.DateTimeField()
    party_size = serializers.IntegerField(min_value=1, max_value=30)
    customer_name = serializers.CharField(max_length=100)
    customer_phone = serializers.CharField(max_length=20)
    customer_email = serializers.EmailField(required=False, allow_blank=True)
    special_requests = serializers.CharField(
        required=False, allow_blank=True, max_length=500
    )
    # True si le client compte pré-commander → la résa démarre en
    # pending_payment et le créneau est bloqué RESERVATION_PAYMENT_HOLD_MINUTES
    with_pre_order = serializers.BooleanField(default=False)

    def validate_starts_at(self, value):
        now = timezone.now()
        if value < now + timedelta(minutes=30):
            raise serializers.ValidationError(
                "La réservation doit être au moins 30 minutes dans le futur."
            )
        if value > now + timedelta(days=60):
            raise serializers.ValidationError(
                "La réservation ne peut pas dépasser 60 jours à l'avance."
            )
        return value


class AvailabilityQuerySerializer(serializers.Serializer):
    restaurant_id = serializers.IntegerField()
    date = serializers.DateField()
    party_size = serializers.IntegerField(min_value=1, max_value=30, default=2)
