from rest_framework import serializers
from api.models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='menu_item.name', read_only=True)
    price = serializers.DecimalField(source='menu_item.price', max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ['menu_item', 'name', 'price', 'quantity']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(source='order_items', many=True, read_only=True)
    table_number = serializers.CharField(source='table.identifiant', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'table_number', 'items', 'is_paid', 'status', 'created_at']
        read_only_fields = ['id', 'created_at']
