from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from api.models import (
    DailyMenu, DailyMenuItem, DailyMenuTemplate, DailyMenuTemplateItem,
    MenuItem, MenuCategory,
)
from api.serializers.menu_serializers import MenuItemSerializer
from api.serializers.restaurant_serializers import RestaurantSerializer
from api.utils.daily_menu_pricing import (
    distinct_category_ids,
    is_formula,
    price_per_category,
)


# ─────────────────────────────────────────────────────────────────────────────
# Items (vue restaurateur)
# ─────────────────────────────────────────────────────────────────────────────

class DailyMenuItemSerializer(serializers.ModelSerializer):
    """Serializer pour les plats d'un menu du jour (vue restaurateur).

    Depuis mai 2026 : les items du menu du jour n'ont plus de prix individuel.
    Le prix est géré globalement au niveau du DailyMenu (special_price) et
    réparti automatiquement entre catégories en mode formule. Le champ
    `special_price` du modèle est conservé pour rétrocompat mais exposé en
    lecture seule et toujours `None` à la création/mise à jour.
    """

    # Données du plat original
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_description = serializers.CharField(source='menu_item.description', read_only=True)
    menu_item_category = serializers.CharField(source='menu_item.category.name', read_only=True)
    menu_item_category_id = serializers.SerializerMethodField()
    menu_item_category_icon = serializers.CharField(source='menu_item.category.icon', read_only=True)
    menu_item_image = serializers.ImageField(source='menu_item.image', read_only=True)
    original_price = serializers.DecimalField(
        source='menu_item.price', max_digits=8, decimal_places=2, read_only=True
    )

    # Prix calculés (formule prioritaire, sinon prix de carte)
    effective_price = serializers.SerializerMethodField()
    has_discount = serializers.SerializerMethodField()
    discount_percentage = serializers.SerializerMethodField()

    # Informations diététiques
    is_vegetarian = serializers.BooleanField(source='menu_item.is_vegetarian', read_only=True)
    is_vegan = serializers.BooleanField(source='menu_item.is_vegan', read_only=True)
    is_gluten_free = serializers.BooleanField(source='menu_item.is_gluten_free', read_only=True)
    allergens = serializers.JSONField(source='menu_item.allergens', read_only=True)

    class Meta:
        model = DailyMenuItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_description',
            'menu_item_category', 'menu_item_category_id',
            'menu_item_category_icon', 'menu_item_image',
            'original_price', 'special_price', 'effective_price',
            'has_discount', 'discount_percentage', 'is_available',
            'display_order', 'special_note', 'is_vegetarian', 'is_vegan',
            'is_gluten_free', 'allergens',
        ]
        # special_price retiré du contrôle restaurateur : read-only
        read_only_fields = [
            'id', 'special_price',
            'effective_price', 'has_discount', 'discount_percentage',
        ]

    def get_menu_item_category_id(self, obj):
        if obj.menu_item and obj.menu_item.category_id:
            return str(obj.menu_item.category_id)
        return None

    def get_effective_price(self, obj):
        """Prix effectif :
        - Mode formule : prix par catégorie (special_price / nb_catégories)
        - Sinon : prix de base du MenuItem (le prix individuel n'existe plus).
        """
        dm = obj.daily_menu
        if is_formula(dm):
            per_cat = price_per_category(dm)
            if per_cat is not None:
                return float(per_cat)
        return float(obj.menu_item.price)

    def get_has_discount(self, obj):
        eff = self.get_effective_price(obj)
        original = float(obj.menu_item.price)
        return eff < original

    def get_discount_percentage(self, obj):
        eff = self.get_effective_price(obj)
        original = float(obj.menu_item.price)
        if eff < original and original > 0:
            return round((original - eff) / original * 100)
        return 0


class DailyMenuCreateItemSerializer(serializers.ModelSerializer):
    """Serializer simplifié pour créer/lier des items à un menu du jour.

    `special_price` n'est plus accepté : le prix se gère uniquement au niveau
    du DailyMenu (formule). Les anciens payloads qui le passent voient le
    champ ignoré silencieusement (pour ne pas casser la rétrocompat client).
    """

    class Meta:
        model = DailyMenuItem
        fields = ['menu_item', 'display_order', 'special_note', 'is_available']

    def to_internal_value(self, data):
        # Tolérance : ignorer un éventuel `special_price` dans les anciens payloads
        if isinstance(data, dict) and 'special_price' in data:
            data = {k: v for k, v in data.items() if k != 'special_price'}
        return super().to_internal_value(data)


# ─────────────────────────────────────────────────────────────────────────────
# DailyMenu (vue restaurateur)
# ─────────────────────────────────────────────────────────────────────────────

class DailyMenuListSerializer(serializers.ModelSerializer):
    """Liste des menus du jour (vue restaurateur)."""

    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    total_items_count = serializers.ReadOnlyField()
    is_today = serializers.ReadOnlyField()
    is_future = serializers.ReadOnlyField()

    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant', 'restaurant_name', 'date', 'title', 'description',
            'is_active', 'special_price', 'total_items_count', 'is_today',
            'is_future', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DailyMenuDetailSerializer(serializers.ModelSerializer):
    """Détail d'un menu du jour (vue restaurateur)."""

    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    daily_menu_items = DailyMenuItemSerializer(many=True, read_only=True)
    total_items_count = serializers.ReadOnlyField()
    estimated_total_price = serializers.SerializerMethodField()
    is_today = serializers.ReadOnlyField()
    is_future = serializers.ReadOnlyField()

    is_formula = serializers.SerializerMethodField()
    price_per_category = serializers.SerializerMethodField()
    categories_count = serializers.SerializerMethodField()

    items_by_category = serializers.SerializerMethodField()

    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant', 'restaurant_name', 'date', 'title', 'description',
            'is_active', 'special_price', 'daily_menu_items', 'total_items_count',
            'estimated_total_price', 'is_today', 'is_future',
            'is_formula', 'price_per_category', 'categories_count',
            'items_by_category', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_is_formula(self, obj):
        return is_formula(obj)

    def get_price_per_category(self, obj):
        per_cat = price_per_category(obj)
        return float(per_cat) if per_cat is not None else None

    def get_categories_count(self, obj):
        return len(distinct_category_ids(obj))

    def get_estimated_total_price(self, obj):
        """En mode formule, le total est exactement special_price (un plat par
        catégorie suffit). Sinon on retombe sur la somme des prix de base."""
        if is_formula(obj):
            return float(obj.special_price)
        items = obj.daily_menu_items.filter(is_available=True).select_related('menu_item')
        return float(sum(item.menu_item.price for item in items))

    def get_items_by_category(self, obj):
        """Items groupés par catégorie pour l'affichage restaurateur."""
        items = obj.daily_menu_items.filter(is_available=True).select_related(
            'menu_item__category'
        ).order_by('menu_item__category__order', 'display_order')

        categories = {}
        for item in items:
            cat = item.menu_item.category
            cat_name = cat.name if cat else 'Autres'
            cat_id = str(cat.id) if cat else None
            if cat_name not in categories:
                categories[cat_name] = {
                    'name': cat_name,
                    'category_id': cat_id,
                    'icon': cat.icon if cat else '🍽️',
                    'items': [],
                }
            categories[cat_name]['items'].append(
                DailyMenuItemSerializer(item, context=self.context).data
            )

        return list(categories.values())


class DailyMenuCreateSerializer(serializers.ModelSerializer):
    """Création d'un menu du jour.

    `special_price` est maintenant requis et > 0 : c'est le prix unique payé
    par le client pour la formule.
    """

    items = DailyMenuCreateItemSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = DailyMenu
        fields = [
            'restaurant', 'date', 'title', 'description', 'is_active',
            'special_price', 'items',
        ]
        extra_kwargs = {
            'special_price': {
                'required': True,
                'allow_null': False,
                'help_text': "Prix total du menu (formule) payé par le client.",
            },
        }

    def validate_special_price(self, value):
        if value is None:
            raise serializers.ValidationError("Le prix du menu est requis.")
        if value <= 0:
            raise serializers.ValidationError(
                "Le prix du menu doit être strictement positif."
            )
        return value

    def validate_date(self, value):
        if value < timezone.now().date() - timedelta(days=1):
            raise serializers.ValidationError(
                "Impossible de créer un menu pour une date antérieure à hier"
            )
        return value

    def validate(self, data):
        restaurant = data['restaurant']
        date = data['date']

        if DailyMenu.objects.filter(restaurant=restaurant, date=date).exists():
            raise serializers.ValidationError(
                f"Un menu du jour existe déjà pour le {date}"
            )

        return data

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user

        daily_menu = DailyMenu.objects.create(**validated_data)

        for item_data in items_data:
            # On force special_price à None côté items : la formule fait foi
            item_data.pop('special_price', None)
            DailyMenuItem.objects.create(
                daily_menu=daily_menu,
                special_price=None,
                **item_data,
            )

        return daily_menu


# ─────────────────────────────────────────────────────────────────────────────
# DailyMenu (API publique côté client)
# ─────────────────────────────────────────────────────────────────────────────

class DailyMenuPublicSerializer(serializers.ModelSerializer):
    """Serializer pour l'API publique (côté client mobile).

    Expose tout ce qu'il faut pour afficher la formule du jour avec multi-choix
    par catégorie. Les items renvoyés ne portent jamais de prix individuel :
    `effective_price` = `price_per_category` en formule, sinon prix de carte.
    """

    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    restaurant_image = serializers.SerializerMethodField()
    items_by_category = serializers.SerializerMethodField()
    total_items_count = serializers.ReadOnlyField()
    estimated_total_price = serializers.SerializerMethodField()

    is_formula = serializers.SerializerMethodField()
    price_per_category = serializers.SerializerMethodField()
    categories_count = serializers.SerializerMethodField()

    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant_name', 'restaurant_image', 'date', 'title',
            'description', 'special_price',
            'is_formula', 'price_per_category', 'categories_count',
            'items_by_category',
            'total_items_count', 'estimated_total_price',
        ]

    def get_restaurant_image(self, obj):
        if obj.restaurant and obj.restaurant.image:
            try:
                return obj.restaurant.image.url
            except (ValueError, AttributeError):
                pass
        return None

    def get_is_formula(self, obj):
        return is_formula(obj)

    def get_price_per_category(self, obj):
        per_cat = price_per_category(obj)
        return float(per_cat) if per_cat is not None else None

    def get_categories_count(self, obj):
        return len(distinct_category_ids(obj))

    def get_estimated_total_price(self, obj):
        if is_formula(obj):
            return float(obj.special_price)
        items = obj.daily_menu_items.filter(is_available=True).select_related('menu_item')
        return float(sum(item.menu_item.price for item in items))

    def get_items_by_category(self, obj):
        """Items groupés par catégorie pour affichage client.

        Forme alignée avec le typage frontend `DailyMenuItem` (champs préfixés
        `menu_item_*`). En mode formule, l'`effective_price` exposé est le
        prix par catégorie de la formule (pas un éventuel prix individuel).
        """
        items = obj.daily_menu_items.filter(is_available=True).select_related(
            'menu_item__category'
        ).order_by('menu_item__category__order', 'display_order')

        formula_active = is_formula(obj)
        per_cat = price_per_category(obj)
        per_cat_float = float(per_cat) if per_cat is not None else None

        categories = {}
        for item in items:
            mi = item.menu_item
            cat = mi.category
            cat_name = cat.name if cat else 'Autres'
            cat_id = str(cat.id) if cat else None
            cat_icon = cat.icon if cat else '🍽️'

            if cat_name not in categories:
                categories[cat_name] = {
                    'name': cat_name,
                    'category_id': cat_id,
                    'icon': cat_icon,
                    'items': [],
                }

            if formula_active and per_cat_float is not None:
                effective = per_cat_float
            else:
                effective = float(mi.price)

            original = float(mi.price)
            has_discount = effective < original
            discount_pct = (
                round((original - effective) / original * 100)
                if has_discount and original > 0 else 0
            )

            categories[cat_name]['items'].append({
                'id': str(item.id),                  # DailyMenuItem.id (UUID)
                'menu_item': mi.id,                  # FK MenuItem (entier)
                'menu_item_name': mi.name,
                'menu_item_description': mi.description,
                'menu_item_image': mi.image.url if mi.image else None,
                'menu_item_category': cat_name,
                'menu_item_category_id': cat_id,
                'menu_item_category_icon': cat_icon,
                'original_price': original,
                # Plus de prix par item : null systématiquement
                'special_price': None,
                'effective_price': effective,
                'has_discount': has_discount,
                'discount_percentage': discount_pct,
                'is_available': item.is_available,
                'display_order': item.display_order,
                'special_note': item.special_note,
                'is_vegetarian': mi.is_vegetarian,
                'is_vegan': mi.is_vegan,
                'is_gluten_free': mi.is_gluten_free,
                'allergens': mi.allergens,
            })

        return list(categories.values())


# ─────────────────────────────────────────────────────────────────────────────
# Templates
# ─────────────────────────────────────────────────────────────────────────────

class DailyMenuTemplateSerializer(serializers.ModelSerializer):
    """Serializer pour les templates de menus du jour."""

    template_items = serializers.SerializerMethodField()

    class Meta:
        model = DailyMenuTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'day_of_week',
            'default_special_price', 'usage_count', 'last_used',
            'template_items', 'created_at',
        ]
        read_only_fields = ['id', 'usage_count', 'last_used', 'created_at']

    def get_template_items(self, obj):
        items = obj.template_items.select_related('menu_item__category').order_by('display_order')
        return [{
            'id': str(item.id),
            'menu_item_id': str(item.menu_item.id),
            'menu_item_name': item.menu_item.name,
            'category_name': item.menu_item.category.name if item.menu_item.category else 'Autres',
            'original_price': float(item.menu_item.price),
            # default_special_price gardé pour rétrocompat front (formulaire de
            # création de template) — il est ignoré à l'application du template.
            'default_special_price': float(item.default_special_price) if item.default_special_price else None,
            'display_order': item.display_order,
            'default_note': item.default_note,
        } for item in items]