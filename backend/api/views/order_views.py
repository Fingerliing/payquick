from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Avg, Sum
from django.utils import timezone
from api.models import Order, Table, MenuItem
from api.serializers.order_serializers import (
    OrderListSerializer,
    OrderDetailSerializer, 
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
    OrderPaymentSerializer,
    OrderWithTableInfoSerializer,
    OrderStatsSerializer
)
from api.consumers import (
    notify_order_update,
    notify_session_order_created,
    notify_session_order_updated
)
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter
from datetime import timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

@extend_schema(tags=["Order • Commandes"])
class OrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet complet pour la gestion des commandes sur place.

    Fonctionnalités incluses :
    - CRUD des commandes (création, consultation, mise à jour)
    - Gestion des statuts (pending -> preparing -> ready -> served)
    - Paiements (cash, card, online)
    - Génération de tickets
    - Statistiques temps réel
    - Interface cuisine/comptoir
    """
    serializer_class = OrderListSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['order_number', 'customer_name', 'table_number']
    filterset_fields = ['status', 'payment_status', 'order_type', 'restaurant']
    ordering_fields = ['created_at', 'total_amount', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        """Filtre selon le type d'utilisateur"""
        user = self.request.user

        # Si restaurateur, voir ses commandes
        if hasattr(user, 'restaurateur_profile'):
            return Order.objects.filter(
                restaurant__owner=user.restaurateur_profile
            ).select_related('restaurant', 'user').prefetch_related('items__menu_item')

        # Si client connecté, voir ses commandes
        elif user.is_authenticated:
            return Order.objects.filter(user=user).select_related('restaurant')

        return Order.objects.none()

    def get_serializer_class(self):
        """Utilise le bon sérialiseur selon l'action"""
        if self.action == 'create':
            return OrderCreateSerializer
        elif self.action == 'retrieve':
            return OrderDetailSerializer
        elif self.action in ['update_status', 'mark_as_paid']:
            return OrderStatusUpdateSerializer
        return OrderListSerializer

    def get_permissions(self):
        """Permissions selon l'action"""
        if self.action == 'create':
            # Création ouverte (client ou restaurateur)
            permission_classes = [AllowAny]
        elif self.action in ['update_status', 'mark_as_paid', 'kitchen_view']:
            # Actions staff uniquement
            permission_classes = [IsAuthenticated, IsRestaurateur]
        else:
            permission_classes = [IsAuthenticated]

        return [permission() for permission in permission_classes]

    @extend_schema(
        summary="Lister les commandes",
        description="Liste des commandes avec filtres par statut, restaurant, type de commande.",
        parameters=[
            OpenApiParameter(name="status", type=str, description="Filtrer par statut"),
            OpenApiParameter(name="restaurant", type=int, description="Filtrer par restaurant"),
            OpenApiParameter(name="order_type", type=str, description="dine_in ou takeaway"),
            OpenApiParameter(name="search", type=str, description="Recherche par numéro, nom client, table"),
        ]
    )
    def list(self, request, *args, **kwargs):
        """Liste des commandes avec informations enrichies"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        orders_data = []
        orders = page if page is not None else queryset

        for order in orders:
            serializer = self.get_serializer(order)
            order_data = serializer.data

            # Enrichir avec des infos temps réel
            order_data.update({
                'is_urgent': self._is_order_urgent(order),
                'items_summary': self._get_items_summary(order),
                'next_possible_status': self._get_next_status(order.status)
            })

            orders_data.append(order_data)

        if page is not None:
            return self.get_paginated_response(orders_data)

        return Response(orders_data)

    @extend_schema(
        summary="Détails d'une commande",
        description="Informations complètes d'une commande avec ses items et historique."
    )
    def retrieve(self, request, *args, **kwargs):
        """Détails complets d'une commande"""
        order = self.get_object()
        serializer = self.get_serializer(order)
        data = serializer.data

        # Ajouter des métadonnées utiles
        data.update({
            'is_urgent': self._is_order_urgent(order),
            'items_summary': self._get_items_summary(order),
            'next_possible_status': self._get_next_status(order.status),
            'timeline': self._get_order_timeline(order),
            'payment_info': {
                'is_paid': order.payment_status == 'paid',
                'can_be_paid': order.status != 'cancelled',
                'payment_methods_available': ['cash', 'card', 'online']
            }
        })

        return Response(data)

    @extend_schema(
        summary="Créer une commande",
        description="Créer une nouvelle commande depuis le menu client ou le back-office.",
        request=OrderCreateSerializer,
        responses={
            201: OpenApiResponse(description="Commande créée avec succès"),
            400: OpenApiResponse(description="Données invalides")
        }
    )
    def create(self, request, *args, **kwargs):
        """Créer une nouvelle commande (avec notifications WebSocket)"""
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            try:
                order = serializer.save()
                logger.info(f"✅ Order created: %s", order.id)

                # 🔔 Notification en temps réel
                self._notify_new_order(order)

                # Retourner avec le sérialiseur détaillé
                response_serializer = OrderDetailSerializer(
                    order, 
                    context={'request': request}
                )

                return Response(
                    response_serializer.data, 
                    status=status.HTTP_201_CREATED
                )

            except Exception as e:
                logger.exception("Erreur lors de la création de la commande")
                return Response({
                    'error': 'Erreur lors de la création de la commande',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'error': 'Données invalides',
            'validation_errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    # ============================================================================
    # GESTION DES STATUTS
    # ============================================================================

    @extend_schema(
        summary="Mettre à jour le statut",
        description="Change le statut d'une commande (pour le personnel cuisine/comptoir).",
        request=OrderStatusUpdateSerializer
    )
    @action(detail=True, methods=["patch"])
    def update_status(self, request, pk=None):
        """Mise à jour du statut d'une commande (avec notifications)"""
        order = self.get_object()
        previous_status = order.status  # conserver l'ancien statut

        serializer = OrderStatusUpdateSerializer(
            order, 
            data=request.data, 
            partial=True
        )

        if serializer.is_valid():
            try:
                updated_order = serializer.save()

                # 🔔 Notification temps réel (avec previous_status)
                self._notify_status_change(updated_order, previous_status=previous_status)

                # Retourner les détails complets
                response_serializer = OrderDetailSerializer(
                    updated_order, 
                    context={'request': request}
                )

                return Response(response_serializer.data)

            except Exception as e:
                logger.exception("Erreur lors de la mise à jour du statut")
                return Response({
                    'error': 'Erreur lors de la mise à jour du statut',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Annuler une commande",
        description="Annule une commande si elle peut encore l'être."
    )
    @action(detail=True, methods=["post"])
    def cancel_order(self, request, pk=None):
        """Annuler une commande"""
        order = self.get_object()

        if not order.can_be_cancelled():
            return Response({
                'error': 'Cette commande ne peut plus être annulée',
                'current_status': order.status
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            previous_status = order.status
            order.status = 'cancelled'
            order.save(update_fields=['status', 'updated_at'])

            # 🔔 Notification
            self._notify_status_change(order, previous_status=previous_status)

            return Response({
                'message': 'Commande annulée avec succès',
                'order_number': order.order_number,
                'status': order.status
            })

        except Exception as e:
            logger.exception("Erreur lors de l'annulation")
            return Response({
                'error': 'Erreur lors de l\'annulation',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ============================================================================
    # GESTION DES PAIEMENTS
    # ============================================================================

    @extend_schema(
        summary="Marquer comme payé",
        description="Marque une commande comme payée avec la méthode de paiement.",
        request=OrderPaymentSerializer
    )
    @action(detail=True, methods=["post"])
    def mark_as_paid(self, request, pk=None):
        """Marquer une commande comme payée"""
        order = self.get_object()

        if order.payment_status == 'paid':
            return Response({
                'message': 'Commande déjà payée',
                'order_number': order.order_number
            })

        serializer = OrderPaymentSerializer(
            order, 
            data=request.data, 
            partial=True
        )

        if serializer.is_valid():
            try:
                updated_order = serializer.save()

                return Response({
                    'message': 'Commande marquée comme payée',
                    'order_number': updated_order.order_number,
                    'payment_method': updated_order.payment_method,
                    'payment_status': updated_order.payment_status,
                    'total_amount': str(updated_order.total_amount)
                })

            except Exception as e:
                logger.exception("Erreur lors du marquage du paiement")
                return Response({
                    'error': 'Erreur lors du marquage du paiement',
                    'details': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # ============================================================================
    # INTERFACE CUISINE ET STATISTIQUES
    # ============================================================================

    @extend_schema(
        summary="Vue cuisine",
        description="Interface cuisine avec regroupement par table",
    )
    @action(detail=False, methods=["get"])
    def kitchen_view(self, request):
        """Vue cuisine avec regroupement par table"""
        restaurant_id = request.query_params.get('restaurant')

        if not restaurant_id:
            return Response({
                'error': 'ID restaurant requis'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Commandes actives groupées par table
        active_orders = self.get_queryset().filter(
            restaurant_id=restaurant_id,
            status__in=['pending', 'confirmed', 'preparing', 'ready']
        ).select_related('restaurant').prefetch_related('items__menu_item')

        # Grouper par table
        tables = {}
        for order in active_orders:
            table_key = order.table_number or 'Takeaway'

            if table_key not in tables:
                tables[table_key] = {
                    'table_number': table_key,
                    'orders': [],
                    'total_items': 0,
                    'oldest_order_time': order.created_at,
                    'urgency_level': 'normal'
                }

            # Ajouter la commande
            order_data = OrderWithTableInfoSerializer(
                order, 
                context={'request': request}
            ).data

            tables[table_key]['orders'].append(order_data)
            tables[table_key]['total_items'] += order.items.count()

            # Calculer l'urgence
            waiting_time = order.get_table_waiting_time()
            if waiting_time > 30:
                tables[table_key]['urgency_level'] = 'urgent'
            elif waiting_time > 20:
                tables[table_key]['urgency_level'] = 'warning'

        # Trier les tables par urgence et temps d'attente
        sorted_tables = sorted(
            tables.values(),
            key=lambda x: (
                {'urgent': 0, 'warning': 1, 'normal': 2}[x['urgency_level']],
                x['oldest_order_time']
            )
        )

        return Response({
            'restaurant_id': restaurant_id,
            'tables': sorted_tables,
            'total_active_orders': active_orders.count(),
            'last_updated': timezone.now().isoformat()
        })

    @extend_schema(
        summary="Statistiques des commandes",
        description="Statistiques détaillées des commandes par période.",
        parameters=[
            OpenApiParameter(name="restaurant", type=int, description="ID du restaurant"),
            OpenApiParameter(name="period", type=str, description="today, week, month")
        ]
    )
    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Statistiques complètes des commandes"""
        restaurant_id = request.query_params.get('restaurant')
        period = request.query_params.get('period', 'today')

        queryset = self.get_queryset()
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)

        # Filtrer par période
        now = timezone.now()
        if period == 'today':
            queryset = queryset.filter(created_at__date=now.date())
        elif period == 'week':
            start_week = now - timedelta(days=7)
            queryset = queryset.filter(created_at__gte=start_week)
        elif period == 'month':
            start_month = now - timedelta(days=30)
            queryset = queryset.filter(created_at__gte=start_month)

        # Calculer les statistiques
        stats = queryset.aggregate(
            total_orders=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
            confirmed=Count('id', filter=Q(status='confirmed')),
            preparing=Count('id', filter=Q(status='preparing')),
            ready=Count('id', filter=Q(status='ready')),
            served=Count('id', filter=Q(status='served')),
            cancelled=Count('id', filter=Q(status='cancelled')),
            paid_orders=Count('id', filter=Q(payment_status='paid')),
            total_revenue=Sum('total_amount', filter=Q(payment_status='paid')) or 0,
        )

        # Calculs dérivés
        stats['unpaid_orders'] = stats['total_orders'] - stats['paid_orders']

        if stats['paid_orders'] > 0:
            stats['average_order_value'] = stats['total_revenue'] / stats['paid_orders']
        else:
            stats['average_order_value'] = 0

        # Temps de préparation moyen
        served_orders = queryset.filter(status='served', ready_at__isnull=False)
        if served_orders.exists():
            avg_prep = served_orders.aggregate(
                avg_time=Avg('ready_at') - Avg('created_at')
            )['avg_time']
            stats['average_preparation_time'] = int(avg_prep.total_seconds() / 60) if avg_prep else 0
        else:
            stats['average_preparation_time'] = 0

        serializer = OrderStatsSerializer(stats)
        return Response({
            'period': period,
            'restaurant_id': restaurant_id,
            'stats': serializer.data,
            'generated_at': timezone.now().isoformat()
        })

    # ============================================================================
    # ACTIONS UTILITAIRES SUR PLACE
    # ============================================================================

    @extend_schema(
        summary="Scanner table QR",
        description="Scanne un QR code de table pour commencer une commande."
    )
    @action(detail=False, methods=["get"], permission_classes=[AllowAny], url_path='scan_table/(?P<table_code>[^/.]+)')
    def scan_table(self, request, table_code=None):
        """Scanner QR code d'une table"""
        if not table_code:
            return Response({
                'error': 'Code de table requis'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            table = get_object_or_404(Table, qr_code=table_code)
            restaurant = table.restaurant

            # Vérifier que le restaurant peut recevoir des commandes
            if not restaurant.can_receive_orders:
                return Response({
                    'error': 'Ce restaurant n\'accepte pas de commandes actuellement'
                }, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                'success': True,
                'restaurant': {
                    'id': restaurant.id,
                    'name': restaurant.name,
                    'description': restaurant.description,
                    'cuisine': restaurant.cuisine,
                    'rating': float(restaurant.rating),
                    'image_url': request.build_absolute_uri(restaurant.image.url) if restaurant.image else None
                },
                'table': {
                    'id': table.id,
                    'number': table.identifiant,
                    'code': table_code
                }
            })

        except Exception as e:
            return Response({
                'error': 'Code de table invalide',
                'details': str(e)
            }, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Estimer temps de préparation",
        description="Estime le temps de préparation pour une liste d'items."
    )
    @action(detail=False, methods=["post"], permission_classes=[AllowAny])
    def estimate_time(self, request):
        """Estimer le temps de préparation"""
        items_data = request.data.get('items', [])

        if not items_data:
            return Response({
                'error': 'Liste d\'items requise'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            total_minutes = 0

            for item in items_data:
                menu_item_id = item.get('menu_item')
                quantity = item.get('quantity', 1)

                try:
                    menu_item = MenuItem.objects.get(id=menu_item_id)
                    prep_time = getattr(menu_item, 'preparation_time', 5)  # 5min par défaut
                    total_minutes += prep_time * quantity
                except MenuItem.DoesNotExist:
                    continue

            # Ajouter buffer et temps de base
            base_time = 5  # 5 minutes de base
            buffer = max(5, total_minutes * 0.2)  # 20% de buffer, minimum 5min

            estimated_minutes = int(base_time + total_minutes + buffer)

            return Response({
                'estimated_minutes': estimated_minutes,
                'estimated_time': f"{estimated_minutes} minutes",
                'ready_at': (timezone.now() + timedelta(minutes=estimated_minutes)).isoformat()
            })

        except Exception as e:
            logger.exception("Erreur lors de l'estimation du temps")
            return Response({
                'error': 'Erreur lors de l\'estimation',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Générer ticket",
        description="Génère un ticket PDF pour une commande."
    )
    @action(detail=True, methods=["post"])
    def generate_ticket(self, request, pk=None):
        """Générer un ticket de commande"""
        order = self.get_object()

        try:
            # Ici on générerait un PDF du ticket
            # Pour l'instant, on retourne les données structurées

            ticket_data = {
                'restaurant': {
                    'name': order.restaurant.name,
                    'address': order.restaurant.address,
                    'phone': order.restaurant.phone
                },
                'order': {
                    'number': order.order_number,
                    'type': order.get_order_type_display(),
                    'table': order.table_number,
                    'customer': order.customer_name or 'Client',
                    'created_at': order.created_at.strftime('%d/%m/%Y %H:%M'),
                    'estimated_ready': order.estimated_ready_time.strftime('%H:%M') if order.estimated_ready_time else None
                },
                'items': [
                    {
                        'name': item.menu_item.name,
                        'quantity': item.quantity,
                        'unit_price': str(item.unit_price),
                        'total': str(item.total_price),
                        'notes': item.special_instructions or ''
                    }
                    for item in order.items.all()
                ],
                'totals': {
                    'subtotal': str(order.subtotal),
                    'tax': str(order.tax_amount),
                    'total': str(order.total_amount)
                }
            }

            return Response({
                'success': True,
                'ticket_data': ticket_data,
                'ticket_url': f'/api/v1/orders/{order.id}/ticket.pdf'  # URL future
            })

        except Exception as e:
            logger.exception("Erreur lors de la génération du ticket")
            return Response({
                'error': 'Erreur lors de la génération du ticket',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ============================================================================
    # MÉTHODES UTILITAIRES PRIVÉES
    # ============================================================================

    def _is_order_urgent(self, order):
        """Détermine si une commande est urgente"""
        if order.status in ['served', 'cancelled']:
            return False

        elapsed = timezone.now() - order.created_at
        return elapsed.total_seconds() > 1800  # Plus de 30 minutes

    def _get_items_summary(self, order):
        """Résumé des items pour affichage rapide"""
        items = order.items.all()
        if items.count() <= 3:
            return ', '.join([f"{item.quantity}x {item.menu_item.name}" for item in items])
        else:
            first_items = list(items[:2])
            return ', '.join([f"{item.quantity}x {item.menu_item.name}" for item in first_items]) + f" +{items.count()-2} autres"

    def _get_next_status(self, current_status):
        """Retourne le prochain statut possible"""
        transitions = {
            'pending': 'confirmed',
            'confirmed': 'preparing', 
            'preparing': 'ready',
            'ready': 'served'
        }
        return transitions.get(current_status)

    def _get_order_timeline(self, order):
        """Timeline des événements de la commande"""
        timeline = [
            {
                'status': 'pending',
                'timestamp': order.created_at,
                'label': 'Commande créée'
            }
        ]

        if order.ready_at:
            timeline.append({
                'status': 'ready',
                'timestamp': order.ready_at,
                'label': 'Commande prête'
            })

        if order.served_at:
            timeline.append({
                'status': 'served', 
                'timestamp': order.served_at,
                'label': 'Commande servie'
            })

        return timeline

    def _get_special_instructions(self, order):
        """Récupère toutes les instructions spéciales"""
        instructions = []

        if order.notes:
            instructions.append(f"Commande: {order.notes}")

        for item in order.items.all():
            if item.special_instructions:
                instructions.append(f"{item.menu_item.name}: {item.special_instructions}")

        return instructions

    # =========================
    # 🔔 Notifications WebSocket
    # =========================
    def _notify_new_order(self, order):
        """Notification temps réel nouvelle commande"""
        try:
            # Notification standard pour l'ordre
            notify_order_update(
                order.id,
                order.status,
                {
                    'order_number': order.order_number,
                    'total_amount': float(order.total_amount),
                    'restaurant_id': order.restaurant_id
                }
            )
            # Notification de session collaborative si applicable
            if getattr(order, 'collaborative_session_id', None):
                order_data = OrderDetailSerializer(order, context={'request': self.request}).data
                notify_session_order_created(
                    str(order.collaborative_session_id),
                    order_data
                )
        except Exception as e:
            logger.warning("Échec notification nouvelle commande: %s", e)

    def _notify_status_change(self, order, previous_status=None):
        """Notification temps réel changement de statut"""
        try:
            notify_order_update(
                order.id,
                order.status,
                {
                    'order_number': order.order_number,
                    'status': order.status,
                    'previous_status': previous_status,
                    'updated_at': order.updated_at.isoformat() if getattr(order, 'updated_at', None) else timezone.now().isoformat()
                }
            )
            if getattr(order, 'collaborative_session_id', None):
                order_data = OrderDetailSerializer(order, context={'request': self.request}).data
                notify_session_order_updated(
                    str(order.collaborative_session_id),
                    order_data
                )
        except Exception as e:
            logger.warning("Échec notification changement de statut: %s", e)
