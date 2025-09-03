from rest_framework import serializers
from api.models import Menu, MenuItem

class MenuItemSerializer(serializers.ModelSerializer):
    """Serializer amélioré pour les items de menu avec catégories"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)
    subcategory_name = serializers.CharField(source='subcategory.name', read_only=True)
    dietary_tags = serializers.ReadOnlyField()
    allergen_display = serializers.ReadOnlyField()
    
    class Meta:
        model = MenuItem
        fields = [
            'id', 'menu', 'name', 'description', 'price', 'is_available',
            'category', 'category_name', 'category_icon',
            'subcategory', 'subcategory_name',
            'allergens', 'allergen_display',
            'is_vegetarian', 'is_vegan', 'is_gluten_free',
            'dietary_tags', 'preparation_time',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'dietary_tags', 'allergen_display']
    
    def validate_allergens(self, value):
        """Validation de la liste des allergènes"""
        if not isinstance(value, list):
            raise serializers.ValidationError("Les allergènes doivent être une liste")
        
        valid_allergens = [
            'gluten', 'crustaceans', 'eggs', 'fish',
            'peanuts', 'soy', 'milk', 'nuts',
            'celery', 'mustard', 'sesame', 'sulfites',
            'lupin', 'mollusks'
        ]
        
        invalid_allergens = [a for a in value if a not in valid_allergens]
        if invalid_allergens:
            raise serializers.ValidationError(
                f"Allergènes non reconnus: {', '.join(invalid_allergens)}"
            )
        
        return list(set(value))  # Supprimer les doublons
    
    def validate(self, attrs):
        """Validation au niveau de l'objet"""
        category = attrs.get('category')
        subcategory = attrs.get('subcategory')
        is_vegan = attrs.get('is_vegan', False)
        is_vegetarian = attrs.get('is_vegetarian', False)
        
        # Vérifier que la sous-catégorie appartient à la catégorie
        if category and subcategory and subcategory.category != category:
            raise serializers.ValidationError({
                'subcategory': 'La sous-catégorie doit appartenir à la catégorie sélectionnée'
            })
        
        # Si végan, alors automatiquement végétarien
        if is_vegan and not is_vegetarian:
            attrs['is_vegetarian'] = True
        
        return attrs

class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)
    restaurant_owner_id = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['id', 'name', 'restaurant', 'items', 'created_at', 'updated_at', 'restaurant_owner_id', 'is_available']

    def get_restaurant_owner_id(self, obj):
        return obj.restaurant.owner.id