"""
Serializers de la fonctionnalite d'import de menu par IA.
"""
from __future__ import annotations

from rest_framework import serializers

from api.models import MenuScanJob, MenuScanImage, RestaurantBranding
from api.models.ai_menu_models import SUPPORTED_LANGUAGE_CODES


# -----------------------------------------------------------------------------
# Images
# -----------------------------------------------------------------------------
class MenuScanImageSerializer(serializers.ModelSerializer):
    """Photo de carte rattachee a un job (lecture seule cote job)."""

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = MenuScanImage
        fields = ['id', 'image_url', 'order', 'created_at']
        read_only_fields = fields

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


# -----------------------------------------------------------------------------
# Charte graphique
# -----------------------------------------------------------------------------
class RestaurantBrandingSerializer(serializers.ModelSerializer):
    """Charte graphique d'un restaurant."""

    class Meta:
        model = RestaurantBranding
        fields = [
            'id', 'primary_color', 'secondary_color', 'accent_color',
            'background_color', 'text_color', 'style_descriptor',
            'is_ai_generated', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_ai_generated', 'created_at', 'updated_at']


# -----------------------------------------------------------------------------
# Job — creation
# -----------------------------------------------------------------------------
class MenuScanJobCreateSerializer(serializers.Serializer):
    """Creation d'un job : un restaurant, des photos, des langues cibles.

    Les images sont envoyees en multipart sous la cle repetee `images`.
    L'ordre des fichiers recus = ordre des pages de la carte.
    """

    # L'ID du restaurant peut etre un entier (PK auto) ou un UUID selon
    # le modele Restaurant. On accepte une chaine et on laisse le lookup
    # ORM convertir au type de PK reel.
    restaurant = serializers.CharField()
    # Menu cible optionnel : celui depuis lequel l'import est lance.
    menu = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    images = serializers.ListField(
        child=serializers.ImageField(),
        allow_empty=False,
        max_length=10,
        help_text="Photos de la carte, dans l'ordre des pages (max 10).",
    )
    target_languages = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Codes ISO des langues cibles (hors francais).",
    )

    def to_internal_value(self, data):
        """Tolere les deux formats d'envoi multipart.

        - `expo-file-system uploadAsync` envoie UN fichier sous `images`
          (cle unique) et `target_languages` en CSV ("en,es,de").
        - un client classique envoie `images` en cle repetee et
          `target_languages` en liste.

        On normalise vers des listes avant la validation standard.
        """
        # QueryDict (multipart) : reconstituer les listes.
        if hasattr(data, 'getlist'):
            normalized = {}
            # Toutes les valeurs sous la cle 'images' (1 ou n fichiers).
            files = data.getlist('images')
            if files:
                normalized['images'] = files
            if 'restaurant' in data:
                normalized['restaurant'] = data.get('restaurant')
            if 'menu' in data:
                normalized['menu'] = data.get('menu')

            # target_languages : CSV unique OU cle repetee.
            langs = data.getlist('target_languages')
            if len(langs) == 1 and ',' in langs[0]:
                langs = [c for c in langs[0].split(',') if c]
            if langs:
                normalized['target_languages'] = langs

            data = normalized
        return super().to_internal_value(data)

    def validate_restaurant(self, value):
        """Verifie que le restaurant appartient bien au restaurateur courant."""
        from api.models import Restaurant

        request = self.context['request']
        profile = getattr(request.user, 'restaurateur_profile', None)
        if profile is None:
            raise serializers.ValidationError("Compte restaurateur requis.")

        # `value` est une chaine : le lookup ORM la convertit selon le type
        # de PK (entier ou UUID). Une valeur non convertible -> ValueError.
        try:
            restaurant = Restaurant.objects.get(id=value, owner=profile)
        except (Restaurant.DoesNotExist, ValueError, TypeError):
            raise serializers.ValidationError(
                "Restaurant introuvable ou non rattache a votre compte."
            )
        return restaurant

    def validate_target_languages(self, value):
        cleaned = []
        for code in value or []:
            code = (code or '').strip().lower()
            if code and code != 'fr':
                if code not in SUPPORTED_LANGUAGE_CODES:
                    raise serializers.ValidationError(
                        f"Langue non prise en charge : « {code} »."
                    )
                if code not in cleaned:
                    cleaned.append(code)
        return cleaned

    def validate(self, attrs):
        """Resout le menu cible et empeche deux imports simultanes."""
        restaurant = attrs['restaurant']

        # Resolution du menu cible (optionnel). Doit appartenir au restaurant.
        menu_id = attrs.get('menu')
        resolved_menu = None
        if menu_id:
            from api.models import Menu
            try:
                resolved_menu = Menu.objects.get(id=menu_id, restaurant=restaurant)
            except (Menu.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError({
                    'menu': "Menu introuvable ou non rattache a ce restaurant.",
                })
        attrs['menu'] = resolved_menu

        active = MenuScanJob.objects.filter(
            restaurant=restaurant,
            status__in=[
                MenuScanJob.Status.PENDING,
                MenuScanJob.Status.PROCESSING,
                MenuScanJob.Status.TRANSLATING,
            ],
        ).exists()
        if active:
            raise serializers.ValidationError(
                "Un import de menu est deja en cours pour ce restaurant. "
                "Patientez jusqu'a sa fin avant d'en lancer un nouveau."
            )
        return attrs

    def create(self, validated_data):
        request = self.context['request']
        images = validated_data['images']
        languages = validated_data.get('target_languages')

        job = MenuScanJob.objects.create(
            restaurant=validated_data['restaurant'],
            menu=validated_data.get('menu'),
            created_by=request.user,
            target_languages=languages if languages is not None else [],
            status=MenuScanJob.Status.PENDING,
        )
        MenuScanImage.objects.bulk_create([
            MenuScanImage(job=job, image=image, order=index)
            for index, image in enumerate(images, start=1)
        ])
        return job


# -----------------------------------------------------------------------------
# Job — lecture (statut + brouillon)
# -----------------------------------------------------------------------------
class MenuScanJobSerializer(serializers.ModelSerializer):
    """Vue complete d'un job : statut, brouillon editable, charte, photos."""

    images = MenuScanImageSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    categories_count = serializers.IntegerField(read_only=True)
    subcategories_count = serializers.IntegerField(read_only=True)
    items_count = serializers.IntegerField(read_only=True)
    is_reviewable = serializers.BooleanField(read_only=True)

    class Meta:
        model = MenuScanJob
        fields = [
            'id', 'restaurant', 'restaurant_name', 'status', 'status_display',
            'target_languages', 'extracted_data', 'branding_data',
            'error_message', 'categories_count', 'subcategories_count',
            'items_count', 'is_reviewable', 'images',
            'created_at', 'updated_at', 'completed_at',
        ]
        read_only_fields = fields  # edition du brouillon : via le serializer dedie


# -----------------------------------------------------------------------------
# Job — liste (allege, sans le brouillon volumineux)
# -----------------------------------------------------------------------------
class MenuScanJobListSerializer(serializers.ModelSerializer):
    """Vue allegee pour le listing : pas de `extracted_data`."""

    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    categories_count = serializers.IntegerField(read_only=True)
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = MenuScanJob
        fields = [
            'id', 'restaurant', 'restaurant_name', 'status', 'status_display',
            'categories_count', 'items_count',
            'created_at', 'updated_at', 'completed_at',
        ]
        read_only_fields = fields


# -----------------------------------------------------------------------------
# Job — edition du brouillon
# -----------------------------------------------------------------------------
class MenuScanDraftUpdateSerializer(serializers.Serializer):
    """Mise a jour du brouillon corrige par le restaurateur avant validation.

    Le restaurateur peut tout corriger (noms, prix, descriptions, traductions,
    structure). On ne re-valide pas finement ici : la materialisation
    (`apply_scan_job`) assainit les prix et les allergenes. On verifie juste
    la forme generale.
    """

    extracted_data = serializers.JSONField(required=False)
    branding_data = serializers.JSONField(required=False)

    def validate_extracted_data(self, value):
        if not isinstance(value, dict) or 'categories' not in value:
            raise serializers.ValidationError(
                "Format attendu : un objet avec une cle « categories »."
            )
        if not isinstance(value['categories'], list):
            raise serializers.ValidationError(
                "« categories » doit etre une liste."
            )
        return value

    def validate_branding_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Format attendu : un objet.")
        return value

    def update(self, instance, validated_data):
        if 'extracted_data' in validated_data:
            instance.extracted_data = validated_data['extracted_data']
        if 'branding_data' in validated_data:
            instance.branding_data = validated_data['branding_data']
        instance.save(update_fields=['extracted_data', 'branding_data', 'updated_at'])
        return instance