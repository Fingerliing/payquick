from rest_framework import serializers
from api.models import Order, OrderItem, Table
from django.utils import timezone
from decimal import Decimal
from django.db import transaction

class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_image = serializers.ImageField(source='menu_item.image', read_only=True)
    menu_item_price = serializers.DecimalField(source='menu_item.price', max_digits=10, decimal_places=2, read_only=True)
    category = serializers.CharField(source='menu_item.category', read_only=True)
    allergen_display = serializers.ReadOnlyField(source='menu_item.allergen_display')
    dietary_tags = serializers.ReadOnlyField(source='menu_item.dietary_tags')
    
    class Meta:
        model = OrderItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_image', 'menu_item_price',
            'category', 'quantity', 'unit_price', 'total_price', 'customizations', 
            'special_instructions', 'allergen_display', 'dietary_tags', 'created_at'
        ]
        read_only_fields = ['id', 'total_price', 'created_at']

    def validate_quantity(self, value):
        """Validation de la quantité"""
        if value <= 0:
            raise serializers.ValidationError("La quantité doit être positive")
        if value > 50:
            raise serializers.ValidationError("Quantité maximum: 50")
        return value

    def validate_customizations(self, value):
        """Validation des personnalisations"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Les personnalisations doivent être un objet JSON")
        
        # Validation des clés autorisées
        allowed_keys = {
            'sauce', 'cuisson', 'accompagnement', 'sans_oignon', 
            'sans_tomate', 'extra_fromage', 'notes_cuisine'
        }
        
        for key in value.keys():
            if key not in allowed_keys:
                raise serializers.ValidationError(f"Personnalisation non autorisée: {key}")
        
        return value

class OrderListSerializer(serializers.ModelSerializer):
    """Pour l'affichage liste (écran cuisine/comptoir)"""
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    table_number = serializers.CharField(read_only=True)
    items_count = serializers.SerializerMethodField()
    waiting_time = serializers.SerializerMethodField()
    customer_display = serializers.SerializerMethodField()
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer_display', 'order_type', 'order_type_display',
            'table_number', 'status', 'status_display', 'payment_status', 'payment_status_display',
            'total_amount', 'items_count', 'waiting_time', 'restaurant_name',
            'estimated_ready_time', 'created_at'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()
    
    def get_waiting_time(self, obj):
        if obj.status in ['served', 'cancelled']:
            return None
        elapsed = timezone.now() - obj.created_at
        return int(elapsed.total_seconds() / 60)  # minutes
    
    def get_customer_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.customer_name or f"Client {obj.order_number}"

class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    customer_display = serializers.SerializerMethodField()
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    payment_method_display = serializers.SerializerMethodField()
    can_be_cancelled = serializers.SerializerMethodField()
    preparation_time = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_display', 'restaurant', 'restaurant_name',
            'order_type', 'order_type_display', 'table_number', 'customer_name', 'phone',
            'status', 'status_display', 'payment_status', 'payment_status_display',
            'payment_method', 'payment_method_display', 'subtotal', 'tax_amount', 'total_amount',
            'estimated_ready_time', 'ready_at', 'served_at', 'notes', 'items',
            'can_be_cancelled', 'preparation_time', 'created_at', 'updated_at'
        ]
    
    def get_customer_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.customer_name or "Client anonyme"
    
    def get_payment_method_display(self, obj):
        method_mapping = {
            'cash': '💵 Espèces',
            'card': '💳 Carte sur place',
            'online': '🌐 Paiement en ligne'
        }
        return method_mapping.get(obj.payment_method, obj.payment_method)
    
    def get_can_be_cancelled(self, obj):
        return obj.can_be_cancelled()
    
    def get_preparation_time(self, obj):
        return obj.get_preparation_time()

class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, write_only=True)
    
    class Meta:
        model = Order
        fields = [
            'restaurant', 'order_type', 'table_number', 'customer_name', 
            'phone', 'payment_method', 'notes', 'items'
        ]
    
    def validate(self, data):
        """Validations spécifiques au sur place"""
        if data['order_type'] == 'dine_in' and not data.get('table_number'):
            raise serializers.ValidationError("Numéro de table requis pour commande sur place")
        
        if not data.get('customer_name') and not self.context['request'].user.is_authenticated:
            raise serializers.ValidationError("Nom du client requis pour commande anonyme")
        
        # Vérifier disponibilité des items
        restaurant = data['restaurant']
        items_data = data.get('items', [])
        
        if not items_data:
            raise serializers.ValidationError("Au moins un item requis")
        
        for item_data in items_data:
            menu_item = item_data['menu_item']
            if menu_item.menu.restaurant != restaurant:
                raise serializers.ValidationError(f"L'item {menu_item.name} n'appartient pas à ce restaurant")
            if not menu_item.is_available:
                raise serializers.ValidationError(f"{menu_item.name} n'est plus disponible")
            if not menu_item.menu.is_available:
                raise serializers.ValidationError(f"Le menu contenant {menu_item.name} n'est pas disponible")
        
        return data
    
    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        request = self.context['request']
        
        # Assigner l'utilisateur si connecté
        if request.user.is_authenticated:
            validated_data['user'] = request.user
        
        # Calculer les montants
        subtotal = Decimal('0.00')
        order_items = []
        
        for item_data in items_data:
            menu_item = item_data['menu_item']
            quantity = item_data['quantity']
            unit_price = menu_item.price
            total_price = quantity * unit_price
            subtotal += total_price
            
            order_items.append({
                **item_data,
                'unit_price': unit_price,
                'total_price': total_price
            })
        
        # Calculer taxe (TVA 10% restauration)
        tax_rate = Decimal('0.10')
        tax_amount = subtotal * tax_rate
        total_amount = subtotal + tax_amount
        
        # Créer commande
        order = Order.objects.create(
            **validated_data,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=total_amount
        )
        
        # Le signal post_save générera automatiquement:
        # - order_number
        # - estimated_ready_time
        
        # Créer items
        for item_data in order_items:
            OrderItem.objects.create(order=order, **item_data)
        
        return order

class OrderStatusUpdateSerializer(serializers.ModelSerializer):
    """Pour mise à jour statut depuis cuisine/comptoir"""
    class Meta:
        model = Order
        fields = ['status']
    
    def validate_status(self, value):
        """Validation des transitions de statut"""
        instance = self.instance
        if not instance:
            return value
        
        current_status = instance.status
        valid_transitions = {
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['preparing', 'cancelled'],
            'preparing': ['ready', 'cancelled'],
            'ready': ['served'],
            'served': [],  # État final
            'cancelled': []  # État final
        }
        
        if value not in valid_transitions.get(current_status, []):
            raise serializers.ValidationError(
                f"Transition de statut invalide: {current_status} -> {value}"
            )
        
        return value
    
    def update(self, instance, validated_data):
        new_status = validated_data['status']
        
        # Auto-timestamps
        if new_status == 'ready' and not instance.ready_at:
            instance.ready_at = timezone.now()
        elif new_status == 'served' and not instance.served_at:
            instance.served_at = timezone.now()
        
        return super().update(instance, validated_data)

class OrderPaymentSerializer(serializers.ModelSerializer):
    """Pour marquer une commande comme payée"""
    class Meta:
        model = Order
        fields = ['payment_method', 'payment_status']
    
    def validate_payment_method(self, value):
        """Validation de la méthode de paiement"""
        allowed_methods = ['cash', 'card', 'online']
        if value not in allowed_methods:
            raise serializers.ValidationError(f"Méthode de paiement invalide: {value}")
        return value
    
    def update(self, instance, validated_data):
        # Marquer comme payé
        validated_data['payment_status'] = 'paid'
        return super().update(instance, validated_data)

class OrderStatsSerializer(serializers.Serializer):
    """Pour les statistiques des commandes"""
    total_orders = serializers.IntegerField()
    pending = serializers.IntegerField()
    confirmed = serializers.IntegerField()
    preparing = serializers.IntegerField()
    ready = serializers.IntegerField()
    served = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    paid_orders = serializers.IntegerField()
    unpaid_orders = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=10, decimal_places=2)
    average_order_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    average_preparation_time = serializers.IntegerField()  # en minutes