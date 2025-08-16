from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.utils import timezone
from datetime import datetime, timedelta
from api.models import (
    Restaurant, Table, Menu, Order, RestaurateurProfile, MenuItem, 
    OpeningHours, OpeningPeriod, RestaurantHoursTemplate
)
from api.serializers.restaurant_serializers import (
    RestaurantSerializer, 
    RestaurantCreateSerializer, 
    RestaurantImageSerializer,
    RestaurantHoursTemplateSerializer
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
    - NOUVEAU: Support des fermetures manuelles
    - NOUVEAU: Gestion des horaires multi-périodes
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
                "id": str(restaurant.id),  # Convertir en string pour cohérence
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
                "updated_at": restaurant.updated_at,
                # NOUVEAU: Statut manuel
                "isManuallyOverridden": restaurant.is_manually_overridden,
                "manualOverrideReason": restaurant.manual_override_reason
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
        
        # S'assurer que l'id est une string
        data['id'] = str(restaurant.id)
        
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
        description="Crée un nouveau restaurant avec toutes les informations nécessaires. Le SIRET peut être généré automatiquement si non fourni. Supporte l'upload d'image lors de la création et les nouveaux horaires multi-périodes.",
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
                    'longitude': {'type': 'number', 'format': 'double'},
                    'openingHours': {'type': 'array', 'items': {'type': 'object'}}
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
        """Crée un nouveau restaurant avec gestion des images et horaires multi-périodes"""
        
        # Nettoyer les données frontend
        frontend_data = request.data.copy()
        
        # Extraire les horaires d'ouverture avant de les supprimer
        opening_hours_data = frontend_data.pop('openingHours', [])
        
        # Supprimer les champs non gérés par le backend
        fields_to_remove = [
            'rating', 'reviewCount', 'isActive', 'ownerId', 
            'createdAt', 'updatedAt', 'location', 'can_receive_orders',
            'accepts_meal_vouchers_display', 'isManuallyOverridden',
            'manualOverrideReason', 'manualOverrideUntil'
        ]
        
        for field in fields_to_remove:
            frontend_data.pop(field, None)
        
        # Gérer latitude/longitude depuis location si présent
        location_data = request.data.get('location')
        if location_data and isinstance(location_data, dict):
            frontend_data['latitude'] = location_data.get('latitude')
            frontend_data['longitude'] = location_data.get('longitude')
        
        # Utiliser le sérialiseur de création
        serializer = self.get_serializer(data=frontend_data)
        
        if serializer.is_valid():
            try:
                # Sauvegarder avec le propriétaire
                restaurant = serializer.save(owner=request.user.restaurateur_profile)
                owner = request.user.restaurateur_profile
                if owner.stripe_verified and owner.is_active and not restaurant.is_stripe_active:
                    restaurant.is_stripe_active = True
                    restaurant.save(update_fields=["is_stripe_active"])
                
                # Créer les horaires d'ouverture avec support multi-périodes
                self._create_opening_hours_with_periods(restaurant, opening_hours_data)
                
                # Retourner avec le sérialiseur complet incluant les horaires
                response_serializer = RestaurantSerializer(
                    restaurant, 
                    context={'request': request}
                )
                
                return Response(
                    response_serializer.data, 
                    status=status.HTTP_201_CREATED
                )
                
            except Exception as e:
                # Si erreur, supprimer le restaurant créé pour éviter les incohérences
                if 'restaurant' in locals():
                    restaurant.delete()
                    
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

    def _create_opening_hours_with_periods(self, restaurant, opening_hours_data):
        """Crée les horaires avec support des périodes multiples"""
        for day_data in opening_hours_data:
            try:
                # Gérer les différents formats possibles
                day_of_week = day_data.get('dayOfWeek', day_data.get('day_of_week'))
                is_closed = day_data.get('isClosed', day_data.get('is_closed', False))
                periods_data = day_data.get('periods', [])
                
                # Créer l'entrée horaire pour ce jour
                opening_hours = OpeningHours.objects.create(
                    restaurant=restaurant,
                    day_of_week=day_of_week,
                    is_closed=is_closed
                )
                
                # Créer les périodes si pas fermé
                if not is_closed and periods_data:
                    for period_data in periods_data:
                        OpeningPeriod.objects.create(
                            opening_hours=opening_hours,
                            start_time=period_data.get('startTime', '09:00'),
                            end_time=period_data.get('endTime', '19:00'),
                            name=period_data.get('name', '')
                        )
                elif not is_closed:
                    # Rétrocompatibilité : créer une période par défaut si aucune fournie
                    # mais seulement si format ancien avec openTime/closeTime
                    open_time = day_data.get('openTime', day_data.get('open_time'))
                    close_time = day_data.get('closeTime', day_data.get('close_time'))
                    
                    if open_time and close_time:
                        OpeningPeriod.objects.create(
                            opening_hours=opening_hours,
                            start_time=open_time,
                            end_time=close_time,
                            name='Service principal'
                        )
                        # Sauvegarder aussi dans l'ancien format pour rétrocompatibilité
                        opening_hours.opening_time = open_time
                        opening_hours.closing_time = close_time
                        opening_hours.save()
                
            except Exception as e:
                print(f"Erreur création horaire: {e}")
                # Continuer même si un horaire échoue

    @extend_schema(
        summary="Modifier un restaurant",
        description="Met à jour les informations d'un restaurant existant. Supporte les mises à jour partielles et les nouveaux horaires multi-périodes.",
        responses={
            200: OpenApiResponse(description="Restaurant mis à jour"),
            400: OpenApiResponse(description="Données invalides"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    def update(self, request, *args, **kwargs):
        """Met à jour un restaurant avec gestion des horaires multi-périodes"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # Nettoyer les données
        frontend_data = request.data.copy()
        
        # Extraire et gérer les horaires séparément si fournis
        opening_hours_data = frontend_data.pop('openingHours', None)
        
        # Supprimer les champs en lecture seule
        fields_to_remove = [
            'id', 'ownerId', 'owner_id', 'createdAt', 'updatedAt',
            'can_receive_orders', 'rating', 'reviewCount', 'location',
            'accepts_meal_vouchers_display', 'lastStatusChangedBy', 'lastStatusChangedAt'
        ]
        
        for field in fields_to_remove:
            frontend_data.pop(field, None)
        
        # Gérer latitude/longitude
        location_data = request.data.get('location')
        if location_data and isinstance(location_data, dict):
            frontend_data['latitude'] = location_data.get('latitude')
            frontend_data['longitude'] = location_data.get('longitude')
        
        serializer = self.get_serializer(instance, data=frontend_data, partial=partial)
        
        if serializer.is_valid():
            try:
                serializer.save()
                
                # Mettre à jour les horaires si fournis
                if opening_hours_data is not None:
                    self._update_opening_hours_with_periods(instance, opening_hours_data)
                
                if getattr(instance, '_prefetched_objects_cache', None):
                    instance._prefetched_objects_cache = {}
                
                # Recharger avec les nouvelles données
                instance.refresh_from_db()
                response_serializer = RestaurantSerializer(
                    instance,
                    context={'request': request}
                )
                    
                return Response(response_serializer.data)
                
            except Exception as e:
                return Response({
                    'error': 'Erreur lors de la mise à jour',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _update_opening_hours_with_periods(self, restaurant, opening_hours_data):
        """Met à jour les horaires avec support des périodes multiples"""
        # Supprimer les anciens horaires
        restaurant.opening_hours.all().delete()
        
        # Créer les nouveaux horaires
        self._create_opening_hours_with_periods(restaurant, opening_hours_data)

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
        description="Supprime définitivement un restaurant et tous ses éléments associés (tables, menus, commandes, images, horaires).",
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
            
            # La suppression en cascade s'occupera des relations (y compris OpeningHours et OpeningPeriod)
            self.perform_destroy(instance)
            
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la suppression',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ============================================================================
    # NOUVELLES FONCTIONNALITÉS - FERMETURES MANUELLES
    # ============================================================================

    @extend_schema(
        summary="Fermer temporairement le restaurant",
        description="Ferme manuellement le restaurant avec raison et durée optionnelle",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'reason': {'type': 'string', 'description': 'Raison de la fermeture'},
                    'until': {'type': 'string', 'format': 'date-time', 'description': 'Date de réouverture (optionnel)'},
                    'duration_hours': {'type': 'integer', 'description': 'Durée en heures (alternatif à until)'}
                },
                'required': ['reason']
            }
        },
        responses={
            200: OpenApiResponse(description="Restaurant fermé temporairement"),
            400: OpenApiResponse(description="Données invalides")
        }
    )
    @action(detail=True, methods=["post"])
    def manual_close(self, request, pk=None):
        """Ferme manuellement le restaurant"""
        restaurant = self.get_object()
        reason = request.data.get('reason')
        until = request.data.get('until')
        duration_hours = request.data.get('duration_hours')
        
        if not reason:
            return Response({
                'error': 'La raison est obligatoire'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Calculer la date de fin si durée fournie
        if duration_hours and not until:
            until = timezone.now() + timedelta(hours=duration_hours)
        elif until:
            try:
                until = datetime.fromisoformat(until.replace('Z', '+00:00'))
            except ValueError:
                return Response({
                    'error': 'Format de date invalide'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Mettre à jour le restaurant
        restaurant.is_manually_overridden = True
        restaurant.manual_override_reason = reason
        restaurant.manual_override_until = until
        restaurant.last_status_changed_by = request.user
        restaurant.last_status_changed_at = timezone.now()
        restaurant.save(update_fields=[
            'is_manually_overridden', 'manual_override_reason', 
            'manual_override_until', 'last_status_changed_by', 
            'last_status_changed_at'
        ])
        
        return Response({
            'success': True,
            'message': 'Restaurant fermé temporairement',
            'restaurant': {
                'id': str(restaurant.id),
                'name': restaurant.name,
                'isManuallyOverridden': True,
                'manualOverrideReason': reason,
                'manualOverrideUntil': until.isoformat() if until else None,
                'can_receive_orders': restaurant.can_receive_orders
            }
        })

    @extend_schema(
        summary="Rouvrir le restaurant",
        description="Annule la fermeture manuelle du restaurant"
    )
    @action(detail=True, methods=["post"])
    def manual_reopen(self, request, pk=None):
        """Rouvre manuellement le restaurant"""
        restaurant = self.get_object()
        
        if not restaurant.is_manually_overridden:
            return Response({
                'error': 'Le restaurant n\'est pas fermé manuellement'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        restaurant.is_manually_overridden = False
        restaurant.manual_override_reason = None
        restaurant.manual_override_until = None
        restaurant.last_status_changed_by = request.user
        restaurant.last_status_changed_at = timezone.now()
        restaurant.save(update_fields=[
            'is_manually_overridden', 'manual_override_reason', 
            'manual_override_until', 'last_status_changed_by', 
            'last_status_changed_at'
        ])
        
        return Response({
            'success': True,
            'message': 'Restaurant rouvert',
            'restaurant': {
                'id': str(restaurant.id),
                'name': restaurant.name,
                'isManuallyOverridden': False,
                'can_receive_orders': restaurant.can_receive_orders
            }
        })

    @extend_schema(
        summary="Statut en temps réel",
        description="Obtient le statut actuel du restaurant avec logique métier complète"
    )
    @action(detail=True, methods=["get"])
    def real_time_status(self, request, pk=None):
        """Statut en temps réel du restaurant avec logique métier"""
        restaurant = self.get_object()
        now = timezone.now()
        
        # Vérifier l'expiration automatique des overrides
        if restaurant.is_manually_overridden and restaurant.manual_override_until:
            if now > restaurant.manual_override_until:
                restaurant.is_manually_overridden = False
                restaurant.manual_override_reason = None
                restaurant.manual_override_until = None
                restaurant.save(update_fields=[
                    'is_manually_overridden', 'manual_override_reason', 
                    'manual_override_until'
                ])
        
        # Calculer le statut selon la logique frontend
        status_info = self._calculate_restaurant_status(restaurant, now)
        
        return Response({
            'restaurant': {
                'id': str(restaurant.id),
                'name': restaurant.name,
                'isActive': restaurant.is_active,
                'isManuallyOverridden': restaurant.is_manually_overridden,
                'manualOverrideReason': restaurant.manual_override_reason,
                'manualOverrideUntil': restaurant.manual_override_until.isoformat() if restaurant.manual_override_until else None,
                'can_receive_orders': restaurant.can_receive_orders
            },
            'status': status_info,
            'timestamp': now.isoformat()
        })

    # ============================================================================
    # NOUVELLES FONCTIONNALITÉS - GESTION HORAIRES MULTI-PÉRIODES
    # ============================================================================

    @extend_schema(
        summary="Mettre à jour les horaires",
        description="Met à jour les horaires avec support des périodes multiples",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'openingHours': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'dayOfWeek': {'type': 'integer', 'minimum': 0, 'maximum': 6},
                                'isClosed': {'type': 'boolean'},
                                'periods': {
                                    'type': 'array',
                                    'items': {
                                        'type': 'object',
                                        'properties': {
                                            'startTime': {'type': 'string', 'pattern': '^[0-2][0-9]:[0-5][0-9]$'},
                                            'endTime': {'type': 'string', 'pattern': '^[0-2][0-9]:[0-5][0-9]$'},
                                            'name': {'type': 'string'}
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                'required': ['openingHours']
            }
        }
    )
    @action(detail=True, methods=["put"])
    def update_hours(self, request, pk=None):
        """Met à jour les horaires avec support multi-périodes"""
        restaurant = self.get_object()
        opening_hours_data = request.data.get('openingHours', [])
        
        if not opening_hours_data or len(opening_hours_data) != 7:
            return Response({
                'error': 'Les horaires doivent couvrir les 7 jours de la semaine'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Valider la structure
        for day_data in opening_hours_data:
            if 'dayOfWeek' not in day_data:
                return Response({
                    'error': 'dayOfWeek manquant pour un jour'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if not day_data.get('isClosed', False):
                periods = day_data.get('periods', [])
                if not periods:
                    return Response({
                        'error': f'Aucune période définie pour le jour {day_data["dayOfWeek"]}'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Valider chaque période
                for period in periods:
                    if not all(k in period for k in ['startTime', 'endTime']):
                        return Response({
                            'error': 'startTime et endTime requis pour chaque période'
                        }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Supprimer les anciens horaires
            restaurant.opening_hours.all().delete()
            
            # Créer les nouveaux horaires
            self._create_opening_hours_with_periods(restaurant, opening_hours_data)
            
            # Retourner les nouveaux horaires
            restaurant.refresh_from_db()
            serializer = self.get_serializer(restaurant)
            
            return Response({
                'success': True,
                'message': 'Horaires mis à jour avec succès',
                'openingHours': serializer.data['opening_hours']
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la mise à jour des horaires',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Valider les horaires",
        description="Valide une configuration d'horaires sans la sauvegarder"
    )
    @action(detail=False, methods=["post"])
    def validate_hours(self, request):
        """Valide une configuration d'horaires"""
        opening_hours_data = request.data.get('openingHours', [])
        
        if not opening_hours_data:
            return Response({
                'isValid': False,
                'errors': ['Aucun horaire fourni']
            })
        
        errors = []
        warnings = []
        
        # Validation basique
        if len(opening_hours_data) != 7:
            errors.append('Les horaires doivent couvrir les 7 jours de la semaine')
        
        days_covered = set()
        for day_data in opening_hours_data:
            day_of_week = day_data.get('dayOfWeek')
            if day_of_week is None:
                errors.append('dayOfWeek manquant')
                continue
            
            if day_of_week in days_covered:
                errors.append(f'Jour {day_of_week} défini plusieurs fois')
            days_covered.add(day_of_week)
            
            if not day_data.get('isClosed', False):
                periods = day_data.get('periods', [])
                if not periods:
                    errors.append(f'Aucune période définie pour le jour {day_of_week}')
                
                # Valider les périodes
                for i, period in enumerate(periods):
                    if not all(k in period for k in ['startTime', 'endTime']):
                        errors.append(f'Période {i+1} du jour {day_of_week}: startTime et endTime requis')
                    else:
                        # Validation des heures
                        try:
                            start = datetime.strptime(period['startTime'], '%H:%M')
                            end = datetime.strptime(period['endTime'], '%H:%M')
                            
                            # Durée minimale
                            if end <= start:
                                duration_minutes = (24 * 60) - (start.hour * 60 + start.minute) + (end.hour * 60 + end.minute)
                            else:
                                duration_minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
                            
                            if duration_minutes < 30:
                                warnings.append(f'Période très courte pour le jour {day_of_week}: {duration_minutes} minutes')
                            
                        except ValueError:
                            errors.append(f'Format d\'heure invalide pour le jour {day_of_week}')
        
        # Vérifications métier
        open_days = len([d for d in opening_hours_data if not d.get('isClosed', False)])
        if open_days == 0:
            warnings.append('Restaurant fermé toute la semaine')
        elif open_days < 5:
            warnings.append('Restaurant ouvert moins de 5 jours par semaine')
        
        return Response({
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'openDays': open_days
        })

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
                        'id': str(updated_restaurant.id),
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
                            'id': str(restaurant.id),
                            'name': restaurant.name
                        }
                    })
                except Exception:
                    return Response({
                        'has_image': False,
                        'error': 'Image référencée mais fichier inaccessible',
                        'restaurant': {
                            'id': str(restaurant.id),
                            'name': restaurant.name
                        }
                    })
            else:
                return Response({
                    'has_image': False,
                    'restaurant': {
                        'id': str(restaurant.id),
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
            "id": str(restaurant.id),
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
                "id": str(restaurant.id),
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
        paid_orders = orders.filter(payment_status='paid').count()
        
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
                "id": str(restaurant.id),
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
        active_menus = Menu.objects.filter(restaurant=restaurant, is_available=True).count()
        
        # Commandes récentes
        recent_orders = Order.objects.filter(restaurant=restaurant).order_by('-created_at')[:5]
        recent_orders_data = []
        for order in recent_orders:
            table_ident = None
            if getattr(order, "table_number", None) is not None:
                t = Table.objects.filter(restaurant=restaurant, number=order.table_number).first()
                table_ident = t.identifiant if t else None

            recent_orders_data.append({
                "id": str(order.id),
                "table_number": order.table_number,
                "table_identifiant": table_ident,
                "status": order.status,
                "payment_status": order.payment_status,
                "created_at": order.created_at
            })
        
        return Response({
            "restaurant": {
                "id": str(restaurant.id),
                "name": restaurant.name,
                "address": restaurant.address,
                "can_receive_orders": restaurant.can_receive_orders,
                "is_stripe_active": restaurant.is_stripe_active,
                "has_image": bool(restaurant.image),
                "isManuallyOverridden": restaurant.is_manually_overridden
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
        tables = Table.objects.filter(restaurant=restaurant).order_by('id')

        tables_data = []
        for table in tables:
            # Order n'a PAS de FK 'table' -> on filtre par restaurant + table_number
            active_orders = Order.objects.filter(
                restaurant=restaurant,
                table_number=getattr(table, "number", None),
                status__in=['pending', 'in_progress']
            ).count()

            # Table n'a PAS 'qr_code_file' -> utiliser 'qr_code' (ou identifiant)
            has_qr_code = bool(getattr(table, "qr_code", None) or getattr(table, "identifiant", None))

            tables_data.append({
                "id": str(table.id),
                "number": table.number,
                "identifiant": table.identifiant,  # alias de qr_code dans ton modèle
                "has_qr_code": has_qr_code,
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
                "id": str(menu.id),
                "name": menu.name,
                "is_available": menu.is_available,
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
                items_count = order.items.count()
            except Exception:
                items_count = 0

            # CHANGEMENT: exposer table_number + identifiant si retrouvable
            table_ident = None
            if getattr(order, "table_number", None) is not None:
                t = Table.objects.filter(restaurant=restaurant, number=order.table_number).first()
                table_ident = t.identifiant if t else None

            orders_data.append({
                "id": str(order.id),
                "table_number": order.table_number,
                "table_identifiant": table_ident,
                "status": order.status,
                "payment_status": order.payment_status,
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
            "can_receive_orders": restaurant.can_receive_orders,
            "has_opening_hours": restaurant.opening_hours.exists(),
            "not_manually_closed": not restaurant.is_manually_overridden
        }
        
        all_good = all(checks.values())
        
        return Response({
            "restaurant": {
                "id": str(restaurant.id),
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
            tables = [{"id": str(t.id), "identifiant": t.identifiant} for t in restaurant.tables.all()]
            menus = [{"id": str(m.id), "name": m.name, "is_available": m.is_available} for m in restaurant.menu.all()]
            orders = [{"id": str(o.id), "status": o.status, "created_at": o.created_at.isoformat()} for o in Order.objects.filter(restaurant=restaurant)[:50]]  # Limiter à 50
            
            # Horaires avec support multi-périodes
            opening_hours = []
            for h in restaurant.opening_hours.all().order_by('day_of_week'):
                day_data = {
                    "day_of_week": h.day_of_week,
                    "day_name": h.get_day_of_week_display(),
                    "is_closed": h.is_closed,
                    "periods": []
                }
                
                if not h.is_closed:
                    for period in h.periods.all():
                        day_data["periods"].append({
                            "start_time": period.start_time.strftime("%H:%M"),
                            "end_time": period.end_time.strftime("%H:%M"),
                            "name": period.name or ""
                        })
                    
                    # Rétrocompatibilité
                    if h.opening_time and h.closing_time:
                        day_data["opening_time"] = h.opening_time.strftime("%H:%M")
                        day_data["closing_time"] = h.closing_time.strftime("%H:%M")
                
                opening_hours.append(day_data)
            
            export_data = {
                "restaurant": restaurant_data,
                "tables": tables,
                "menus": menus,
                "recent_orders": orders,
                "opening_hours": opening_hours,
                "export_date": timezone.now().isoformat(),
                "exported_by": request.user.username
            }
            
            return Response(export_data)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de l\'export',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Activer Stripe pour ce restaurant",
        description=(
            "Passe is_stripe_active=TRUE pour ce restaurant. "
            "Si toutes les conditions sont réunies (owner actif & vérifié, restaurant actif), "
            "can_receive_orders passera à TRUE automatiquement."
        ),
        parameters=[
            OpenApiParameter(
                name="force_owner",
                type=bool,
                description="Admin uniquement : force aussi owner.is_active/owner.stripe_verified à TRUE",
                required=False,
            )
        ],
        responses={
            200: OpenApiResponse(description="Mise à jour effectuée"),
            202: OpenApiResponse(description="Mise à jour faite mais commandes pas encore possibles (voir missing)"),
        },
    )
    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsRestaurateur]
    )
    def enable_orders(self, request, pk=None):
        restaurant = self.get_object()
        owner = getattr(restaurant, "owner", None)

        # Toujours activer Stripe sur le restaurant ciblé
        updated_fields = []
        if not restaurant.is_stripe_active:
            restaurant.is_stripe_active = True
            updated_fields.append("is_stripe_active")

        # Option admin : forcer les flags owner si demandé
        force_owner = str(request.query_params.get("force_owner", "")).lower() in ("1", "true", "yes")
        if request.user.is_staff and force_owner and owner:
            owner_changed = False
            if not owner.is_active:
                owner.is_active = True
                owner_changed = True
            if not getattr(owner, "stripe_verified", False):
                owner.stripe_verified = True
                owner_changed = True
            if owner_changed:
                owner.save(update_fields=["is_active", "stripe_verified"])

        if updated_fields:
            restaurant.save(update_fields=updated_fields)

        # État final
        can_receive = getattr(restaurant, "can_receive_orders", False)
        missing = {
            "owner_is_active": bool(getattr(owner, "is_active", False)),
            "owner_stripe_verified": bool(getattr(owner, "stripe_verified", False)),
            "restaurant_is_active": bool(getattr(restaurant, "is_active", False)),
            "restaurant_is_stripe_active": bool(getattr(restaurant, "is_stripe_active", False)),
        }

        status_code = status.HTTP_200_OK if can_receive else status.HTTP_202_ACCEPTED
        return Response(
            {
                "id": str(restaurant.id),
                "is_stripe_active": restaurant.is_stripe_active,
                "can_receive_orders": can_receive,
                "missing": {k: v for k, v in missing.items() if not v},
            },
            status=status_code,
        )

    # ============================================================================
    # MÉTHODES UTILITAIRES PRIVÉES
    # ============================================================================

    def _calculate_restaurant_status(self, restaurant, current_time):
        """Calcule le statut selon la logique frontend"""
        # Override manuel
        if restaurant.is_manually_overridden:
            status = 'Fermé temporairement'
            if restaurant.manual_override_reason:
                status += f' ({restaurant.manual_override_reason})'
            
            return {
                'isOpen': False,
                'status': status,
                'shortStatus': 'Fermé temp.',
                'type': 'manual_override'
            }
        
        # Restaurant inactif
        if not restaurant.is_active:
            return {
                'isOpen': False,
                'status': 'Restaurant désactivé',
                'shortStatus': 'Désactivé',
                'type': 'inactive'
            }
        
        # Vérifier selon les horaires
        current_day = current_time.weekday()
        # Convertir lundi=0 vers dimanche=0
        current_day = (current_day + 1) % 7
        current_minutes = current_time.hour * 60 + current_time.minute
        
        try:
            today_hours = restaurant.opening_hours.get(day_of_week=current_day)
            
            if today_hours.is_closed:
                # Chercher prochaine ouverture
                next_opening = self._find_next_opening(restaurant, current_time)
                if next_opening:
                    return {
                        'isOpen': False,
                        'status': f'Fermé - Ouverture {next_opening}',
                        'shortStatus': 'Fermé',
                        'type': 'closed_schedule'
                    }
                else:
                    return {
                        'isOpen': False,
                        'status': 'Fermé - Aucune ouverture prévue',
                        'shortStatus': 'Fermé',
                        'type': 'closed_schedule'
                    }
            
            # Vérifier les périodes
            current_period = None
            for period in today_hours.periods.all():
                start_minutes = period.start_time.hour * 60 + period.start_time.minute
                end_minutes = period.end_time.hour * 60 + period.end_time.minute
                
                if end_minutes < start_minutes:  # Traverse minuit
                    if current_minutes >= start_minutes or current_minutes < end_minutes:
                        current_period = period
                        break
                else:
                    if start_minutes <= current_minutes < end_minutes:
                        current_period = period
                        break
            
            if current_period:
                period_name = current_period.name or 'Service en cours'
                end_time = current_period.end_time.strftime('%H:%M')
                return {
                    'isOpen': True,
                    'status': f'{period_name} jusqu\'à {end_time}',
                    'shortStatus': f'Ouvert jusqu\'à {end_time}',
                    'type': 'open',
                    'currentPeriod': {
                        'name': current_period.name,
                        'startTime': current_period.start_time.strftime('%H:%M'),
                        'endTime': current_period.end_time.strftime('%H:%M')
                    }
                }
            else:
                # Fermé selon horaires
                next_opening = self._find_next_opening(restaurant, current_time)
                if next_opening:
                    return {
                        'isOpen': False,
                        'status': f'Fermé - Ouverture {next_opening}',
                        'shortStatus': 'Fermé',
                        'type': 'closed_schedule'
                    }
                else:
                    return {
                        'isOpen': False,
                        'status': 'Fermé - Aucune ouverture prévue',
                        'shortStatus': 'Fermé',
                        'type': 'closed_schedule'
                    }
                    
        except Exception as e:
            return {
                'isOpen': False,
                'status': 'Erreur de configuration des horaires',
                'shortStatus': 'Erreur',
                'type': 'error',
                'error': str(e)
            }
    
    def _find_next_opening(self, restaurant, current_time):
        """Trouve la prochaine ouverture"""
        current_day = (current_time.weekday() + 1) % 7
        current_minutes = current_time.hour * 60 + current_time.minute
        
        # Chercher dans les 14 prochains jours
        for i in range(14):
            check_day = (current_day + i) % 7
            
            try:
                day_hours = restaurant.opening_hours.get(day_of_week=check_day)
                
                if not day_hours.is_closed and day_hours.periods.exists():
                    # Pour aujourd'hui, chercher les périodes restantes
                    if i == 0:
                        remaining_periods = day_hours.periods.filter(
                            start_time__gt=current_time.time()
                        ).order_by('start_time')
                        
                        if remaining_periods.exists():
                            next_period = remaining_periods.first()
                            return f"aujourd'hui à {next_period.start_time.strftime('%H:%M')}"
                    else:
                        # Autres jours
                        first_period = day_hours.periods.order_by('start_time').first()
                        if first_period:
                            days_names = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
                            if i == 1:
                                return f"demain à {first_period.start_time.strftime('%H:%M')}"
                            else:
                                return f"{days_names[check_day]} à {first_period.start_time.strftime('%H:%M')}"
                                
            except Exception:
                continue
        
        return None


@extend_schema(tags=["Public • Restaurants"])
class PublicRestaurantViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet public en lecture seule pour que les clients puissent
    consulter les restaurants disponibles.
    """
    serializer_class = RestaurantSerializer
    permission_classes = [AllowAny]  # Accès public
    authentication_classes = []
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'city', 'cuisine']
    ordering_fields = ['name', 'rating', 'created_at']
    ordering = ['-rating', 'name']
    
    def get_queryset(self):
        """Retourne uniquement les restaurants actifs qui peuvent recevoir des commandes"""
        return Restaurant.objects.filter(
            is_active=True,
            owner__is_active=True,
            owner__stripe_verified=True,
            is_stripe_active=True,
            is_manually_overridden=False  # NOUVEAU: Exclure les restaurants fermés manuellement
        ).select_related('owner').prefetch_related('opening_hours__periods')
    
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
            owner__is_active=True,
            owner__stripe_verified=True,
            is_stripe_active=True,
            is_manually_overridden=False
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
            owner__is_active=True,
            owner__stripe_verified=True,
            is_stripe_active=True,
            is_manually_overridden=False
        ).values_list('city', flat=True).distinct().order_by('city')
        
        return Response(list(cities))
    
    @action(detail=False, methods=['get'])
    def meal_voucher_restaurants(self, request):
        """Restaurants acceptant les titres-restaurant"""
        restaurants = self.get_queryset().filter(accepts_meal_vouchers=True)
        serializer = self.get_serializer(restaurants, many=True)
        return Response(serializer.data)


@extend_schema(tags=["Templates • Horaires"])
class RestaurantHoursTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet pour les templates d'horaires prédéfinis"""
    
    queryset = RestaurantHoursTemplate.objects.filter(is_active=True)
    serializer_class = RestaurantHoursTemplateSerializer
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Lister les templates d'horaires",
        description="Retourne la liste des templates d'horaires disponibles"
    )
    def list(self, request, *args, **kwargs):
        """Liste des templates avec catégories"""
        queryset = self.get_queryset().order_by('category', 'name')
        
        # Grouper par catégorie
        categories = {}
        for template in queryset:
            category = template.get_category_display()
            if category not in categories:
                categories[category] = []
            
            categories[category].append(
                self.get_serializer(template).data
            )
        
        return Response({
            'categories': categories,
            'total': queryset.count()
        })
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Templates filtrés par catégorie"""
        category = request.query_params.get('category')
        
        if category:
            queryset = self.get_queryset().filter(category=category)
        else:
            queryset = self.get_queryset()
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)