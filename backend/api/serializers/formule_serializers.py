"""
Serializers CRUD restaurateur des formules.

Écriture imbriquée à 3 niveaux : Formule → courses (FormuleCourse) → items
(FormuleCourseItem). À l'update, les crans/plats sont REMPLACÉS (delete + recreate) :
c'est sûr ici car l'historique de commande ne référence jamais ces lignes —
OrderItemComponent fige des snapshots et pointe vers MenuItem (SET_NULL), pas vers
FormuleCourseItem, et OrderItem.formule est en SET_NULL.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework import serializers

from api.models import (
    Formule, FormuleCourse, FormuleCourseItem, MenuItem, Restaurant,
)


class FormuleCourseItemSerializer(serializers.ModelSerializer):
    """Un plat éligible dans un cran. `menu_item` écrit (PK), libellés en lecture."""
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_price = serializers.DecimalField(
        source='menu_item.price', max_digits=6, decimal_places=2, read_only=True
    )

    class Meta:
        model = FormuleCourseItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_price',
            'extra_price', 'is_available', 'display_order',
        ]
        read_only_fields = ['id']

    def validate_extra_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Le supplément ne peut pas être négatif.")
        return value


class FormuleCourseSerializer(serializers.ModelSerializer):
    """Un cran de la formule (Entrée, Plat, Dessert...) avec ses plats éligibles."""
    items = FormuleCourseItemSerializer(many=True)

    class Meta:
        model = FormuleCourse
        fields = [
            'id', 'name', 'order', 'is_required',
            'min_choices', 'max_choices', 'items',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        mn = attrs.get('min_choices', 1)
        mx = attrs.get('max_choices', 1)
        if mx < 1:
            raise serializers.ValidationError(
                {'max_choices': "Le maximum de choix doit être au moins 1."}
            )
        if mn < 0:
            raise serializers.ValidationError(
                {'min_choices': "Le minimum de choix ne peut pas être négatif."}
            )
        if mn > mx:
            raise serializers.ValidationError(
                {'min_choices': "Le minimum ne peut pas dépasser le maximum."}
            )
        return attrs


class FormuleSerializer(serializers.ModelSerializer):
    """CRUD complet d'une formule avec ses crans et plats (écriture imbriquée)."""
    courses = FormuleCourseSerializer(many=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)

    class Meta:
        model = Formule
        fields = [
            'id', 'restaurant', 'restaurant_name', 'name', 'description',
            'price', 'is_active', 'order', 'courses',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Restreint le choix de restaurant aux établissements du restaurateur
        # courant (même pattern que MenuSerializer).
        request = self.context.get('request')
        if request and hasattr(request.user, 'restaurateur_profile'):
            self.fields['restaurant'].queryset = Restaurant.objects.filter(
                owner=request.user.restaurateur_profile
            )

    def validate_price(self, value):
        if value is None or Decimal(str(value)) <= 0:
            raise serializers.ValidationError(
                "Le prix de la formule doit être supérieur à zéro."
            )
        return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def validate(self, attrs):
        # Restaurant cible (présent à la création, sinon celui de l'instance).
        restaurant = attrs.get('restaurant') or getattr(self.instance, 'restaurant', None)
        courses = attrs.get('courses')

        if courses is not None:
            if not courses:
                raise serializers.ValidationError(
                    {'courses': "Une formule doit comporter au moins un cran."}
                )
            for course in courses:
                items = course.get('items', [])
                if not items:
                    raise serializers.ValidationError(
                        {'courses': f"Le cran « {course.get('name', '?')} » "
                                    f"doit proposer au moins un plat."}
                    )
                # Chaque plat doit appartenir au restaurant de la formule.
                for it in items:
                    mi = it['menu_item']
                    if restaurant and mi.menu.restaurant_id != restaurant.id:
                        raise serializers.ValidationError(
                            {'courses': f"Le plat « {mi.name} » n'appartient pas "
                                        f"à ce restaurant."}
                        )
                # min_choices ne peut pas exiger plus de plats que proposés.
                mn = course.get('min_choices', 1)
                if course.get('is_required', True) and mn > len(items):
                    raise serializers.ValidationError(
                        {'courses': f"Le cran « {course.get('name', '?')} » exige "
                                    f"{mn} choix mais ne propose que {len(items)} plat(s)."}
                    )
        return attrs

    # ── Écriture imbriquée ───────────────────────────────────────────────
    def _write_courses(self, formule, courses):
        for course_data in courses:
            items_data = course_data.pop('items', [])
            course = FormuleCourse.objects.create(formule=formule, **course_data)
            FormuleCourseItem.objects.bulk_create([
                FormuleCourseItem(course=course, **item) for item in items_data
            ])

    @transaction.atomic
    def create(self, validated_data):
        courses = validated_data.pop('courses', [])
        formule = Formule.objects.create(**validated_data)
        self._write_courses(formule, courses)
        return formule

    @transaction.atomic
    def update(self, instance, validated_data):
        courses = validated_data.pop('courses', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Remplacement intégral des crans/plats si fournis (cascade delete).
        if courses is not None:
            instance.courses.all().delete()
            self._write_courses(instance, courses)

        return instance


class FormuleListSerializer(serializers.ModelSerializer):
    """Vue allégée pour le listing restaurateur (sans le détail des crans)."""
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    courses_count = serializers.SerializerMethodField()

    class Meta:
        model = Formule
        fields = [
            'id', 'restaurant', 'restaurant_name', 'name', 'price',
            'is_active', 'order', 'courses_count', 'created_at', 'updated_at',
        ]

    def get_courses_count(self, obj):
        return obj.courses.count()


# =============================================================================
# Lecture CLIENT (configurateur) — read-only, multilingue via ?lang=
# =============================================================================
# Le client sélectionne une formule puis voit, pour chaque cran, les plats
# disponibles. Les noms/descriptions des plats sont résolus dans la langue
# demandée (?lang=, repli français) via le mixin de traduction de MenuItem,
# comme MenuItemSerializer. Les formules elles-mêmes ne sont pas traduisibles
# (Formule n'hérite pas de TranslatableModelMixin) : name/description bruts.


class FormuleClientItemSerializer(serializers.ModelSerializer):
    """Un plat éligible dans un cran, vu côté client (détails du plat aplatis)."""
    menu_item_id = serializers.IntegerField(source='menu_item.id', read_only=True)
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    price = serializers.DecimalField(
        source='menu_item.price', max_digits=6, decimal_places=2, read_only=True
    )
    image_url = serializers.SerializerMethodField()
    allergen_display = serializers.SerializerMethodField()
    dietary_tags = serializers.SerializerMethodField()

    class Meta:
        model = FormuleCourseItem
        fields = [
            'id', 'menu_item_id', 'name', 'description', 'price',
            'image_url', 'allergen_display', 'dietary_tags',
            'extra_price', 'display_order',
        ]
        read_only_fields = fields

    def _requested_lang(self):
        request = self.context.get('request')
        if not request:
            return ''
        return (request.query_params.get('lang') or '').strip().lower()

    def get_name(self, obj):
        mi = obj.menu_item
        if mi and hasattr(mi, 'get_translated'):
            return mi.get_translated('name', self._requested_lang())
        return mi.name if mi else None

    def get_description(self, obj):
        mi = obj.menu_item
        if mi and hasattr(mi, 'get_translated'):
            return mi.get_translated('description', self._requested_lang())
        return mi.description if mi else None

    def get_image_url(self, obj):
        mi = obj.menu_item
        request = self.context.get('request')
        if mi and mi.image and hasattr(mi.image, 'url') and request:
            return request.build_absolute_uri(mi.image.url)
        return None

    def get_allergen_display(self, obj):
        return obj.menu_item.allergen_display if obj.menu_item else []

    def get_dietary_tags(self, obj):
        return obj.menu_item.dietary_tags if obj.menu_item else []


class FormuleClientCourseSerializer(serializers.ModelSerializer):
    """Un cran, vu côté client : seuls les plats réellement disponibles sont exposés."""
    items = serializers.SerializerMethodField()

    class Meta:
        model = FormuleCourse
        fields = ['id', 'name', 'order', 'is_required', 'min_choices', 'max_choices', 'items']
        read_only_fields = fields

    def get_items(self, obj):
        # obj.items.all() est trié (Meta) et mis en cache par le prefetch de la
        # vue : on filtre en Python pour rester sur le cache (pas de requête).
        available = [
            ci for ci in obj.items.all()
            if ci.is_available and ci.menu_item and ci.menu_item.is_available
        ]
        return FormuleClientItemSerializer(
            available, many=True, context=self.context
        ).data


class FormuleClientSerializer(serializers.ModelSerializer):
    """Formule complète pour le configurateur client (prix + crans + plats dispo)."""
    courses = serializers.SerializerMethodField()

    class Meta:
        model = Formule
        fields = ['id', 'name', 'description', 'price', 'order', 'courses']
        read_only_fields = fields

    def get_courses(self, obj):
        return FormuleClientCourseSerializer(
            obj.courses.all(), many=True, context=self.context
        ).data