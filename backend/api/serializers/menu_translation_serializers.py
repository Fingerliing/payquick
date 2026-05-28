"""
Serializers — Traduction automatique du menu existant.

Emplacement : backend/api/serializers/menu_translation_serializers.py
"""
from __future__ import annotations

from rest_framework import serializers

from api.models import MenuTranslationJob
from api.models.ai_menu_models import (
    SUPPORTED_LANGUAGE_CODES,
    DEFAULT_TARGET_LANGUAGES,
)


class MenuTranslationJobSerializer(serializers.ModelSerializer):
    """Suivi d'un job de traduction (statut, progression, bilan)."""

    status_display = serializers.CharField(source='get_status_display', read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = MenuTranslationJob
        fields = [
            'id', 'restaurant', 'status', 'status_display',
            'target_languages', 'progress_done', 'progress_total',
            'progress_percent', 'report', 'error_message',
            'created_at', 'updated_at', 'completed_at',
        ]
        read_only_fields = fields


class MenuTranslationJobCreateSerializer(serializers.Serializer):
    """Creation d'un job : restaurant + langues cibles."""

    restaurant = serializers.CharField()
    target_languages = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )

    def validate_restaurant(self, value):
        from api.models import Restaurant

        request = self.context['request']
        profile = getattr(request.user, 'restaurateur_profile', None)
        if profile is None:
            raise serializers.ValidationError("Compte restaurateur requis.")
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
        """Empeche deux traductions simultanees pour le meme restaurant."""
        restaurant = attrs['restaurant']
        active = MenuTranslationJob.objects.filter(
            restaurant=restaurant,
            status__in=[
                MenuTranslationJob.Status.PENDING,
                MenuTranslationJob.Status.PROCESSING,
            ],
        ).exists()
        if active:
            raise serializers.ValidationError(
                "Une traduction est deja en cours pour ce restaurant."
            )
        return attrs

    def create(self, validated_data):
        request = self.context['request']
        languages = validated_data.get('target_languages')
        if not languages:
            languages = list(DEFAULT_TARGET_LANGUAGES)
        return MenuTranslationJob.objects.create(
            restaurant=validated_data['restaurant'],
            created_by=request.user,
            target_languages=languages,
            status=MenuTranslationJob.Status.PENDING,
        )
