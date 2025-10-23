from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import timedelta
import logging

from api.models import CollaborativeTableSession, Table, Restaurant
from api.serializers.collaborative_session_serializers import CollaborativeSessionSerializer

logger = logging.getLogger(__name__)

class RestaurantSessionManagementViewSet(viewsets.ViewSet):
    """
    ViewSet pour la gestion des sessions par les restaurateurs
    """
    permission_classes = [IsAuthenticated]
    
    def _get_user_restaurants(self, user):
        """Récupère les restaurants du restaurateur"""
        if not hasattr(user, 'restaurateur_profile'):
            return Restaurant.objects.none()
        return user.restaurateur_profile.restaurants.all()
    
    def _can_manage_restaurant(self, user, restaurant_id):
        """Vérifie si l'utilisateur peut gérer ce restaurant"""
        if user.is_staff:
            return True
        restaurants = self._get_user_restaurants(user)
        return restaurants.filter(id=restaurant_id).exists()
    
    @action(detail=False, methods=['get'])
    def active_sessions(self, request):
        """
        Liste toutes les sessions actives des restaurants du restaurateur
        """
        restaurants = self._get_user_restaurants(request.user)
        
        if not restaurants.exists():
            return Response({
                'error': 'Aucun restaurant associé'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Récupérer toutes les sessions actives
        sessions = CollaborativeTableSession.objects.filter(
            restaurant__in=restaurants,
            status__in=['active', 'locked', 'payment'],
            is_archived=False
        ).select_related('restaurant', 'table').prefetch_related('participants')
        
        # Grouper par restaurant
        by_restaurant = {}
        for session in sessions:
            restaurant_name = session.restaurant.name
            if restaurant_name not in by_restaurant:
                by_restaurant[restaurant_name] = []
            
            by_restaurant[restaurant_name].append(
                CollaborativeSessionSerializer(
                    session,
                    context={'request': request}
                ).data
            )
        
        return Response({
            'count': sessions.count(),
            'by_restaurant': by_restaurant
        })
    
    @action(detail=False, methods=['post'])
    def release_table(self, request):
        """
        Libère une table en archivant toutes ses sessions
        """
        table_id = request.data.get('table_id')
        restaurant_id = request.data.get('restaurant_id')
        reason = request.data.get('reason', 'Libération manuelle par le restaurateur')
        
        if not table_id:
            return Response({
                'error': 'table_id requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            table = Table.objects.get(id=table_id)
            
            # Vérifier les permissions
            if not self._can_manage_restaurant(request.user, table.restaurant.id):
                return Response({
                    'error': 'Non autorisé pour ce restaurant'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Trouver toutes les sessions non archivées de cette table
            sessions = CollaborativeTableSession.objects.filter(
                table=table,
                is_archived=False
            )
            
            archived_count = 0
            session_details = []
            
            for session in sessions:
                # Marquer comme cancelled si pas déjà terminée
                if session.status not in ['completed', 'cancelled']:
                    session.status = 'cancelled'
                    session.save(update_fields=['status'])
                
                # Archiver
                session.archive(reason=reason)
                archived_count += 1
                
                session_details.append({
                    'share_code': session.share_code,
                    'status': session.status,
                    'participant_count': session.participant_count
                })
            
            logger.info(
                f"Table {table.number} libérée par {request.user.email} "
                f"- {archived_count} session(s) archivée(s)"
            )
            
            return Response({
                'message': f'Table {table.number} libérée',
                'table_number': table.number,
                'archived_sessions': archived_count,
                'sessions': session_details
            })
        
        except Table.DoesNotExist:
            return Response({
                'error': 'Table non trouvée'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Erreur lors de la libération de la table")
            return Response({
                'error': 'Erreur lors de la libération',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def bulk_archive(self, request):
        """
        Archive plusieurs sessions en masse
        """
        session_ids = request.data.get('session_ids', [])
        reason = request.data.get('reason', 'Archivage groupé par le restaurateur')
        
        if not session_ids:
            return Response({
                'error': 'session_ids requis (liste d\'UUIDs)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Récupérer les sessions
        sessions = CollaborativeTableSession.objects.filter(
            id__in=session_ids,
            is_archived=False
        )
        
        # Vérifier les permissions pour chaque session
        authorized_sessions = []
        for session in sessions:
            if self._can_manage_restaurant(request.user, session.restaurant.id):
                authorized_sessions.append(session)
        
        if not authorized_sessions:
            return Response({
                'error': 'Aucune session autorisée trouvée'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Archiver
        archived_count = 0
        results = []
        
        for session in authorized_sessions:
            try:
                # Marquer comme cancelled si nécessaire
                if session.status not in ['completed', 'cancelled']:
                    session.status = 'cancelled'
                    session.save(update_fields=['status'])
                
                session.archive(reason=reason)
                archived_count += 1
                
                results.append({
                    'id': str(session.id),
                    'share_code': session.share_code,
                    'status': 'archived',
                    'table_number': session.table_number
                })
            except Exception as e:
                logger.error(f"Erreur archivage session {session.id}: {e}")
                results.append({
                    'id': str(session.id),
                    'status': 'error',
                    'error': str(e)
                })
        
        return Response({
            'message': f'{archived_count} session(s) archivée(s)',
            'total_requested': len(session_ids),
            'total_archived': archived_count,
            'results': results
        })
    
    @action(detail=False, methods=['get'])
    def table_status(self, request):
        """
        Récupère le statut de toutes les tables (libres/occupées)
        """
        restaurant_id = request.query_params.get('restaurant_id')
        
        if not restaurant_id:
            return Response({
                'error': 'restaurant_id requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Vérifier permissions
        if not self._can_manage_restaurant(request.user, restaurant_id):
            return Response({
                'error': 'Non autorisé'
            }, status=status.HTTP_403_FORBIDDEN)
        
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
            tables = Table.objects.filter(restaurant=restaurant)
            
            table_statuses = []
            for table in tables:
                # Chercher une session active sur cette table
                active_session = CollaborativeTableSession.objects.filter(
                    table=table,
                    status__in=['active', 'locked', 'payment'],
                    is_archived=False
                ).first()
                
                table_statuses.append({
                    'table_id': table.id,
                    'table_number': table.number,
                    'capacity': table.capacity,
                    'is_occupied': active_session is not None,
                    'active_session': {
                        'id': str(active_session.id),
                        'share_code': active_session.share_code,
                        'participant_count': active_session.participant_count,
                        'status': active_session.status,
                        'created_at': active_session.created_at
                    } if active_session else None
                })
            
            occupied_count = sum(1 for t in table_statuses if t['is_occupied'])
            
            return Response({
                'restaurant_name': restaurant.name,
                'total_tables': len(table_statuses),
                'occupied_tables': occupied_count,
                'free_tables': len(table_statuses) - occupied_count,
                'tables': table_statuses
            })
        
        except Restaurant.DoesNotExist:
            return Response({
                'error': 'Restaurant non trouvé'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def archived_sessions(self, request):
        """
        Liste les sessions archivées récentes (30 derniers jours)
        """
        restaurant_id = request.query_params.get('restaurant_id')
        days = int(request.query_params.get('days', 30))
        
        if not restaurant_id:
            return Response({
                'error': 'restaurant_id requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not self._can_manage_restaurant(request.user, restaurant_id):
            return Response({
                'error': 'Non autorisé'
            }, status=status.HTTP_403_FORBIDDEN)
        
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # Utiliser all_objects pour accéder aux sessions archivées
        sessions = CollaborativeTableSession.all_objects.filter(
            restaurant_id=restaurant_id,
            is_archived=True,
            archived_at__gte=cutoff_date
        ).order_by('-archived_at')
        
        serializer = CollaborativeSessionSerializer(
            sessions,
            many=True,
            context={'request': request}
        )
        
        return Response({
            'count': sessions.count(),
            'period_days': days,
            'sessions': serializer.data
        })