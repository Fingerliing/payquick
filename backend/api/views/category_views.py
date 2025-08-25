# backend/api/views/category_views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from api.models import Restaurant, MenuCategory, MenuSubCategory, MenuItem
from api.serializers.category_serializers import (
    MenuCategorySerializer,
    MenuCategoryCreateSerializer,
    MenuSubCategorySerializer,
    MenuSubCategoryCreateSerializer,
)
from api.serializers.menu_serializers import MenuItemSerializer
from api.permissions import IsRestaurateur, IsValidatedRestaurateur


@extend_schema(tags=["Categories • Management"])
class MenuCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour la gestion des catégories de menu
    
    Routes disponibles:
    - GET /api/v1/menu/categories/ - Liste toutes les catégories
    - POST /api/v1/menu/categories/ - Crée une nouvelle catégorie
    - GET /api/v1/menu/categories/{id}/ - Détails d'une catégorie
    - PUT/PATCH /api/v1/menu/categories/{id}/ - Modifie une catégorie
    - DELETE /api/v1/menu/categories/{id}/ - Supprime une catégorie
    - GET /api/v1/menu/categories/restaurant/{restaurant_id}/ - Catégories d'un restaurant
    - GET /api/v1/menu/categories/statistics/ - Statistiques des catégories
    - POST /api/v1/menu/categories/reorder/ - Réorganise l'ordre des catégories
    """
    
    permission_classes = [permissions.IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    
    def get_queryset(self):
        """Filtre les catégories par restaurant du restaurateur connecté"""
        try:
            restaurant_id = self.request.query_params.get('restaurant_id')
            base_queryset = MenuCategory.objects.select_related('restaurant').prefetch_related(
                'subcategories'
            )
            
            if restaurant_id:
                # Filtrer par restaurant spécifique
                restaurant = get_object_or_404(
                    Restaurant,
                    id=restaurant_id,
                    owner=self.request.user.restaurateur_profile
                )
                return base_queryset.filter(restaurant=restaurant)
            else:
                # Toutes les catégories du restaurateur
                return base_queryset.filter(
                    restaurant__owner=self.request.user.restaurateur_profile
                )
        except AttributeError:
            return MenuCategory.objects.none()
    
    def get_serializer_class(self):
        """Utilise le bon serializer selon l'action"""
        if self.action == 'create':
            return MenuCategoryCreateSerializer
        return MenuCategorySerializer
    
    def perform_create(self, serializer):
        """Assigne automatiquement le restaurant lors de la création"""
        restaurant_id = self.request.data.get('restaurant_id')
        if not restaurant_id:
            restaurant_id = self.request.query_params.get('restaurant_id')
        
        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=self.request.user.restaurateur_profile
        )
        serializer.save(restaurant=restaurant)
    
    @extend_schema(
        summary="Catégories par restaurant",
        description="Retourne toutes les catégories d'un restaurant spécifique",
        parameters=[
            OpenApiParameter(
                name='restaurant_id',
                type=str,
                location=OpenApiParameter.PATH,
                description='UUID du restaurant'
            ),
        ]
    )
    @action(detail=False, methods=['get'], url_path='restaurant/(?P<restaurant_id>[^/.]+)')
    def by_restaurant(self, request, restaurant_id=None):
        """Retourne les catégories d'un restaurant spécifique"""
        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )
        
        categories = MenuCategory.objects.filter(
            restaurant=restaurant
        ).select_related('restaurant').prefetch_related('subcategories').order_by('order', 'name')
        
        serializer = self.get_serializer(categories, many=True)
        return Response({
            'restaurant': {
                'id': restaurant.id,
                'name': restaurant.name
            },
            'categories': serializer.data,
            'total_count': categories.count()
        })
    
    @extend_schema(
        summary="Réorganiser l'ordre des catégories",
        description="Met à jour l'ordre d'affichage de plusieurs catégories en une seule requête",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'restaurant_id': {
                        'type': 'string',
                        'format': 'uuid',
                        'description': 'ID du restaurant'
                    },
                    'categories': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'id': {'type': 'string', 'format': 'uuid'},
                                'order': {'type': 'integer', 'minimum': 0}
                            },
                            'required': ['id', 'order']
                        }
                    }
                },
                'required': ['restaurant_id', 'categories']
            }
        }
    )
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Réorganise l'ordre d'affichage des catégories"""
        restaurant_id = request.data.get('restaurant_id')
        categories_data = request.data.get('categories', [])
        
        if not restaurant_id:
            return Response(
                {'error': 'ID du restaurant requis'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not categories_data:
            return Response(
                {'error': 'Liste des catégories requise'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Vérifier que le restaurant appartient au restaurateur
        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )
        
        updated_count = 0
        
        for cat_data in categories_data:
            category_id = cat_data.get('id')
            new_order = cat_data.get('order')
            
            if category_id and new_order is not None:
                try:
                    category = MenuCategory.objects.get(
                        id=category_id,
                        restaurant=restaurant
                    )
                    category.order = new_order
                    category.save(update_fields=['order', 'updated_at'])
                    updated_count += 1
                except MenuCategory.DoesNotExist:
                    continue
        
        return Response({
            'message': f'{updated_count} catégorie(s) réorganisée(s)',
            'updated_count': updated_count,
            'restaurant_id': str(restaurant_id)
        })
    
    @extend_schema(
        summary="Activer/désactiver plusieurs catégories",
        description="Active ou désactive plusieurs catégories en une seule requête"
    )
    @action(detail=False, methods=['post'])
    def bulk_toggle_active(self, request):
        """Active/désactive plusieurs catégories"""
        restaurant_id = request.data.get('restaurant_id')
        category_ids = request.data.get('category_ids', [])
        is_active = request.data.get('is_active', True)
        
        if not restaurant_id:
            return Response(
                {'error': 'ID du restaurant requis'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not category_ids:
            return Response(
                {'error': 'Liste des IDs de catégories requise'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Vérifier que le restaurant appartient au restaurateur
        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )
        
        updated_count = MenuCategory.objects.filter(
            id__in=category_ids,
            restaurant=restaurant
        ).update(is_active=is_active)
        
        return Response({
            'message': f'{updated_count} catégorie(s) {"activée(s)" if is_active else "désactivée(s)"}',
            'updated_count': updated_count,
            'restaurant_id': str(restaurant_id)
        })
    
    @extend_schema(
        summary="Statistiques des catégories",
        description="Retourne des statistiques détaillées sur les catégories d'un restaurant",
        parameters=[
            OpenApiParameter(
                name='restaurant_id',
                type=str,
                location=OpenApiParameter.QUERY,
                description='UUID du restaurant',
                required=True
            ),
        ]
    )
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Retourne des statistiques sur les catégories"""
        restaurant_id = request.query_params.get('restaurant_id')
        if not restaurant_id:
            return Response(
                {'error': 'ID du restaurant requis en paramètre'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Vérifier que le restaurant appartient au restaurateur
        restaurant = get_object_or_404(
            Restaurant,
            id=restaurant_id,
            owner=request.user.restaurateur_profile
        )
        
        categories = MenuCategory.objects.filter(restaurant=restaurant)
        
        stats = {
            'restaurant': {
                'id': restaurant.id,
                'name': restaurant.name
            },
            'totals': {
                'categories': categories.count(),
                'active_categories': categories.filter(is_active=True).count(),
                'subcategories': MenuSubCategory.objects.filter(
                    category__in=categories
                ).count(),
                'active_subcategories': MenuSubCategory.objects.filter(
                    category__in=categories,
                    is_active=True
                ).count(),
                'menu_items': MenuItem.objects.filter(
                    category__in=categories
                ).count(),
                'available_menu_items': MenuItem.objects.filter(
                    category__in=categories,
                    is_available=True
                ).count(),
            }
        }
        
        # Statistiques par catégorie
        category_stats = categories.annotate(
            subcategories_count=Count('subcategories'),
            active_subcategories_count=Count(
                'subcategories',
                filter=Q(subcategories__is_active=True)
            ),
            menu_items_count=Count('menu_items'),
            available_menu_items_count=Count(
                'menu_items',
                filter=Q(menu_items__is_available=True)
            )
        ).values(
            'id', 'name', 'icon', 'color', 'is_active', 'order',
            'subcategories_count', 'active_subcategories_count',
            'menu_items_count', 'available_menu_items_count'
        ).order_by('order', 'name')
        
        stats['categories_breakdown'] = list(category_stats)
        
        return Response(stats)


@extend_schema(tags=["Categories • SubCategories"])
class MenuSubCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour la gestion des sous-catégories
    
    Routes disponibles:
    - GET /api/v1/menu/subcategories/ - Liste toutes les sous-catégories
    - POST /api/v1/menu/subcategories/ - Crée une nouvelle sous-catégorie
    - GET /api/v1/menu/subcategories/{id}/ - Détails d'une sous-catégorie
    - PUT/PATCH /api/v1/menu/subcategories/{id}/ - Modifie une sous-catégorie
    - DELETE /api/v1/menu/subcategories/{id}/ - Supprime une sous-catégorie
    - POST /api/v1/menu/subcategories/reorder/ - Réorganise l'ordre des sous-catégories
    """
    
    permission_classes = [permissions.IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    
    def get_queryset(self):
        """Filtre les sous-catégories par restaurant du restaurateur"""
        try:
            category_id = self.request.query_params.get('category_id')
            restaurant_id = self.request.query_params.get('restaurant_id')
            
            base_queryset = MenuSubCategory.objects.select_related(
                'category', 'category__restaurant'
            )
            
            if category_id:
                # Filtrer par catégorie spécifique
                return base_queryset.filter(
                    category_id=category_id,
                    category__restaurant__owner=self.request.user.restaurateur_profile
                )
            elif restaurant_id:
                # Filtrer par restaurant spécifique
                return base_queryset.filter(
                    category__restaurant_id=restaurant_id,
                    category__restaurant__owner=self.request.user.restaurateur_profile
                )
            else:
                # Toutes les sous-catégories du restaurateur
                return base_queryset.filter(
                    category__restaurant__owner=self.request.user.restaurateur_profile
                )
        except AttributeError:
            return MenuSubCategory.objects.none()
    
    def get_serializer_class(self):
        """Utilise le bon serializer selon l'action"""
        if self.action in ['create', 'update', 'partial_update']:
            return MenuSubCategoryCreateSerializer
        return MenuSubCategorySerializer
    
    @extend_schema(
        summary="Réorganiser les sous-catégories",
        description="Met à jour l'ordre d'affichage des sous-catégories d'une catégorie",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'category_id': {
                        'type': 'string',
                        'format': 'uuid',
                        'description': 'ID de la catégorie parent'
                    },
                    'subcategories': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'id': {'type': 'string', 'format': 'uuid'},
                                'order': {'type': 'integer', 'minimum': 0}
                            },
                            'required': ['id', 'order']
                        }
                    }
                },
                'required': ['category_id', 'subcategories']
            }
        }
    )
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Réorganise l'ordre des sous-catégories"""
        category_id = request.data.get('category_id')
        subcategories_data = request.data.get('subcategories', [])
        
        if not category_id:
            return Response(
                {'error': 'ID de catégorie requis'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not subcategories_data:
            return Response(
                {'error': 'Liste des sous-catégories requise'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Vérifier que la catégorie appartient au restaurateur
        try:
            category = MenuCategory.objects.get(
                id=category_id,
                restaurant__owner=self.request.user.restaurateur_profile
            )
        except MenuCategory.DoesNotExist:
            return Response(
                {'error': 'Catégorie non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated_count = 0
        
        for subcat_data in subcategories_data:
            subcategory_id = subcat_data.get('id')
            new_order = subcat_data.get('order')
            
            if subcategory_id and new_order is not None:
                try:
                    subcategory = category.subcategories.get(id=subcategory_id)
                    subcategory.order = new_order
                    subcategory.save(update_fields=['order', 'updated_at'])
                    updated_count += 1
                except MenuSubCategory.DoesNotExist:
                    continue
        
        return Response({
            'message': f'{updated_count} sous-catégorie(s) réorganisée(s)',
            'updated_count': updated_count,
            'category_id': str(category_id)
        })
    
    @extend_schema(
        summary="Sous-catégories par catégorie",
        description="Retourne toutes les sous-catégories d'une catégorie spécifique"
    )
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Retourne les sous-catégories d'une catégorie spécifique"""
        category_id = request.query_params.get('category_id')
        
        if not category_id:
            return Response(
                {'error': 'ID de catégorie requis en paramètre'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        category = get_object_or_404(
            MenuCategory,
            id=category_id,
            restaurant__owner=request.user.restaurateur_profile
        )
        
        subcategories = MenuSubCategory.objects.filter(
            category=category
        ).order_by('order', 'name')
        
        serializer = self.get_serializer(subcategories, many=True)
        return Response({
            'category': {
                'id': category.id,
                'name': category.name,
                'icon': category.icon,
                'color': category.color
            },
            'subcategories': serializer.data,
            'total_count': subcategories.count()
        })