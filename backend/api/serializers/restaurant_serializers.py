from rest_framework import serializers
from api.models import Restaurant, OpeningHours, OpeningPeriod, RestaurantHoursTemplate
from django.contrib.auth.models import User
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils import timezone
import os

class OpeningPeriodSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les périodes d'ouverture"""
    
    id = serializers.CharField(read_only=True)
    startTime = serializers.TimeField(source='start_time', format='%H:%M')
    endTime = serializers.TimeField(source='end_time', format='%H:%M')
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = OpeningPeriod
        fields = ['id', 'startTime', 'endTime', 'name']
    
    def to_representation(self, instance):
        """Convertir en format frontend"""
        return {
            'id': str(instance.id),
            'startTime': instance.start_time.strftime('%H:%M'),
            'endTime': instance.end_time.strftime('%H:%M'),
            'name': instance.name or ''
        }

class OpeningHoursSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les horaires d'ouverture - Version multi-périodes"""
    
    id = serializers.CharField(read_only=True)
    dayOfWeek = serializers.IntegerField(source='day_of_week')
    isClosed = serializers.BooleanField(source='is_closed')
    periods = OpeningPeriodSerializer(many=True, required=False)
    
    # Rétrocompatibilité
    openTime = serializers.TimeField(source='opening_time', format='%H:%M', required=False, allow_null=True)
    closeTime = serializers.TimeField(source='closing_time', format='%H:%M', required=False, allow_null=True)
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)
    
    class Meta:
        model = OpeningHours
        fields = [
            'id', 'dayOfWeek', 'isClosed', 'periods',
            # Rétrocompatibilité
            'openTime', 'closeTime', 'day_name'
        ]
    
    def to_representation(self, instance):
        """Convertir en format frontend avec migration automatique"""
        data = {
            'id': str(instance.id),
            'dayOfWeek': instance.day_of_week,
            'isClosed': instance.is_closed,
            'periods': []
        }
        
        if instance.is_closed:
            return data
        
        # Utiliser les nouvelles périodes si disponibles
        if instance.periods.exists():
            data['periods'] = [
                OpeningPeriodSerializer(period).data 
                for period in instance.periods.all()
            ]
        elif instance.opening_time and instance.closing_time:
            # Migration automatique depuis l'ancien format
            data['periods'] = [{
                'id': None,
                'startTime': instance.opening_time.strftime('%H:%M'),
                'endTime': instance.closing_time.strftime('%H:%M'),
                'name': 'Service principal'
            }]
        
        return data
    
    def create(self, validated_data):
        """Création avec support des périodes"""
        periods_data = validated_data.pop('periods', [])
        opening_hours = super().create(validated_data)
        
        # Créer les périodes
        for period_data in periods_data:
            OpeningPeriod.objects.create(
                opening_hours=opening_hours,
                **period_data
            )
        
        return opening_hours
    
    def update(self, instance, validated_data):
        """Mise à jour avec gestion des périodes"""
        periods_data = validated_data.pop('periods', None)
        
        # Mettre à jour les champs de base
        instance = super().update(instance, validated_data)
        
        # Gérer les périodes si fournies
        if periods_data is not None:
            # Supprimer les anciennes périodes
            instance.periods.all().delete()
            
            # Créer les nouvelles si pas fermé
            if not instance.is_closed:
                for period_data in periods_data:
                    OpeningPeriod.objects.create(
                        opening_hours=instance,
                        **period_data
                    )
        
        return instance

class RestaurantSerializer(serializers.ModelSerializer):
    """Sérialiseur Restaurant complet aligné avec le frontend"""
    
    # Champs calculés et relationnels
    owner_name = serializers.CharField(source='owner.display_name', read_only=True)
    owner_id = serializers.CharField(source='owner.id', read_only=True)
    opening_hours = OpeningHoursSerializer(many=True, read_only=True)
    
    # NOUVEAU: Support des fermetures manuelles
    isManuallyOverridden = serializers.BooleanField(
        source='is_manually_overridden', 
        required=False
    )
    manualOverrideReason = serializers.CharField(
        source='manual_override_reason', 
        required=False, 
        allow_blank=True, 
        allow_null=True
    )
    manualOverrideUntil = serializers.DateTimeField(
        source='manual_override_until', 
        required=False, 
        allow_null=True
    )
    lastStatusChangedBy = serializers.CharField(
        source='last_status_changed_by.username', 
        read_only=True
    )
    lastStatusChangedAt = serializers.DateTimeField(
        source='last_status_changed_at', 
        read_only=True
    )
    
    accepts_meal_vouchers_display = serializers.SerializerMethodField()
    
    # Géolocalisation
    location = serializers.SerializerMethodField()
    
    # Gestion des images
    image = serializers.ImageField(required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()
    image_name = serializers.SerializerMethodField()
    image_size = serializers.SerializerMethodField()
    
    # Champs frontend vs backend mapping
    zipCode = serializers.CharField(source='zip_code', required=False)
    priceRange = serializers.IntegerField(source='price_range', required=False)
    reviewCount = serializers.IntegerField(source='review_count', read_only=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    
    # Métadonnées
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    # ID forcé en string
    id = serializers.SerializerMethodField()
    
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
            
            # Images et médias
            'image', 'image_url', 'image_name', 'image_size',
            
            # Évaluation
            'rating', 'reviewCount', 'review_count',
            
            # Géolocalisation
            'latitude', 'longitude', 'location',
            
            # Statut et gestion
            'isActive', 'is_active', 'is_stripe_active', 'can_receive_orders',
            
            # NOUVEAU: Fermetures manuelles
            'isManuallyOverridden', 'manualOverrideReason', 'manualOverrideUntil',
            'lastStatusChangedBy', 'lastStatusChangedAt',
            
            # Relations
            'opening_hours',
            
            # Métadonnées
            'createdAt', 'updatedAt', 'created_at', 'updated_at',
            
            # Titres-restaurant
            'accepts_meal_vouchers', 'meal_voucher_info', 'accepts_meal_vouchers_display',
        ]
        read_only_fields = [
            'id', 'owner_id', 'owner_name', 'created_at', 'updated_at', 
            'createdAt', 'updatedAt', 'can_receive_orders', 'rating', 
            'review_count', 'reviewCount', 'full_address', 'image_url',
            'image_name', 'image_size', 'lastStatusChangedBy', 'lastStatusChangedAt'
        ]
    
    def get_id(self, obj):
        return str(obj.id) if obj and obj.id else None
    
    def get_location(self, obj):
        return {
            'latitude': float(obj.latitude) if obj.latitude else 0.0,
            'longitude': float(obj.longitude) if obj.longitude else 0.0,
        }
    
    def get_image_url(self, obj):
        try:
            if obj and obj.image and hasattr(obj.image, 'url'):
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.image.url)
                return obj.image.url
        except (ValueError, AttributeError):
            pass
        return None
    
    def get_image_name(self, obj):
        try:
            if obj and obj.image and hasattr(obj.image, 'name') and obj.image.name:
                return os.path.basename(obj.image.name)
        except (ValueError, AttributeError):
            pass
        return None
    
    def get_image_size(self, obj):
        try:
            if obj and obj.image and hasattr(obj.image, 'size'):
                return obj.image.size
        except (ValueError, AttributeError):
            pass
        return None
    
    def get_accepts_meal_vouchers_display(self, obj):
        return "Oui" if obj.accepts_meal_vouchers else "Non"
    
    # ... méthodes de validation existantes ...
    
    def update(self, instance, validated_data):
        """Mise à jour avec gestion des fermetures manuelles"""
        
        # Gérer les changements d'override manuel
        user = self.context.get('request').user if self.context.get('request') else None
        
        # Vérifier si l'override change
        new_override = validated_data.get('is_manually_overridden')
        if new_override is not None and new_override != instance.is_manually_overridden:
            if user:
                validated_data['last_status_changed_by'] = user
                validated_data['last_status_changed_at'] = timezone.now()
        
        return super().update(instance, validated_data)

class RestaurantCreateSerializer(serializers.ModelSerializer):
    """Sérialiseur pour création avec support des nouveaux horaires"""
    
    # Mapping des champs frontend -> backend
    zipCode = serializers.CharField(source='zip_code')
    priceRange = serializers.IntegerField(source='price_range')
    
    # Gestion de l'image
    image = serializers.ImageField(required=False, allow_null=True)
    
    # NOUVEAU: Support des nouveaux horaires
    openingHours = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        write_only=True
    )
    
    class Meta:
        model = Restaurant
        fields = [
            'name', 'description', 'address', 'city', 'zipCode', 
            'country', 'phone', 'email', 'website', 'cuisine', 
            'priceRange', 'latitude', 'longitude', 'image',
            'accepts_meal_vouchers', 'meal_voucher_info', 'openingHours'
        ]
    
    def create(self, validated_data):
        """Création avec gestion des nouveaux horaires"""
        
        # Extraire les horaires
        opening_hours_data = validated_data.pop('openingHours', [])
        
        # Créer le restaurant
        restaurant = super().create(validated_data)
        
        # Créer les horaires avec support multi-périodes
        self._create_opening_hours(restaurant, opening_hours_data)
        
        return restaurant
    
    def _create_opening_hours(self, restaurant, hours_data):
        """Crée les horaires avec support des périodes multiples"""
        for day_data in hours_data:
            day_of_week = day_data.get('dayOfWeek')
            is_closed = day_data.get('isClosed', False)
            periods_data = day_data.get('periods', [])
            
            # Créer l'entrée horaire pour ce jour
            opening_hours = OpeningHours.objects.create(
                restaurant=restaurant,
                day_of_week=day_of_week,
                is_closed=is_closed
            )
            
            # Créer les périodes si pas fermé
            if not is_closed and periods_data:
                for period_data in periods_data:
                    OpeningPeriod.objects.create(
                        opening_hours=opening_hours,
                        start_time=period_data.get('startTime', '09:00'),
                        end_time=period_data.get('endTime', '19:00'),
                        name=period_data.get('name', '')
                    )
            elif not is_closed:
                # Rétrocompatibilité : créer une période par défaut
                OpeningPeriod.objects.create(
                    opening_hours=opening_hours,
                    start_time='09:00',
                    end_time='19:00',
                    name='Service principal'
                )

class RestaurantHoursTemplateSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les templates d'horaires"""
    
    id = serializers.CharField(read_only=True)
    
    class Meta:
        model = RestaurantHoursTemplate
        fields = [
            'id', 'name', 'description', 'category', 
            'is_default', 'hours_data'
        ]
    
    def to_representation(self, instance):
        return {
            'id': str(instance.id),
            'name': instance.name,
            'description': instance.description,
            'category': instance.category,
            'isDefault': instance.is_default,
            'openingHours': instance.hours_data
        }