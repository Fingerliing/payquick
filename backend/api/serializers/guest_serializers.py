from rest_framework import serializers
from api.models import Order, Restaurant, Table


class GuestItemSerializer(serializers.Serializer):
    """Serializer for individual items in a guest order"""
    menu_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    options = serializers.JSONField(required=False)


class GuestPrepareSerializer(serializers.Serializer):
    """Serializer for preparing a guest order"""
    restaurant_id = serializers.IntegerField()
    table_number = serializers.CharField(required=False, allow_blank=True)
    items = GuestItemSerializer(many=True)
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.RegexField(r"^(\+33|0)[1-9]\d{8}$")  # FR, aligné à ton validateur
    email = serializers.EmailField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=["online", "cash"])
    consent = serializers.BooleanField()


class GuestPrepareResponse(serializers.Serializer):
    """Response serializer for guest order preparation"""
    draft_order_id = serializers.UUIDField()
    amount = serializers.IntegerField()     # centimes
    currency = serializers.CharField()
    payment_intent_client_secret = serializers.CharField(
        allow_null=True, required=False
    )


class DraftStatusQuery(serializers.Serializer):
    """Query serializer for draft status lookup"""
    draft_order_id = serializers.UUIDField()


class DraftStatusResponse(serializers.Serializer):
    """Response serializer for draft status"""
    status = serializers.CharField()
    order_id = serializers.IntegerField(allow_null=True)


class GuestInfoSerializer(serializers.Serializer):
    """Serializer pour les informations d'un guest"""
    guest_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    guest_phone = serializers.RegexField(
        r"^(\+33|0)[1-9]\d{8}$",
        required=False,
        allow_blank=True
    )


class GuestOrderSerializer(serializers.ModelSerializer):
    """Serializer pour les commandes guest"""
    # Map model fields to guest-friendly API names
    guest_name = serializers.CharField(source='customer_name', required=False, allow_blank=True)
    guest_phone = serializers.CharField(source='phone', required=False, allow_blank=True)
    table = serializers.CharField(source='table_number', required=False, allow_blank=True)
    
    restaurant_id = serializers.UUIDField(write_only=True, required=False)
    table_id = serializers.UUIDField(write_only=True, required=False)
    # write_only to avoid conflict with Order.items RelatedManager
    items = serializers.ListField(child=serializers.DictField(), required=False, default=list, write_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'guest_name', 'guest_phone', 'restaurant', 'table',
            'restaurant_id', 'table_id', 'items', 'status', 'total_amount',
            'user', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'user']
        extra_kwargs = {
            'total_amount': {'required': False},
        }


class GuestSessionSerializer(serializers.Serializer):
    """Serializer pour les sessions guest"""
    restaurant_id = serializers.UUIDField(required=False)
    table_number = serializers.CharField(max_length=50, required=False)
    guest_name = serializers.CharField(max_length=120, required=False)


class GuestCartSerializer(serializers.Serializer):
    """Serializer pour le panier guest"""
    items = serializers.ListField(child=serializers.DictField(), default=list)
    restaurant_id = serializers.UUIDField(required=False)
    table_number = serializers.CharField(required=False)
    guest_name = serializers.CharField(max_length=120, required=False)
    guest_phone = serializers.CharField(max_length=20, required=False)