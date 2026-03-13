from rest_framework import serializers
from api.models import Order, OrderItem, TableSession, MenuItem
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from django.db import transaction
from decimal import ROUND_HALF_UP
from django.contrib.auth.models import User

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
        if value is None:
            return {}
            
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


class OrderCreateSerializer(serializers.ModelSerializer):
    """Serializer pour créer une commande - Version améliorée pour clients"""
    
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        allow_empty=False,
        help_text="Liste des items"
    )
    
    # Champ optionnel pour l'utilisateur (sera rempli automatiquement si authentifié)
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
            'table_session_id'  # Ajout pour les sessions collaboratives
        ]
        extra_kwargs = {
            'table_session_id': {'required': False, 'allow_null': True},
            'customer_name': {'required': False, 'allow_blank': True},
            'phone': {'required': False, 'allow_blank': True}
        }
    
    def validate_restaurant(self, value):
        """Validation du restaurant - Plus permissif pour les clients"""
        if not value.is_active:
            raise serializers.ValidationError("Ce restaurant n'est pas actif")
        return value
    
    def validate_order_type(self, value):
        """Validation du type de commande"""
        # Match the Order model's ORDER_TYPE_CHOICES
        if value not in ['dine_in', 'takeaway']:
            raise serializers.ValidationError(
                "Type de commande invalide. Valeurs acceptées: dine_in, takeaway"
            )
        return value
    
    def validate_table_number(self, value):
        """Validation du numéro de table - Optionnel pour les clients"""
        if value and self.initial_data.get('order_type') != 'dine_in':
            raise serializers.ValidationError(
                "Le numéro de table n'est requis que pour les commandes sur place"
            )
        return value
    
    def validate_items(self, value):
        """Validation des items avec gestion améliorée"""
        if not value:
            raise serializers.ValidationError("Au moins un item requis")
        
        from api.models import MenuItem
        
        validated_items = []
        restaurant_id = self.initial_data.get('restaurant')
        
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
                
                # Vérifier que l'item appartient au bon restaurant
                if restaurant_id and str(menu_item.menu.restaurant.id) != str(restaurant_id):
                    raise serializers.ValidationError(
                        f"Item {i}: L'article {menu_item.name} n'appartient pas à ce restaurant"
                    )
                
                # Vérifier que l'item est disponible
                if not menu_item.is_available:
                    raise serializers.ValidationError(
                        f"Item {i}: L'article {menu_item.name} n'est pas disponible"
                    )
                
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
            
            # Préparer l'item validé
            validated_items.append({
                'menu_item': menu_item,
                'quantity': quantity,
                'customizations': item.get('customizations', {}),
                'special_instructions': item.get('special_instructions', ''),
                'unit_price': menu_item.price,
                'total_price': menu_item.price * Decimal(str(quantity)),
                'vat_rate': menu_item.vat_rate or Decimal('10.00')
            })
        
        return validated_items
    
    # def validate(self, data):
    #     """Validation croisée avec gestion client améliorée"""
        
    #     # Si c'est une commande sur place, vérifier la table
    #     if data.get('order_type') == 'dine_in' and not data.get('table_number'):
    #         raise serializers.ValidationError({
    #             'table_number': 'Le numéro de table est requis pour les commandes sur place'
    #         })
        
    #     # Pour les clients non authentifiés, s'assurer d'avoir au moins un nom ou téléphone
    #     request = self.context.get('request')
    #     if request and not request.user.is_authenticated:
    #         if not data.get('customer_name') and not data.get('phone'):
    #             raise serializers.ValidationError(
    #                 "Au moins le nom ou le téléphone est requis pour les clients non authentifiés"
    #             )
        
    #     # Si une session collaborative est spécifiée, vérifier qu'elle existe et est active
    #     if data.get('table_session_id'):
    #         try:
    #             session = TableSession.objects.get(
    #                 id=data['table_session_id'],
    #                 is_active=True
    #             )
    #             # Vérifier que la session correspond au restaurant et à la table
    #             if session.restaurant != data['restaurant']:
    #                 raise serializers.ValidationError({
    #                     'table_session_id': 'La session ne correspond pas au restaurant'
    #                 })
    #             if data.get('table_number') and session.table_number != data['table_number']:
    #                 raise serializers.ValidationError({
    #                     'table_session_id': 'La session ne correspond pas à la table'
    #                 })
    #         except TableSession.DoesNotExist:
    #             raise serializers.ValidationError({
    #                 'table_session_id': 'Session invalide ou inactive'
    #             })
        
    #     return data
    
    @transaction.atomic
    def create(self, validated_data):
        """Création de la commande avec gestion client améliorée"""
        items_data = validated_data.pop('items')
        
        # Si l'utilisateur est authentifié, l'associer automatiquement
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['user'] = request.user
            # Remplir le nom si non fourni
            if not validated_data.get('customer_name'):
                validated_data['customer_name'] = request.user.get_full_name() or request.user.username
        
        # Générer un numéro de commande
        import uuid
        validated_data['order_number'] = str(uuid.uuid4())[:8].upper()
        
        # Calculer le sous-total et le total
        subtotal = sum(item['total_price'] for item in items_data)
        # Les prix sont TTC : TVA = TTC - (TTC / 1.1) pour un taux de 10%
        tax_amount = subtotal - (subtotal / Decimal('1.1')).quantize(Decimal('0.01'))
        total_amount = subtotal  # Le client paie exactement le prix affiché
        
        validated_data.update({
            'subtotal': subtotal,
            'tax_amount': tax_amount,
            'total_amount': total_amount,
            'status': 'pending',
            'payment_status': 'pending'
        })
        
        # Estimer le temps de préparation (15 min de base + 5 min par item)
        estimated_ready_time = timezone.now() + timezone.timedelta(
            minutes=15 + (len(items_data) * 5)
        )
        validated_data['estimated_ready_time'] = estimated_ready_time.time()
        
        # Créer la commande
        order = Order.objects.create(**validated_data)
        
        # Créer les items
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
        
        # Si une session collaborative existe, mettre à jour les compteurs
        if order.table_session_id:
            try:
                session = TableSession.objects.get(id=order.table_session_id)
                session.orders_count = session.orders.count()
                session.total_amount = session.orders.aggregate(
                    total=Sum('total_amount')
                )['total'] or Decimal('0.00')
                session.save()
            except TableSession.DoesNotExist:
                # Pas de session réelle - c'est juste un UUID de groupement
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


# Les autres serializers restent inchangés
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


class TableSessionSerializer(serializers.ModelSerializer):
    """Serializer pour les sessions de table"""
    
    # Use SerializerMethodField to avoid buggy model properties that reference Order without importing
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
        """Retourne les commandes de la session"""
        # Query Order directly to avoid NameError in model's orders property
        orders = Order.objects.filter(table_session_id=obj.id)
        return OrderListSerializer(orders, many=True, context=self.context).data
    
    def get_orders_count(self, obj):
        """Nombre de commandes dans la session"""
        return Order.objects.filter(table_session_id=obj.id).count()
    
    def get_total_amount(self, obj):
        """Montant total de la session"""
        from django.db.models import Sum
        result = Order.objects.filter(table_session_id=obj.id).aggregate(
            total=Sum('total_amount')
        )
        return result['total'] or 0


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
        if hasattr(obj, 'table_orders'):
            return obj.table_orders.count()
        return 1
    
    def get_table_waiting_time(self, obj):
        """Temps d'attente pour cette table"""
        if hasattr(obj, 'get_table_waiting_time'):
            return obj.get_table_waiting_time()
        # Calcul par défaut
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