from rest_framework import serializers
from api.models import Table, Restaurant
from django.core.exceptions import ValidationError

class TableSerializer(serializers.ModelSerializer):
    """Serializer complet pour les tables"""
    
    # Champs calculés
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    qrCodeUrl = serializers.SerializerMethodField()
    manualCode = serializers.CharField(source='qr_code', read_only=True)
    
    # Support des deux formats
    identifiant = serializers.CharField(source='qr_code', required=False)
    
    # ID en string pour cohérence
    id = serializers.SerializerMethodField()
    restaurant_id = serializers.SerializerMethodField()
    
    class Meta:
        model = Table
        fields = [
            'id', 'number', 'capacity', 'is_active',
            'restaurant', 'restaurant_id', 'restaurant_name',
            'qr_code', 'identifiant', 'qrCodeUrl', 'manualCode',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_id(self, obj):
        """Retourne l'ID comme string"""
        return str(obj.id) if obj and obj.id else None
    
    def get_restaurant_id(self, obj):
        """Retourne l'ID du restaurant comme string"""
        return str(obj.restaurant.id) if obj and obj.restaurant else None
    
    def get_qrCodeUrl(self, obj):
        """Génère l'URL du QR code"""
        if obj and obj.qr_code:
            request = self.context.get('request')
            if request:
                base_url = request.build_absolute_uri('/').rstrip('/')
                return f"{base_url}/table/{obj.qr_code}"
        return None
    
    def validate_number(self, value):
        """Validation du numéro de table"""
        if not value:
            raise serializers.ValidationError("Le numéro de table est requis")
        
        # Vérifier que c'est un nombre valide
        try:
            int(value)
        except ValueError:
            raise serializers.ValidationError("Le numéro de table doit être numérique")
        
        return value
    
    def validate_capacity(self, value):
        """Validation de la capacité"""
        if value is not None and (value < 1 or value > 20):
            raise serializers.ValidationError("La capacité doit être entre 1 et 20")
        return value
    
    def validate(self, data):
        """Validation croisée"""
        restaurant = data.get('restaurant')
        number = data.get('number')
        
        if restaurant and number:
            # Vérifier l'unicité du numéro de table dans le restaurant
            existing_table = Table.objects.filter(
                restaurant=restaurant,
                number=number
            )
            
            # Exclure l'instance actuelle en cas de mise à jour
            if self.instance:
                existing_table = existing_table.exclude(id=self.instance.id)
            
            if existing_table.exists():
                raise serializers.ValidationError({
                    'number': f'Une table avec le numéro {number} existe déjà dans ce restaurant'
                })
        
        return data
    
    def create(self, validated_data):
        """Création avec génération automatique du QR code"""
        # Générer l'identifiant QR si pas fourni
        if not validated_data.get('qr_code'):
            restaurant = validated_data['restaurant']
            number = validated_data['number']
            validated_data['qr_code'] = f"R{restaurant.id}T{str(number).zfill(3)}"
        
        return super().create(validated_data)

class TableCreateSerializer(serializers.ModelSerializer):
    """Serializer simplifié pour la création de table"""
    
    identifiant = serializers.CharField(source='qr_code', required=False)
    
    class Meta:
        model = Table
        fields = [
            'restaurant', 'number', 'capacity', 'identifiant'
        ]
    
    def validate(self, data):
        """Validation avec vérification des permissions"""
        restaurant = data.get('restaurant')
        
        # Vérifier que le restaurant appartient à l'utilisateur connecté
        request = self.context.get('request')
        if request and hasattr(request.user, 'restaurateur_profile'):
            try:
                if restaurant.owner != request.user.restaurateur_profile:
                    raise serializers.ValidationError({
                        'restaurant': 'Vous ne pouvez créer des tables que pour vos propres restaurants'
                    })
            except AttributeError:
                raise serializers.ValidationError({
                    'restaurant': 'Restaurant invalide'
                })
        
        return super().validate(data)
    
    def create(self, validated_data):
        """Création avec génération automatique du QR code"""
        if not validated_data.get('qr_code'):
            restaurant = validated_data['restaurant']
            number = validated_data['number']
            validated_data['qr_code'] = f"R{restaurant.id}T{str(number).zfill(3)}"
        
        validated_data.setdefault('is_active', True)
        validated_data.setdefault('capacity', 4)
        
        return super().create(validated_data)

class TableBulkCreateSerializer(serializers.Serializer):
    """Serializer pour la création en lot de tables"""
    
    restaurant_id = serializers.CharField()
    table_count = serializers.IntegerField(min_value=1, max_value=50)
    start_number = serializers.IntegerField(min_value=1, default=1)
    capacity = serializers.IntegerField(min_value=1, max_value=20, default=4)
    
    def validate_restaurant_id(self, value):
        """Valide que le restaurant existe et appartient à l'utilisateur"""
        request = self.context.get('request')
        
        try:
            restaurant = Restaurant.objects.get(id=value)
        except Restaurant.DoesNotExist:
            raise serializers.ValidationError("Restaurant non trouvé")
        
        # Vérifier les permissions
        if request and hasattr(request.user, 'restaurateur_profile'):
            if restaurant.owner != request.user.restaurateur_profile:
                raise serializers.ValidationError(
                    "Vous ne pouvez créer des tables que pour vos propres restaurants"
                )
        
        return value
    
    def validate(self, data):
        """Validation croisée"""
        restaurant_id = data.get('restaurant_id')
        table_count = data.get('table_count')
        start_number = data.get('start_number')
        
        if restaurant_id and table_count and start_number:
            # Vérifier qu'aucune table n'existe déjà dans la plage
            try:
                restaurant = Restaurant.objects.get(id=restaurant_id)
                end_number = start_number + table_count - 1
                
                existing_tables = Table.objects.filter(
                    restaurant=restaurant,
                    number__in=[str(i) for i in range(start_number, end_number + 1)]
                )
                
                if existing_tables.exists():
                    existing_numbers = list(existing_tables.values_list('number', flat=True))
                    raise serializers.ValidationError({
                        'table_count': f'Des tables existent déjà avec les numéros : {", ".join(existing_numbers)}'
                    })
                    
            except Restaurant.DoesNotExist:
                pass  # Sera géré par validate_restaurant_id
        
        return data

class TableStatusSerializer(serializers.ModelSerializer):
    """Serializer pour le changement de statut"""
    
    class Meta:
        model = Table
        fields = ['is_active']

class TableQRInfoSerializer(serializers.Serializer):
    """Serializer pour les informations QR d'une table"""
    
    table_id = serializers.CharField(read_only=True)
    table_number = serializers.CharField(read_only=True)
    identifiant = serializers.CharField(read_only=True)
    qr_code_url = serializers.URLField(read_only=True)
    qr_code_image = serializers.CharField(read_only=True)  # Base64
    manual_code = serializers.CharField(read_only=True)

class PublicTableMenuSerializer(serializers.Serializer):
    """Serializer pour la réponse publique d'une table (menu)"""
    
    success = serializers.BooleanField(default=True)
    
    restaurant = serializers.DictField(child=serializers.CharField())
    table = serializers.DictField(child=serializers.CharField())
    menu = serializers.DictField()
    ordering_info = serializers.DictField()
    
    class Meta:
        fields = ['success', 'restaurant', 'table', 'menu', 'ordering_info']