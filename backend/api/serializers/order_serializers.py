from rest_framework import serializers
from api.models import (
    Order, OrderItem, OrderItemComponent, TableSession, MenuItem,
    Formule, FormuleCourse, FormuleCourseItem,
)
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
    validate_formula_completeness,
)
from api.utils.formule_pricing import build_formule_components


class OrderItemComponentSerializer(serializers.ModelSerializer):
    """Un plat choisi dans un cran d'une formule (lecture seule)."""
    menu_item_image = serializers.SerializerMethodField()
    allergen_display = serializers.SerializerMethodField()
    dietary_tags = serializers.SerializerMethodField()

    class Meta:
        model = OrderItemComponent
        fields = [
            'id', 'course_name', 'menu_item', 'menu_item_name', 'menu_item_image',
            'extra_price', 'allocated_price', 'vat_rate', 'vat_amount',
            'allergen_display', 'dietary_tags', 'display_order',
        ]

    def get_menu_item_image(self, obj):
        # URL absolue si possible (sinon carré gris côté React Native)
        if not obj.menu_item or not getattr(obj.menu_item, 'image', None):
            return None
        try:
            url = obj.menu_item.image.url
        except ValueError:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_allergen_display(self, obj):
        return obj.menu_item.allergen_display if obj.menu_item else []

    def get_dietary_tags(self, obj):
        return obj.menu_item.dietary_tags if obj.menu_item else []


class OrderItemSerializer(serializers.ModelSerializer):
    kind = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)  # property du modèle

    # Champs "plat" — null-safe quand kind='formule' (menu_item NULL)
    menu_item_name = serializers.SerializerMethodField()
    menu_item_image = serializers.SerializerMethodField()
    menu_item_price = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    allergen_display = serializers.SerializerMethodField()
    dietary_tags = serializers.SerializerMethodField()

    # Champs "formule"
    formule = serializers.PrimaryKeyRelatedField(read_only=True)
    label = serializers.CharField(read_only=True)
    components = OrderItemComponentSerializer(many=True, read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id', 'kind', 'display_name',
            'menu_item', 'menu_item_name', 'menu_item_image', 'menu_item_price', 'category',
            'formule', 'label', 'components',
            'quantity', 'unit_price', 'total_price', 'customizations',
            'special_instructions', 'allergen_display', 'dietary_tags',
            'vat_rate', 'vat_amount', 'created_at',
        ]
        # 👉 Le serveur calcule les prix : ne pas accepter depuis le client
        read_only_fields = ['id', 'unit_price', 'total_price', 'created_at']

    # ── Champs "plat" null-safe ──────────────────────────────────────────
    def get_menu_item_name(self, obj):
        if obj.menu_item:
            return obj.menu_item.name
        return obj.label or None

    def get_menu_item_image(self, obj):
        if not obj.menu_item or not getattr(obj.menu_item, 'image', None):
            return None
        try:
            url = obj.menu_item.image.url
        except ValueError:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_menu_item_price(self, obj):
        return obj.menu_item.price if obj.menu_item else None

    def get_category(self, obj):
        if obj.menu_item and obj.menu_item.category:
            return str(obj.menu_item.category)
        return None

    def get_allergen_display(self, obj):
        # Formule → UNION des allergènes de tous les composants (sécurité client).
        if obj.kind == 'formule':
            seen = []
            for c in obj.components.all():
                if not c.menu_item:
                    continue
                for a in c.menu_item.allergen_display:
                    if a not in seen:
                        seen.append(a)
            return seen
        return obj.menu_item.allergen_display if obj.menu_item else []

    def get_dietary_tags(self, obj):
        # Formule → INTERSECTION : un tag n'est vrai que si TOUS les plats l'ont.
        if obj.kind == 'formule':
            sets = [set(c.menu_item.dietary_tags) for c in obj.components.all() if c.menu_item]
            return list(set.intersection(*sets)) if sets else []
        return obj.menu_item.dietary_tags if obj.menu_item else []

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
        required=False,
        default=list,
        allow_empty=True,
        help_text="Liste des items à la carte"
    )

    formules = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        default=list,
        allow_empty=True,
        help_text="Formules sélectionnées (1 OrderItem par formule)"
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
            'phone', 'payment_method', 'notes', 'items', 'formules', 'user',
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
            # Une commande peut ne contenir QUE des formules (cf. validate()).
            return []

        validated_items = []
        restaurant_id = self.initial_data.get('restaurant')

        # ─── Détection formule menu du jour active ────────────────────
        active_dm = None
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
                active_dm = None
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

        # ─── Validation formule complète (option A) ────────────────────
        # Si le panier contient des items de la formule, ils doivent couvrir
        # toutes les catégories du menu du jour. Sinon le client obtiendrait
        # des plats au prix formule sans payer la formule entière.
        if formula_per_cat is not None:
            # On dédupe par menu_item pour la validation (la quantité ne joue pas)
            unique_menu_items = list({
                v['menu_item'].id: v['menu_item'] for v in validated_items
            }.values())
            # active_dm est défini si formula_per_cat l'est (cf. plus haut)
            is_valid, error_msg = validate_formula_completeness(active_dm, unique_menu_items)
            if not is_valid:
                raise serializers.ValidationError({'items': [error_msg]})

        return validated_items

    def validate_formules(self, value):
        """Valide chaque formule sélectionnée et résout les objets.

        Retourne une structure normalisée prête pour create() :
            [{ 'formule': Formule, 'quantity': int,
               'chosen': [{ 'course': FormuleCourse, 'menu_item': MenuItem,
                            'extra_price': Decimal }] }]
        """
        if not value:
            return []

        restaurant_id = self.initial_data.get('restaurant')
        normalized = []

        for idx, f in enumerate(value):
            formule_id = f.get('formule')
            if not formule_id:
                raise serializers.ValidationError(f"Formule {idx}: champ 'formule' requis")

            try:
                formule = (
                    Formule.objects
                    .prefetch_related('courses__items__menu_item')
                    .get(id=formule_id, restaurant_id=restaurant_id, is_active=True)
                )
            except Formule.DoesNotExist:
                raise serializers.ValidationError(
                    f"Formule {idx}: introuvable, inactive, ou hors de ce restaurant"
                )

            try:
                quantity = int(f.get('quantity', 1))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Formule {idx}: quantity doit être un entier")
            if quantity <= 0 or quantity > 50:
                raise serializers.ValidationError(f"Formule {idx}: quantity entre 1 et 50")

            courses = list(formule.courses.all())
            courses_by_id = {str(c.id): c for c in courses}
            picked = {str(c.id): [] for c in courses}
            chosen = []

            for sel in f.get('selections', []):
                course = courses_by_id.get(str(sel.get('course')))
                if not course:
                    raise serializers.ValidationError(
                        f"Formule {idx}: cran inconnu pour cette formule"
                    )
                eligible = {
                    ci.menu_item_id: ci
                    for ci in course.items.all()
                    if ci.is_available and ci.menu_item and ci.menu_item.is_available
                }
                try:
                    mi_id = int(sel.get('menu_item'))
                except (TypeError, ValueError):
                    raise serializers.ValidationError(
                        f"Formule {idx}: menu_item doit être un entier"
                    )
                course_item = eligible.get(mi_id)
                if not course_item:
                    raise serializers.ValidationError(
                        f"Formule {idx}: plat indisponible dans le cran « {course.name} »"
                    )
                picked[str(course.id)].append(course_item)
                chosen.append({
                    'course': course,
                    'menu_item': course_item.menu_item,
                    'extra_price': course_item.extra_price,
                })

            # min/max + crans obligatoires
            for course in courses:
                n = len(picked[str(course.id)])
                if course.is_required and n < course.min_choices:
                    raise serializers.ValidationError(
                        f"Formule {idx}: « {course.name} » nécessite au moins "
                        f"{course.min_choices} choix"
                    )
                if n > course.max_choices:
                    raise serializers.ValidationError(
                        f"Formule {idx}: « {course.name} » accepte au plus "
                        f"{course.max_choices} choix"
                    )

            normalized.append({'formule': formule, 'quantity': quantity, 'chosen': chosen})

        return normalized

    def validate(self, attrs):
        if not attrs.get('items') and not attrs.get('formules'):
            raise serializers.ValidationError(
                "La commande doit contenir au moins un item ou une formule."
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """Création de la commande avec gestion client améliorée"""
        items_data = validated_data.pop('items', [])
        formules_data = validated_data.pop('formules', [])

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['user'] = request.user
            if not validated_data.get('customer_name'):
                validated_data['customer_name'] = request.user.get_full_name() or request.user.username

        import uuid
        validated_data['order_number'] = str(uuid.uuid4())[:8].upper()

        # Montants provisoires : recalculés depuis les lignes réelles plus bas.
        validated_data.update({
            'subtotal': Decimal('0.00'),
            'tax_amount': Decimal('0.00'),
            'total_amount': Decimal('0.00'),
            'status': 'pending',
            'payment_status': 'pending'
        })

        total_lines = len(items_data) + sum(f['quantity'] for f in formules_data)
        estimated_ready_time = timezone.now() + timezone.timedelta(
            minutes=15 + (total_lines * 5)
        )
        validated_data['estimated_ready_time'] = estimated_ready_time.time()

        order = Order.objects.create(**validated_data)

        # ── Lignes à la carte ────────────────────────────────────────────
        for item_data in items_data:
            try:
                OrderItem.objects.create(
                    order=order,
                    kind='dish',
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

        # ── Lignes formule (1 OrderItem + N OrderItemComponent) ──────────
        for f in formules_data:
            formule = f['formule']
            quantity = f['quantity']
            unit_price, comps = build_formule_components(formule, f['chosen'])
            line_vat = sum(c['vat_amount'] for c in comps) * quantity

            line = OrderItem.objects.create(
                order=order,
                kind='formule',
                menu_item=None,
                formule=formule,
                label=formule.name,
                quantity=quantity,
                unit_price=unit_price,
                total_price=(unit_price * quantity).quantize(Decimal('0.01')),
                vat_amount=line_vat.quantize(Decimal('0.01')),
            )
            OrderItemComponent.objects.bulk_create([
                OrderItemComponent(order_item=line, **c) for c in comps
            ])

        # ── Recalcul des totaux depuis les lignes réelles ────────────────
        # subtotal = somme TTC ; tax = somme des TVA (taux mixtes corrects via
        # la ventilation par composant pour les formules).
        order.refresh_from_db()
        subtotal = order.items.aggregate(s=Sum('total_price'))['s'] or Decimal('0.00')
        order.calculate_vat_breakdown()  # remplit order.vat_details
        tax_amount = sum(
            (Decimal(str(b['tva'])) for b in order.vat_details.values()),
            Decimal('0.00')
        )
        order.subtotal = subtotal
        order.tax_amount = tax_amount
        order.total_amount = subtotal
        order.save(update_fields=['subtotal', 'tax_amount', 'total_amount', 'vat_details'])

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
            'total_amount', 'items_count', 'waiting_time',
            'restaurant', 'restaurant_name',  # 'restaurant' = ID FK pour filtrage côté frontend
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
            'can_be_cancelled', 'preparation_time', 'vat_details', 'created_at', 'updated_at'
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
            # 'preparing' autorisé depuis 'pending' : le kanban restaurateur fait
            # accepter+démarrer en un seul geste ("Commencer"). L'étape 'confirmed'
            # reste valide pour les flows qui veulent dissocier acceptation et
            # démarrage de la préparation.
            'pending': ['confirmed', 'preparing', 'cancelled'],
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