from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
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
    """Serializer pour l'API publique (côté client)"""
    
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    restaurant_logo = serializers.ImageField(source='restaurant.logo', read_only=True)
    items_by_category = serializers.SerializerMethodField()
    total_items_count = serializers.ReadOnlyField()
    estimated_total_price = serializers.ReadOnlyField()
    
    class Meta:
        model = DailyMenu
        fields = [
            'id', 'restaurant_name', 'restaurant_logo', 'date', 'title', 
            'description', 'special_price', 'items_by_category', 
            'total_items_count', 'estimated_total_price'
        ]
    
    def get_items_by_category(self, obj):
        """Items groupés par catégorie pour affichage client"""
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
            
            # Données simplifiées pour le client
            categories[category_name]['items'].append({
                'id': str(item.id),
                'name': item.menu_item.name,
                'description': item.menu_item.description,
                'price': float(item.effective_price),
                'original_price': float(item.menu_item.price) if item.has_discount else None,
                'special_note': item.special_note,
                'image_url': item.menu_item.image.url if item.menu_item.image else None,
                'is_vegetarian': item.menu_item.is_vegetarian,
                'is_vegan': item.menu_item.is_vegan,
                'is_gluten_free': item.menu_item.is_gluten_free,
                'allergens': item.menu_item.allergens,
                'has_discount': item.has_discount,
                'discount_percentage': item.discount_percentage
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