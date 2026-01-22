import os
from rest_framework import serializers
from api.models import Menu, MenuItem

class MenuItemSerializer(serializers.ModelSerializer):
    """Serializer amélioré pour les items de menu avec catégories"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)
    subcategory_name = serializers.CharField(source='subcategory.name', read_only=True)
    dietary_tags = serializers.ReadOnlyField()
    allergen_display = serializers.ReadOnlyField()
    image = serializers.ImageField(required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()
    # Champs TVA
    vat_category = serializers.ChoiceField(
        choices=MenuItem.VAT_CATEGORIES,
        required=False,
        default='FOOD'
    )
    vat_rate = serializers.DecimalField(
        max_digits=4,
        decimal_places=3,
        required=False,
        allow_null=True
    )
    price_excl_vat = serializers.ReadOnlyField()
    vat_amount = serializers.ReadOnlyField()
    vat_rate_display = serializers.ReadOnlyField()
    
    class Meta:
        model = MenuItem
        fields = [
            'id', 'menu', 'name', 'description', 'price', 'is_available',
            'category', 'category_name', 'category_icon',
            'subcategory', 'subcategory_name',
            'allergens', 'allergen_display',
            'is_vegetarian', 'is_vegan', 'is_gluten_free',
            'dietary_tags', 'preparation_time',
            'image', 'image_url',
            'created_at', 'updated_at',
            'vat_category', 'vat_rate', 'price_excl_vat', 
            'vat_amount', 'vat_rate_display'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'dietary_tags', 'allergen_display', 'image_url']
    
    def create(self, validated_data):
        # Arrondir le vat_rate à 3 décimales si fourni
        if 'vat_rate' in validated_data and validated_data['vat_rate']:
            from decimal import Decimal, ROUND_HALF_UP
            validated_data['vat_rate'] = Decimal(str(validated_data['vat_rate'])).quantize(
                Decimal('0.001'), 
                rounding=ROUND_HALF_UP
            )
        return super().create(validated_data)

    def get_image_url(self, obj):
        request = self.context.get('request')
        if obj.image and hasattr(obj.image, 'url') and request:
            return request.build_absolute_uri(obj.image.url)
        return None
    
    def validate_price(self, value):
        """Validation du prix - doit être positif"""
        from decimal import Decimal
        if value is not None and Decimal(str(value)) <= 0:
            raise serializers.ValidationError(
                "Le prix doit être supérieur à zéro"
            )
        return value
    
    def validate_image(self, value):
        """Validation du fichier image"""
        if value is None:
            return value
            
        # Vérifier le type de fichier
        allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        if hasattr(value, 'content_type') and value.content_type:
            if value.content_type not in allowed_types:
                raise serializers.ValidationError(
                    "Format d'image non supporté. Utilisez JPEG, PNG ou WebP."
                )
        
        # Vérifier la taille (max 5MB)
        if hasattr(value, 'size') and value.size:
            if value.size > 5 * 1024 * 1024:
                raise serializers.ValidationError(
                    "L'image ne doit pas dépasser 5MB."
                )
        
        # Vérifier l'extension
        if hasattr(value, 'name') and value.name:
            allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp']
            file_extension = os.path.splitext(value.name)[1].lower()
            if file_extension not in allowed_extensions:
                raise serializers.ValidationError(
                    "Extension de fichier non supportée. Utilisez .jpg, .png ou .webp"
                )
        
        return value

    def validate_allergens(self, value):
        """Validation de la liste des allergènes"""
        # si 'value' arrive en string JSON (multipart), le parser
        if isinstance(value, str):
            import json
            value = json.loads(value or '[]')
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