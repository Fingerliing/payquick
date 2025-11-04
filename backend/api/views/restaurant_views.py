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

    def handle_unvalidated_restaurateur(self):
        """Retourne une réponse appropriée pour les restaurateurs non validés"""
        try:
            profile = self.request.user.restaurateur_profile
            return Response({
                'restaurants': [],
                'message': 'Profil en cours de validation',
                'validation_status': {
                    'stripe_verified': profile.stripe_verified,
                    'is_active': profile.is_active,
                    'stripe_onboarding_completed': profile.stripe_onboarding_completed,
                    'has_stripe_account': bool(profile.stripe_account_id),
                },
                'next_steps': [
                    'Complétez votre profil Stripe' if not profile.stripe_account_id else None,
                    'Finalisez le processus de vérification Stripe' if not profile.stripe_verified else None,
                ][0] if not profile.stripe_verified else 'Votre profil est en cours de validation par nos équipes'
            })
        except AttributeError:
            return Response({
                'restaurants': [],
                'error': 'Profil restaurateur non trouvé'
            }, status=status.HTTP_404_NOT_FOUND)

    def list(self, request, *args, **kwargs):
        """Liste tous les restaurants du restaurateur avec gestion des non-validés"""
        try:
            # Vérifier d'abord si l'utilisateur a un profil restaurateur
            if not hasattr(request.user, 'restaurateur_profile'):
                return Response({
                    'restaurants': [],
                    'error': 'Profil restaurateur requis'
                }, status=status.HTTP_403_FORBIDDEN)

            profile = request.user.restaurateur_profile
            
            # Si le restaurateur n'est pas validé, retourner une réponse appropriée
            if not profile.stripe_verified or not profile.is_active:
                return self.handle_unvalidated_restaurateur()

            # Si validé, procéder normalement
            return super().list(request, *args, **kwargs)
            
        except Exception as e:
            return self.handle_unvalidated_restaurateur()

    def retrieve(self, request, *args, **kwargs):
        """Détails d'un restaurant avec gestion des non-validés"""
        try:
            if not hasattr(request.user, 'restaurateur_profile'):
                return Response({
                    'error': 'Profil restaurateur requis'
                }, status=status.HTTP_403_FORBIDDEN)

            profile = request.user.restaurateur_profile
            
            if not profile.stripe_verified or not profile.is_active:
                return Response({
                    'error': 'Profil en cours de validation',
                    'validation_status': {
                        'stripe_verified': profile.stripe_verified,
                        'is_active': profile.is_active,
                    }
                }, status=status.HTTP_403_FORBIDDEN)

            return super().retrieve(request, *args, **kwargs)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la récupération du restaurant'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
    # STATISTIQUES ET DASHBOARD
    # ============================================================================

    @extend_schema(
        summary="Statistiques d'un restaurant",
        description="Récupère les statistiques complètes d'un restaurant avec KPIs pour l'amélioration continue",
        responses={
            200: OpenApiResponse(description="Statistiques détaillées du restaurant"),
            403: OpenApiResponse(description="Accès non autorisé"),
            404: OpenApiResponse(description="Restaurant non trouvé"),
        }
    )
    @action(detail=True, methods=['get'], url_path='statistics')
    def statistics(self, request, pk=None):
        """
        Récupère les statistiques complètes d'un restaurant avec indicateurs d'amélioration continue
        GET /api/v1/restaurants/{id}/statistics/
        
        Inclut:
        - Statistiques générales (commandes, menus, tables)
        - Top/Flop des plats
        - Heures de pointe
        - Tendances et évolutions
        - Indicateurs de performance
        """
        restaurant = self.get_object()
        
        # Vérifier que l'utilisateur a accès à ce restaurant
        if not request.user.is_staff and restaurant.owner != request.user.restaurateur_profile:
            return Response(
                {'error': 'Vous n\'avez pas accès à ces statistiques'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            from django.db.models import Sum, Avg, F, Case, When, FloatField, DurationField
            from api.models import OrderItem
            
            # Période d'analyse (30 derniers jours par défaut)
            period_days = int(request.query_params.get('period_days', 30))
            start_date = timezone.now() - timedelta(days=period_days)
            
            # ====================================================================
            # 1. STATISTIQUES GÉNÉRALES
            # ====================================================================
            
            orders_stats = Order.objects.filter(
                restaurant=restaurant
            ).aggregate(
                total=Count('id'),
                total_last_period=Count('id', filter=Q(created_at__gte=start_date)),
                pending=Count('id', filter=Q(status='pending')),
                in_progress=Count('id', filter=Q(status='in_progress')),
                served=Count('id', filter=Q(status='served')),
                cancelled=Count('id', filter=Q(status='cancelled')),
                paid=Count('id', filter=Q(payment_status='paid')),
                unpaid=Count('id', filter=Q(payment_status='unpaid')),
            )
            
            # Taux d'annulation
            total_orders = orders_stats['total'] or 1
            cancellation_rate = round((orders_stats['cancelled'] / total_orders) * 100, 1)
            payment_rate = round((orders_stats['paid'] / total_orders) * 100, 1)
            
            menus_stats = Menu.objects.filter(
                restaurant=restaurant
            ).aggregate(
                total=Count('id'),
                active=Count('id', filter=Q(is_available=True)),
            )
            
            menu_items_stats = MenuItem.objects.filter(
                menu__restaurant=restaurant
            ).aggregate(
                total=Count('id'),
                available=Count('id', filter=Q(is_available=True)),
            )
            
            # Taux de disponibilité des plats
            availability_rate = round(
                (menu_items_stats['available'] / (menu_items_stats['total'] or 1)) * 100, 1
            )
            
            tables_stats = Table.objects.filter(
                restaurant=restaurant
            ).aggregate(
                total=Count('id'),
            )
            
            # ====================================================================
            # 2. ANALYSE DES PLATS
            # ====================================================================
            
            # Top 10 des plats les plus commandés
            top_dishes = OrderItem.objects.filter(
                order__restaurant=restaurant,
                order__created_at__gte=start_date,
                order__status__in=['in_progress', 'served']
            ).values(
                'menu_item__id',
                'menu_item__name',
                'menu_item__price'
            ).annotate(
                total_orders=Sum('quantity'),
                revenue=Sum(F('quantity') * F('menu_item__price')),
                orders_count=Count('order', distinct=True)
            ).order_by('-total_orders')[:10]
            
            # Plats les moins commandés (pour identifier ce qui ne marche pas)
            flop_dishes = MenuItem.objects.filter(
                menu__restaurant=restaurant,
                is_available=True
            ).annotate(
                orders_count=Count(
                    'orderitem',
                    filter=Q(
                        orderitem__order__created_at__gte=start_date,
                        orderitem__order__status__in=['in_progress', 'served']
                    )
                )
            ).order_by('orders_count')[:10]
            
            # Plats jamais commandés (action requise)
            never_ordered = MenuItem.objects.filter(
                menu__restaurant=restaurant,
                is_available=True
            ).annotate(
                orders_count=Count('orderitem')
            ).filter(orders_count=0).count()
            
            # ====================================================================
            # 3. ANALYSE FINANCIÈRE
            # ====================================================================
            
            # Chiffre d'affaires
            revenue_data = Order.objects.filter(
                restaurant=restaurant,
                payment_status='paid',
                created_at__gte=start_date
            ).aggregate(
                total_revenue=Sum('total_amount'),
                avg_order_value=Avg('total_amount'),
                orders_count=Count('id')
            )
            
            # Comparaison avec la période précédente
            previous_start = start_date - timedelta(days=period_days)
            previous_revenue = Order.objects.filter(
                restaurant=restaurant,
                payment_status='paid',
                created_at__gte=previous_start,
                created_at__lt=start_date
            ).aggregate(
                total=Sum('total_amount')
            )['total'] or 0
            
            current_revenue = revenue_data['total_revenue'] or 0
            revenue_evolution = 0
            if previous_revenue > 0:
                revenue_evolution = round(
                    ((current_revenue - previous_revenue) / previous_revenue) * 100, 1
                )
            
            # ====================================================================
            # 4. HEURES DE POINTE
            # ====================================================================
            
            # Distribution des commandes par heure
            from django.db.models.functions import ExtractHour
            
            hourly_distribution = Order.objects.filter(
                restaurant=restaurant,
                created_at__gte=start_date
            ).annotate(
                hour=ExtractHour('created_at')
            ).values('hour').annotate(
                orders_count=Count('id')
            ).order_by('hour')
            
            # Identifier les heures de pointe
            peak_hours = sorted(
                hourly_distribution,
                key=lambda x: x['orders_count'],
                reverse=True
            )[:3]
            
            # ====================================================================
            # 5. ANALYSE DES TABLES
            # ====================================================================
            
            # Tables les plus utilisées
            popular_tables = Order.objects.filter(
                restaurant=restaurant,
                created_at__gte=start_date
            ).exclude(
                Q(table_number__isnull=True) | Q(table_number='')
            ).values(
                'table_number'
            ).annotate(
                orders_count=Count('id'),
                total_revenue=Sum('total_amount', filter=Q(payment_status='paid'))
            ).order_by('-orders_count')[:5]

            # On peut estimer le taux d'utilisation des tables sur la période
            if tables_stats['total'] > 0:
                total_table_orders = Order.objects.filter(
                    restaurant=restaurant,
                    created_at__gte=start_date
                ).exclude(table_number__isnull=True).count()
                table_usage_rate = round((total_table_orders / tables_stats['total']) * 100, 1)
            else:
                table_usage_rate = 0
            
            # ====================================================================
            # 6. TEMPS DE SERVICE
            # ====================================================================
            
            # Temps moyen entre commande et service
            served_orders = Order.objects.filter(
                restaurant=restaurant,
                status='served',
                created_at__gte=start_date,
                updated_at__isnull=False
            )
            
            avg_service_time = None
            if served_orders.exists():
                time_diffs = []
                for order in served_orders:
                    if order.updated_at and order.created_at:
                        diff = (order.updated_at - order.created_at).total_seconds() / 60
                        if 0 < diff < 180:  # Ignorer les valeurs aberrantes (>3h)
                            time_diffs.append(diff)
                
                if time_diffs:
                    avg_service_time = round(sum(time_diffs) / len(time_diffs), 1)
            
            # ====================================================================
            # 7. INDICATEURS PAR JOUR DE LA SEMAINE
            # ====================================================================
            
            from django.db.models.functions import ExtractWeekDay
            
            daily_stats = Order.objects.filter(
                restaurant=restaurant,
                created_at__gte=start_date
            ).annotate(
                day=ExtractWeekDay('created_at')
            ).values('day').annotate(
                orders_count=Count('id'),
                revenue=Sum('total_amount', filter=Q(payment_status='paid'))
            ).order_by('day')
            
            # Meilleur/pire jour
            days_names = {
                1: 'Dimanche', 2: 'Lundi', 3: 'Mardi', 4: 'Mercredi',
                5: 'Jeudi', 6: 'Vendredi', 7: 'Samedi'
            }
            
            best_day = None
            worst_day = None
            if daily_stats:
                best = max(daily_stats, key=lambda x: x['orders_count'] or 0)
                worst = min(daily_stats, key=lambda x: x['orders_count'] or 0)
                best_day = {
                    'day': days_names.get(best['day'], 'Inconnu'),
                    'orders_count': best['orders_count']
                }
                worst_day = {
                    'day': days_names.get(worst['day'], 'Inconnu'),
                    'orders_count': worst['orders_count']
                }
            
            # ====================================================================
            # 8. CONSTRUIRE LA RÉPONSE
            # ====================================================================
            
            statistics = {
                # Période d'analyse
                'period': {
                    'days': period_days,
                    'start_date': start_date.isoformat(),
                    'end_date': timezone.now().isoformat(),
                },
                
                # Vue d'ensemble
                'overview': {
                    'orders': orders_stats,
                    'menus': menus_stats,
                    'menu_items': menu_items_stats,
                    'tables': tables_stats,
                    'restaurant': {
                        'name': restaurant.name,
                        'can_receive_orders': restaurant.can_receive_orders,
                        'is_stripe_active': restaurant.is_stripe_active,
                    }
                },
                
                # KPIs principaux
                'kpis': {
                    'cancellation_rate': cancellation_rate,
                    'payment_rate': payment_rate,
                    'availability_rate': availability_rate,
                    'avg_order_value': float(revenue_data['avg_order_value'] or 0),
                    'avg_service_time_minutes': avg_service_time,
                    'table_usage_rate': table_usage_rate,
                },
                
                # Performance des plats
                'dishes_performance': {
                    'top_dishes': [
                        {
                            'id': dish['menu_item__id'],
                            'name': dish['menu_item__name'],
                            'price': float(dish['menu_item__price'] or 0),
                            'total_orders': dish['total_orders'],
                            'revenue': float(dish['revenue'] or 0),
                            'orders_count': dish['orders_count'],
                        }
                        for dish in top_dishes
                    ],
                    'underperforming_dishes': [
                        {
                            'id': dish.id,
                            'name': dish.name,
                            'price': float(dish.price),
                            'orders_count': dish.orders_count,
                        }
                        for dish in flop_dishes
                    ],
                    'never_ordered_count': never_ordered,
                },
                
                # Revenus
                'revenue': {
                    'current_period': float(current_revenue),
                    'previous_period': float(previous_revenue),
                    'evolution_percent': revenue_evolution,
                    'avg_order_value': float(revenue_data['avg_order_value'] or 0),
                    'total_orders': revenue_data['orders_count'],
                },
                
                # Heures de pointe
                'peak_hours': [
                    {
                        'hour': f"{item['hour']}:00",
                        'orders_count': item['orders_count']
                    }
                    for item in peak_hours
                ],
                
                # Distribution horaire complète
                'hourly_distribution': [
                    {
                        'hour': item['hour'],
                        'orders_count': item['orders_count']
                    }
                    for item in hourly_distribution
                ],
                
                # Tables populaires
                'popular_tables': [
                    {
                        'table_id': None,  # pas de FK table
                        'table_number': table['table_number'],
                        'orders_count': table['orders_count'],
                        'revenue': float(table['total_revenue'] or 0),
                    }
                    for table in popular_tables
                ],
                
                # Performance par jour
                'daily_performance': {
                    'distribution': [
                        {
                            'day': days_names.get(day['day'], 'Inconnu'),
                            'orders_count': day['orders_count'],
                            'revenue': float(day['revenue'] or 0),
                        }
                        for day in daily_stats
                    ],
                    'best_day': best_day,
                    'worst_day': worst_day,
                },
                
                # Recommandations d'amélioration
                'recommendations': self._generate_recommendations(
                    cancellation_rate,
                    availability_rate,
                    never_ordered,
                    avg_service_time,
                    table_usage_rate,
                    revenue_evolution
                ),
            }
            
            return Response(statistics, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'Erreur lors de la récupération des statistiques: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _generate_recommendations(self, cancellation_rate, availability_rate, 
                                  never_ordered, avg_service_time, 
                                  table_usage_rate, revenue_evolution):
        """Génère des recommandations personnalisées basées sur les KPIs"""
        recommendations = []
        
        # Taux d'annulation élevé
        if cancellation_rate > 10:
            recommendations.append({
                'type': 'warning',
                'category': 'commandes',
                'title': 'Taux d\'annulation élevé',
                'message': f'Votre taux d\'annulation est de {cancellation_rate}%. '
                          'Identifiez les causes : délais trop longs, erreurs de commande, '
                          'ou problèmes de communication avec les clients.',
                'priority': 'high'
            })
        
        # Disponibilité des plats faible
        if availability_rate < 80:
            recommendations.append({
                'type': 'warning',
                'category': 'menu',
                'title': 'Disponibilité des plats à améliorer',
                'message': f'Seulement {availability_rate}% de vos plats sont disponibles. '
                          'Revoyez votre gestion des stocks ou retirez les plats '
                          'indisponibles du menu.',
                'priority': 'high'
            })
        
        # Plats jamais commandés
        if never_ordered > 5:
            recommendations.append({
                'type': 'info',
                'category': 'menu',
                'title': 'Optimisation du menu',
                'message': f'{never_ordered} plats n\'ont jamais été commandés. '
                          'Envisagez de les retirer du menu ou de les mettre en avant '
                          'avec des promotions.',
                'priority': 'medium'
            })
        
        # Temps de service élevé
        if avg_service_time and avg_service_time > 30:
            recommendations.append({
                'type': 'warning',
                'category': 'service',
                'title': 'Temps de service à optimiser',
                'message': f'Le temps moyen de service est de {avg_service_time} minutes. '
                          'Optimisez votre processus de préparation ou augmentez '
                          'votre personnel en cuisine.',
                'priority': 'high'
            })
        elif avg_service_time and avg_service_time < 15:
            recommendations.append({
                'type': 'success',
                'category': 'service',
                'title': 'Excellent temps de service',
                'message': f'Temps moyen de {avg_service_time} minutes. Continuez ! '
                          'Vos clients apprécient cette rapidité.',
                'priority': 'low'
            })
        
        # Utilisation des tables faible
        if table_usage_rate < 50:
            recommendations.append({
                'type': 'info',
                'category': 'tables',
                'title': 'Optimisation de l\'espace',
                'message': f'Seulement {table_usage_rate}% de vos tables sont utilisées. '
                          'Envisagez de réduire le nombre de tables ou '
                          'd\'améliorer votre visibilité.',
                'priority': 'medium'
            })
        
        # Évolution du CA négative
        if revenue_evolution < -10:
            recommendations.append({
                'type': 'warning',
                'category': 'revenus',
                'title': 'Baisse du chiffre d\'affaires',
                'message': f'Votre CA a baissé de {abs(revenue_evolution)}%. '
                          'Analysez vos plats populaires et lancez des promotions '
                          'pour relancer l\'activité.',
                'priority': 'high'
            })
        elif revenue_evolution > 10:
            recommendations.append({
                'type': 'success',
                'category': 'revenus',
                'title': 'Croissance positive',
                'message': f'Félicitations ! Votre CA a augmenté de {revenue_evolution}%. '
                          'Maintenez cette dynamique et capitalisez sur vos succès.',
                'priority': 'low'
            })
        
        # Message positif par défaut
        if not recommendations:
            recommendations.append({
                'type': 'success',
                'category': 'general',
                'title': 'Tout va bien !',
                'message': 'Vos indicateurs sont dans les normes. '
                          'Continuez à suivre vos statistiques régulièrement.',
                'priority': 'low'
            })
        
        return recommendations

    @extend_schema(
        summary="Dashboard d'un restaurant",
        description="Récupère le dashboard complet avec statistiques, commandes récentes et tendances",
        responses={
            200: OpenApiResponse(description="Dashboard du restaurant"),
            403: OpenApiResponse(description="Accès non autorisé"),
            404: OpenApiResponse(description="Restaurant non trouvé"),
        }
    )
    @action(detail=True, methods=['get'], url_path='dashboard')
    def dashboard(self, request, pk=None):
        """
        Récupère le dashboard complet d'un restaurant
        GET /api/v1/restaurants/{id}/dashboard/
        """
        restaurant = self.get_object()
        
        # Vérifier les permissions
        if not request.user.is_staff and restaurant.owner != request.user.restaurateur_profile:
            return Response(
                {'error': 'Vous n\'avez pas accès à ce dashboard'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            # Récupérer les statistiques de base
            stats_response = self.statistics(request, pk)
            
            if stats_response.status_code != 200:
                return stats_response
            
            # Commandes récentes (dernières 24h)
            from django.db.models import Sum
            from api.models import OrderItem
            
            recent_orders = Order.objects.filter(
                restaurant=restaurant,
                created_at__gte=timezone.now() - timedelta(days=1)
            ).select_related('table').order_by('-created_at')[:10]
            
            # Articles populaires (top 5)
            popular_items = OrderItem.objects.filter(
                order__restaurant=restaurant,
                order__created_at__gte=timezone.now() - timedelta(days=30)
            ).values(
                'menu_item__name'
            ).annotate(
                total_quantity=Sum('quantity')
            ).order_by('-total_quantity')[:5]
            
            # Revenus
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - timedelta(days=7)
            month_start = today_start - timedelta(days=30)
            
            revenue_stats = {
                'today': Order.objects.filter(
                    restaurant=restaurant,
                    payment_status='paid',
                    created_at__gte=today_start
                ).aggregate(total=Sum('total_amount'))['total'] or 0,
                'week': Order.objects.filter(
                    restaurant=restaurant,
                    payment_status='paid',
                    created_at__gte=week_start
                ).aggregate(total=Sum('total_amount'))['total'] or 0,
                'month': Order.objects.filter(
                    restaurant=restaurant,
                    payment_status='paid',
                    created_at__gte=month_start
                ).aggregate(total=Sum('total_amount'))['total'] or 0,
            }
            
            # Construire le dashboard
            dashboard_data = {
                'statistics': stats_response.data,
                'recent_orders': [
                    {
                        'id': order.id,
                        'table_number': order.table.number if order.table else None,
                        'status': order.status,
                        'total_amount': float(order.total_amount) if hasattr(order, 'total_amount') else 0,
                        'created_at': order.created_at.isoformat(),
                        'payment_status': order.payment_status,
                    }
                    for order in recent_orders
                ],
                'popular_items': [
                    {
                        'name': item['menu_item__name'],
                        'quantity': item['total_quantity'],
                    }
                    for item in popular_items
                ],
                'revenue': revenue_stats,
            }
            
            return Response(dashboard_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': f'Erreur lors de la récupération du dashboard: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
    # TABLEAUX DE BORD
    # ============================================================================

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