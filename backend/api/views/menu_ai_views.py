"""
Vues de la fonctionnalite d'import de menu par IA.

Endpoints (montes sous /api/v1/menu-ai/ — cf. menu_ai_urls.py) ::

    GET    /jobs/                  liste des imports du restaurateur
    POST   /jobs/                  cree un import (upload photos) -> lance Celery
    GET    /jobs/{id}/             detail + brouillon (polling du statut)
    DELETE /jobs/{id}/             supprime un import
    PATCH  /jobs/{id}/draft/       corrige le brouillon avant validation
    POST   /jobs/{id}/apply/       materialise le brouillon en menu reel
    POST   /jobs/{id}/retry/       relance un import en echec

Emplacement : backend/api/views/menu_ai_views.py
"""
from __future__ import annotations

import logging

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from api.models import MenuScanJob
from api.permissions import IsRestaurateur, IsValidatedRestaurateur
from api.serializers.menu_ai_serializers import (
    MenuScanDraftUpdateSerializer,
    MenuScanJobCreateSerializer,
    MenuScanJobListSerializer,
    MenuScanJobSerializer,
)

logger = logging.getLogger(__name__)


class MenuScanJobViewSet(viewsets.ModelViewSet):
    """Gestion des imports de menu par IA pour un restaurateur valide.

    Le restaurateur ne voit que les imports de ses propres restaurants.
    Methodes HTTP autorisees : GET, POST, DELETE (l'edition du brouillon passe
    par l'action dediee `draft`, pas par PUT/PATCH sur la ressource).
    """

    permission_classes = [
        permissions.IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur,
    ]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'delete', 'patch']

    def get_queryset(self):
        """Restreint aux jobs des restaurants appartenant au restaurateur."""
        profile = getattr(self.request.user, 'restaurateur_profile', None)
        if profile is None:
            return MenuScanJob.objects.none()

        queryset = (
            MenuScanJob.objects
            .filter(restaurant__owner=profile)
            .select_related('restaurant')
            .prefetch_related('images')
        )
        # Filtre optionnel par restaurant : ?restaurant=<id>
        restaurant_id = self.request.query_params.get('restaurant')
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return MenuScanJobCreateSerializer
        if self.action == 'list':
            return MenuScanJobListSerializer
        if self.action == 'draft':
            return MenuScanDraftUpdateSerializer
        return MenuScanJobSerializer

    # -- Creation : upload de la 1re photo, SANS demarrer le pipeline --------
    def create(self, request, *args, **kwargs):
        """Cree le job avec sa premiere photo.

        Le pipeline IA n'est PAS lance ici : l'upload mobile envoie une photo
        par requete (cf. expo-file-system). On attend l'appel explicite a
        l'action `start` — une fois toutes les pages ajoutees — pour demarrer
        le traitement. Cela evite de lancer l'analyse sur une carte
        incomplete.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save()

        logger.info("MenuScanJob %s cree (en attente de demarrage).", job.id)
        output = MenuScanJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

    # -- Demarrage du pipeline (toutes les photos sont uploadees) ------------
    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        """Lance le pipeline IA pour un job dont l'upload est termine."""
        job = self.get_object()

        if job.status != MenuScanJob.Status.PENDING:
            return Response(
                {'detail': "Cet import a deja ete demarre."},
                status=status.HTTP_409_CONFLICT,
            )
        if not job.images.exists():
            return Response(
                {'detail': "Aucune photo attachee a cet import."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from api.services.menu_ai.tasks import process_menu_scan_job
            process_menu_scan_job.delay(str(job.id))
        except Exception:  # noqa: BLE001 - Redis/Celery injoignable, import casse...
            logger.exception("Mise en file impossible pour le job %s.", job.id)
            return Response(
                {'detail': "Le service d'analyse est momentanement "
                           "indisponible. Reessayez dans quelques instants."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        logger.info("MenuScanJob %s demarre.", job.id)
        output = MenuScanJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_200_OK)

    # -- Edition du brouillon ------------------------------------------------
    @action(detail=True, methods=['patch'], url_path='draft')
    def draft(self, request, pk=None):
        """Corrige le brouillon (`extracted_data` / `branding_data`).

        Autorise uniquement tant que le job est relisable (statut `ready`) :
        on ne corrige pas un import encore en traitement ni deja applique.
        """
        job = self.get_object()
        if job.status != MenuScanJob.Status.READY:
            return Response(
                {'detail': "Le brouillon ne peut etre modifie que lorsque "
                           "l'import est au statut « pret a valider »."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = self.get_serializer(job, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        output = MenuScanJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_200_OK)

    # -- Materialisation -----------------------------------------------------
    @action(detail=True, methods=['post'], url_path='apply')
    def apply(self, request, pk=None):
        """Transforme le brouillon en menu reel (catégories, plats, charte)."""
        job = self.get_object()

        from api.services.menu_ai.apply import apply_scan_job

        try:
            report = apply_scan_job(job)
        except ValueError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Echec de l'application du job %s.", job.id)
            return Response(
                {'detail': "Une erreur est survenue lors de l'application "
                           "du menu. Aucune donnee n'a ete modifiee."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        job.refresh_from_db()
        return Response(
            {
                'detail': "Menu importe avec succes.",
                'report': report.as_dict(),
                'job': MenuScanJobSerializer(
                    job, context=self.get_serializer_context(),
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    # -- Relance d'un import en echec ----------------------------------------
    @action(detail=True, methods=['post'], url_path='retry')
    def retry(self, request, pk=None):
        """Relance le pipeline pour un job en echec (`failed`)."""
        job = self.get_object()
        if job.status != MenuScanJob.Status.FAILED:
            return Response(
                {'detail': "Seul un import en echec peut etre relance."},
                status=status.HTTP_409_CONFLICT,
            )

        job.status = MenuScanJob.Status.PENDING
        job.error_message = ''
        job.save(update_fields=['status', 'error_message', 'updated_at'])

        try:
            from api.services.menu_ai.tasks import process_menu_scan_job
            process_menu_scan_job.delay(str(job.id))
        except Exception:  # noqa: BLE001
            logger.exception("Relance impossible pour le job %s.", job.id)
            return Response(
                {'detail': "Le service d'analyse est momentanement indisponible."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        logger.info("MenuScanJob %s relance.", job.id)
        output = MenuScanJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_200_OK)

    # -- Ajout d'une photo supplementaire (menus multi-pages) ----------------
    @action(detail=True, methods=['post'], url_path='add-image')
    def add_image(self, request, pk=None):
        """Ajoute une photo a un job existant (pages 2+ d'une carte).

        L'upload mobile (expo-file-system) envoie un fichier par requete :
        la page 1 cree le job, les suivantes arrivent ici. N'est autorise
        que tant que le job n'a pas commence a etre traite.
        """
        job = self.get_object()

        if job.status != MenuScanJob.Status.PENDING:
            return Response(
                {'detail': "Des photos ne peuvent etre ajoutees que sur un "
                           "import qui n'a pas encore demarre."},
                status=status.HTTP_409_CONFLICT,
            )

        from api.models import MenuScanImage

        image_file = request.FILES.get('image')
        if image_file is None:
            return Response(
                {'detail': "Aucune photo fournie (champ « image » attendu)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Garde-fou : ne pas depasser le plafond de pages.
        current_count = job.images.count()
        if current_count >= 10:
            return Response(
                {'detail': "Nombre maximum de pages atteint (10)."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            order = int(request.data.get('order') or (current_count + 1))
        except (TypeError, ValueError):
            order = current_count + 1

        MenuScanImage.objects.create(job=job, image=image_file, order=order)
        logger.info("Photo ajoutee au job %s (page %s).", job.id, order)

        output = MenuScanJobSerializer(job, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)