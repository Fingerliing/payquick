"""
API — Traduction automatique du menu existant.

Endpoints (montes sous /api/v1/menu-ai/ — cf. menu_ai_urls.py) ::

    POST   /translations/              cree un job + lance la traduction
    GET    /translations/{id}/         suivi (statut + progression + bilan)

Emplacement : backend/api/views/menu_translation_views.py
"""
from __future__ import annotations

import logging

from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from api.models import MenuTranslationJob
from api.permissions import IsRestaurateur, IsValidatedRestaurateur
from api.serializers.menu_translation_serializers import (
    MenuTranslationJobCreateSerializer,
    MenuTranslationJobSerializer,
)

logger = logging.getLogger(__name__)


class MenuTranslationJobViewSet(viewsets.ModelViewSet):
    """Gestion des jobs de traduction du menu d'un restaurateur."""

    permission_classes = [
        permissions.IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur,
    ]
    http_method_names = ['get', 'post']

    def get_queryset(self):
        profile = getattr(self.request.user, 'restaurateur_profile', None)
        if profile is None:
            return MenuTranslationJob.objects.none()
        return (
            MenuTranslationJob.objects
            .filter(restaurant__owner=profile)
            .select_related('restaurant')
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return MenuTranslationJobCreateSerializer
        return MenuTranslationJobSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save()

        try:
            from api.services.menu_ai.translate_tasks import translate_menu_job
            translate_menu_job.delay(str(job.id))
        except Exception:  # noqa: BLE001
            logger.exception("Mise en file impossible (traduction) job %s.", job.id)
            return Response(
                {'detail': "Le service de traduction est momentanement "
                           "indisponible. Reessayez dans quelques instants."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        output = MenuTranslationJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)
