from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from api.models import DailyMenu, DailyMenuItem, DailyMenuTemplate, DailyMenuTemplateItem, MenuItem, MenuCategory
from api.serializers.menu_serializers import MenuItemSerializer
from api.serializers.restaurant_serializers import RestaurantSerializer


class DailyMenuItemSerializer(serializers.ModelSerializer):
    """Serializer pour les plats d'un menu du jour"""
    
    # Données du plat original
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_description = serializers.CharField(source='menu_item.description', read_only=True)
    menu_item_category = serializers.CharField(source='menu_item.category.name', read_only=True)
    menu_item_category_icon = serializers.CharField(source='menu_item.category.icon', read_only=True)
    menu_item_image = serializers.ImageField(source='menu_item.image', read_only=True)
    original_price = serializers.DecimalField(source='menu_item.price', max_digits=8, decimal_places=2, read_only=True)
    
    # Prix et remises calculés
    effective_price = serializers.ReadOnlyField()
    has_discount = serializers.ReadOnlyField()
    discount_percentage = serializers.ReadOnlyField()
    
    # Informations diététiques
    is_vegetarian = serializers.BooleanField(source='menu_item.is_vegetarian', read_only=True)
    is_vegan = serializers.BooleanField(source='menu_item.is_vegan', read_only=True)
    is_gluten_free = serializers.BooleanField(source='menu_item.is_gluten_free', read_only=True)
    allergens = serializers.JSONField(source='menu_item.allergens', read_only=True)
    
    class Meta:
        model = DailyMenuItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_description', 
            'menu_item_category', 'menu_item_category_icon', 'menu_item_image',
            'original_price', 'special_price', 'effective_price', 
            'has_discount', 'discount_percentage', 'is_available', 
            'display_order', 'special_note', 'is_vegetarian', 'is_vegan', 
            'is_gluten_free', 'allergens'
        ]
        read_only_fields = ['id']


class DailyMenuCreateItemSerializer(serializers.ModelSerializer):
    """Serializer simplifié pour créer des items de menu du jour"""
    
    class Meta:
        model = DailyMenuItem
        fields = ['menu_item', 'special_price', 'display_order', 'special_note', 'is_available']


class DailyMenuListSerializer(serializers.ModelSerializer):
    """Serializer pour la liste des menus du jour (vue restaurateur)"""
    
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    total_items_count = serializers.ReadOnlyField()
    is_today = serializers.ReadOnlyField()
    is_future = serializers.ReadOnlyField()
    
    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant', 'restaurant_name', 'date', 'title', 'description',
            'is_active', 'special_price', 'total_items_count', 'is_today', 
            'is_future', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DailyMenuDetailSerializer(serializers.ModelSerializer):
    """Serializer détaillé pour un menu du jour (vue restaurateur)"""
    
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    daily_menu_items = DailyMenuItemSerializer(many=True, read_only=True)
    total_items_count = serializers.ReadOnlyField()
    estimated_total_price = serializers.ReadOnlyField()
    is_today = serializers.ReadOnlyField()
    is_future = serializers.ReadOnlyField()
    
    # Statistiques par catégorie
    items_by_category = serializers.SerializerMethodField()
    
    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant', 'restaurant_name', 'date', 'title', 'description',
            'is_active', 'special_price', 'daily_menu_items', 'total_items_count',
            'estimated_total_price', 'is_today', 'is_future', 'items_by_category',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_items_by_category(self, obj):
        """Groupe les items par catégorie pour l'affichage"""
        items = obj.daily_menu_items.filter(is_available=True).select_related(
            'menu_item__category'
        ).order_by('menu_item__category__order', 'display_order')
        
        categories = {}
        for item in items:
            category_name = item.menu_item.category.name if item.menu_item.category else 'Autres'
            if category_name not in categories:
                categories[category_name] = {
                    'name': category_name,
                    'icon': item.menu_item.category.icon if item.menu_item.category else '🍽️',
                    'items': []
                }
            categories[category_name]['items'].append(DailyMenuItemSerializer(item).data)
        
        return list(categories.values())


class DailyMenuCreateSerializer(serializers.ModelSerializer):
    """Serializer pour créer un menu du jour"""
    
    items = DailyMenuCreateItemSerializer(many=True, write_only=True, required=False)
    
    class Meta:
        model = DailyMenu
        fields = [
            'restaurant', 'date', 'title', 'description', 'is_active', 
            'special_price', 'items'
        ]
    
    def validate_date(self, value):
        """Valide que la date n'est pas trop ancienne"""
        if value < timezone.now().date() - timedelta(days=1):
            raise serializers.ValidationError(
                "Impossible de créer un menu pour une date antérieure à hier"
            )
        return value
    
    def validate(self, data):
        """Valide qu'il n'existe pas déjà un menu pour cette date"""
        restaurant = data['restaurant']
        date = data['date']
        
        if DailyMenu.objects.filter(restaurant=restaurant, date=date).exists():
            raise serializers.ValidationError(
                f"Un menu du jour existe déjà pour le {date}"
            )
        
        return data
    
    def create(self, validated_data):
        """Crée le menu et ses items"""
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        
        daily_menu = DailyMenu.objects.create(**validated_data)
        
        # Créer les items
        for item_data in items_data:
            DailyMenuItem.objects.create(daily_menu=daily_menu, **item_data)
        
        return daily_menu


class DailyMenuPublicSerializer(serializers.ModelSerializer):
    """Serializer pour l'API publique (côté client).

    Expose les informations nécessaires au front mobile pour afficher le
    menu du jour ET appliquer la logique "formule" :
    - si `special_price` est défini sur le menu et qu'au moins une
      catégorie est représentée, on bascule en mode formule : le prix
      affiché par item devient `special_price / nb_catégories_distinctes`
      et la règle "1 plat par catégorie" peut être appliquée côté client ;
    - sinon, on retombe sur l'`effective_price` standard du DailyMenuItem
      (prix spécial éventuel sinon prix de base du MenuItem).
    """

    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    # FIX: Le modèle Restaurant utilise 'image', pas 'logo'
    restaurant_image = serializers.SerializerMethodField()
    items_by_category = serializers.SerializerMethodField()
    total_items_count = serializers.ReadOnlyField()
    estimated_total_price = serializers.ReadOnlyField()

    # Champs spécifiques au mode formule
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

    # ---------- Helpers internes ----------

    def _distinct_category_ids(self, obj):
        """Set des UUIDs de catégories distinctes représentées par les items
        disponibles de ce menu du jour. Sert de base au calcul du prix
        par catégorie en mode formule."""
        return set(
            obj.daily_menu_items
                .filter(is_available=True)
                .values_list('menu_item__category_id', flat=True)
                .distinct()
        )

    def _is_formula(self, obj):
        return obj.special_price is not None and len(self._distinct_category_ids(obj)) > 0

    def _price_per_category(self, obj):
        """Prix d'un item en mode formule : special_price / nb_catégories.
        Retourne None si on n'est pas en mode formule."""
        if obj.special_price is None:
            return None
        cat_ids = self._distinct_category_ids(obj)
        if not cat_ids:
            return None
        # Decimal pour éviter les imprécisions float, arrondi à 2 décimales
        per_cat = (Decimal(obj.special_price) / Decimal(len(cat_ids))).quantize(Decimal('0.01'))
        return float(per_cat)

    # ---------- Méthodes du serializer ----------

    def get_restaurant_image(self, obj):
        """Retourne l'URL de l'image du restaurant"""
        if obj.restaurant and obj.restaurant.image:
            try:
                return obj.restaurant.image.url
            except (ValueError, AttributeError):
                pass
        return None

    def get_is_formula(self, obj):
        return self._is_formula(obj)

    def get_price_per_category(self, obj):
        return self._price_per_category(obj)

    def get_categories_count(self, obj):
        return len(self._distinct_category_ids(obj))

    def get_items_by_category(self, obj):
        """Items groupés par catégorie pour affichage client.

        Note : la forme renvoyée doit rester cohérente avec le typage
        front `DailyMenuItem` (champs préfixés `menu_item_*`). En mode
        formule, l'`effective_price` exposé est le prix par catégorie
        de la formule, pas l'éventuel prix spécial du DailyMenuItem.
        """
        items = obj.daily_menu_items.filter(is_available=True).select_related(
            'menu_item__category'
        ).order_by('menu_item__category__order', 'display_order')

        is_formula = self._is_formula(obj)
        per_cat_price = self._price_per_category(obj)

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
                    'items': []
                }

            # Prix effectif côté client : formule prioritaire sinon prix
            # spécial du DailyMenuItem sinon prix de base du MenuItem.
            if is_formula and per_cat_price is not None:
                effective = per_cat_price
            else:
                effective = float(item.effective_price)

            original = float(mi.price)
            has_discount = effective < original
            discount_pct = (
                round((original - effective) / original * 100)
                if has_discount and original > 0 else 0
            )

            categories[cat_name]['items'].append({
                'id': str(item.id),                  # DailyMenuItem.id (UUID)
                'menu_item': mi.id,                  # FK MenuItem (entier) — utilisé par le panier
                'menu_item_name': mi.name,
                'menu_item_description': mi.description,
                'menu_item_image': mi.image.url if mi.image else None,
                'menu_item_category': cat_name,
                'menu_item_category_id': cat_id,
                'menu_item_category_icon': cat_icon,
                'original_price': original,
                'special_price': float(item.special_price) if item.special_price is not None else None,
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


class DailyMenuTemplateSerializer(serializers.ModelSerializer):
    """Serializer pour les templates de menus du jour"""
    
    template_items = serializers.SerializerMethodField()
    
    class Meta:
        model = DailyMenuTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'day_of_week', 
            'default_special_price', 'usage_count', 'last_used', 
            'template_items', 'created_at'
        ]
        read_only_fields = ['id', 'usage_count', 'last_used', 'created_at']
    
    def get_template_items(self, obj):
        """Items du template avec informations détaillées"""
        items = obj.template_items.select_related('menu_item__category').order_by('display_order')
        return [{
            'id': str(item.id),
            'menu_item_id': str(item.menu_item.id),
            'menu_item_name': item.menu_item.name,
            'category_name': item.menu_item.category.name if item.menu_item.category else 'Autres',
            'original_price': float(item.menu_item.price),
            'default_special_price': float(item.default_special_price) if item.default_special_price else None,
            'display_order': item.display_order,
            'default_note': item.default_note
        } for item in items]