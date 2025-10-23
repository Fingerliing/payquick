from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum, Count, Prefetch
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiParameter

from api.models import (
    CollaborativeTableSession, SessionParticipant, 
    Order, Restaurant, Table
)
from api.serializers.collaborative_session_serializers import (
    CollaborativeSessionSerializer,
    SessionCreateSerializer,
    SessionJoinSerializer,
    SessionParticipantSerializer,
    SessionActionSerializer,
    ParticipantActionSerializer,
    SessionOrderSerializer,
    SessionSummarySerializer
)

# 🔔 WebSocket notifications
from api.consumers import (
    notify_participant_joined,
    notify_participant_left,
    notify_participant_approved,
    notify_session_locked,
    notify_session_unlocked,
    notify_session_completed,
    notify_session_update,
    notify_table_released,
    notify_session_archived
)

import logging
logger = logging.getLogger(__name__)


class CollaborativeSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour gérer les sessions collaboratives de table
    AVEC archivage automatique
    """
    serializer_class = CollaborativeSessionSerializer
    permission_classes = [AllowAny]  # Les invités peuvent aussi utiliser

    def get_queryset(self):
        """Filtrer selon le contexte"""
        # 🆕 Utiliser le manager par défaut qui exclut automatiquement les sessions archivées
        queryset = CollaborativeTableSession.objects.select_related(
            'restaurant', 'table'
        ).prefetch_related(
            Prefetch('participants', queryset=SessionParticipant.objects.filter(
                status='active'
            ))
        )

        # Si authentifié, montrer aussi ses sessions
        if self.request.user.is_authenticated:
            queryset = queryset.filter(
                Q(participants__user=self.request.user) |
                Q(host=self.request.user)
            ).distinct()

        return queryset.order_by('-created_at')

    @extend_schema(
        summary="Créer une nouvelle session collaborative",
        request=SessionCreateSerializer,
        responses={201: CollaborativeSessionSerializer}
    )
    @action(detail=False, methods=['post'])
    def create_session(self, request):
        """
        Crée une nouvelle session collaborative avec détection de conflits
        """
        serializer = SessionCreateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data
        
        try:
            # Récupérer le restaurant
            try:
                restaurant = Restaurant.objects.get(id=data['restaurant_id'])
            except Restaurant.DoesNotExist:
                return Response({
                    'error': 'Restaurant non trouvé'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Récupérer la table si fournie
            table = None
            if data.get('table_id'):
                try:
                    table = Table.objects.get(
                        id=data['table_id'],
                        restaurant=restaurant
                    )
                except Table.DoesNotExist:
                    return Response({
                        'error': 'Table non trouvée'
                    }, status=status.HTTP_404_NOT_FOUND)
            
            # 🆕 DÉTECTION DE CONFLITS - Vérifier sessions actives sur cette table
            existing_active_sessions = CollaborativeTableSession.objects.filter(
                table_id=data.get('table_id'),
                table_number=data['table_number'],
                status__in=['active', 'locked', 'payment'],
                is_archived=False  # Important: exclure les archivées
            )
            
            if existing_active_sessions.exists():
                existing = existing_active_sessions.first()
                
                # Si la session existante est completed, l'archiver automatiquement
                if existing.status == 'completed':
                    existing.archive(reason="Nouvelle session créée sur la même table")
                    logger.info(
                        f"Session {existing.id} archivée automatiquement "
                        f"(nouvelle session sur table {data['table_number']})"
                    )
                else:
                    # Session vraiment active - conflit !
                    return Response({
                        'error': 'Session active existante',
                        'conflict': True,
                        'existing_session': {
                            'id': str(existing.id),
                            'share_code': existing.share_code,
                            'status': existing.status,
                            'participant_count': existing.participant_count,
                            'created_at': existing.created_at,
                        },
                        'suggestion': (
                            'Une session est déjà active sur cette table. '
                            'Voulez-vous la rejoindre ou demander au restaurateur '
                            'de libérer la table ?'
                        )
                    }, status=status.HTTP_409_CONFLICT)
            
            # Créer la nouvelle session
            session = CollaborativeTableSession.objects.create(
                restaurant=restaurant,
                table=table,
                table_number=data['table_number'],
                session_type=data.get('session_type', 'collaborative'),
                host=request.user if request.user.is_authenticated else None,
                host_name=data.get('host_name', ''),
                max_participants=data.get('max_participants', 10),
                require_approval=data.get('require_approval', False),
                split_payment_enabled=data.get('split_payment_enabled', True),
                session_notes=data.get('session_notes', '')
            )
            
            # Créer le participant hôte
            SessionParticipant.objects.create(
                session=session,
                user=request.user if request.user.is_authenticated else None,
                guest_name=data.get('host_name', '') if not request.user.is_authenticated else '',
                role='host',
                status='active'
            )
            
            # 🔔 Notifier la création
            try:
                notify_session_update(
                    str(session.id),
                    {
                        'event': 'created',
                        'actor': self._actor_name(request),
                        'data': {
                            'share_code': session.share_code,
                            'table_number': session.table_number,
                            'participant_count': 1
                        }
                    }
                )
            except Exception as e:
                logger.warning(f"Notification création session échouée: {e}")
            
            response_serializer = CollaborativeSessionSerializer(
                session,
                context={'request': request}
            )
            
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            logger.exception("Erreur lors de la création de la session")
            return Response({
                'error': 'Erreur lors de la création de la session',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Rejoindre une session avec un code",
        request=SessionJoinSerializer,
        responses={200: CollaborativeSessionSerializer}
    )
    @action(detail=False, methods=['post'])
    def join_session(self, request):
        """
        Permet à un utilisateur de rejoindre une session existante
        """
        serializer = SessionJoinSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        share_code = serializer.validated_data['share_code']

        try:
            session = CollaborativeTableSession.objects.get(
                share_code=share_code
            )
        except CollaborativeTableSession.DoesNotExist:
            return Response({
                'error': 'Session non trouvée',
                'code': 'SESSION_NOT_FOUND'
            }, status=status.HTTP_404_NOT_FOUND)

        # Vérifier que la session peut être rejointe
        if not session.can_join:
            return Response({
                'error': 'Cette session ne peut plus être rejointe',
                'status': session.status,
                'reason': self._get_cannot_join_reason(session)
            }, status=status.HTTP_400_BAD_REQUEST)

        # Vérifier si déjà participant
        if request.user.is_authenticated:
            existing = SessionParticipant.objects.filter(
                session=session,
                user=request.user
            ).first()
            if existing and existing.status == 'active':
                return Response({
                    'error': 'Vous êtes déjà dans cette session',
                    'participant': SessionParticipantSerializer(existing).data
                }, status=status.HTTP_400_BAD_REQUEST)

        # Créer le participant
        status_choice = 'pending' if session.require_approval else 'active'
        participant = SessionParticipant.objects.create(
            session=session,
            user=request.user if request.user.is_authenticated else None,
            guest_name=serializer.validated_data.get('guest_name', ''),
            guest_phone=serializer.validated_data.get('guest_phone', ''),
            notes=serializer.validated_data.get('notes', ''),
            status=status_choice,
            role='member'
        )

        # 🔔 Notifier les autres participants
        if status_choice == 'active':
            try:
                notify_participant_joined(
                    str(session.id),
                    SessionParticipantSerializer(participant).data
                )
            except Exception as e:
                logger.warning(f"Notification participant joined échouée: {e}")

        return Response({
            'message': 'Rejoint avec succès' if status_choice == 'active' else 'En attente d\'approbation',
            'participant': SessionParticipantSerializer(participant).data,
            'session': CollaborativeSessionSerializer(session, context={'request': request}).data,
            'requires_approval': session.require_approval
        }, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary="Quitter une session"
    )
    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """
        Permet à un participant de quitter la session
        """
        session = self.get_object()

        try:
            # Trouver le participant
            if request.user.is_authenticated:
                participant = SessionParticipant.objects.get(
                    session=session,
                    user=request.user
                )
            else:
                # Pour les invités, on peut utiliser un ID de participant
                participant_id = request.data.get('participant_id')
                if not participant_id:
                    return Response({
                        'error': 'participant_id requis'
                    }, status=status.HTTP_400_BAD_REQUEST)

                participant = SessionParticipant.objects.get(
                    session=session,
                    id=participant_id
                )

            # Vérifier que ce n'est pas l'hôte
            if participant.is_host:
                return Response({
                    'error': "L'hôte ne peut pas quitter la session. Annulez-la ou transférez le rôle d'hôte."
                }, status=status.HTTP_403_FORBIDDEN)

            # Marquer comme parti
            participant.status = 'left'
            participant.left_at = timezone.now()
            participant.save()

            # 🔔 Notifier
            try:
                notify_participant_left(str(session.id), str(participant.id))
            except Exception as e:
                logger.warning(f"Notification participant left échouée: {e}")

            return Response({
                'message': 'Vous avez quitté la session',
                'participant': SessionParticipantSerializer(participant).data
            })

        except SessionParticipant.DoesNotExist:
            return Response({
                'error': 'Participant non trouvé dans cette session'
            }, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Obtenir une session par son code"
    )
    @action(detail=False, methods=['get'])
    def get_by_code(self, request):
        """
        Récupère une session par son code de partage
        """
        share_code = request.query_params.get('share_code')
        if not share_code:
            return Response({
                'error': 'share_code requis'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = CollaborativeTableSession.objects.get(
                share_code=share_code
            )
            return Response(
                CollaborativeSessionSerializer(
                    session,
                    context={'request': request}
                ).data
            )
        except CollaborativeTableSession.DoesNotExist:
            return Response({
                'error': 'Session non trouvée'
            }, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Actions sur une session (lock, unlock, complete, cancel)"
    )
    @action(detail=True, methods=['post'])
    def session_action(self, request, pk=None):
        """
        Effectue une action sur la session
        AVEC archivage automatique après completion
        """
        session = self.get_object()
        serializer = SessionActionSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        action_type = serializer.validated_data['action']
        actor = self._actor_name(request)

        try:
            if action_type == 'lock':
                session.lock_session()
                message = 'Session verrouillée'
                
                # 🔔 Notifier
                try:
                    notify_session_locked(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification lock échouée: {e}")

            elif action_type == 'unlock':
                session.unlock_session()
                message = 'Session déverrouillée'
                
                # 🔔 Notifier
                try:
                    notify_session_unlocked(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification unlock échouée: {e}")

            elif action_type == 'complete':
                # Vérifier que toutes les commandes sont payées
                unpaid_orders = session.orders.exclude(
                    payment_status='paid'
                ).count()

                if unpaid_orders > 0:
                    return Response({
                        'error': f'{unpaid_orders} commande(s) non payée(s)',
                        'unpaid_count': unpaid_orders
                    }, status=status.HTTP_400_BAD_REQUEST)

                session.mark_completed()
                
                # 🔔 Notifier la completion
                try:
                    notify_session_completed(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification completion échouée: {e}")
                
                # 🆕 ARCHIVAGE AUTOMATIQUE PROGRAMMÉ
                # Programmer l'archivage dans 5 minutes
                try:
                    from celery import current_app
                    current_app.send_task(
                        'api.tasks.archive_session_delayed',
                        args=[str(session.id)],
                        countdown=300  # 5 minutes
                    )
                    logger.info(f"✅ Archivage programmé pour session {session.id} dans 5 minutes")
                except Exception as e:
                    logger.error(f"❌ Erreur programmation archivage: {e}")
                
                message = 'Session terminée (archivage automatique dans 5 minutes)'

            elif action_type == 'cancel':
                session.status = 'cancelled'
                session.save()
                
                # 🆕 Archiver immédiatement les sessions annulées
                try:
                    session.archive(reason="Session annulée par l'utilisateur")
                    
                    # 🔔 Notifier l'archivage
                    notify_session_archived(
                        str(session.id),
                        "Session annulée"
                    )
                except Exception as e:
                    logger.error(f"Erreur lors de l'archivage de session annulée: {e}")
                
                message = 'Session annulée et archivée'

            else:
                return Response({
                    'error': f'Action inconnue: {action_type}'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 🔔 Émettre une mise à jour générique
            self._notify_session_update(session, event=action_type, actor=actor)

            return Response({
                'message': message,
                'session': CollaborativeSessionSerializer(
                    session,
                    context={'request': request}
                ).data
            })

        except Exception as e:
            logger.exception("Erreur session_action")
            return Response({
                'error': "Erreur lors de l'action",
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Obtenir le résumé complet d'une session"
    )
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Retourne un résumé complet de la session avec toutes les commandes
        """
        session = self.get_object()

        # Récupérer toutes les commandes de la session
        orders = session.orders.select_related('participant').prefetch_related('items')

        # Calculer la répartition des paiements
        payment_breakdown = {}
        for participant in session.participants.filter(status='active'):
            participant_orders = orders.filter(participant=participant)
            total = participant_orders.aggregate(
                total=Sum('total_amount')
            )['total'] or 0

            payment_breakdown[str(participant.id)] = {
                'name': participant.display_name,
                'total': float(total),
                'orders_count': participant_orders.count(),
                'paid': participant_orders.filter(
                    payment_status='paid'
                ).count()
            }

        # Vérifier si on peut finaliser
        can_finalize = (
            session.status in ['active', 'locked'] and
            orders.exclude(payment_status='paid').count() == 0
        )

        # Statistiques
        stats = {
            'total_participants': session.participant_count,
            'total_orders': orders.count(),
            'total_amount': float(session.total_amount),
            'paid_orders': orders.filter(payment_status='paid').count(),
            'pending_orders': orders.filter(payment_status='unpaid').count(),
        }

        return Response({
            'session': CollaborativeSessionSerializer(
                session, 
                context={'request': request}
            ).data,
            'orders': SessionOrderSerializer(
                orders, 
                many=True, 
                context={'request': request}
            ).data,
            'payment_breakdown': payment_breakdown,
            'can_finalize': can_finalize,
            'stats': stats
        })

    @extend_schema(
        summary="Archiver manuellement une session"
    )
    @action(detail=True, methods=['post'])
    def archive_session(self, request, pk=None):
        """
        🆕 Archive manuellement une session (libère la table)
        Nécessite permissions (admin ou hôte)
        """
        session = self.get_object()
        reason = request.data.get('reason', 'Archivage manuel')
        
        # Vérifier les permissions (admin ou hôte)
        if not self._can_manage_session(request, session):
            return Response({
                'error': 'Non autorisé'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Vérifier que la session peut être archivée
        if not session.can_be_archived:
            return Response({
                'error': f'La session ne peut pas être archivée (statut: {session.status})',
                'hint': 'Seules les sessions completed ou cancelled peuvent être archivées'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if session.is_archived:
            return Response({
                'error': 'Session déjà archivée'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Archiver
        try:
            session.archive(reason=reason)
            
            # 🔔 Notifier
            notify_session_archived(str(session.id), reason)
            
            logger.info(f"✅ Session {session.id} archivée manuellement par {self._actor_name(request)}")
        except Exception as e:
            logger.error(f"Erreur lors de l'archivage: {e}")
            return Response({
                'error': 'Erreur lors de l\'archivage',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response({
            'message': 'Session archivée avec succès',
            'session': CollaborativeSessionSerializer(
                session,
                context={'request': request}
            ).data
        })

    # ==============================
    # Utilitaires de notification
    # ==============================
    def _actor_name(self, request):
        """Récupère le nom de l'acteur depuis la requête"""
        if request.user.is_authenticated:
            return getattr(request.user, 'username', None) or getattr(request.user, 'email', None) or f"User {request.user.id}"
        return 'Invité'

    def _notify_session_update(self, session, event='update', actor=None):
        """Émet une notification générique de mise à jour de session"""
        try:
            payload = {
                'event': event,
                'actor': actor,
                'session': CollaborativeSessionSerializer(session, context={'request': self.request}).data
            }
            notify_session_update(str(session.id), payload)
            logger.info(f"✅ Session update notified: {event} by {actor}")
        except Exception as e:
            logger.warning(f"⚠️ Notif session_update échouée: {e}")

    def _get_cannot_join_reason(self, session):
        """Retourne la raison pour laquelle on ne peut pas rejoindre"""
        if session.status == 'completed':
            return 'Session terminée'
        elif session.status == 'cancelled':
            return 'Session annulée'
        elif session.status == 'locked' and not session.allow_join_after_lock:
            return 'Session verrouillée'
        elif session.is_full:
            return 'Session complète'
        return 'Session non disponible'

    # ==============================
    # HELPER METHODS
    # ==============================
    def _can_manage_session(self, request, session):
        """Vérifie si l'utilisateur peut gérer la session"""
        # Super admin
        if request.user.is_staff:
            return True
        
        # Propriétaire du restaurant
        if hasattr(request.user, 'restaurateur_profile'):
            if session.restaurant in request.user.restaurateur_profile.restaurants.all():
                return True
        
        # Hôte de la session
        if request.user.is_authenticated and session.host == request.user:
            return True
        
        return False


class SessionParticipantViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet pour gérer les participants d'une session
    """
    serializer_class = SessionParticipantSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        """Filtrer les participants"""
        session_id = self.request.query_params.get('session_id')
        if session_id:
            return SessionParticipant.objects.filter(
                session_id=session_id
            ).select_related('user', 'session')
        return SessionParticipant.objects.none()

    @extend_schema(
        summary="Actions sur un participant (approve, reject, remove, make_host)"
    )
    @action(detail=True, methods=['post'])
    def participant_action(self, request, pk=None):
        """
        Effectue une action sur un participant
        Seul l'hôte peut effectuer ces actions
        """
        participant = self.get_object()
        session = participant.session

        # Vérifier que c'est l'hôte
        if request.user.is_authenticated:
            is_host = SessionParticipant.objects.filter(
                session=session,
                user=request.user,
                role='host'
            ).exists()
        else:
            is_host = False

        if not is_host:
            return Response({
                'error': "Seul l'hôte peut effectuer cette action"
            }, status=status.HTTP_403_FORBIDDEN)

        serializer = ParticipantActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        action_type = serializer.validated_data['action']

        try:
            actor = self._actor_name(request)
            if action_type == 'approve':
                participant.status = 'active'
                participant.save()
                try:
                    notify_participant_approved(
                        str(session.id),
                        SessionParticipantSerializer(participant).data
                    )
                except Exception as e:
                    logger.warning("Notif participant_approved échouée: %s", e)
                message = 'Participant approuvé'

            elif action_type == 'reject':
                participant.status = 'removed'
                participant.save()
                message = 'Participation rejetée'
                # Mise à jour générique
                self._notify_session_update(session, event='participant_rejected', actor=actor)

            elif action_type == 'remove':
                participant.status = 'removed'
                participant.left_at = timezone.now()
                participant.save()
                try:
                    notify_participant_left(str(session.id), str(participant.id))
                except Exception as e:
                    logger.warning("Notif participant_left (remove) échouée: %s", e)
                message = 'Participant retiré'

            elif action_type == 'make_host':
                # Retirer le rôle d'hôte à l'ancien hôte
                SessionParticipant.objects.filter(
                    session=session,
                    role='host'
                ).update(role='member')

                # Donner le rôle au nouveau
                participant.role = 'host'
                participant.save()

                session.host = participant.user
                session.save()

                message = 'Nouveau hôte désigné'
                self._notify_session_update(session, event='make_host', actor=participant.display_name)

            # 🔔 Synchroniser la session après action
            self._notify_session_update(session, event=action_type, actor=actor)

            return Response({
                'message': message,
                'participant': SessionParticipantSerializer(
                    participant,
                    context={'request': request}
                ).data
            })

        except Exception as e:
            logger.exception("Erreur participant_action")
            return Response({
                'error': "Erreur lors de l'action",
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ==============================
    # Utilitaires de notification
    # ==============================
    def _actor_name(self, request):
        if request.user.is_authenticated:
            return getattr(request.user, 'username', None) or getattr(request.user, 'email', None)
        return 'guest'

    def _notify_session_update(self, session, event='update', actor=None):
        """Émet une notification générique de mise à jour de session"""
        try:
            payload = {
                'event': event,
                'actor': actor,
                'session': CollaborativeSessionSerializer(session, context={'request': self.request}).data
            }
            notify_session_update(str(session.id), payload)
        except Exception as e:
            logger.warning("Notif session_update échouée: %s", e)