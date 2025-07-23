from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from api.models import Restaurant, Table, Menu, Order, RestaurateurProfile
from api.serializers import RestaurantSerializer
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter

@extend_schema(tags=["Restaurant • Restaurants"])
class RestaurantViewSet(viewsets.ModelViewSet):
    """
    Gère les restaurants d'un restaurateur.
    Filtrés automatiquement selon le restaurateur connecté.
    Inclut des actions pour : activation, statistiques, gestion des tables, etc.
    """
    queryset = Restaurant.objects.all().order_by('-id')
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsOwnerOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'siret']
    ordering_fields = ['name', 'created_at', 'is_stripe_active']
    ordering = ['-id']

    def get_queryset(self):
        """Filtre les restaurants par propriétaire connecté"""
        return Restaurant.objects.filter(owner=self.request.user.restaurateur_profile)

    def perform_create(self, serializer):
        """Assigne automatiquement le propriétaire lors de la création"""
        serializer.save(owner=self.request.user.restaurateur_profile)

    @extend_schema(
        summary="Créer un restaurant",
        description="Crée un nouveau restaurant pour le restaurateur connecté. Seuls les restaurateurs validés Stripe peuvent créer des restaurants.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string', 'maxLength': 100},
                    'description': {'type': 'string'},
                    'address': {'type': 'string', 'maxLength': 255},
                    'siret': {'type': 'string', 'pattern': '^[0-9]{14}$', 'description': 'Numéro SIRET à 14 chiffres'}
                },
                'required': ['name', 'description', 'address', 'siret']
            }
        },
        responses={
            201: OpenApiResponse(description="Restaurant créé avec succès"),
            400: OpenApiResponse(description="Données invalides"),
            403: OpenApiResponse(description="Non autorisé - Validation Stripe requise")
        }
    )
    def create(self, request, *args, **kwargs):
        """Crée un nouveau restaurant avec validation Stripe"""
        try:
            profile = request.user.restaurateur_profile
            if not profile.stripe_verified:
                return Response(
                    {"error": "Validation Stripe requise pour créer un restaurant"}, 
                    status=status.HTTP_403_FORBIDDEN
                )
        except RestaurateurProfile.DoesNotExist:
            return Response(
                {"error": "Profil restaurateur introuvable"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().create(request, *args, **kwargs)

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
                "active_orders": active_orders
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
        
        data = {
            "id": restaurant.id,
            "name": restaurant.name,
            "description": restaurant.description,
            "address": restaurant.address,
            "siret": restaurant.siret,
            "is_stripe_active": restaurant.is_stripe_active,
            "can_receive_orders": restaurant.can_receive_orders,
            "stats": {
                "total_orders": total_orders,
                "active_orders": active_orders,
                "total_tables": total_tables
            },
            "owner": {
                "stripe_verified": restaurant.owner.stripe_verified,
                "is_active": restaurant.owner.is_active
            }
        }
        
        return Response(data)