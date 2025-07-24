# backend/api/serializers/restaurant_serializers.py

from rest_framework import serializers
from api.models import Restaurant, OpeningHours
from django.contrib.auth.models import User

class OpeningHoursSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les horaires d'ouverture"""
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)
    
    class Meta:
        model = OpeningHours
        fields = [
            'id', 'day_of_week', 'day_name', 'opening_time', 
            'closing_time', 'is_closed'
        ]

class RestaurantSerializer(serializers.ModelSerializer):
    """Sérialiseur Restaurant complet pour correspondre au frontend"""
    
    # Champs calculés et relationnels
    owner_name = serializers.CharField(source='owner.display_name', read_only=True)
    owner_id = serializers.CharField(source='owner.id', read_only=True)
    opening_hours = OpeningHoursSerializer(many=True, read_only=True)
    
    # Géolocalisation (structure attendue par le frontend)
    location = serializers.SerializerMethodField()
    
    # Image avec URL complète
    image_url = serializers.SerializerMethodField()
    
    # Champs frontend vs backend mapping
    zipCode = serializers.CharField(source='zip_code', required=False)
    priceRange = serializers.IntegerField(source='price_range', required=False)
    reviewCount = serializers.IntegerField(source='review_count', read_only=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    
    # Métadonnées
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Restaurant
        fields = [
            # IDs
            'id', 'owner_id', 'owner_name',
            
            # Informations de base
            'name', 'description', 'cuisine', 'priceRange', 'price_range',
            
            # Adresse
            'address', 'city', 'zipCode', 'zip_code', 'country', 'full_address',
            
            # Contact
            'phone', 'email', 'website',
            
            # Médias et évaluation
            'image', 'image_url', 'rating', 'reviewCount', 'review_count',
            
            # Géolocalisation
            'latitude', 'longitude', 'location',
            
            # Statut et gestion
            'isActive', 'is_active', 'siret', 'is_stripe_active', 'can_receive_orders',
            
            # Relations
            'opening_hours',
            
            # Métadonnées
            'createdAt', 'updatedAt', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'owner_id', 'owner_name', 'created_at', 'updated_at', 
            'createdAt', 'updatedAt', 'can_receive_orders', 'rating', 
            'review_count', 'reviewCount', 'full_address'
        ]
        extra_kwargs = {
            'siret': {'write_only': True},  # Pas exposé au frontend pour la sécurité
        }
    
    def get_location(self, obj):
        """Retourne la structure de géolocalisation attendue par le frontend"""
        return {
            'latitude': float(obj.latitude) if obj.latitude else 0.0,
            'longitude': float(obj.longitude) if obj.longitude else 0.0,
        }
    
    def get_image_url(self, obj):
        """Retourne l'URL complète de l'image"""
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def validate_phone(self, value):
        """Validation du numéro de téléphone"""
        import re
        # Nettoyer le numéro
        cleaned = re.sub(r'[\s\.\-]', '', value)
        
        # Patterns français acceptés
        patterns = [
            r'^(\+33|0)[1-9]\d{8}$',  # Format standard
            r'^\+33\s?[1-9](\s?\d{2}){4}$',  # Avec espaces
        ]
        
        if not any(re.match(pattern, value) for pattern in patterns):
            raise serializers.ValidationError(
                "Format de téléphone invalide. Utilisez +33123456789 ou 0123456789"
            )
        return value
    
    def validate_zip_code(self, value):
        """Validation du code postal français"""
        import re
        if not re.match(r'^\d{5}$', value):
            raise serializers.ValidationError(
                "Le code postal doit contenir exactement 5 chiffres"
            )
        return value
    
    def validate_price_range(self, value):
        """Validation de la gamme de prix"""
        if value not in [1, 2, 3, 4]:
            raise serializers.ValidationError(
                "La gamme de prix doit être entre 1 et 4"
            )
        return value
    
    def create(self, validated_data):
        """Création d'un restaurant avec génération automatique du SIRET si manquant"""
        
        # Générer un SIRET unique si non fourni (pour les tests)
        if not validated_data.get('siret'):
            import random
            while True:
                siret = ''.join([str(random.randint(0, 9)) for _ in range(14)])
                if not Restaurant.objects.filter(siret=siret).exists():
                    validated_data['siret'] = siret
                    break
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Mise à jour avec gestion des champs spéciaux"""
        
        # Ne pas permettre la modification du SIRET après création
        validated_data.pop('siret', None)
        
        return super().update(instance, validated_data)

class RestaurantCreateSerializer(serializers.ModelSerializer):
    """Sérialiseur simplifié pour la création depuis le frontend"""
    
    # Mapping des champs frontend -> backend
    zipCode = serializers.CharField(source='zip_code')
    priceRange = serializers.IntegerField(source='price_range')
    
    class Meta:
        model = Restaurant
        fields = [
            'name', 'description', 'address', 'city', 'zipCode', 
            'country', 'phone', 'email', 'website', 'cuisine', 
            'priceRange', 'latitude', 'longitude'
        ]
    
    def create(self, validated_data):
        """Création avec génération automatique du SIRET"""
        
        # Générer un SIRET unique
        import random
        while True:
            siret = ''.join([str(random.randint(0, 9)) for _ in range(14)])
            if not Restaurant.objects.filter(siret=siret).exists():
                validated_data['siret'] = siret
                break
        
        # Valeurs par défaut
        validated_data.setdefault('is_active', True)
        validated_data.setdefault('rating', 0.00)
        validated_data.setdefault('review_count', 0)
        
        return super().create(validated_data)