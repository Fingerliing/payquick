from rest_framework import serializers
from api.models import Order, OrderItem, TableSession, MenuItem
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from django.db import transaction
from decimal import ROUND_HALF_UP
from django.contrib.auth.models import User
from django.db.models import Sum

from api.utils.daily_menu_pricing import (
    get_active_daily_menu,
    formula_pricing_context,
    unit_price_for,
)


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
        if value <= 0:
            raise serializers.ValidationError("La quantité doit être positive")
        if value > 50:
            raise serializers.ValidationError("Quantité maximum: 50")
        return value

    def validate_customizations(self, value):
        if value is None:
            return {}

        if not isinstance(value, dict):
            raise serializers.ValidationError("Les personnalisations doivent être un objet JSON")

        allowed_keys = {
            'sauce', 'cuisson', 'accompagnement', 'sans_oignon',
            'sans_tomate', 'extra_fromage', 'notes_cuisine'
        }

        for key in value.keys():
            if key not in allowed_keys:
                raise serializers.ValidationError(f"Personnalisation non autorisée: {key}")

        return value


class OrderCreateSerializer(serializers.ModelSerializer):
    """Serializer pour créer une commande - Version améliorée pour clients."""

    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        allow_empty=False,
        help_text="Liste des items"
    )

    user = serializers.PrimaryKeyRelatedField(
        read_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Order
        fields = [
            'restaurant', 'order_type', 'table_number', 'customer_name',
            'phone', 'payment_method', 'notes', 'items', 'user',
            'table_session_id'
        ]
        extra_kwargs = {
            'table_session_id': {'required': False, 'allow_null': True},
            'customer_name': {'required': False, 'allow_blank': True},
            'phone': {'required': False, 'allow_blank': True}
        }

    def validate_restaurant(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Ce restaurant n'est pas actif")
        return value

    def validate_order_type(self, value):
        if value not in ['dine_in', 'takeaway']:
            raise serializers.ValidationError(
                "Type de commande invalide. Valeurs acceptées: dine_in, takeaway"
            )
        return value

    def validate_table_number(self, value):
        if value and self.initial_data.get('order_type') != 'dine_in':
            raise serializers.ValidationError(
                "Le numéro de table n'est requis que pour les commandes sur place"
            )
        return value

    def validate_items(self, value):
        """Validation des items + application du prix formule menu du jour.

        Si un menu du jour actif existe pour le restaurant et que l'item
        commandé fait partie de la formule, le prix unitaire devient
        `special_price / nb_catégories` au lieu du prix de carte. Sans cela,
        le client paierait la somme des prix de carte au lieu du prix annoncé.
        """
        if not value:
            raise serializers.ValidationError("Au moins un item requis")

        validated_items = []
        restaurant_id = self.initial_data.get('restaurant')

        # ─── Détection formule menu du jour active ────────────────────
        formula_per_cat = None
        formula_menu_item_ids = set()
        if restaurant_id:
            try:
                from api.models import Restaurant
                restaurant_obj = Restaurant.objects.get(pk=restaurant_id)
                active_dm = get_active_daily_menu(restaurant_obj)
                formula_per_cat, formula_menu_item_ids = formula_pricing_context(active_dm)
            except Exception:
                # Si quoi que ce soit échoue, on retombe sur les prix de carte
                formula_per_cat = None
                formula_menu_item_ids = set()

        for i, item in enumerate(value):
            if 'menu_item' not in item:
                raise serializers.ValidationError(f"Item {i}: menu_item requis")
            if 'quantity' not in item:
                raise serializers.ValidationError(f"Item {i}: quantity requis")

            try:
                menu_item_id = int(item['menu_item'])
                menu_item = MenuItem.objects.select_related('menu__restaurant').get(id=menu_item_id)

                if restaurant_id and str(menu_item.menu.restaurant.id) != str(restaurant_id):
                    raise serializers.ValidationError(
                        f"Item {i}: L'article {menu_item.name} n'appartient pas à ce restaurant"
                    )

                if not menu_item.is_available:
                    raise serializers.ValidationError(
                        f"Item {i}: L'article {menu_item.name} n'est pas disponible"
                    )

                if menu_item.price is None:
                    raise serializers.ValidationError(
                        f"Item {i}: Prix non défini pour {menu_item.name}"
                    )

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

            # ─── Prix unitaire : formule menu du jour si applicable ──
            unit_price = unit_price_for(menu_item, formula_per_cat, formula_menu_item_ids)

            validated_items.append({
                'menu_item': menu_item,
                'quantity': quantity,
                'customizations': item.get('customizations', {}),
                'special_instructions': item.get('special_instructions', ''),
                'unit_price': unit_price,
                'total_price': unit_price * Decimal(str(quantity)),
                'vat_rate': menu_item.vat_rate or Decimal('10.00')
            })

        return validated_items

    @transaction.atomic
    def create(self, validated_data):
        """Création de la commande avec gestion client améliorée"""
        items_data = validated_data.pop('items')

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['user'] = request.user
            if not validated_data.get('customer_name'):
                validated_data['customer_name'] = request.user.get_full_name() or request.user.username

        import uuid
        validated_data['order_number'] = str(uuid.uuid4())[:8].upper()

        subtotal = sum(item['total_price'] for item in items_data)
        # Les prix sont TTC : TVA = TTC - (TTC / 1.1) pour un taux de 10%
        tax_amount = subtotal - (subtotal / Decimal('1.1')).quantize(Decimal('0.01'))
        total_amount = subtotal

        validated_data.update({
            'subtotal': subtotal,
            'tax_amount': tax_amount,
            'total_amount': total_amount,
            'status': 'pending',
            'payment_status': 'pending'
        })

        estimated_ready_time = timezone.now() + timezone.timedelta(
            minutes=15 + (len(items_data) * 5)
        )
        validated_data['estimated_ready_time'] = estimated_ready_time.time()

        order = Order.objects.create(**validated_data)

        for item_data in items_data:
            try:
                OrderItem.objects.create(
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
                raise serializers.ValidationError(
                    f"Erreur lors de la création de l'item {item_data['menu_item'].name}: {str(e)}"
                )

        if order.table_session_id:
            try:
                session = TableSession.objects.get(id=order.table_session_id)
                session.orders_count = session.orders.count()
                session.total_amount = session.orders.aggregate(
                    total=Sum('total_amount')
                )['total'] or Decimal('0.00')
                session.save()
            except TableSession.DoesNotExist:
                pass

        return order


# Serializers d'affichage (lecture seule) - inchangés

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
        return int(elapsed.total_seconds() / 60)

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


class OrderStatusUpdateSerializer(serializers.ModelSerializer):
    """Pour mise à jour statut depuis cuisine/comptoir"""
    class Meta:
        model = Order
        fields = ['status']

    def validate_status(self, value):
        instance = self.instance
        if not instance:
            return value

        current_status = instance.status
        valid_transitions = {
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['preparing', 'cancelled'],
            'preparing': ['ready', 'cancelled'],
            'ready': ['served'],
            'served': [],
            'cancelled': []
        }

        if value not in valid_transitions.get(current_status, []):
            raise serializers.ValidationError(
                f"Transition de statut invalide: {current_status} -> {value}"
            )

        return value

    def update(self, instance, validated_data):
        new_status = validated_data['status']

        if new_status == 'ready' and not instance.ready_at:
            instance.ready_at = timezone.now()
        elif new_status == 'served' and not instance.served_at:
            instance.served_at = timezone.now()

        return super().update(instance, validated_data)


class TableSessionSerializer(serializers.ModelSerializer):
    """Serializer pour les sessions de table"""

    orders_count = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
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
        orders = Order.objects.filter(table_session_id=obj.id)
        return OrderListSerializer(orders, many=True, context=self.context).data

    def get_orders_count(self, obj):
        return Order.objects.filter(table_session_id=obj.id).count()

    def get_total_amount(self, obj):
        result = Order.objects.filter(table_session_id=obj.id).aggregate(
            total=Sum('total_amount')
        )
        return result['total'] or 0


class OrderWithTableInfoSerializer(serializers.ModelSerializer):
    """Serializer étendu avec informations de table"""

    table_session_id = serializers.UUIDField(read_only=True)
    order_sequence = serializers.IntegerField(read_only=True)
    is_main_order = serializers.BooleanField(read_only=True)

    table_orders_count = serializers.SerializerMethodField()
    table_total_amount = serializers.ReadOnlyField()
    table_waiting_time = serializers.SerializerMethodField()
    table_status_summary = serializers.ReadOnlyField()

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
            'table_session_id', 'order_sequence', 'is_main_order',
            'table_orders_count', 'table_total_amount', 'table_waiting_time',
            'table_status_summary'
        ]

    def get_table_orders_count(self, obj):
        if hasattr(obj, 'table_orders'):
            return obj.table_orders.count()
        return 1

    def get_table_waiting_time(self, obj):
        if hasattr(obj, 'get_table_waiting_time'):
            return obj.get_table_waiting_time()
        if obj.status in ['served', 'cancelled']:
            return 0
        elapsed = timezone.now() - obj.created_at
        return int(elapsed.total_seconds() / 60)

    def get_customer_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.customer_name or f"Client {obj.order_number}"


class OrderPaymentSerializer(serializers.ModelSerializer):
    """Serializer for marking orders as paid"""

    class Meta:
        model = Order
        fields = ['id', 'payment_method', 'payment_status']
        read_only_fields = ['id']

    def update(self, instance, validated_data):
        instance.payment_status = 'paid'
        if 'payment_method' in validated_data:
            instance.payment_method = validated_data['payment_method']
        instance.save()
        return instance


class OrderStatsSerializer(serializers.Serializer):
    """Serializer for order statistics data"""

    total_orders = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    average_order_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    orders_by_status = serializers.DictField()
    average_preparation_time = serializers.IntegerField()


class OrderItemCreateSerializer(serializers.Serializer):
    """Serializer pour la création d'items de commande (validation entrées)"""

    menu_item = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.all()
    )
    quantity = serializers.IntegerField(min_value=1, max_value=50)
    customizations = serializers.JSONField(required=False, default=dict)
    special_instructions = serializers.CharField(required=False, allow_blank=True)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("La quantité doit être positive")
        return value