from rest_framework import serializers
from django.core.validators import RegexValidator
from api.models import MenuCategory, MenuSubCategory, MenuItem

class MenuSubCategorySerializer(serializers.ModelSerializer):
    """Serializer pour les sous-catégories"""
    
    menu_items_count = serializers.ReadOnlyField()
    restaurant_id = serializers.CharField(source='category.restaurant.id', read_only=True)
    
    class Meta:
        model = MenuSubCategory
        fields = [
            'id', 'name', 'description', 'is_active', 'order',
            'menu_items_count', 'restaurant_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'menu_items_count']
    
    def validate_name(self, value):
        """Validation du nom de sous-catégorie"""
        if len(value.strip()) < 2:
            raise serializers.ValidationError(
                "Le nom de la sous-catégorie doit contenir au moins 2 caractères"
            )
        return value.strip().title()


class MenuCategorySerializer(serializers.ModelSerializer):
    """Serializer principal pour les catégories avec sous-catégories imbriquées"""
    
    subcategories = MenuSubCategorySerializer(many=True, read_only=True)
    active_subcategories_count = serializers.ReadOnlyField()
    total_menu_items_count = serializers.ReadOnlyField()
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    
    class Meta:
        model = MenuCategory
        fields = [
            'id', 'name', 'description', 'icon', 'color', 
            'is_active', 'order', 'restaurant', 'restaurant_name',
            'subcategories', 'active_subcategories_count', 'total_menu_items_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 
            'active_subcategories_count', 'total_menu_items_count'
        ]
    
    def validate_name(self, value):
        """Validation du nom de catégorie"""
        if len(value.strip()) < 2:
            raise serializers.ValidationError(
                "Le nom de la catégorie doit contenir au moins 2 caractères"
            )
        return value.strip().title()
    
    def validate_color(self, value):
        """Validation du code couleur hexadécimal"""
        if value and not value.startswith('#'):
            value = f"#{value}"
        
        hex_validator = RegexValidator(
            regex=r'^#[0-9A-Fa-f]{6}$',
            message='La couleur doit être un code hexadécimal valide (ex: #1E2A78)'
        )
        hex_validator(value)
        return value.upper()
    
    def validate_icon(self, value):
        """Validation de l'icône emoji"""
        if value and len(value) > 10:
            raise serializers.ValidationError(
                "L'icône ne peut pas dépasser 10 caractères"
            )
        return value
    
    def validate(self, attrs):
        """Validation au niveau de l'objet"""
        restaurant = attrs.get('restaurant')
        name = attrs.get('name')
        
        # Vérifier l'unicité du nom par restaurant (sauf pour l'objet en cours de modification)
        if restaurant and name:
            existing_category = MenuCategory.objects.filter(
                restaurant=restaurant,
                name__iexact=name
            )
            
            # Exclure l'objet actuel lors de la modification
            if self.instance:
                existing_category = existing_category.exclude(pk=self.instance.pk)
            
            if existing_category.exists():
                raise serializers.ValidationError({
                    'name': 'Une catégorie avec ce nom existe déjà pour ce restaurant'
                })
        
        return attrs


class MenuCategoryCreateSerializer(serializers.ModelSerializer):
    """Serializer simplifié pour la création de catégories"""
    
    class Meta:
        model = MenuCategory
        fields = ['restaurant', 'name', 'description', 'icon', 'color', 'is_active', 'order']
    
    def validate_name(self, value):
        return MenuCategorySerializer().validate_name(value)
    
    def validate_color(self, value):
        return MenuCategorySerializer().validate_color(value)


class MenuSubCategoryCreateSerializer(serializers.ModelSerializer):
    """Serializer pour la création de sous-catégories"""
    
    class Meta:
        model = MenuSubCategory
        fields = ['restaurant', 'category', 'name', 'description', 'is_active', 'order']
    
    def validate_name(self, value):
        return MenuSubCategorySerializer().validate_name(value)
    
    def validate(self, attrs):
        """Validation de l'unicité du nom par catégorie"""
        category = attrs.get('category')
        name = attrs.get('name')
        
        if category and name:
            existing_subcategory = MenuSubCategory.objects.filter(
                category=category,
                name__iexact=name
            )
            
            if self.instance:
                existing_subcategory = existing_subcategory.exclude(pk=self.instance.pk)
            
            if existing_subcategory.exists():
                raise serializers.ValidationError({
                    'name': 'Une sous-catégorie avec ce nom existe déjà pour cette catégorie'
                })
        
        return attrs