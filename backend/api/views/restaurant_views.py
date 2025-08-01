from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.utils import timezone
from api.models import Restaurant, Table, Menu, Order, RestaurateurProfile, MenuItem
from api.serializers.restaurant_serializers import (
    RestaurantSerializer, 
    RestaurantCreateSerializer, 
    RestaurantImageSerializer
)
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiRequest, OpenApiResponse, OpenApiParameter
from drf_spectacular.types import OpenApiTypes
import os
import traceback
import mimetypes

@extend_schema(tags=["Restaurant • Restaurants"])
class RestaurantViewSet(viewsets.ModelViewSet):
    """
    ViewSet complet pour la gestion des restaurants d'un restaurateur.
    
    Fonctionnalités incluses :
    - CRUD complet des restaurants
    - Upload et gestion d'images
    - Statistiques et tableaux de bord
    - Gestion des tables et menus
    - Activation/désactivation Stripe
    - Validation et statuts
    """
    queryset = Restaurant.objects.all().order_by('-id')
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['accepts_meal_vouchers']
    search_fields = ['name', 'address', 'siret']
    ordering_fields = ['name', 'created_at', 'is_stripe_active', 'rating']
    ordering = ['-id']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        """Filtre les restaurants par propriétaire connecté"""
        try:
            return Restaurant.objects.filter(owner=self.request.user.restaurateur_profile)
        except AttributeError:
            return Restaurant.objects.none()

    def get_serializer_class(self):
        """Utilise le bon sérialiseur selon l'action"""
        if self.action == 'create':
            return RestaurantCreateSerializer
        elif self.action in ['upload_image', 'update_image']:
            return RestaurantImageSerializer
        return RestaurantSerializer

    def perform_create(self, serializer):
        """Assigne automatiquement le propriétaire lors de la création"""
        serializer.save(owner=self.request.user.restaurateur_profile)

    @action(detail=False, methods=['get'])
    def meal_voucher_accepted(self, request):
        """Endpoint pour récupérer uniquement les restaurants acceptant les titres-restaurant"""
        restaurants = self.queryset.filter(accepts_meal_vouchers=True)
        serializer = self.get_serializer(restaurants, many=True)
        return Response(serializer.data)

    # ============================================================================
    # MÉTHODES CRUD DE BASE
    # ============================================================================

    @extend_schema(
        summary="Lister tous les restaurants",
        description="Retourne la liste paginée de tous les restaurants du restaurateur connecté avec leurs informations de base et statistiques rapides.",
        parameters=[
            OpenApiParameter(name="search", type=str, description="Recherche par nom, adresse ou SIRET"),
            OpenApiParameter(name="ordering", type=str, description="Tri par : name, created_at, is_stripe_active, rating"),
            OpenApiParameter(name="page", type=int, description="Numéro de page"),
            OpenApiParameter(name="page_size", type=int, description="Nombre d'éléments par page"),
        ],
        responses={
            200: OpenApiResponse(description="Liste des restaurants")
        }
    )
    def list(self, request, *args, **kwargs):
        """Liste tous les restaurants du restaurateur avec informations enrichies"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        
        restaurants_data = []
        restaurants = page if page is not None else queryset
        
        for restaurant in restaurants:
            # Statistiques rapides
            active_orders = Order.objects.filter(
                restaurant=restaurant, 
                status__in=['pending', 'in_progress']
            ).count()
            
            total_tables = Table.objects.filter(restaurant=restaurant).count()
            
            restaurants_data.append({
                "id": restaurant.id,
                "name": restaurant.name,
                "description": restaurant.description,
                "address": restaurant.address,
                "city": restaurant.city,
                "cuisine": restaurant.cuisine,
                "rating": float(restaurant.rating),
                "review_count": restaurant.review_count,
                "is_stripe_active": restaurant.is_stripe_active,
                "can_receive_orders": restaurant.can_receive_orders,
                "has_image": bool(restaurant.image),
                "image_url": request.build_absolute_uri(restaurant.image.url) if restaurant.image else None,
                "active_orders": active_orders,
                "total_tables": total_tables,
                "created_at": restaurant.created_at,
                "updated_at": restaurant.updated_at
            })
        
        if page is not None:
            return self.get_paginated_response(restaurants_data)
        
        return Response(restaurants_data)

    @extend_schema(
        summary="Détails d'un restaurant",
        description="Retourne les détails complets d'un restaurant avec ses statistiques et informations relationnelles.",
        responses={
            200: OpenApiResponse(description="Détails du restaurant"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    def retrieve(self, request, *args, **kwargs):
        """Récupère les détails complets d'un restaurant avec statistiques"""
        restaurant = self.get_object()
        
        # Utiliser le serializer complet pour la réponse
        serializer = self.get_serializer(restaurant)
        data = serializer.data
        
        # Ajouter les statistiques détaillées
        total_orders = Order.objects.filter(restaurant=restaurant).count()
        active_orders = Order.objects.filter(
            restaurant=restaurant, 
            status__in=['pending', 'in_progress']
        ).count()
        served_orders = Order.objects.filter(restaurant=restaurant, status='served').count()
        total_tables = Table.objects.filter(restaurant=restaurant).count()
        total_menus = Menu.objects.filter(restaurant=restaurant).count()
        active_menus = Menu.objects.filter(restaurant=restaurant, is_available=True).count()
        
        data['stats'] = {
            "orders": {
                "total": total_orders,
                "active": active_orders,
                "served": served_orders
            },
            "tables": {
                "total": total_tables
            },
            "menus": {
                "total": total_menus,
                "active": active_menus
            }
        }
        
        return Response(data)

    @extend_schema(
        summary="Créer un restaurant",
        description="Crée un nouveau restaurant avec toutes les informations nécessaires. Le SIRET peut être généré automatiquement si non fourni. Supporte l'upload d'image lors de la création.",
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string', 'maxLength': 100},
                    'description': {'type': 'string'},
                    'address': {'type': 'string', 'maxLength': 255},
                    'city': {'type': 'string', 'maxLength': 100},
                    'zipCode': {'type': 'string', 'pattern': '^[0-9]{5}$'},
                    'country': {'type': 'string', 'default': 'France'},
                    'phone': {'type': 'string'},
                    'email': {'type': 'string', 'format': 'email'},
                    'website': {'type': 'string', 'format': 'uri'},
                    'cuisine': {'type': 'string', 'enum': ['french', 'italian', 'asian', 'mexican', 'indian', 'american', 'mediterranean', 'japanese', 'chinese', 'thai', 'other']},
                    'priceRange': {'type': 'integer', 'minimum': 1, 'maximum': 4},
                    'image': {'type': 'string', 'format': 'binary'},
                    'latitude': {'type': 'number', 'format': 'double'},
                    'longitude': {'type': 'number', 'format': 'double'}
                },
                'required': ['name', 'address', 'city', 'zipCode', 'phone', 'email', 'cuisine', 'priceRange']
            }
        },
        responses={
            201: OpenApiResponse(description="Restaurant créé avec succès"),
            400: OpenApiResponse(description="Données invalides"),
            403: OpenApiResponse(description="Non autorisé")
        }
    )
    def create(self, request, *args, **kwargs):
        """Crée un nouveau restaurant avec gestion des images"""
        
        # Nettoyer les données frontend
        frontend_data = request.data.copy()
        
        # Supprimer les champs non gérés par le backend
        fields_to_remove = [
            'rating', 'reviewCount', 'isActive', 'openingHours', 
            'ownerId', 'createdAt', 'updatedAt', 'location'
        ]
        
        for field in fields_to_remove:
            frontend_data.pop(field, None)
        
        # Utiliser le sérialiseur de création
        serializer = self.get_serializer(data=frontend_data)
        
        if serializer.is_valid():
            try:
                # Sauvegarder avec le propriétaire
                restaurant = serializer.save(owner=request.user.restaurateur_profile)
                
                # Retourner avec le sérialiseur complet
                response_serializer = RestaurantSerializer(
                    restaurant, 
                    context={'request': request}
                )
                
                return Response(
                    response_serializer.data, 
                    status=status.HTTP_201_CREATED
                )
                
            except Exception as e:
                return Response({
                    'error': 'Erreur lors de la création',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        else:
            return Response({
                'error': 'Données invalides',
                'validation_errors': serializer.errors,
                'received_data': dict(frontend_data),
                'help': 'Vérifiez que tous les champs requis sont présents et valides'
            }, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Modifier un restaurant",
        description="Met à jour les informations d'un restaurant existant. Supporte les mises à jour partielles.",
        responses={
            200: OpenApiResponse(description="Restaurant mis à jour"),
            400: OpenApiResponse(description="Données invalides"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    def update(self, request, *args, **kwargs):
        """Met à jour un restaurant"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        if serializer.is_valid():
            try:
                serializer.save()
                
                if getattr(instance, '_prefetched_objects_cache', None):
                    instance._prefetched_objects_cache = {}
                    
                return Response(serializer.data)
                
            except Exception as e:
                return Response({
                    'error': 'Erreur lors de la mise à jour',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Modifier partiellement un restaurant", 
        description="Met à jour partiellement les informations d'un restaurant."
    )
    def partial_update(self, request, *args, **kwargs):
        """Mise à jour partielle"""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @extend_schema(
        summary="Supprimer un restaurant",
        description="Supprime définitivement un restaurant et tous ses éléments associés (tables, menus, commandes, images).",
        responses={
            204: OpenApiResponse(description="Restaurant supprimé"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    def destroy(self, request, *args, **kwargs):
        """Supprime un restaurant avec nettoyage"""
        instance = self.get_object()
        restaurant_name = instance.name
        
        try:
            # Supprimer l'image physique si elle existe
            if instance.image:
                try:
                    if os.path.isfile(instance.image.path):
                        os.remove(instance.image.path)
                except Exception:
                    pass  # Continuer même si la suppression échoue
            
            # La suppression en cascade s'occupera des relations
            self.perform_destroy(instance)
            
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la suppression',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ============================================================================
    # GESTION DES IMAGES
    # ============================================================================

    @extend_schema(
        summary="Uploader une image",
        description="Upload ou remplace l'image d'un restaurant existant.",
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'image': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'Fichier image (JPEG, PNG, WebP, max 5MB, min 200x200px)'
                    }
                },
                'required': ['image']
            }
        },
        responses={
            200: OpenApiResponse(description="Image uploadée avec succès"),
            400: OpenApiResponse(description="Fichier image invalide"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """Upload ou remplace l'image d'un restaurant"""
        
        try:
            restaurant = self.get_object()
            
            if 'image' not in request.FILES:
                return Response({
                    'error': 'Aucun fichier image fourni',
                    'help': 'Envoyez un fichier avec la clé "image"'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            image_file = request.FILES['image']
            
            # Validation basique
            if image_file.size > 5 * 1024 * 1024:  # 5MB
                return Response({
                    'error': 'Fichier trop volumineux',
                    'details': f'Taille: {image_file.size/1024/1024:.1f}MB (max 5MB)'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Vérifier le type
            content_type = getattr(image_file, 'content_type', None)
            allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            
            if content_type and content_type not in allowed_types:
                return Response({
                    'error': 'Type de fichier non autorisé',
                    'details': f'Type: {content_type}',
                    'allowed_types': allowed_types
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Sauvegarder l'ancienne image pour suppression ultérieure
            old_image_path = None
            if restaurant.image:
                try:
                    old_image_path = restaurant.image.path
                except:
                    pass
            
            # Utiliser le serializer
            serializer = RestaurantImageSerializer(
                restaurant, 
                data={'image': image_file}, 
                context={'request': request},
                partial=True
            )
            
            if serializer.is_valid():
                # Sauvegarder la nouvelle image
                updated_restaurant = serializer.save()
                
                # Supprimer l'ancienne image APRÈS la sauvegarde réussie
                if old_image_path and old_image_path != updated_restaurant.image.path:
                    try:
                        if os.path.isfile(old_image_path):
                            os.remove(old_image_path)
                    except Exception:
                        pass  # Continuer même si la suppression échoue
                
                # Construire la réponse
                response_data = {
                    'success': True,
                    'message': 'Image uploadée avec succès',
                    'restaurant': {
                        'id': updated_restaurant.id,
                        'name': updated_restaurant.name
                    }
                }
                
                if updated_restaurant.image:
                    try:
                        response_data.update({
                            'image_url': request.build_absolute_uri(updated_restaurant.image.url),
                            'image_name': os.path.basename(updated_restaurant.image.name),
                            'image_size': getattr(updated_restaurant.image, 'size', None)
                        })
                    except Exception:
                        pass  # Continuer même si la construction de l'URL échoue
                
                return Response(response_data, status=status.HTTP_200_OK)
                
            else:
                return Response({
                    'error': 'Fichier image invalide',
                    'validation_errors': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            return Response({
                'error': 'Erreur lors de l\'upload',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Supprimer l'image",
        description="Supprime l'image du restaurant."
    )
    @action(detail=True, methods=["delete"])
    def delete_image(self, request, pk=None):
        """Supprime l'image d'un restaurant"""
        try:
            restaurant = self.get_object()
            
            if not restaurant.image:
                return Response({
                    'error': 'Aucune image à supprimer'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Supprimer le fichier physique
            try:
                if os.path.isfile(restaurant.image.path):
                    os.remove(restaurant.image.path)
            except:
                pass
            
            # Supprimer la référence
            restaurant.image.delete(save=True)
            
            return Response({
                'success': True,
                'message': 'Image supprimée avec succès'
            })
            
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Informations de l'image",
        description="Retourne les informations détaillées de l'image du restaurant."
    )
    @action(detail=True, methods=["get"])
    def image_info(self, request, pk=None):
        """Informations sur l'image d'un restaurant"""
        try:
            restaurant = self.get_object()
            
            if restaurant.image:
                try:
                    return Response({
                        'has_image': True,
                        'image_url': request.build_absolute_uri(restaurant.image.url),
                        'image_name': os.path.basename(restaurant.image.name),
                        'image_size': getattr(restaurant.image, 'size', None),
                        'restaurant': {
                            'id': restaurant.id,
                            'name': restaurant.name
                        }
                    })
                except Exception:
                    return Response({
                        'has_image': False,
                        'error': 'Image référencée mais fichier inaccessible',
                        'restaurant': {
                            'id': restaurant.id,
                            'name': restaurant.name
                        }
                    })
            else:
                return Response({
                    'has_image': False,
                    'restaurant': {
                        'id': restaurant.id,
                        'name': restaurant.name
                    }
                })
                
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    # ============================================================================
    # GESTION STRIPE ET PAIEMENTS
    # ============================================================================

    @extend_schema(
        summary="Activer/désactiver Stripe",
        description="Active ou désactive les paiements Stripe pour le restaurant.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'is_stripe_active': {'type': 'boolean'}
                },
                'required': ['is_stripe_active']
            }
        }
    )
    @action(detail=True, methods=["post"])
    def toggle_stripe(self, request, pk=None):
        """Active ou désactive les paiements Stripe"""
        restaurant = self.get_object()
        is_active = request.data.get('is_stripe_active')
        
        if is_active is None:
            return Response({
                "error": "Le champ 'is_stripe_active' est requis"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        restaurant.is_stripe_active = is_active
        restaurant.save(update_fields=['is_stripe_active'])
        
        return Response({
            "id": restaurant.id,
            "name": restaurant.name,
            "is_stripe_active": restaurant.is_stripe_active,
            "can_receive_orders": restaurant.can_receive_orders
        })

    @extend_schema(
        summary="Statut de validation",
        description="Vérifie le statut de validation Stripe et les capacités du restaurant."
    )
    @action(detail=True, methods=["get"])
    def validation_status(self, request, pk=None):
        """Statut de validation du restaurant"""
        restaurant = self.get_object()
        owner = restaurant.owner
        
        return Response({
            "restaurant": {
                "id": restaurant.id,
                "name": restaurant.name,
                "is_stripe_active": restaurant.is_stripe_active,
                "can_receive_orders": restaurant.can_receive_orders
            },
            "owner_validation": {
                "stripe_verified": owner.stripe_verified,
                "stripe_onboarding_completed": owner.stripe_onboarding_completed,
                "is_active": owner.is_active,
                "has_stripe_account": bool(owner.stripe_account_id)
            },
            "capabilities": {
                "can_create_orders": restaurant.can_receive_orders,
                "can_receive_payments": restaurant.is_stripe_active and owner.stripe_verified
            }
        })

    # ============================================================================
    # STATISTIQUES ET TABLEAUX DE BORD
    # ============================================================================

    @extend_schema(
        summary="Statistiques du restaurant",
        description="Retourne les statistiques complètes d'un restaurant."
    )
    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        """Statistiques complètes d'un restaurant"""
        restaurant = self.get_object()
        
        # Statistiques des commandes
        orders = Order.objects.filter(restaurant=restaurant)
        total_orders = orders.count()
        pending_orders = orders.filter(status='pending').count()
        in_progress_orders = orders.filter(status='in_progress').count()
        served_orders = orders.filter(status='served').count()
        paid_orders = orders.filter(is_paid=True).count()
        
        # Statistiques des tables
        tables = Table.objects.filter(restaurant=restaurant)
        total_tables = tables.count()
        
        # Statistiques des menus
        menus = Menu.objects.filter(restaurant=restaurant)
        total_menus = menus.count()
        active_menus = menus.filter(is_available=True).count()
        
        # Statistiques des items de menu
        try:
            menu_items = MenuItem.objects.filter(menu__restaurant=restaurant)
            total_items = menu_items.count()
            available_items = menu_items.filter(is_available=True).count()
        except:
            total_items = 0
            available_items = 0
        
        return Response({
            "restaurant": {
                "id": restaurant.id,
                "name": restaurant.name,
                "can_receive_orders": restaurant.can_receive_orders,
                "is_stripe_active": restaurant.is_stripe_active
            },
            "orders": {
                "total": total_orders,
                "pending": pending_orders,
                "in_progress": in_progress_orders,
                "served": served_orders,
                "paid": paid_orders,
                "unpaid": total_orders - paid_orders
            },
            "tables": {
                "total": total_tables
            },
            "menus": {
                "total": total_menus,
                "active": active_menus
            },
            "menu_items": {
                "total": total_items,
                "available": available_items
            }
        })

    @extend_schema(
        summary="Dashboard du restaurant",
        description="Tableau de bord complet avec vue d'ensemble."
    )
    @action(detail=True, methods=["get"])
    def dashboard(self, request, pk=None):
        """Dashboard complet du restaurant"""
        restaurant = self.get_object()
        
        # Statistiques rapides
        total_orders = Order.objects.filter(restaurant=restaurant).count()
        active_orders = Order.objects.filter(
            restaurant=restaurant, 
            status__in=['pending', 'in_progress']
        ).count()
        total_tables = Table.objects.filter(restaurant=restaurant).count()
        active_menus = Menu.objects.filter(restaurant=restaurant, disponible=True).count()
        
        # Commandes récentes
        recent_orders = Order.objects.filter(restaurant=restaurant).order_by('-created_at')[:5]
        recent_orders_data = [{
            "id": order.id,
            "table": order.table.identifiant,
            "status": order.status,
            "is_paid": order.is_paid,
            "created_at": order.created_at
        } for order in recent_orders]
        
        return Response({
            "restaurant": {
                "id": restaurant.id,
                "name": restaurant.name,
                "address": restaurant.address,
                "can_receive_orders": restaurant.can_receive_orders,
                "is_stripe_active": restaurant.is_stripe_active,
                "has_image": bool(restaurant.image)
            },
            "quick_stats": {
                "total_orders": total_orders,
                "active_orders": active_orders,
                "total_tables": total_tables,
                "active_menus": active_menus
            },
            "recent_orders": recent_orders_data,
            "owner_status": {
                "stripe_verified": restaurant.owner.stripe_verified,
                "is_active": restaurant.owner.is_active
            }
        })

    # ============================================================================
    # GESTION DES RELATIONS (TABLES, MENUS, COMMANDES)
    # ============================================================================

    @extend_schema(
        summary="Lister les tables",
        description="Retourne la liste des tables du restaurant."
    )
    @action(detail=True, methods=["get"])
    def tables(self, request, pk=None):
        """Liste des tables d'un restaurant"""
        restaurant = self.get_object()
        tables = Table.objects.filter(restaurant=restaurant).order_by('identifiant')
        
        tables_data = []
        for table in tables:
            active_orders = Order.objects.filter(
                table=table, 
                status__in=['pending', 'in_progress']
            ).count()
            
            tables_data.append({
                "id": table.id,
                "identifiant": table.identifiant,
                "has_qr_code": bool(table.qr_code_file),
                "active_orders": active_orders,
                "created_at": table.created_at
            })
        
        return Response({
            "restaurant": restaurant.name,
            "total_tables": len(tables_data),
            "tables": tables_data
        })

    @extend_schema(
        summary="Lister les menus",
        description="Retourne la liste des menus du restaurant."
    )
    @action(detail=True, methods=["get"])
    def menus(self, request, pk=None):
        """Liste des menus d'un restaurant"""
        restaurant = self.get_object()
        menus = Menu.objects.filter(restaurant=restaurant).order_by('-created_at')
        
        menus_data = []
        for menu in menus:
            try:
                items_count = menu.items.count()
                available_items = menu.items.filter(is_available=True).count()
            except:
                items_count = 0
                available_items = 0
            
            menus_data.append({
                "id": menu.id,
                "name": menu.name,
                "is_available": getattr(menu, 'disponible', False),
                "items_count": items_count,
                "available_items": available_items,
                "created_at": menu.created_at,
                "updated_at": menu.updated_at
            })
        
        return Response({
            "restaurant": restaurant.name,
            "total_menus": len(menus_data),
            "menus": menus_data
        })

    @extend_schema(
        summary="Commandes récentes",
        description="Retourne les commandes récentes du restaurant.",
        parameters=[
            OpenApiParameter(name="limit", type=int, default=10, description="Nombre de commandes"),
            OpenApiParameter(name="status", type=str, description="Filtrer par statut")
        ]
    )
    @action(detail=True, methods=["get"])
    def recent_orders(self, request, pk=None):
        """Commandes récentes d'un restaurant"""
        restaurant = self.get_object()
        limit = int(request.query_params.get('limit', 10))
        status_filter = request.query_params.get('status')
        
        orders = Order.objects.filter(restaurant=restaurant).order_by('-created_at')
        
        if status_filter:
            orders = orders.filter(status=status_filter)
        
        orders = orders[:limit]
        
        orders_data = []
        for order in orders:
            try:
                items_count = order.order_items.count()
            except:
                items_count = 0
            
            orders_data.append({
                "id": order.id,
                "table": order.table.identifiant,
                "status": order.status,
                "is_paid": order.is_paid,
                "items_count": items_count,
                "created_at": order.created_at
            })
        
        return Response({
            "restaurant": restaurant.name,
            "orders": orders_data,
            "count": len(orders_data)
        })

    # ============================================================================
    # ACTIONS UTILITAIRES
    # ============================================================================

    @extend_schema(
        summary="Vérifier la santé du restaurant",
        description="Vérifie l'état général du restaurant et ses dépendances."
    )
    @action(detail=True, methods=["get"])
    def health_check(self, request, pk=None):
        """Vérification de l'état du restaurant"""
        restaurant = self.get_object()
        
        checks = {
            "restaurant_active": restaurant.is_active,
            "stripe_configured": restaurant.is_stripe_active,
            "owner_verified": restaurant.owner.stripe_verified,
            "has_image": bool(restaurant.image),
            "has_tables": Table.objects.filter(restaurant=restaurant).exists(),
            "has_menus": Menu.objects.filter(restaurant=restaurant).exists(),
            "can_receive_orders": restaurant.can_receive_orders
        }
        
        all_good = all(checks.values())
        
        return Response({
            "restaurant": {
                "id": restaurant.id,
                "name": restaurant.name
            },
            "status": "healthy" if all_good else "needs_attention",
            "checks": checks,
            "score": sum(checks.values()) / len(checks)
        })

    @extend_schema(
        summary="Exporter les données du restaurant",
        description="Exporte toutes les données du restaurant au format JSON."
    )
    @action(detail=True, methods=["get"])
    def export_data(self, request, pk=None):
        """Export sécurisé des données du restaurant"""
        try:
            restaurant = self.get_object()
            
            # Données de base
            restaurant_data = RestaurantSerializer(restaurant, context={'request': request}).data
            
            # Vérifier l'image avant export pour éviter les erreurs
            if restaurant.image:
                try:
                    # Test d'accès au fichier
                    image_exists = os.path.isfile(restaurant.image.path)
                    if not image_exists:
                        # Nettoyer la référence d'image cassée
                        restaurant_data['image_url'] = None
                        restaurant_data['image_name'] = 'Fichier manquant'
                        restaurant_data['has_image'] = False
                except Exception:
                    restaurant_data['image_url'] = None
                    restaurant_data['image_error'] = 'Erreur d\'accès au fichier'
            
            # Relations sécurisées
            tables = [{"id": t.id, "identifiant": t.identifiant} for t in restaurant.tables.all()]
            menus = [{"id": m.id, "name": m.name, "disponible": getattr(m, 'disponible', False)} for m in restaurant.menu.all()]
            orders = [{"id": o.id, "status": o.status, "created_at": o.created_at.isoformat()} for o in restaurant.orders.all()[:50]]  # Limiter à 50
            
            export_data = {
                "restaurant": restaurant_data,
                "tables": tables,
                "menus": menus,
                "recent_orders": orders,
                "export_date": timezone.now().isoformat(),
                "exported_by": request.user.username
            }
            
            return Response(export_data)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de l\'export',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
@extend_schema(tags=["Public • Restaurants"])
class PublicRestaurantViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet public en lecture seule pour que les clients puissent
    consulter les restaurants disponibles.
    """
    serializer_class = RestaurantSerializer
    permission_classes = [AllowAny]  # Accès public
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'city', 'cuisine']
    ordering_fields = ['name', 'rating', 'created_at']
    ordering = ['-rating', 'name']
    
    def get_queryset(self):
        """Retourne uniquement les restaurants actifs qui peuvent recevoir des commandes"""
        return Restaurant.objects.filter(
            is_active=True,
            can_receive_orders=True,
            owner__is_active=True,
            owner__stripe_verified=True
        ).select_related('owner').prefetch_related('opening_hours')
    
    @extend_schema(
        summary="Liste des restaurants publics",
        description="Retourne la liste des restaurants actifs disponibles pour les clients.",
        parameters=[
            OpenApiParameter(name="search", type=str, description="Recherche par nom, adresse, ville ou cuisine"),
            OpenApiParameter(name="cuisine", type=str, description="Filtrer par type de cuisine"),
            OpenApiParameter(name="city", type=str, description="Filtrer par ville"),
            OpenApiParameter(name="accepts_meal_vouchers", type=bool, description="Restaurants acceptant les titres-restaurant"),
        ]
    )
    def list(self, request, *args, **kwargs):
        """Liste publique des restaurants avec filtres"""
        queryset = self.filter_queryset(self.get_queryset())
        
        # Filtres supplémentaires
        cuisine = request.query_params.get('cuisine')
        city = request.query_params.get('city')
        accepts_meal_vouchers = request.query_params.get('accepts_meal_vouchers')
        
        if cuisine:
            queryset = queryset.filter(cuisine=cuisine)
        if city:
            queryset = queryset.filter(city__icontains=city)
        if accepts_meal_vouchers:
            accepts = accepts_meal_vouchers.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(accepts_meal_vouchers=accepts)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Détails d'un restaurant public",
        description="Retourne les détails complets d'un restaurant pour les clients."
    )
    def retrieve(self, request, *args, **kwargs):
        """Détails publics d'un restaurant"""
        return super().retrieve(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def cuisines(self, request):
        """Retourne la liste des types de cuisine disponibles"""
        cuisines = Restaurant.objects.filter(
            is_active=True,
            can_receive_orders=True
        ).values_list('cuisine', flat=True).distinct()
        
        cuisine_choices = dict(Restaurant.CUISINE_CHOICES)
        available_cuisines = [
            {'value': cuisine, 'label': cuisine_choices.get(cuisine, cuisine)}
            for cuisine in cuisines if cuisine
        ]
        
        return Response(available_cuisines)
    
    @action(detail=False, methods=['get'])
    def cities(self, request):
        """Retourne la liste des villes avec restaurants"""
        cities = Restaurant.objects.filter(
            is_active=True,
            can_receive_orders=True
        ).values_list('city', flat=True).distinct().order_by('city')
        
        return Response(list(cities))
    
    @action(detail=False, methods=['get'])
    def meal_voucher_restaurants(self, request):
        """Restaurants acceptant les titres-restaurant"""
        restaurants = self.get_queryset().filter(accepts_meal_vouchers=True)
        serializer = self.get_serializer(restaurants, many=True)
        return Response(serializer.data)