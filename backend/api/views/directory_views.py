# -*- coding: utf-8 -*-
"""
Vues — Répertoire des restaurants partenaires.

Emplacement : backend/api/views/directory_views.py

Briques :

  1. `nearby_restaurants`  (GET, public)
     Restaurants partenaires autour d'un point (lat/lng) triés par distance.
     Bounding-box SQL puis distance exacte (Haversine) en Python, sans PostGIS.

  2. `SiretEnrichmentView` (POST, restaurateur authentifié)
     Enrichit un SIRET via l'API Sirene + géocodage BAN.

  3. `RestaurantReviewViewSet`
     Avis : lecture publique, écriture réservée aux clients ayant commandé
     (achat vérifié), + modération (masquer/réafficher) par le restaurateur
     propriétaire ou un membre du staff. `eligibility` pilote l'affichage du
     formulaire côté UI.
"""
import logging
from math import asin, cos, radians, sin, sqrt

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes as permission_classes_dec
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from api.models import Restaurant, RestaurantReview
from api.permissions import IsRestaurateur
from api.serializers import RestaurantSerializer
from api.serializers.review_serializers import (
    RestaurantReviewCreateSerializer,
    RestaurantReviewSerializer,
    SiretEnrichmentRequestSerializer,
    latest_qualifying_order,
)
from api.services.sirene_service import sirene_service

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0
DEFAULT_RADIUS_KM = 10.0
MAX_RADIUS_KM = 50.0
MAX_RESULTS = 100


# ── Helpers ──────────────────────────────────────────────────────────────────
def _visible_restaurants_qs():
    """Restaurants publiquement listables (miroir de PublicRestaurantViewSet)."""
    return (
        Restaurant.objects.filter(
            is_active=True,
            owner__is_active=True,
            owner__stripe_verified=True,
            is_stripe_active=True,
            is_manually_overridden=False,
        )
        .select_related("owner")
        .prefetch_related("opening_hours__periods")
    )


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


# ── 1. Restaurants à proximité ───────────────────────────────────────────────
@extend_schema(
    tags=["Public • Restaurants"],
    summary="Restaurants partenaires à proximité",
    description=(
        "Retourne les restaurants partenaires autour d'un point géographique, "
        "triés par distance croissante. Chaque restaurant est enrichi d'un champ "
        "`distance_km`."
    ),
    parameters=[
        OpenApiParameter(name="lat", type=float, required=True, description="Latitude du point de recherche"),
        OpenApiParameter(name="lng", type=float, required=True, description="Longitude du point de recherche"),
        OpenApiParameter(name="radius", type=float, description=f"Rayon en km (défaut {DEFAULT_RADIUS_KM}, max {MAX_RADIUS_KM})"),
        OpenApiParameter(name="limit", type=int, description=f"Nombre max de résultats (max {MAX_RESULTS})"),
        OpenApiParameter(name="cuisine", type=str, description="Filtrer par type de cuisine"),
    ],
)
@api_view(["GET"])
@permission_classes_dec([AllowAny])
def nearby_restaurants(request):
    try:
        lat = float(request.query_params.get("lat"))
        lng = float(request.query_params.get("lng"))
    except (TypeError, ValueError):
        return Response(
            {"error": "Les paramètres 'lat' et 'lng' sont requis et doivent être numériques."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return Response({"error": "Coordonnées hors limites."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        radius = min(float(request.query_params.get("radius", DEFAULT_RADIUS_KM)), MAX_RADIUS_KM)
    except (TypeError, ValueError):
        radius = DEFAULT_RADIUS_KM

    try:
        limit = min(int(request.query_params.get("limit", MAX_RESULTS)), MAX_RESULTS)
    except (TypeError, ValueError):
        limit = MAX_RESULTS

    # Bounding-box : ~111 km / degré de latitude ; longitude corrigée par cos(lat).
    lat_delta = radius / 111.0
    lon_delta = radius / (111.0 * max(cos(radians(lat)), 0.01))

    qs = _visible_restaurants_qs().filter(
        latitude__isnull=False,
        longitude__isnull=False,
        latitude__gte=lat - lat_delta,
        latitude__lte=lat + lat_delta,
        longitude__gte=lng - lon_delta,
        longitude__lte=lng + lon_delta,
    )

    cuisine = request.query_params.get("cuisine")
    if cuisine:
        qs = qs.filter(cuisine=cuisine)

    scored = []
    for r in qs:
        d = _haversine_km(lat, lng, float(r.latitude), float(r.longitude))
        if d <= radius:
            scored.append((d, r))
    scored.sort(key=lambda t: t[0])
    scored = scored[:limit]

    serializer = RestaurantSerializer(
        [r for _, r in scored], many=True, context={"request": request}
    )
    data = serializer.data
    for item, (d, _r) in zip(data, scored):
        item["distance_km"] = round(d, 2)

    return Response({"count": len(data), "radius_km": radius, "results": data})


# ── 2. Enrichissement SIRET ──────────────────────────────────────────────────
class _SiretEnrichThrottle(UserRateThrottle):
    scope = "siret_enrich"
    rate = "30/hour"  # défini en dur → aucune config settings requise


@extend_schema(
    tags=["Restaurants • Onboarding"],
    summary="Enrichir un SIRET (Sirene + géocodage)",
    description=(
        "Interroge l'API INSEE Sirene puis géocode l'adresse via la Base Adresse "
        "Nationale. Sert à pré-remplir le formulaire d'ajout de restaurant."
    ),
    request=SiretEnrichmentRequestSerializer,
)
class SiretEnrichmentView(APIView):
    permission_classes = [IsAuthenticated, IsRestaurateur]
    throttle_classes = [_SiretEnrichThrottle]

    def post(self, request):
        serializer = SiretEnrichmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        siret = serializer.validated_data["siret"]

        result = sirene_service.enrich_from_siret(siret)
        if result is None:
            return Response(
                {"error": "SIRET introuvable ou service Sirene indisponible."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = result.to_dict()

        warnings = []
        if not payload["is_active_insee"]:
            warnings.append("Cet établissement est marqué comme fermé auprès de l'INSEE.")
        if not payload["is_restauration"]:
            warnings.append("Le code d'activité (APE) n'est pas un code de la restauration.")
        if not payload["is_diffusible"]:
            warnings.append("Établissement non diffusible : certaines informations peuvent être masquées.")
        if payload["latitude"] is None:
            warnings.append("Adresse non géolocalisée automatiquement : positionnez le restaurant manuellement.")

        payload["warnings"] = warnings
        return Response(payload, status=status.HTTP_200_OK)


# ── 3. Avis restaurants ──────────────────────────────────────────────────────
@extend_schema(tags=["Public • Avis"])
class RestaurantReviewViewSet(viewsets.ModelViewSet):
    """
    Avis restaurants.

    - `list` / `retrieve` : public (filtrable par ?restaurant=<id>).
    - `create` / `update` / `destroy` : client authentifié, sur ses propres avis.
    - `eligibility` : indique si le client courant peut noter un restaurant.
    - `hide` / `unhide` : modération par le restaurateur propriétaire ou le staff.
    """

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return RestaurantReviewCreateSerializer
        return RestaurantReviewSerializer

    def get_queryset(self):
        # Écritures / objets détenus : restreindre à l'utilisateur (BOLA).
        if self.action in ("update", "partial_update", "destroy"):
            if not self.request.user.is_authenticated:
                return RestaurantReview.objects.none()
            return RestaurantReview.objects.filter(client=self.request.user)

        qs = RestaurantReview.objects.filter(is_visible=True).select_related("client", "restaurant")
        restaurant_id = self.request.query_params.get("restaurant")
        if restaurant_id:
            qs = qs.filter(restaurant_id=restaurant_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(client=self.request.user)

    # ── Éligibilité ──────────────────────────────────────────────────────────
    @extend_schema(
        summary="Éligibilité à laisser un avis",
        description=(
            "Indique si le client authentifié peut laisser un avis sur un "
            "restaurant : `can_review` est vrai s'il a une commande qualifiante "
            "(payée ou servie) et n'a pas déjà noté ce restaurant."
        ),
        parameters=[OpenApiParameter(name="restaurant", type=str, required=True)],
    )
    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def eligibility(self, request):
        restaurant_id = request.query_params.get("restaurant")
        if not restaurant_id:
            return Response(
                {"error": "Le paramètre 'restaurant' est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = latest_qualifying_order(request.user, restaurant_id)
        already_reviewed = RestaurantReview.objects.filter(
            restaurant_id=restaurant_id, client=request.user
        ).exists()

        return Response(
            {
                "has_ordered": order is not None,
                "already_reviewed": already_reviewed,
                "can_review": (order is not None) and (not already_reviewed),
                "order_id": order.id if order else None,
            }
        )

    # ── Modération ───────────────────────────────────────────────────────────
    @staticmethod
    def _can_moderate(user, review) -> bool:
        """Staff, ou restaurateur propriétaire du restaurant noté."""
        if getattr(user, "is_staff", False):
            return True
        profile = getattr(user, "restaurateur_profile", None)
        return profile is not None and review.restaurant.owner_id == profile.id

    def _set_visibility(self, request, pk, visible: bool):
        # get_object_or_404 direct (et non self.get_object()) pour contourner le
        # filtre is_visible=True du queryset public : un avis masqué doit rester
        # ré-affichable.
        review = get_object_or_404(RestaurantReview, pk=pk)
        if not self._can_moderate(request.user, review):
            return Response(
                {"error": "Vous n'êtes pas autorisé à modérer cet avis."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if review.is_visible != visible:
            review.is_visible = visible
            # Déclenche le signal post_save → recalcul de la note agrégée
            # (un avis masqué ne compte plus dans la moyenne).
            review.save(update_fields=["is_visible"])
        return Response({"id": review.id, "is_visible": review.is_visible})

    @extend_schema(summary="Masquer un avis (modération)")
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def hide(self, request, pk=None):
        return self._set_visibility(request, pk, visible=False)

    @extend_schema(summary="Réafficher un avis masqué (modération)")
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def unhide(self, request, pk=None):
        return self._set_visibility(request, pk, visible=True)

    @extend_schema(
        summary="Avis d'un restaurant pour modération (inclut les masqués)",
        description=(
            "Réservé au restaurateur propriétaire / staff. Liste tous les avis "
            "(visibles ou non) d'un restaurant afin de les modérer."
        ),
        parameters=[OpenApiParameter(name="restaurant", type=str, required=True)],
    )
    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def moderation(self, request):
        restaurant_id = request.query_params.get("restaurant")
        if not restaurant_id:
            return Response(
                {"error": "Le paramètre 'restaurant' est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        restaurant = get_object_or_404(Restaurant, pk=restaurant_id)

        is_staff = getattr(request.user, "is_staff", False)
        profile = getattr(request.user, "restaurateur_profile", None)
        if not is_staff and (profile is None or restaurant.owner_id != profile.id):
            return Response(
                {"error": "Vous n'êtes pas autorisé à modérer ce restaurant."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            RestaurantReview.objects.filter(restaurant=restaurant)
            .select_related("client")
            .order_by("-created_at")
        )
        data = RestaurantReviewSerializer(qs, many=True, context={"request": request}).data
        # Le serializer public n'expose pas is_visible : on l'ajoute pour la modération.
        visibility = {r.id: r.is_visible for r in qs}
        for item in data:
            item["is_visible"] = visibility.get(item["id"], True)
        return Response({"count": len(data), "results": data})