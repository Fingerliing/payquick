from rest_framework import serializers
from api.models import Menu, MenuItem

class MenuItemSerializer(serializers.ModelSerializer):
    allergen_display = serializers.ReadOnlyField()
    dietary_tags = serializers.ReadOnlyField()

    class Meta:
        model = MenuItem
        fields = [
            'id', 'name', 'description', 'price', 'category', 
            'is_available', 'menu', 'allergens', 'is_vegetarian', 
            'is_vegan', 'is_gluten_free', 'allergen_display', 
            'dietary_tags', 'created_at', 'updated_at'
        ]

    def validate_allergens(self, value):
        """Validation des allergènes"""
        valid_allergens = {
            'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 
            'soybeans', 'milk', 'nuts', 'celery', 'mustard', 
            'sesame', 'sulphites', 'lupin', 'molluscs'
        }
        
        if not isinstance(value, list):
            raise serializers.ValidationError("Les allergènes doivent être une liste")
        
        invalid_allergens = set(value) - valid_allergens
        if invalid_allergens:
            raise serializers.ValidationError(
                f"Allergènes invalides: {', '.join(invalid_allergens)}"
            )
        
        return value

    def validate(self, data):
        """Validation globale"""
        # Si vegan, alors végétarien
        if data.get('is_vegan') and not data.get('is_vegetarian'):
            data['is_vegetarian'] = True
        
        # Si sans gluten, retirer le gluten des allergènes
        if data.get('is_gluten_free') and 'gluten' in data.get('allergens', []):
            data['allergens'] = [a for a in data['allergens'] if a != 'gluten']
        
        # Si vegan, retirer lait et œufs
        if data.get('is_vegan'):
            allergens = data.get('allergens', [])
            data['allergens'] = [a for a in allergens if a not in ['milk', 'eggs']]
        
        return data

class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)
    restaurant_owner_id = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['id', 'name', 'restaurant', 'items', 'created_at', 'updated_at', 'restaurant_owner_id', 'is_available']

    def get_restaurant_owner_id(self, obj):
        return obj.restaurant.owner.id