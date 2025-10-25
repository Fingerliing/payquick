from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum, Avg, Count
from django.utils import timezone
from api.models import Order, Restaurant, TableSession
from api.permissions import IsRestaurateur, IsValidatedRestaurateur
from api.serializers import OrderWithTableInfoSerializer, TableSessionSerializer, OrderCreateSerializer, OrderListSerializer
from drf_spectacular.utils import extend_schema, OpenApiParameter

class TableOrdersViewSet(viewsets.ViewSet):
    """
    ViewSet pour gérer les commandes multiples par table
    Accessible aux clients ET aux restaurateurs
    """
    
    def get_permissions(self):
        """
        Permissions dynamiques selon l'action
        """
        if self.action in ['table_orders', 'table_session']:
            # Les clients peuvent voir les commandes de leur table
            return [AllowAny()]
        elif self.action == 'add_table_order':
            # Les clients (authentifiés ou non) peuvent créer des commandes
            return [AllowAny()]
        elif self.action == 'end_table_session':
            # Seuls les restaurateurs ou le client principal peuvent terminer une session
            return [IsAuthenticated()]
        elif self.action == 'restaurant_tables_stats':
            # Seuls les restaurateurs peuvent voir les stats globales
            return [IsAuthenticated(), IsRestaurateur(), IsValidatedRestaurateur()]
        return [IsAuthenticated()]
    
    @extend_schema(
        summary="Commandes d'une table",
        description="Récupère toutes les commandes (actives et complétées) pour une table donnée",
        parameters=[
            OpenApiParameter(name="restaurant_id", type=int, required=True),
            OpenApiParameter(name="table_number", type=str, required=True),
        ]
    )
    @action(detail=False, methods=['get'])
    def table_orders(self, request):
        """Récupère toutes les commandes d'une table"""
        restaurant_id = request.query_params.get('restaurant_id')
        table_number = request.query_params.get('table_number')
        
        if not restaurant_id or not table_number:
            return Response({
                'error': 'restaurant_id et table_number sont requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Récupérer le restaurant (sans vérifier la propriété pour les clients)
            restaurant = get_object_or_404(Restaurant, id=restaurant_id)
            
            # Vérifier les permissions
            user = request.user
            is_restaurateur = (
                user.is_authenticated and 
                hasattr(user, 'restaurateur_profile') and 
                restaurant.owner == user.restaurateur_profile
            )
            
            # Récupérer les commandes de la table
            all_orders = Order.objects.for_table(restaurant, table_number)
            
            # Si c'est un client, filtrer pour ne montrer que ses propres commandes
            # sauf s'il fait partie d'une session collaborative
            if not is_restaurateur:
                # Vérifier s'il y a une session collaborative active
                active_session = TableSession.objects.filter(
                    restaurant=restaurant,
                    table_number=table_number,
                    is_active=True
                ).first()
                
                if active_session:
                    # En session collaborative, tous peuvent voir toutes les commandes de la session
                    all_orders = all_orders.filter(
                        Q(table_session_id=active_session.id) |
                        Q(user=user if user.is_authenticated else None) |
                        Q(phone=request.session.get('guest_phone'))
                    )
                elif user.is_authenticated:
                    # Pas de session collaborative, filtrer par utilisateur
                    all_orders = all_orders.filter(user=user)
                else:
                    # Client non authentifié, utiliser le téléphone en session
                    guest_phone = request.session.get('guest_phone')
                    if guest_phone:
                        all_orders = all_orders.filter(phone=guest_phone)
                    else:
                        # Aucun moyen d'identifier le client, retourner vide
                        all_orders = all_orders.none()
            
            # Séparer les commandes actives et complétées
            active_orders = all_orders.filter(
                status__in=['pending', 'confirmed', 'preparing', 'ready']
            )
            completed_orders = all_orders.filter(
                status__in=['served', 'cancelled']
            )[:10]  # Limiter l'historique
            
            # Session actuelle
            current_session = None
            if active_orders.exists():
                latest_active = active_orders.first()
                if latest_active.table_session_id:
                    current_session = TableSession.objects.filter(
                        id=latest_active.table_session_id,
                        is_active=True
                    ).first()
            
            # Statistiques de la table (limitées pour les clients)
            if is_restaurateur:
                table_stats = Order.objects.table_statistics(restaurant, table_number)
            else:
                # Pour les clients, stats limitées à leurs commandes
                table_stats = {
                    'total_orders': active_orders.count() + completed_orders.count(),
                    'active_orders': active_orders.count(),
                    'total_revenue': float(
                        all_orders.aggregate(
                            total=Sum('total_amount')
                        )['total'] or 0
                    )
                }
            
            # Préparer la réponse
            response_data = {
                'restaurant_id': restaurant_id,
                'restaurant_name': restaurant.name,
                'table_number': table_number,
                'active_orders': OrderWithTableInfoSerializer(
                    active_orders, 
                    many=True, 
                    context={'request': request}
                ).data,
                'completed_orders': OrderWithTableInfoSerializer(
                    completed_orders, 
                    many=True, 
                    context={'request': request}
                ).data,
                'table_statistics': table_stats,
                'current_session': TableSessionSerializer(
                    current_session, 
                    context={'request': request}
                ).data if current_session else None,
                'can_add_order': True,
                'is_restaurateur': is_restaurateur,
                'last_updated': timezone.now().isoformat()
            }
            
            return Response(response_data)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la récupération des commandes',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @extend_schema(
        summary="Créer une nouvelle commande pour une table",
        description="Ajoute une nouvelle commande à une table existante",
    )
    @action(detail=False, methods=['post'])
    def add_table_order(self, request):
        """Ajoute une nouvelle commande à une table"""
        try:
            # Ajouter l'utilisateur aux données si authentifié
            data = request.data.copy()
            if request.user.is_authenticated:
                data['user'] = request.user.id
            
            # Si c'est un client non authentifié, stocker son téléphone en session
            if not request.user.is_authenticated and 'phone' in data:
                request.session['guest_phone'] = data['phone']
                request.session.save()
            
            # Utiliser le serializer de création standard
            serializer = OrderCreateSerializer(
                data=data,
                context={'request': request}
            )
            
            if serializer.is_valid():
                order = serializer.save()
                
                # Si une session collaborative existe, l'associer automatiquement
                if 'table_number' in data and 'restaurant' in data:
                    active_session = TableSession.objects.filter(
                        restaurant_id=data['restaurant'],
                        table_number=data['table_number'],
                        is_active=True
                    ).first()
                    
                    if active_session:
                        order.table_session_id = active_session.id
                        order.save()
                
                # Retourner avec les informations de table
                response_serializer = OrderWithTableInfoSerializer(
                    order,
                    context={'request': request}
                )
                
                return Response(
                    response_serializer.data,
                    status=status.HTTP_201_CREATED
                )
            
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la création de la commande',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @extend_schema(
        summary="Session de table",
        description="Informations détaillées sur la session de table active",
    )
    @action(detail=False, methods=['get'])
    def table_session(self, request):
        """Informations sur la session de table active"""
        restaurant_id = request.query_params.get('restaurant_id')
        table_number = request.query_params.get('table_number')
        
        if not restaurant_id or not table_number:
            return Response({
                'error': 'restaurant_id et table_number sont requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            restaurant = get_object_or_404(Restaurant, id=restaurant_id)
            
            # Chercher une session active
            active_session = TableSession.objects.filter(
                restaurant=restaurant,
                table_number=table_number,
                is_active=True
            ).first()
            
            if not active_session:
                return Response({
                    'message': 'Aucune session active pour cette table',
                    'has_active_session': False
                })
            
            # Vérifier les permissions pour voir les détails
            user = request.user
            is_restaurateur = (
                user.is_authenticated and 
                hasattr(user, 'restaurateur_profile') and 
                restaurant.owner == user.restaurateur_profile
            )
            
            # Les clients peuvent voir la session s'ils en font partie
            if not is_restaurateur:
                # Vérifier si le client a des commandes dans cette session
                user_has_orders = False
                if user.is_authenticated:
                    user_has_orders = active_session.orders.filter(user=user).exists()
                else:
                    guest_phone = request.session.get('guest_phone')
                    if guest_phone:
                        user_has_orders = active_session.orders.filter(phone=guest_phone).exists()
                
                if not user_has_orders:
                    # Le client ne fait pas partie de la session, infos limitées
                    return Response({
                        'has_active_session': True,
                        'session': {
                            'id': str(active_session.id),
                            'table_number': active_session.table_number,
                            'guest_count': active_session.guest_count,
                            'is_active': True
                        }
                    })
            
            serializer = TableSessionSerializer(
                active_session,
                context={'request': request}
            )
            
            return Response({
                'has_active_session': True,
                'session': serializer.data
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la récupération de la session',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @extend_schema(
        summary="Terminer une session de table",
        description="Marque la session de table comme terminée",
    )
    @action(detail=False, methods=['post'])
    def end_table_session(self, request):
        """Termine une session de table"""
        restaurant_id = request.data.get('restaurant_id')
        table_number = request.data.get('table_number')
        
        if not restaurant_id or not table_number:
            return Response({
                'error': 'restaurant_id et table_number sont requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            restaurant = get_object_or_404(Restaurant, id=restaurant_id)
            
            # Vérifier les permissions
            user = request.user
            is_restaurateur = (
                hasattr(user, 'restaurateur_profile') and 
                restaurant.owner == user.restaurateur_profile
            )
            
            # Chercher la session active
            active_session = TableSession.objects.filter(
                restaurant=restaurant,
                table_number=table_number,
                is_active=True
            ).first()
            
            if not active_session:
                return Response({
                    'error': 'Aucune session active trouvée pour cette table'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Vérifier les permissions pour terminer la session
            if not is_restaurateur:
                # Un client peut terminer la session s'il est le créateur
                # ou s'il a la première commande de la session
                first_order = active_session.orders.order_by('created_at').first()
                can_end = False
                
                if first_order:
                    if first_order.user == user:
                        can_end = True
                    elif not user.is_authenticated:
                        # Client non authentifié, vérifier le téléphone
                        guest_phone = request.session.get('guest_phone')
                        if guest_phone and first_order.phone == guest_phone:
                            can_end = True
                
                if not can_end:
                    return Response({
                        'error': 'Vous n\'avez pas la permission de terminer cette session'
                    }, status=status.HTTP_403_FORBIDDEN)
            
            # Vérifier que toutes les commandes sont terminées
            active_orders = active_session.orders.filter(
                status__in=['pending', 'confirmed', 'preparing', 'ready']
            )
            
            if active_orders.exists():
                return Response({
                    'error': 'Impossible de terminer la session : des commandes sont encore actives',
                    'active_orders_count': active_orders.count()
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Terminer la session
            active_session.end_session()
            
            return Response({
                'message': 'Session de table terminée avec succès',
                'session_id': str(active_session.id),
                'total_amount': active_session.total_amount,
                'orders_count': active_session.orders_count,
                'duration_minutes': int(active_session.duration.total_seconds() / 60)
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la fin de session',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @extend_schema(
        summary="Statistiques des tables",
        description="Statistiques globales pour toutes les tables du restaurant",
    )
    @action(detail=False, methods=['get'])
    def restaurant_tables_stats(self, request):
        """Statistiques des tables pour un restaurant - Réservé aux restaurateurs"""
        restaurant_id = request.query_params.get('restaurant_id')
        
        if not restaurant_id:
            return Response({
                'error': 'restaurant_id est requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            restaurant = get_object_or_404(
                Restaurant,
                id=restaurant_id,
                owner=request.user.restaurateur_profile
            )
            
            # Statistiques par table
            tables_stats = {}
            
            # Récupérer toutes les tables qui ont des commandes
            tables_with_orders = Order.objects.filter(
                restaurant=restaurant,
                table_number__isnull=False
            ).values_list('table_number', flat=True).distinct()
            
            for table_number in tables_with_orders:
                stats = Order.objects.table_statistics(restaurant, table_number)
                
                # Ajouter les commandes actives
                active_orders = Order.objects.active_for_table(restaurant, table_number)
                stats['active_orders_detail'] = OrderListSerializer(
                    active_orders, 
                    many=True, 
                    context={'request': request}
                ).data
                
                tables_stats[table_number] = stats
            
            # Statistiques globales
            today = timezone.now().date()
            global_stats = Order.objects.filter(
                restaurant=restaurant,
                created_at__date=today
            ).aggregate(
                total_orders=Count('id'),
                total_revenue=Sum('total_amount'),
                active_orders=Count('id', filter=Q(
                    status__in=['pending', 'confirmed', 'preparing', 'ready']
                ))
            )
            
            return Response({
                'restaurant_id': restaurant_id,
                'restaurant_name': restaurant.name,
                'tables_stats': tables_stats,
                'global_stats': global_stats,
                'date': today.isoformat()
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la récupération des statistiques',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)