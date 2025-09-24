from rest_framework import serializers
from api.models import Order, OrderItem, TableSession
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from django.db import transaction
from decimal import ROUND_HALF_UP


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
        # 👉 Le serveur calcule les prix : ne pas accepter depuis le client
        read_only_fields = ['id', 'unit_price', 'total_price', 'created_at']

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
    """Serializer pour créer une commande - Version fonctionnelle corrigée"""
    
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        allow_empty=False,
        help_text="Liste des items"
    )
    
    class Meta:
        model = Order
        fields = [
            'restaurant', 'order_type', 'table_number', 'customer_name', 
            'phone', 'payment_method', 'notes', 'items'
        ]
    
    def validate_items(self, value):
        """Validation des items"""
        if not value:
            raise serializers.ValidationError("Au moins un item requis")
        
        from api.models import MenuItem
        
        validated_items = []
        
        for i, item in enumerate(value):
            # Vérifier menu_item
            if 'menu_item' not in item:
                raise serializers.ValidationError(f"Item {i}: menu_item requis")
            
            # Vérifier quantity
            if 'quantity' not in item:
                raise serializers.ValidationError(f"Item {i}: quantity requis")
            
            try:
                menu_item_id = int(item['menu_item'])
                menu_item = MenuItem.objects.select_related('menu__restaurant').get(id=menu_item_id)
                
                if menu_item.price is None:
                    raise serializers.ValidationError(f"Item {i}: Prix non défini pour {menu_item.name}")
                
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Item {i}: menu_item doit être un entier")
            except MenuItem.DoesNotExist:
                raise serializers.ValidationError(f"Item {i}: MenuItem {menu_item_id} introuvable")
            
            try:
                quantity = int(item['quantity'])
                if quantity <= 0:
                    raise serializers.ValidationError(f"Item {i}: quantité doit être positive")
                if quantity > 50:
                    raise serializers.ValidationError(f"Item {i}: quantité max 50")
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Item {i}: quantity doit être un entier")
            
            validated_item = {
                'menu_item': menu_item,
                'menu_item_id': menu_item_id,
                'quantity': quantity,
                'customizations': item.get('customizations', {}),
                'special_instructions': item.get('special_instructions', ''),
            }
            
            if not isinstance(validated_item['customizations'], dict):
                raise serializers.ValidationError(f"Item {i}: customizations doit être un objet")
            
            if not isinstance(validated_item['special_instructions'], str):
                validated_item['special_instructions'] = str(validated_item['special_instructions'])
            
            validated_items.append(validated_item)
        
        return validated_items
    
    def validate(self, data):
        """Validations globales"""
        if data['order_type'] == 'dine_in' and not data.get('table_number'):
            raise serializers.ValidationError("Numéro de table requis pour commande sur place")
        
        if not data.get('customer_name') and not self.context['request'].user.is_authenticated:
            raise serializers.ValidationError("Nom du client requis")
        
        restaurant = data['restaurant']
        for item in data['items']:
            menu_item = item['menu_item']
            if menu_item.menu.restaurant != restaurant:
                raise serializers.ValidationError(f"Item {menu_item.name} n'appartient pas à ce restaurant")
            
            if not menu_item.is_available:
                raise serializers.ValidationError(f"Item {menu_item.name} non disponible")
            
            if not menu_item.menu.is_available:
                raise serializers.ValidationError(f"Menu contenant {menu_item.name} non disponible")
        
        return data
    
    @transaction.atomic
    def create(self, validated_data):
        """Créer la commande avec validations renforcées"""
        items_data = validated_data.pop('items')
        request = self.context['request']
        
        if request.user.is_authenticated:
            validated_data['user'] = request.user
        
        subtotal = Decimal('0.00')
        order_items_data = []
        
        # Validation renforcée des items
        for i, item_data in enumerate(items_data):
            menu_item = item_data['menu_item']
            quantity = item_data['quantity']
            
            # Validation de la quantité
            if quantity is None:
                raise serializers.ValidationError(f"Item {i}: La quantité ne peut pas être None")
            
            if not isinstance(quantity, int) or quantity <= 0:
                raise serializers.ValidationError(f"Item {i}: La quantité doit être un entier positif")
            
            # Validation du prix
            if menu_item.price is None:
                raise serializers.ValidationError(f"Item {i}: Le prix du menu item {menu_item.name} n'est pas défini")
            
            # Validation et arrondi du vat_rate
            vat_rate = menu_item.vat_rate or Decimal('0.10')
            try:
                # Arrondir le taux de TVA à 3 décimales
                vat_rate = Decimal(str(vat_rate)).quantize(
                    Decimal('0.001'), 
                    rounding=ROUND_HALF_UP
                )
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Item {i}: Taux de TVA invalide pour {menu_item.name}")
            
            try:
                unit_price = Decimal(str(menu_item.price))
                quantity_decimal = Decimal(str(quantity))
                total_price = unit_price * quantity_decimal
            except (ValueError, TypeError) as e:
                raise serializers.ValidationError(f"Item {i}: Erreur de calcul du prix - {str(e)}")
            
            subtotal += total_price
            
            # Construire les données de l'OrderItem avec vat_rate corrigé
            order_item_data = {
                'menu_item': menu_item,
                'quantity': int(quantity),
                'customizations': item_data.get('customizations', {}),
                'special_instructions': item_data.get('special_instructions', ''),
                'unit_price': unit_price,
                'total_price': total_price,
                'vat_rate': vat_rate  # Taux TVA arrondi
            }
            
            # Validation finale des types
            if not isinstance(order_item_data['quantity'], int):
                raise serializers.ValidationError(f"Item {i}: Type de quantité invalide après conversion")
            
            if order_item_data['quantity'] <= 0:
                raise serializers.ValidationError(f"Item {i}: Quantité doit être positive après validation")
            
            order_items_data.append(order_item_data)
        
        # Calcul du total
        total_amount = subtotal
        
        # Créer la commande
        order = Order.objects.create(
            **validated_data,
            subtotal=subtotal,
            tax_amount=Decimal('0.00'),
            total_amount=total_amount
        )
        
        # Créer les OrderItem avec validation supplémentaire
        for item_data in order_items_data:
            try:
                # Validation finale avant création
                if item_data['quantity'] is None or item_data['quantity'] <= 0:
                    raise ValueError(f"Quantité invalide pour {item_data['menu_item'].name}: {item_data['quantity']}")
                
                if item_data['unit_price'] is None:
                    raise ValueError(f"Prix invalide pour {item_data['menu_item'].name}: {item_data['unit_price']}")
                
                # Créer avec vat_rate explicite pour éviter le calcul dans save()
                order_item = OrderItem.objects.create(
                    order=order, 
                    menu_item=item_data['menu_item'],
                    quantity=item_data['quantity'],
                    customizations=item_data['customizations'],
                    special_instructions=item_data['special_instructions'],
                    unit_price=item_data['unit_price'],
                    total_price=item_data['total_price'],
                    vat_rate=item_data['vat_rate']
                )
                
            except Exception as e:
                # Si une erreur se produit, annuler toute la transaction
                raise serializers.ValidationError(f"Erreur lors de la création de l'item {item_data['menu_item'].name}: {str(e)}")
        
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


class TableSessionSerializer(serializers.ModelSerializer):
    """Serializer pour les sessions de table"""
    
    orders_count = serializers.ReadOnlyField()
    total_amount = serializers.ReadOnlyField()
    duration = serializers.ReadOnlyField()
    orders = serializers.SerializerMethodField()
    
    class Meta:
        model = TableSession
        fields = [
            'id', 'restaurant', 'table_number', 'started_at', 'ended_at',
            'is_active', 'primary_customer_name', 'primary_phone', 
            'guest_count', 'session_notes', 'orders_count', 'total_amount',
            'duration', 'orders'
        ]
        read_only_fields = ['id', 'started_at']
    
    def get_orders(self, obj):
        """Retourne les commandes de la session"""
        orders = obj.orders.all()
        return OrderListSerializer(orders, many=True, context=self.context).data


class OrderWithTableInfoSerializer(serializers.ModelSerializer):
    """Serializer étendu avec informations de table"""
    
    # Informations de session de table
    table_session_id = serializers.UUIDField(read_only=True)
    order_sequence = serializers.IntegerField(read_only=True)
    is_main_order = serializers.BooleanField(read_only=True)
    
    # Informations calculées
    table_orders_count = serializers.SerializerMethodField()
    table_total_amount = serializers.ReadOnlyField()
    table_waiting_time = serializers.SerializerMethodField()
    table_status_summary = serializers.ReadOnlyField()
    
    # Informations de base
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    customer_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_display', 'restaurant', 'restaurant_name',
            'order_type', 'table_number', 'customer_name', 'phone',
            'status', 'payment_status', 'payment_method',
            'subtotal', 'tax_amount', 'total_amount',
            'estimated_ready_time', 'ready_at', 'served_at', 'notes',
            'created_at', 'updated_at', 'items',
            # Nouveaux champs pour table
            'table_session_id', 'order_sequence', 'is_main_order',
            'table_orders_count', 'table_total_amount', 'table_waiting_time',
            'table_status_summary'
        ]
    
    def get_table_orders_count(self, obj):
        """Nombre de commandes dans cette session de table"""
        return obj.table_orders.count()
    
    def get_table_waiting_time(self, obj):
        """Temps d'attente pour cette table"""
        return obj.get_table_waiting_time()
    
    def get_customer_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.customer_name or f"Client {obj.order_number}"


class TableOrdersSerializer(serializers.Serializer):
    """Serializer pour toutes les commandes d'une table"""
    
    restaurant_id = serializers.IntegerField()
    table_number = serializers.CharField()
    active_orders = OrderWithTableInfoSerializer(many=True, read_only=True)
    completed_orders = OrderWithTableInfoSerializer(many=True, read_only=True)
    table_statistics = serializers.DictField(read_only=True)
    current_session = TableSessionSerializer(read_only=True)
