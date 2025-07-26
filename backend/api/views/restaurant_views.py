from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from api.models import Restaurant, Table, Menu, Order, RestaurateurProfile
from api.serializers.restaurant_serializers import (
    RestaurantSerializer, 
    RestaurantCreateSerializer,
    RestaurantImageSerializer
)
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter
import os

@extend_schema(tags=["Restaurant • Restaurants"])
class RestaurantViewSet(viewsets.ModelViewSet):
    """
    Gère les restaurants d'un restaurateur.
    Filtrés automatiquement selon le restaurateur connecté.
    Inclut des actions pour : activation, statistiques, gestion des tables, upload d'images, etc.
    """
    queryset = Restaurant.objects.all().order_by('-id')
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'siret']
    ordering_fields = ['name', 'created_at', 'is_stripe_active']
    ordering = ['-id']
    
    # Support pour upload de fichiers
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        """Filtre les restaurants par propriétaire connecté"""
        return Restaurant.objects.filter(owner=self.request.user.restaurateur_profile)

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

    @extend_schema(
        summary="Créer un restaurant",
        description="Crée un nouveau restaurant avec toutes les informations nécessaires, y compris une image optionnelle. Le SIRET peut être généré automatiquement si non fourni.",
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    # Informations de base
                    'name': {
                        'type': 'string', 
                        'maxLength': 100,
                        'description': 'Nom du restaurant',
                        'example': 'Le Petit Bistrot'
                    },
                    'description': {
                        'type': 'string',
                        'description': 'Description du restaurant',
                        'example': 'Restaurant traditionnel français avec une ambiance chaleureuse'
                    },
                    
                    # Adresse complète
                    'address': {
                        'type': 'string', 
                        'maxLength': 255,
                        'description': 'Adresse du restaurant',
                        'example': '42 Avenue des Champs-Élysées'
                    },
                    'city': {
                        'type': 'string',
                        'maxLength': 100,
                        'description': 'Ville',
                        'example': 'Paris'
                    },
                    'zipCode': {
                        'type': 'string',
                        'pattern': '^[0-9]{5}$',
                        'description': 'Code postal français (5 chiffres)',
                        'example': '75008'
                    },
                    'country': {
                        'type': 'string',
                        'maxLength': 100,
                        'default': 'France',
                        'description': 'Pays',
                        'example': 'France'
                    },
                    
                    # Contact
                    'phone': {
                        'type': 'string',
                        'pattern': '^(\+33|0)[1-9][0-9]{8}$',
                        'description': 'Numéro de téléphone français',
                        'example': '+33142563789'
                    },
                    'email': {
                        'type': 'string',
                        'format': 'email',
                        'description': 'Email de contact du restaurant',
                        'example': 'contact@petitbistrot.fr'
                    },
                    'website': {
                        'type': 'string',
                        'format': 'uri',
                        'description': 'Site web du restaurant (optionnel)',
                        'example': 'https://www.petitbistrot.fr'
                    },
                    
                    # Informations métier
                    'cuisine': {
                        'type': 'string',
                        'enum': ['french', 'italian', 'asian', 'mexican', 'indian', 'american', 'mediterranean', 'japanese', 'chinese', 'thai', 'other'],
                        'description': 'Type de cuisine',
                        'example': 'french'
                    },
                    'priceRange': {
                        'type': 'integer',
                        'minimum': 1,
                        'maximum': 4,
                        'description': 'Gamme de prix (1=€, 2=€€, 3=€€€, 4=€€€€)',
                        'example': 2
                    },
                    
                    # Image du restaurant
                    'image': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'Photo du restaurant (JPEG, PNG, WebP, max 5MB, min 200x200px)',
                    },
                    
                    # Géolocalisation (optionnel)
                    'latitude': {
                        'type': 'number',
                        'format': 'double',
                        'minimum': -90,
                        'maximum': 90,
                        'description': 'Latitude GPS',
                        'example': 48.8566
                    },
                    'longitude': {
                        'type': 'number',
                        'format': 'double',
                        'minimum': -180,
                        'maximum': 180,
                        'description': 'Longitude GPS',
                        'example': 2.3522
                    },
                    
                    # SIRET (optionnel - généré automatiquement si absent)
                    'siret': {
                        'type': 'string',
                        'pattern': '^[0-9]{14}$',
                        'description': 'Numéro SIRET à 14 chiffres (généré automatiquement si non fourni)',
                        'example': '12345678901234'
                    }
                },
                'required': ['name', 'address', 'city', 'zipCode', 'phone', 'email', 'cuisine', 'priceRange'],
                'additionalProperties': False
            }
        },
        responses={
            201: {
                'description': 'Restaurant créé avec succès',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'id': {'type': 'integer', 'example': 1},
                                'name': {'type': 'string', 'example': 'Le Petit Bistrot'},
                                'description': {'type': 'string'},
                                'address': {'type': 'string'},
                                'city': {'type': 'string'},
                                'zipCode': {'type': 'string'},
                                'country': {'type': 'string'},
                                'phone': {'type': 'string'},
                                'email': {'type': 'string'},
                                'website': {'type': 'string'},
                                'cuisine': {'type': 'string'},
                                'priceRange': {'type': 'integer'},
                                'rating': {'type': 'number', 'format': 'double'},
                                'reviewCount': {'type': 'integer'},
                                'isActive': {'type': 'boolean'},
                                'canReceiveOrders': {'type': 'boolean'},
                                'image_url': {'type': 'string', 'format': 'uri'},
                                'image_name': {'type': 'string'},
                                'image_size': {'type': 'integer'},
                                'location': {
                                    'type': 'object',
                                    'properties': {
                                        'latitude': {'type': 'number'},
                                        'longitude': {'type': 'number'}
                                    }
                                },
                                'createdAt': {'type': 'string', 'format': 'date-time'},
                                'updatedAt': {'type': 'string', 'format': 'date-time'},
                                'owner': {
                                    'type': 'object',
                                    'properties': {
                                        'id': {'type': 'integer'},
                                        'name': {'type': 'string'}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            400: {
                'description': 'Données invalides',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'error': {'type': 'string', 'example': 'Données invalides'},
                                'validation_errors': {
                                    'type': 'object',
                                    'additionalProperties': {
                                        'type': 'array',
                                        'items': {'type': 'string'}
                                    },
                                    'example': {
                                        'zipCode': ['Le code postal doit contenir exactement 5 chiffres'],
                                        'phone': ['Format de téléphone invalide'],
                                        'image': ['L\'image ne doit pas dépasser 5MB']
                                    }
                                },
                                'received_data': {'type': 'object'},
                                'help': {'type': 'string', 'example': 'Vérifiez que tous les champs requis sont présents et valides'}
                            }
                        }
                    }
                }
            }
        }
    )
    def create(self, request, *args, **kwargs):
        """Crée un nouveau restaurant avec données du frontend adaptées"""
        
        # Debug des données reçues
        print(f"📦 Données reçues du frontend: {dict(request.data)}")
        print(f"📷 Fichiers reçus: {dict(request.FILES)}")
        
        # Nettoyer et adapter les données du frontend
        frontend_data = request.data.copy()
        
        # Supprimer les champs que le backend ne gère pas encore (sauf image maintenant)
        fields_to_remove = [
            'rating', 'reviewCount', 'isActive', 'openingHours', 
            'ownerId', 'createdAt', 'updatedAt', 'location'
        ]
        
        for field in fields_to_remove:
            frontend_data.pop(field, None)
        
        print(f"📦 Données nettoyées: {dict(frontend_data)}")
        
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
            200: {
                'description': 'Image uploadée avec succès',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'success': {'type': 'boolean', 'example': True},
                                'message': {'type': 'string', 'example': 'Image uploadée avec succès'},
                                'image_url': {'type': 'string', 'format': 'uri'},
                                'image_name': {'type': 'string'},
                                'image_size': {'type': 'integer'},
                                'restaurant': {
                                    'type': 'object',
                                    'properties': {
                                        'id': {'type': 'integer'},
                                        'name': {'type': 'string'}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            400: {
                'description': 'Fichier image invalide',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'error': {'type': 'string'},
                                'validation_errors': {'type': 'object'},
                                'allowed_formats': {'type': 'array', 'items': {'type': 'string'}},
                                'max_size': {'type': 'string', 'example': '5MB'}
                            }
                        }
                    }
                }
            },
            404: {'description': 'Restaurant non trouvé'}
        }
    )
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """Upload ou remplace l'image d'un restaurant"""
        restaurant = self.get_object()
        
        if 'image' not in request.FILES:
            return Response({
                'error': 'Aucun fichier image fourni',
                'help': 'Envoyez un fichier avec la clé "image"'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = RestaurantImageSerializer(
            restaurant, 
            data=request.data, 
            context={'request': request},
            partial=True
        )
        
        if serializer.is_valid():
            try:
                updated_restaurant = serializer.save()
                
                return Response({
                    'success': True,
                    'message': 'Image uploadée avec succès',
                    'image_url': serializer.get_image_url(updated_restaurant),
                    'image_name': os.path.basename(updated_restaurant.image.name) if updated_restaurant.image else None,
                    'image_size': updated_restaurant.image.size if updated_restaurant.image else None,
                    'restaurant': {
                        'id': updated_restaurant.id,
                        'name': updated_restaurant.name
                    }
                }, status=status.HTTP_200_OK)
                
            except Exception as e:
                return Response({
                    'error': 'Erreur lors de l\'upload',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        else:
            return Response({
                'error': 'Fichier image invalide',
                'validation_errors': serializer.errors,
                'allowed_formats': ['JPEG', 'PNG', 'WebP'],
                'max_size': '5MB',
                'min_dimensions': '200x200px'
            }, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Supprimer l'image",
        description="Supprime l'image du restaurant.",
        responses={
            200: {
                'description': 'Image supprimée avec succès',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'success': {'type': 'boolean', 'example': True},
                                'message': {'type': 'string', 'example': 'Image supprimée avec succès'},
                                'restaurant': {
                                    'type': 'object',
                                    'properties': {
                                        'id': {'type': 'integer'},
                                        'name': {'type': 'string'},
                                        'has_image': {'type': 'boolean', 'example': False}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {'description': 'Restaurant non trouvé ou aucune image à supprimer'}
        }
    )
    @action(detail=True, methods=["delete"])
    def delete_image(self, request, pk=None):
        """Supprime l'image d'un restaurant"""
        restaurant = self.get_object()
        
        if not restaurant.image:
            return Response({
                'error': 'Aucune image à supprimer',
                'restaurant': {
                    'id': restaurant.id,
                    'name': restaurant.name,
                    'has_image': False
                }
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            # Supprimer le fichier physique
            if os.path.isfile(restaurant.image.path):
                os.remove(restaurant.image.path)
            
            # Supprimer la référence en base
            restaurant.image.delete(save=True)
            
            return Response({
                'success': True,
                'message': 'Image supprimée avec succès',
                'restaurant': {
                    'id': restaurant.id,
                    'name': restaurant.name,
                    'has_image': False
                }
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la suppression',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Informations de l'image",
        description="Retourne les informations détaillées de l'image du restaurant.",
        responses={
            200: {
                'description': 'Informations de l\'image',
                'content': {
                    'application/json': {
                        'schema': {
                            'type': 'object',
                            'properties': {
                                'has_image': {'type': 'boolean'},
                                'image_url': {'type': 'string', 'format': 'uri'},
                                'image_name': {'type': 'string'},
                                'image_size': {'type': 'integer'},
                                'image_size_formatted': {'type': 'string', 'example': '1.2 MB'},
                                'upload_date': {'type': 'string', 'format': 'date-time'},
                                'restaurant': {
                                    'type': 'object',
                                    'properties': {
                                        'id': {'type': 'integer'},
                                        'name': {'type': 'string'}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {'description': 'Restaurant non trouvé'}
        }
    )
    @action(detail=True, methods=["get"])
    def image_info(self, request, pk=None):
        """Retourne les informations de l'image d'un restaurant"""
        restaurant = self.get_object()
        
        def format_size(size_bytes):
            """Formate la taille en bytes vers une chaîne lisible"""
            if size_bytes < 1024:
                return f"{size_bytes} B"
            elif size_bytes < 1024**2:
                return f"{size_bytes/1024:.1f} KB"
            elif size_bytes < 1024**3:
                return f"{size_bytes/(1024**2):.1f} MB"
            else:
                return f"{size_bytes/(1024**3):.1f} GB"
        
        if restaurant.image:
            try:
                # Obtenir les informations du fichier
                file_stat = os.stat(restaurant.image.path) if restaurant.image.path else None
                
                return Response({
                    'has_image': True,
                    'image_url': request.build_absolute_uri(restaurant.image.url),
                    'image_name': os.path.basename(restaurant.image.name),
                    'image_size': restaurant.image.size,
                    'image_size_formatted': format_size(restaurant.image.size),
                    'upload_date': restaurant.updated_at,  # Approximation
                    'restaurant': {
                        'id': restaurant.id,
                        'name': restaurant.name
                    }
                }, status=status.HTTP_200_OK)
                
            except Exception as e:
                return Response({
                    'has_image': True,
                    'error': 'Erreur lors de la lecture des informations',
                    'details': str(e),
                    'restaurant': {
                        'id': restaurant.id,
                        'name': restaurant.name
                    }
                }, status=status.HTTP_200_OK)
        else:
            return Response({
                'has_image': False,
                'image_url': None,
                'image_name': None,
                'image_size': None,
                'image_size_formatted': None,
                'upload_date': None,
                'restaurant': {
                    'id': restaurant.id,
                    'name': restaurant.name
                }
            }, status=status.HTTP_200_OK)

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
        },
        responses={
            200: OpenApiResponse(description="Statut Stripe mis à jour"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["post"])
    def toggle_stripe(self, request, pk=None):
        """Active ou désactive les paiements Stripe pour le restaurant"""
        restaurant = self.get_object()
        is_active = request.data.get('is_stripe_active')
        
        if is_active is None:
            return Response(
                {"error": "Le champ 'is_stripe_active' est requis"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        restaurant.is_stripe_active = is_active
        restaurant.save()
        
        return Response({
            "id": restaurant.id,
            "name": restaurant.name,
            "is_stripe_active": restaurant.is_stripe_active,
            "can_receive_orders": restaurant.can_receive_orders
        }, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Statistiques du restaurant",
        description="Retourne les statistiques complètes d'un restaurant : commandes, revenus, tables actives, etc.",
        responses={
            200: OpenApiResponse(description="Statistiques du restaurant"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        """Retourne les statistiques complètes d'un restaurant"""
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
        active_menus = menus.filter(disponible=True).count()
        
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
            }
        })

    @extend_schema(
        summary="Lister les tables",
        description="Retourne la liste de toutes les tables du restaurant avec leurs informations.",
        responses={
            200: OpenApiResponse(description="Liste des tables"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def tables(self, request, pk=None):
        """Retourne la liste des tables d'un restaurant"""
        restaurant = self.get_object()
        tables = Table.objects.filter(restaurant=restaurant).order_by('identifiant')
        
        tables_data = []
        for table in tables:
            # Compter les commandes actives pour cette table
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
        description="Retourne la liste de tous les menus du restaurant avec leurs statuts.",
        responses={
            200: OpenApiResponse(description="Liste des menus"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def menus(self, request, pk=None):
        """Retourne la liste des menus d'un restaurant"""
        restaurant = self.get_object()
        menus = Menu.objects.filter(restaurant=restaurant).order_by('-created_at')
        
        menus_data = []
        for menu in menus:
            items_count = menu.items.count()
            available_items = menu.items.filter(is_available=True).count()
            
            menus_data.append({
                "id": menu.id,
                "name": menu.name,
                "disponible": menu.disponible,
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
        summary="Statut de validation",
        description="Vérifie le statut de validation Stripe et les capacités du restaurant.",
        responses={
            200: OpenApiResponse(description="Statut de validation"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def validation_status(self, request, pk=None):
        """Vérifie le statut de validation et les capacités du restaurant"""
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

    @extend_schema(
        summary="Commandes récentes",
        description="Retourne les commandes récentes du restaurant avec pagination.",
        parameters=[
            OpenApiParameter(name="limit", type=int, default=10, description="Nombre de commandes à retourner"),
            OpenApiParameter(name="status", type=str, description="Filtrer par statut (pending, in_progress, served)")
        ],
        responses={
            200: OpenApiResponse(description="Liste des commandes récentes"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def recent_orders(self, request, pk=None):
        """Retourne les commandes récentes d'un restaurant"""
        restaurant = self.get_object()
        limit = int(request.query_params.get('limit', 10))
        status_filter = request.query_params.get('status')
        
        orders = Order.objects.filter(restaurant=restaurant).order_by('-created_at')
        
        if status_filter:
            orders = orders.filter(status=status_filter)
        
        orders = orders[:limit]
        
        orders_data = []
        for order in orders:
            items_count = order.order_items.count()
            
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

    @extend_schema(
        summary="Dashboard du restaurant",
        description="Retourne un aperçu complet du restaurant avec toutes les informations essentielles.",
        responses={
            200: OpenApiResponse(description="Dashboard du restaurant"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=True, methods=["get"])
    def dashboard(self, request, pk=None):
        """Retourne un dashboard complet du restaurant"""
        restaurant = self.get_object()
        
        # Statistiques rapides
        total_orders = Order.objects.filter(restaurant=restaurant).count()
        active_orders = Order.objects.filter(
            restaurant=restaurant, 
            status__in=['pending', 'in_progress']
        ).count()
        total_tables = Table.objects.filter(restaurant=restaurant).count()
        active_menus = Menu.objects.filter(restaurant=restaurant, disponible=True).count()
        
        # Commandes récentes (5 dernières)
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
                "is_stripe_active": restaurant.is_stripe_active
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

    @extend_schema(
        summary="Lister tous les restaurants",
        description="Retourne la liste de tous les restaurants du restaurateur connecté avec leurs informations de base.",
        responses={200: OpenApiResponse(description="Liste des restaurants")}
    )
    def list(self, request, *args, **kwargs):
        """Liste tous les restaurants du restaurateur avec informations enrichies"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        
        restaurants_data = []
        restaurants = page if page is not None else queryset
        
        for restaurant in restaurants:
            # Ajouter des stats rapides
            active_orders = Order.objects.filter(
                restaurant=restaurant, 
                status__in=['pending', 'in_progress']
            ).count()
            
            restaurants_data.append({
                "id": restaurant.id,
                "name": restaurant.name,
                "description": restaurant.description,
                "address": restaurant.address,
                "siret": restaurant.siret,
                "is_stripe_active": restaurant.is_stripe_active,
                "can_receive_orders": restaurant.can_receive_orders,
                "active_orders": active_orders,
                "has_image": bool(restaurant.image),
                "image_url": request.build_absolute_uri(restaurant.image.url) if restaurant.image else None
            })
        
        if page is not None:
            return self.get_paginated_response(restaurants_data)
        
        return Response(restaurants_data)

    @extend_schema(
        summary="Détails d'un restaurant",
        description="Retourne les détails complets d'un restaurant avec ses statistiques.",
        responses={
            200: OpenApiResponse(description="Détails du restaurant"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    def retrieve(self, request, *args, **kwargs):
        """Récupère les détails d'un restaurant avec stats"""
        restaurant = self.get_object()
        
        # Stats rapides
        total_orders = Order.objects.filter(restaurant=restaurant).count()
        active_orders = Order.objects.filter(
            restaurant=restaurant, 
            status__in=['pending', 'in_progress']
        ).count()
        total_tables = Table.objects.filter(restaurant=restaurant).count()
        
        # Utiliser le serializer complet pour la réponse
        serializer = self.get_serializer(restaurant)
        data = serializer.data
        
        # Ajouter les stats
        data['stats'] = {
            "total_orders": total_orders,
            "active_orders": active_orders,
            "total_tables": total_tables
        }
        
        return Response(data)