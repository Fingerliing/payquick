from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, Sum, Avg
from django.utils import timezone
from datetime import timedelta, datetime
from calendar import monthrange
import logging

from api.models import (
    DailyMenu, DailyMenuItem, DailyMenuTemplate, Restaurant, MenuItem
)
from api.serializers.daily_menu_serializers import (
    DailyMenuListSerializer, DailyMenuDetailSerializer, DailyMenuCreateSerializer,
    DailyMenuPublicSerializer, DailyMenuItemSerializer, DailyMenuTemplateSerializer
)
from api.permissions import IsRestaurateur, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

logger = logging.getLogger(__name__)


@extend_schema(tags=["Daily Menu • Menus du Jour"])
class DailyMenuViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour la gestion des menus du jour par les restaurateurs.

    Fonctionnalités :
    - CRUD complet des menus du jour
    - Duplication / copie de menus
    - Gestion rapide de disponibilité par plat
    - Templates et suggestions
    - Statistiques
    """
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    ordering_fields = ['date', 'created_at', 'title']
    ordering = ['-date', '-created_at']

    def get_queryset(self):
        """Filtre les menus par restaurant du restaurateur connecté"""
        return DailyMenu.objects.filter(
            restaurant__owner=self.request.user.restaurateur_profile
        ).select_related('restaurant').prefetch_related('daily_menu_items__menu_item__category')

    def get_serializer_class(self):
        if self.action == 'create':
            return DailyMenuCreateSerializer
        elif self.action == 'retrieve':
            return DailyMenuDetailSerializer
        elif self.action == 'list':
            return DailyMenuListSerializer
        return DailyMenuDetailSerializer

    def perform_create(self, serializer):
        """Assure que le restaurant appartient au restaurateur connecté"""
        restaurant = serializer.validated_data['restaurant']
        if restaurant.owner != self.request.user.restaurateur_profile:
            raise PermissionDenied("Ce restaurant ne vous appartient pas")
        serializer.save()

    @extend_schema(
        summary="Menu du jour d'aujourd'hui",
        description="Récupère le menu du jour actuel pour un restaurant donné",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=str, required=True, location="query")
        ]
    )
    @action(detail=False, methods=['get'])
    def today(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        if not restaurant_id:
            return Response(
                {'error': 'restaurant_id est requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )

        today = timezone.now().date()
        try:
            daily_menu = DailyMenu.objects.get(restaurant=restaurant, date=today)
            serializer = DailyMenuDetailSerializer(daily_menu)
            return Response(serializer.data)
        except DailyMenu.DoesNotExist:
            return Response(
                {'message': f'Aucun menu du jour configuré pour {today}'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(
        summary="Toggle rapide disponibilité d'un plat",
        description="Active/désactive rapidement un plat dans le menu du jour"
    )
    @action(detail=True, methods=['post'])
    def quick_toggle_item(self, request, pk=None):
        daily_menu = self.get_object()
        item_id = request.data.get('item_id')

        if not item_id:
            return Response(
                {'error': 'item_id est requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            daily_menu_item = DailyMenuItem.objects.get(
                daily_menu=daily_menu,
                id=item_id
            )
            daily_menu_item.is_available = not daily_menu_item.is_available
            daily_menu_item.save()

            return Response({
                'success': True,
                'item_id': str(daily_menu_item.id),
                'is_available': daily_menu_item.is_available,
                'message': f"Plat {'activé' if daily_menu_item.is_available else 'désactivé'}"
            })
        except DailyMenuItem.DoesNotExist:
            return Response(
                {'error': 'Plat non trouvé dans ce menu'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(
        summary="Dupliquer un menu existant",
        description=(
            "Crée une copie d'un menu du jour pour une nouvelle date. "
            "Si un menu existe déjà à la date cible, renvoie 409 sauf si "
            "`force=true` est passé : dans ce cas, le menu existant est "
            "supprimé puis remplacé par la copie."
        )
    )
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source_menu = self.get_object()
        new_date = request.data.get('date')
        force = bool(request.data.get('force', False))

        if not new_date:
            return Response(
                {'error': 'date est requise'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            new_date = datetime.strptime(new_date, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_date < timezone.now().date() - timedelta(days=1):
            return Response(
                {'error': 'Impossible de dupliquer vers une date antérieure à hier'},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing = DailyMenu.objects.filter(
            restaurant=source_menu.restaurant,
            date=new_date,
        ).first()

        # Cas idempotent : on duplique vers la même date que la source → no-op
        if existing and existing.id == source_menu.id:
            serializer = DailyMenuDetailSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if existing:
            if not force:
                return Response(
                    {
                        'error': f'Un menu du jour existe déjà pour le {new_date}',
                        'code': 'menu_exists',
                        'existing_menu_id': str(existing.id),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            existing.delete()

        new_menu = DailyMenu.objects.create(
            restaurant=source_menu.restaurant,
            date=new_date,
            title=source_menu.title,
            description=source_menu.description,
            special_price=source_menu.special_price,
            is_active=source_menu.is_active,
            created_by=request.user,
        )

        # Copier tous les items SANS leur prix individuel : la formule s'applique
        for source_item in source_menu.daily_menu_items.all():
            DailyMenuItem.objects.create(
                daily_menu=new_menu,
                menu_item=source_item.menu_item,
                special_price=None,
                display_order=source_item.display_order,
                special_note=source_item.special_note,
                is_available=source_item.is_available,
            )

        serializer = DailyMenuDetailSerializer(new_menu)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary="Suggestions de plats pour le menu du jour",
        description="Propose des plats populaires ou de saison pour créer un menu"
    )
    @action(detail=False, methods=['get'])
    def suggestions(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        if not restaurant_id:
            return Response(
                {'error': 'restaurant_id est requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )

        popular_items = self._get_popular_items(restaurant)
        seasonal_items = self._get_seasonal_items(restaurant)
        never_used_items = self._get_never_used_items(restaurant)

        return Response({
            'restaurant': restaurant.name,
            'suggestions': {
                'popular': popular_items,
                'seasonal': seasonal_items,
                'new': never_used_items[:5],
            }
        })

    def _get_popular_items(self, restaurant):
        recent_date = timezone.now().date() - timedelta(days=30)
        popular = DailyMenuItem.objects.filter(
            daily_menu__restaurant=restaurant,
            daily_menu__date__gte=recent_date
        ).values('menu_item').annotate(
            usage_count=Count('menu_item')
        ).order_by('-usage_count')[:10]

        popular_items = []
        for item in popular:
            try:
                menu_item = MenuItem.objects.get(id=item['menu_item'])
            except MenuItem.DoesNotExist:
                continue
            popular_items.append({
                'id': str(menu_item.id),
                'name': menu_item.name,
                'category': menu_item.category.name if menu_item.category else 'Autres',
                'price': float(menu_item.price),
                'usage_count': item['usage_count']
            })

        return popular_items

    def _get_seasonal_items(self, restaurant):
        current_month = timezone.now().month

        if current_month in [12, 1, 2]:
            seasonal_keywords = ['soupe', 'ragoût', 'gratin', 'chaud']
        elif current_month in [3, 4, 5]:
            seasonal_keywords = ['salade', 'légumes', 'frais', 'asperg']
        elif current_month in [6, 7, 8]:
            seasonal_keywords = ['gazpacho', 'tomate', 'melon', 'glace']
        else:
            seasonal_keywords = ['potiron', 'champignon', 'gibier', 'châtaigne']

        q_objects = Q()
        for keyword in seasonal_keywords:
            q_objects |= Q(name__icontains=keyword) | Q(description__icontains=keyword)

        seasonal_items = MenuItem.objects.filter(
            menu__restaurant=restaurant,
            is_available=True
        ).filter(q_objects)[:8]

        return [{
            'id': str(item.id),
            'name': item.name,
            'category': item.category.name if item.category else 'Autres',
            'price': float(item.price),
            'reason': 'saisonnier'
        } for item in seasonal_items]

    def _get_never_used_items(self, restaurant):
        used_items = DailyMenuItem.objects.filter(
            daily_menu__restaurant=restaurant
        ).values_list('menu_item_id', flat=True)

        never_used = MenuItem.objects.filter(
            menu__restaurant=restaurant,
            is_available=True
        ).exclude(id__in=used_items)[:10]

        return [{
            'id': str(item.id),
            'name': item.name,
            'category': item.category.name if item.category else 'Autres',
            'price': float(item.price),
            'reason': 'nouveau'
        } for item in never_used]

    @extend_schema(
        summary="Menu par date",
        description="Récupère le menu d'une date spécifique pour un restaurant",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=str, required=True, location="query"),
            OpenApiParameter(name="date", type=str, required=True, location="query", description="Format: YYYY-MM-DD")
        ]
    )
    @action(detail=False, methods=['get'], url_path='by-date')
    def by_date(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        date = request.query_params.get('date')

        if not restaurant_id or not date:
            return Response(
                {'error': 'restaurant_id et date sont requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )

        try:
            target_date = datetime.strptime(date, '%Y-%m-%d').date()
            daily_menu = DailyMenu.objects.get(restaurant=restaurant, date=target_date)
            serializer = DailyMenuDetailSerializer(daily_menu)
            return Response(serializer.data)
        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except DailyMenu.DoesNotExist:
            return Response(
                {'message': f'Aucun menu trouvé pour le {target_date}'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(
        summary="Menus par période",
        description="Récupère les menus d'une période pour un restaurant",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=str, required=True, location="query"),
            OpenApiParameter(name="start_date", type=str, required=True, location="query", description="Format: YYYY-MM-DD"),
            OpenApiParameter(name="end_date", type=str, required=True, location="query", description="Format: YYYY-MM-DD")
        ]
    )
    @action(detail=False, methods=['get'])
    def range(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not all([restaurant_id, start_date, end_date]):
            return Response(
                {'error': 'restaurant_id, start_date et end_date sont requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )

        try:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

            if start_date > end_date:
                return Response(
                    {'error': 'La date de début doit être antérieure à la date de fin'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            menus = DailyMenu.objects.filter(
                restaurant=restaurant,
                date__range=[start_date, end_date]
            ).order_by('date')

            serializer = DailyMenuListSerializer(menus, many=True)
            return Response(serializer.data)

        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        summary="Calendrier mensuel",
        description="Récupère le calendrier des menus du mois",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=str, required=True, location="query"),
            OpenApiParameter(name="year", type=int, required=True, location="query"),
            OpenApiParameter(name="month", type=int, required=True, location="query", description="1-12")
        ]
    )
    @action(detail=False, methods=['get'])
    def calendar(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        year = request.query_params.get('year')
        month = request.query_params.get('month')

        if not all([restaurant_id, year, month]):
            return Response(
                {'error': 'restaurant_id, year et month sont requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )

        try:
            year = int(year)
            month = int(month)

            if not (1 <= month <= 12):
                return Response(
                    {'error': 'Le mois doit être entre 1 et 12'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            _, last_day = monthrange(year, month)
            start_date = datetime(year, month, 1).date()
            end_date = datetime(year, month, last_day).date()

            menus = DailyMenu.objects.filter(
                restaurant=restaurant,
                date__range=[start_date, end_date]
            ).order_by('date')

            dates_with_menu = [menu.date.isoformat() for menu in menus]
            menu_summaries = [{
                'date': menu.date.isoformat(),
                'menu_id': str(menu.id),
                'title': menu.title,
                'items_count': menu.total_items_count,
                'is_active': menu.is_active
            } for menu in menus]

            return Response({
                'dates_with_menu': dates_with_menu,
                'menu_summaries': menu_summaries
            })

        except ValueError:
            return Response(
                {'error': 'Année et mois doivent être des entiers valides'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        summary="Copier un menu vers une nouvelle date",
        description=(
            "Alias historique de `duplicate`. Mêmes règles : 409 si la date "
            "cible est déjà occupée, sauf si `force=true`."
        ),
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'target_date': {
                        'type': 'string',
                        'format': 'date',
                        'description': 'Date cible au format YYYY-MM-DD'
                    },
                    'force': {
                        'type': 'boolean',
                        'description': 'Remplacer un éventuel menu existant à cette date'
                    },
                },
                'required': ['target_date']
            }
        }
    )
    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        source_menu = self.get_object()
        target_date = request.data.get('target_date') or request.data.get('date')
        force = bool(request.data.get('force', False))

        if not target_date:
            return Response(
                {'error': 'target_date est requise'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_date = datetime.strptime(target_date, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if target_date < timezone.now().date() - timedelta(days=1):
            return Response(
                {'error': 'Impossible de copier vers une date antérieure à hier'},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing = DailyMenu.objects.filter(
            restaurant=source_menu.restaurant,
            date=target_date,
        ).first()

        if existing and existing.id == source_menu.id:
            serializer = DailyMenuDetailSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if existing:
            if not force:
                return Response(
                    {
                        'error': f'Un menu du jour existe déjà pour le {target_date}',
                        'code': 'menu_exists',
                        'existing_menu_id': str(existing.id),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            existing.delete()

        new_menu = DailyMenu.objects.create(
            restaurant=source_menu.restaurant,
            date=target_date,
            title=source_menu.title,
            description=source_menu.description,
            special_price=source_menu.special_price,
            is_active=source_menu.is_active,
            created_by=request.user,
        )

        for source_item in source_menu.daily_menu_items.all():
            DailyMenuItem.objects.create(
                daily_menu=new_menu,
                menu_item=source_item.menu_item,
                special_price=None,
                display_order=source_item.display_order,
                special_note=source_item.special_note,
                is_available=source_item.is_available,
            )

        serializer = DailyMenuDetailSerializer(new_menu)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Daily Menu • API Publique"])
class PublicDailyMenuViewSet(viewsets.ReadOnlyModelViewSet):
    """API publique pour l'accès aux menus du jour côté client (pas d'auth)."""
    permission_classes = [AllowAny]
    serializer_class = DailyMenuPublicSerializer

    def get_queryset(self):
        return DailyMenu.objects.filter(
            is_active=True,
            date__gte=timezone.now().date()
        ).select_related('restaurant').prefetch_related(
            'daily_menu_items__menu_item__category'
        )

    @extend_schema(
        summary="Menu du jour d'un restaurant",
        description="Récupère le menu du jour actuel d'un restaurant (API publique)",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=str, required=True, location="path")
        ]
    )
    @action(detail=False, methods=['get'], url_path=r'restaurant/(?P<restaurant_id>[^/.]+)')
    def by_restaurant(self, request, restaurant_id=None):
        today = timezone.now().date()

        try:
            daily_menu = DailyMenu.objects.get(
                restaurant_id=restaurant_id,
                date=today,
                is_active=True
            )
            serializer = self.get_serializer(daily_menu)
            return Response(serializer.data)
        except DailyMenu.DoesNotExist:
            return Response(
                {'message': 'Aucun menu du jour disponible pour ce restaurant'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(
        summary="Menus du jour disponibles aujourd'hui",
        description="Liste tous les restaurants ayant un menu du jour aujourd'hui"
    )
    @action(detail=False, methods=['get'])
    def today_available(self, request):
        today = timezone.now().date()
        menus = self.get_queryset().filter(date=today)

        restaurants_with_menu = []
        for menu in menus:
            restaurants_with_menu.append({
                'restaurant_id': str(menu.restaurant.id),
                'restaurant_name': menu.restaurant.name,
                'restaurant_image': menu.restaurant.image.url if menu.restaurant.image else None,
                'menu_title': menu.title,
                'special_price': float(menu.special_price) if menu.special_price else None,
                'items_count': menu.total_items_count
            })

        return Response({
            'date': today,
            'restaurants_count': len(restaurants_with_menu),
            'restaurants': restaurants_with_menu
        })


@extend_schema(tags=["Daily Menu • Templates"])
class DailyMenuTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet pour la gestion des templates de menus du jour."""
    serializer_class = DailyMenuTemplateSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]

    def get_queryset(self):
        return DailyMenuTemplate.objects.filter(
            restaurant__owner=self.request.user.restaurateur_profile
        ).prefetch_related('template_items__menu_item__category')

    @extend_schema(
        summary="Appliquer un template",
        description="Crée un menu du jour à partir d'un template pour une date donnée"
    )
    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        template = self.get_object()
        target_date = request.data.get('date')

        if not target_date:
            return Response(
                {'error': 'date est requise'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_date = datetime.strptime(target_date, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            daily_menu = template.apply_to_date(target_date, request.user)
            serializer = DailyMenuDetailSerializer(daily_menu)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            logger.warning(f"ValidationError applying template: {e}")
            return Response(
                {'error': 'Données invalides ou conflit de dates pour ce menu.'},
                status=status.HTTP_400_BAD_REQUEST
            )