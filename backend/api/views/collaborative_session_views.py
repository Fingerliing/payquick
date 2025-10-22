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
    notify_session_update
)

import logging
logger = logging.getLogger(__name__)


class CollaborativeSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour gérer les sessions collaboratives de table
    """
    serializer_class = CollaborativeSessionSerializer
    permission_classes = [AllowAny]  # Les invités peuvent aussi utiliser

    def get_queryset(self):
        """Filtrer selon le contexte"""
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
        Crée une nouvelle session collaborative pour une table
        """
        serializer = SessionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, 
                status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data

        try:
            restaurant = Restaurant.objects.get(id=data['restaurant_id'])
            table = None
            if data.get('table_id'):
                table = Table.objects.get(id=data['table_id'])

            # Vérifier s'il existe déjà une session active pour cette table
            existing_session = CollaborativeTableSession.objects.filter(
                restaurant=restaurant,
                table_number=data['table_number'],
                status__in=['active', 'locked']
            ).first()

            if existing_session:
                return Response({
                    'error': 'Une session est déjà active pour cette table',
                    'existing_session': {
                        'id': str(existing_session.id),
                        "share_code": existing_session.share_code,
                        'can_join': existing_session.can_join
                    }
                }, status=status.HTTP_409_CONFLICT)

            # Créer la session
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

            # 🔔 Notifier la création / mise à jour de session
            self._notify_session_update(session, event='created', actor=self._actor_name(request))

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
        Permet à un utilisateur de rejoindre une session via le code de partage
        """
        serializer = SessionJoinSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, 
                status=status.HTTP_400_BAD_REQUEST
            )

        share_code = serializer.validated_data['share_code'].upper()

        try:
            session = CollaborativeTableSession.objects.get(share_code=share_code)

            # Vérifier si l'utilisateur a déjà rejoint
            if request.user.is_authenticated:
                existing_participant = SessionParticipant.objects.filter(
                    session=session,
                    user=request.user
                ).first()

                if existing_participant:
                    if existing_participant.status == 'active':
                        return Response({
                            'message': 'Vous avez déjà rejoint cette session',
                            'session': CollaborativeSessionSerializer(
                                session, 
                                context={'request': request}
                            ).data
                        })
                    else:
                        # Réactiver la participation
                        existing_participant.status = 'active'
                        existing_participant.save()

                        # 🔔 Notifier réactivation (rejoint)
                        try:
                            notify_participant_joined(
                                str(session.id),
                                SessionParticipantSerializer(existing_participant).data
                            )
                        except Exception as e:
                            logger.warning("Notif participant_joined (reactivate) échouée: %s", e)

                        return Response({
                            'message': 'Vous avez rejoint la session',
                            'session': CollaborativeSessionSerializer(
                                session, 
                                context={'request': request}
                            ).data
                        })

            # Créer nouveau participant
            participant_status = 'pending' if session.require_approval else 'active'

            participant = SessionParticipant.objects.create(
                session=session,
                user=request.user if request.user.is_authenticated else None,
                guest_name=serializer.validated_data.get('guest_name', ''),
                guest_phone=serializer.validated_data.get('guest_phone', ''),
                status=participant_status,
                notes=serializer.validated_data.get('notes', '')
            )

            # 🔔 Notifications
            try:
                # On notifie l'arrivée dans tous les cas (même pending)
                notify_participant_joined(
                    str(session.id),
                    SessionParticipantSerializer(participant).data
                )
                if participant_status == 'pending':
                    # Une mise à jour générique pour que l'hôte voie la demande
                    self._notify_session_update(session, event='join_request', actor=self._actor_name(request))
            except Exception as e:
                logger.warning("Notif participant_joined échouée: %s", e)

            message = (
                "Demande envoyée. En attente d'approbation de l'hôte."
                if participant_status == 'pending'
                else 'Vous avez rejoint la session avec succès !'
            )

            return Response({
                'message': message,
                'participant_id': str(participant.id),
                'requires_approval': session.require_approval,
                'session': CollaborativeSessionSerializer(
                    session, 
                    context={'request': request}
                ).data
            })

        except CollaborativeTableSession.DoesNotExist:
            return Response({
                'error': 'Code de session invalide'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Erreur join_session")
            return Response({
                'error': 'Erreur lors de la connexion à la session',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Obtenir les détails d'une session par code",
        parameters=[
            OpenApiParameter('share_code', str, required=True)
        ]
    )
    @action(detail=False, methods=['get'])
    def get_by_code(self, request):
        """
        Récupère une session par son code de partage (sans la rejoindre)
        """
        share_code = request.query_params.get('share_code', '').upper()

        if not share_code:
            return Response({
                'error': 'Le code de partage est requis'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = CollaborativeTableSession.objects.get(share_code=share_code)

            serializer = CollaborativeSessionSerializer(
                session,
                context={'request': request}
            )

            return Response(serializer.data)

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
        Effectue une action sur la session (verrouiller, terminer, etc.)
        Seul l'hôte peut effectuer ces actions
        """
        session = self.get_object()

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

        serializer = SessionActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        action_type = serializer.validated_data['action']

        try:
            actor = self._actor_name(request)
            if action_type == 'lock':
                session.lock_session()
                try:
                    notify_session_locked(str(session.id), actor)
                except Exception as e:
                    logger.warning("Notif session_locked échouée: %s", e)
                message = 'Session verrouillée'

            elif action_type == 'unlock':
                session.unlock_session()
                try:
                    notify_session_unlocked(str(session.id))
                except Exception as e:
                    logger.warning("Notif session_unlocked échouée: %s", e)
                message = 'Session déverrouillée'

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
                try:
                    notify_session_completed(str(session.id))
                except Exception as e:
                    logger.warning("Notif session_completed échouée: %s", e)
                message = 'Session terminée'

            elif action_type == 'cancel':
                session.status = 'cancelled'
                session.save()
                message = 'Session annulée'

            # 🔔 Émettre une mise à jour générique pour synchroniser les UIs
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
                }, status=status.HTTP_400_BAD_REQUEST)

            # Vérifier qu'il n'y a pas de commandes impayées
            unpaid_orders = Order.objects.filter(
                collaborative_session=session,
                participant=participant,
                payment_status__in=['unpaid', 'pending']
            ).count()

            if unpaid_orders > 0:
                return Response({
                    'error': f'Vous avez {unpaid_orders} commande(s) non payée(s)',
                    'unpaid_count': unpaid_orders
                }, status=status.HTTP_400_BAD_REQUEST)

            participant_id_str = str(participant.id)
            participant_name = participant.display_name
            participant.leave_session()

            # 🔔 Notifier départ
            try:
                notify_participant_left(str(session.id), participant_id_str)
                self._notify_session_update(session, event='participant_left', actor=participant_name)
            except Exception as e:
                logger.warning("Notif participant_left échouée: %s", e)

            return Response({
                'message': 'Vous avez quitté la session'
            })

        except SessionParticipant.DoesNotExist:
            return Response({
                'error': 'Vous ne faites pas partie de cette session'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Erreur leave")
            return Response({
                'error': 'Erreur lors de la sortie de session',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
