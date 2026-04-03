from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum, Count, Prefetch
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.utils import extend_schema, OpenApiParameter

from api.models import (
    CollaborativeTableSession, SessionParticipant,
    Order, Restaurant, Table, SessionCartItem
)
from api.serializers.collaborative_session_serializers import (
    CollaborativeSessionSerializer,
    SessionCreateSerializer,
    SessionJoinSerializer,
    SessionParticipantSerializer,
    SessionActionSerializer,
    ParticipantActionSerializer,
    SessionCartItemSerializer,
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

from django.core.cache import cache

import logging
logger = logging.getLogger(__name__)


class CollaborativeSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour gérer les sessions collaboratives de table
    AVEC archivage automatique
    """
    serializer_class = CollaborativeSessionSerializer

    def get_permissions(self):
        """
        Permissions dynamiques selon l'action.

        create_session / join_session / get_by_code : AllowAny
            → un guest sans compte doit pouvoir créer ou rejoindre une session
              via le QR code de la table.

        Toutes les autres actions (list, retrieve, update, partial_update,
        destroy, session_action, leave, summary, archive_session, cart, …) :
        IsAuthenticated.
            → évite que le ModelViewSet par défaut expose un CRUD anonyme
              sur l'intégralité des sessions.
        """
        public_actions = {
            'create_session', 'join_session', 'get_by_code',
            # Les guests (sans JWT) doivent pouvoir accéder au panier partagé.
            # L'identité du participant est vérifiée dans _get_current_participant
            # via le header X-Participant-ID (chemin guest) ou le JWT (chemin auth).
            'cart', 'cart_add', 'cart_update_item', 'cart_remove_item', 'cart_clear',
        }
        if self.action in public_actions:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """
        Filtrer selon le contexte.

        La restriction d'accès aux anonymes est assurée par get_permissions()
        (IsAuthenticated). get_queryset() ne court-circuite PAS sur
        is_authenticated car DRF évalue get_object() → get_queryset() AVANT
        d'évaluer les permissions sur les actions de détail, ce qui produirait
        un 404 au lieu du 401 attendu.

        Pour les anonymes qui passent par les actions publiques
        (create_session, join_session, get_by_code), get_queryset n'est pas
        appelé : ces méthodes font leurs propres lookups directs.
        """
        # Pour les actions panier (AllowAny), un guest non authentifié doit
        # pouvoir résoudre l'objet session via get_object(). On retourne le
        # queryset complet ; l'autorisation réelle est déléguée à
        # _get_current_participant() (vérification par X-Participant-ID).
        CART_ACTIONS = {'cart', 'cart_add', 'cart_update_item', 'cart_remove_item', 'cart_clear'}
        if self.action in CART_ACTIONS and not self.request.user.is_authenticated:
            return CollaborativeTableSession.objects.select_related(
                'restaurant', 'table'
            ).all()

        if not self.request.user.is_authenticated:
            return CollaborativeTableSession.objects.none()

        return CollaborativeTableSession.objects.select_related(
            'restaurant', 'table'
        ).prefetch_related(
            Prefetch('participants', queryset=SessionParticipant.objects.filter(
                status__in=['active', 'pending']
            ).order_by('joined_at'))
        ).filter(
            Q(participants__user=self.request.user,
              participants__status__in=['active', 'pending']) |
            Q(host=self.request.user)
        ).distinct().order_by('-created_at')

    # ── Issue 1 fix: bloquer PATCH/PUT pour les non-hôtes ────────────────────
    # ModelViewSet expose update/partial_update par défaut avec IsAuthenticated.
    # N'importe quel participant pourrait modifier status, require_approval,
    # max_participants, restaurant, table, etc. On exige _can_manage_session.

    def update(self, request, *args, **kwargs):
        session = self.get_object()
        if not self._can_manage_session(request, session):
            return Response(
                {'error': 'Seul l\'hôte ou le restaurateur peut modifier la session.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        session = self.get_object()
        if not self._can_manage_session(request, session):
            return Response(
                {'error': 'Seul l\'hôte ou le restaurateur peut modifier la session.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        session = self.get_object()
        if not self._can_manage_session(request, session):
            return Response(
                {'error': 'Seul l\'hôte ou le restaurateur peut supprimer la session.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

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
        # ── Rate limiting DoS ─────────────────────────────────────────────────
        # Deux niveaux indépendants :
        #   1. Par IP     : max 5 créations / 10 min  (scripts automatisés)
        #   2. Par table  : max 3 créations / heure   (ciblage d'une table, même
        #                                               avec rotation d'IP)
        # Les compteurs sont incrémentés uniquement après une création réussie
        # pour ne pas pénaliser les erreurs de validation légitimes.
        raw_table_key = request.data.get('table_id') or request.data.get('table_number', '')
        rate_limit_error = self._check_create_session_rate_limits(request, raw_table_key)
        if rate_limit_error is not None:
            return rate_limit_error

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

            # DÉTECTION DE CONFLITS - Vérifier sessions actives sur cette table
            existing_active_sessions = CollaborativeTableSession.objects.filter(
                table_id=data.get('table_id'),
                table_number=data['table_number'],
                status__in=['active', 'locked', 'payment'],
                is_archived=False  # Important: exclure les archivées
            )

            STALE_SESSION_MINUTES = 5

            if existing_active_sessions.exists():
                existing = existing_active_sessions.first()
                stale_threshold = timezone.now() - timedelta(minutes=STALE_SESSION_MINUTES)

                if existing.status == 'completed':
                    # Session terminée mais pas encore archivée → archivage immédiat
                    existing.archive(reason="Nouvelle session créée sur la même table")
                    logger.info(
                        f"Session {existing.id} (completed) archivée automatiquement "
                        f"(nouvelle session sur table {data['table_number']})"
                    )

                elif existing.updated_at < stale_threshold:
                    # Session active/locked mais abandonnée sans activité
                    # → archivage silencieux, on ne bloque pas la création
                    CollaborativeTableSession.objects.filter(id=existing.id).update(
                        status='cancelled'
                    )
                    existing.refresh_from_db()
                    existing.archive(reason=f"Session abandonnée (inactivité >{STALE_SESSION_MINUTES}min)")
                    logger.info(
                        f"Session {existing.id} ({existing.status}) archivée automatiquement "
                        f"— inactivité depuis {existing.updated_at} "
                        f"(nouvelle session sur table {data['table_number']})"
                    )
                    try:
                        notify_session_archived(
                            session_id=str(existing.id),
                            reason="Session abandonnée remplacée par une nouvelle"
                        )
                    except Exception as e:
                        logger.warning(f"Notification WebSocket échouée pour {existing.id}: {e}")

                else:
                    # Session vraiment active et récente → conflit légitime.
                    # SÉCURITÉ : ne pas exposer le share_code (secret de jointure)
                    # à un appelant non authentifié.
                    return Response({
                        'error': 'Session active existante',
                        'conflict': True,
                        'existing_session': {
                            'id': str(existing.id),
                            # share_code intentionnellement absent
                            'status': existing.status,
                            'participant_count': existing.participant_count,
                            'created_at': existing.created_at,
                            'last_activity': existing.updated_at,
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

            # Incrémenter les compteurs de rate limiting après une création réussie
            self._increment_create_session_counters(request, raw_table_key)

            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )

        except Exception as e:
            logger.exception("Erreur lors de la création de la session")
            return Response({
                'error': 'Erreur lors de la création de la session.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Rejoindre une session avec un code",
        request=SessionJoinSerializer,
        responses={200: CollaborativeSessionSerializer}
    )
    @action(detail=False, methods=['post'])
    def join_session(self, request):
        """
        Permet à un utilisateur de rejoindre une session existante.

        Trois cas :
        1. Déjà participant actif → réponse 200 sans modifier l'état.
        2. Participant existant mais inactif (left/rejected/…) → réactivation.
        3. Nouvel arrivant (authentifié ou guest) → création du participant.
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

        # Chercher un participant existant pour les utilisateurs authentifiés.
        # Initialisation explicite à None pour couvrir le cas guest (non authentifié).
        existing = None
        if request.user.is_authenticated:
            existing = SessionParticipant.objects.filter(
                session=session,
                user=request.user
            ).first()

        if existing:
            if existing.status == 'active':
                # Cas 1 : déjà dans la session
                return Response({
                    'message': 'Déjà dans la session',
                    'participant': SessionParticipantSerializer(existing).data,
                    'session': CollaborativeSessionSerializer(
                        session, context={'request': request}
                    ).data,
                    'requires_approval': False,
                    'participant_id': str(existing.id),
                }, status=status.HTTP_200_OK)
            else:
                # Cas 2 : participant inactif → réactivation
                existing.status = 'active' if not session.require_approval else 'pending'
                existing.left_at = None
                existing.save()
                participant = existing
                status_choice = existing.status
                try:
                    if status_choice == 'active':
                        notify_participant_joined(
                            str(session.id),
                            SessionParticipantSerializer(participant).data
                        )
                except Exception as e:
                    logger.warning(f"Notification rejoin échouée: {e}")
                return Response({
                    'message': 'Rejoint à nouveau avec succès',
                    'participant': SessionParticipantSerializer(participant).data,
                    'session': CollaborativeSessionSerializer(
                        session, context={'request': request}
                    ).data,
                    'requires_approval': session.require_approval,
                    'participant_id': str(participant.id),
                }, status=status.HTTP_200_OK)
        else:
            # Cas 3 : nouvel arrivant (authentifié ou guest)
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

            # 🔔 Notifier selon le statut
            try:
                if status_choice == 'active':
                    notify_participant_joined(
                        str(session.id),
                        SessionParticipantSerializer(participant).data
                    )
                else:
                    # Participant en attente → notifier l'hôte via session_update
                    notify_session_update(
                        str(session.id),
                        {
                            'event': 'participant_pending',
                            'actor': serializer.validated_data.get('guest_name', 'Inconnu'),
                            'data': {
                                'participant': SessionParticipantSerializer(participant).data,
                                'pending_count': SessionParticipant.objects.filter(
                                    session=session,
                                    status='pending'
                                ).count()
                            }
                        }
                    )
            except Exception as e:
                logger.warning(f"Notification participant joined/pending échouée: {e}")

            return Response({
                'message': (
                    'Rejoint avec succès'
                    if status_choice == 'active'
                    else "En attente d'approbation"
                ),
                'participant': SessionParticipantSerializer(participant).data,
                'participant_id': str(participant.id),
                'session': CollaborativeSessionSerializer(
                    session, context={'request': request}
                ).data,
                'requires_approval': session.require_approval
            }, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Quitter une session")
    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """
        Permet à un participant de quitter la session.
        - Si l'hôte est le seul participant restant : la session est auto-annulée.
        - Si après le départ plus aucun actif : la session est auto-annulée.
        """
        try:
            session = CollaborativeTableSession.objects.get(pk=pk)
        except CollaborativeTableSession.DoesNotExist:
            return Response({'error': 'Session introuvable'}, status=status.HTTP_404_NOT_FOUND)

        try:
            if request.user.is_authenticated:
                participant = SessionParticipant.objects.get(
                    session=session,
                    user=request.user
                )
            else:
                participant_id = request.data.get('participant_id')
                if not participant_id:
                    return Response(
                        {'error': 'participant_id requis'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                participant = SessionParticipant.objects.get(
                    session=session,
                    id=participant_id
                )

            # Si l'hôte veut partir, on vérifie s'il est seul
            if participant.is_host:
                remaining_members = session.participants.filter(
                    status='active',
                    role='member'
                ).count()
                if remaining_members > 0:
                    return Response({
                        'error': (
                            "L'hôte ne peut pas quitter une session avec des participants actifs. "
                            "Annulez-la, transférez le rôle d'hôte, ou attendez que tout le monde parte."
                        )
                    }, status=status.HTTP_403_FORBIDDEN)

            # Marquer comme parti
            participant.status = 'left'
            participant.left_at = timezone.now()
            participant.save()

            # 🔔 Notifier le départ
            try:
                notify_participant_left(str(session.id), str(participant.id))
            except Exception as e:
                logger.warning(f"Notification participant left échouée: {e}")

            # ── Auto-annulation si plus personne d'actif ──────────────────────
            remaining_active = session.participants.filter(status='active').count()
            session_auto_cancelled = False

            if remaining_active == 0 and session.status in ['active', 'locked']:
                CollaborativeTableSession.objects.filter(id=session.id).update(
                    status='cancelled'
                )
                session.refresh_from_db()
                session_auto_cancelled = True
                logger.info(
                    f"Session {session.id} auto-annulée : plus aucun participant actif"
                )
                try:
                    notify_session_completed(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification auto-cancel échouée: {e}")

            return Response({
                'message': 'Vous avez quitté la session',
                'participant': SessionParticipantSerializer(participant).data,
                'session_auto_cancelled': session_auto_cancelled,
            })

        except SessionParticipant.DoesNotExist:
            return Response(
                {'error': 'Participant non trouvé dans cette session'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(summary="Obtenir une session par son code")
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

        if not self._can_manage_session(request, session):
            return Response(
                {'error': "Seul l'hôte ou le restaurateur peut effectuer cette action."},
                status=status.HTTP_403_FORBIDDEN
            )

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
                try:
                    notify_session_locked(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification lock échouée: {e}")

            elif action_type == 'unlock':
                session.unlock_session()
                message = 'Session déverrouillée'
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
                try:
                    notify_session_completed(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification completion échouée: {e}")

                # Programmer l'archivage dans 5 minutes
                try:
                    from celery import current_app
                    current_app.send_task(
                        'api.tasks.archive_session_delayed',
                        args=[str(session.id)],
                        countdown=300
                    )
                    logger.info(f"✅ Archivage programmé pour session {session.id} dans 5 minutes")
                except Exception as e:
                    logger.error(f"❌ Erreur programmation archivage: {e}")

                message = 'Session terminée (archivage automatique dans 5 minutes)'

            elif action_type == 'cancel':
                session.status = 'cancelled'
                session.save()
                try:
                    session.archive(reason="Session annulée par l'utilisateur")
                    notify_session_archived(str(session.id), "Session annulée")
                except Exception as e:
                    logger.error(f"Erreur lors de l'archivage de session annulée: {e}")
                message = 'Session annulée et archivée'

            elif action_type == 'payment':
                # Passage en mode paiement — _notify_session_update ci-dessous
                # émet event='payment' à tous les participants via WS.
                session.status = 'payment'
                session.save(update_fields=['status'])
                message = 'Session en cours de paiement'

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
                'error': "Erreur lors de l'action."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Obtenir le résumé complet d'une session")
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Retourne un résumé complet de la session avec toutes les commandes
        """
        session = self.get_object()
        orders = session.orders.select_related('participant').prefetch_related('items')

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
                'paid': participant_orders.filter(payment_status='paid').count()
            }

        can_finalize = (
            session.status in ['active', 'locked'] and
            orders.exclude(payment_status='paid').count() == 0
        )

        stats = {
            'total_participants': session.participant_count,
            'total_orders': orders.count(),
            'total_amount': float(session.total_amount),
            'paid_orders': orders.filter(payment_status='paid').count(),
            'pending_orders': orders.filter(payment_status='unpaid').count(),
        }

        return Response({
            'session': CollaborativeSessionSerializer(
                session, context={'request': request}
            ).data,
            'orders': SessionOrderSerializer(
                orders, many=True, context={'request': request}
            ).data,
            'payment_breakdown': payment_breakdown,
            'can_finalize': can_finalize,
            'stats': stats
        })

    @extend_schema(summary="Archiver manuellement une session")
    @action(detail=True, methods=['post'])
    def archive_session(self, request, pk=None):
        """
        Archive manuellement une session (libère la table).
        Nécessite permissions (admin ou hôte).
        """
        session = self.get_object()
        reason = request.data.get('reason', 'Archivage manuel')

        if not self._can_manage_session(request, session):
            return Response({
                'error': 'Non autorisé'
            }, status=status.HTTP_403_FORBIDDEN)

        if not session.can_be_archived:
            return Response({
                'error': f'La session ne peut pas être archivée (statut: {session.status})',
                'hint': 'Seules les sessions completed ou cancelled peuvent être archivées'
            }, status=status.HTTP_400_BAD_REQUEST)

        if session.is_archived:
            return Response({
                'error': 'Session déjà archivée'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            session.archive(reason=reason)
            notify_session_archived(str(session.id), reason)
            logger.info(f"✅ Session {session.id} archivée manuellement par {self._actor_name(request)}")
        except Exception as e:
            logger.error(f"Erreur lors de l'archivage: {e}")
            return Response({
                'error': "Erreur lors de l'archivage."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'message': 'Session archivée avec succès',
            'session': CollaborativeSessionSerializer(
                session, context={'request': request}
            ).data
        })

    # ── Panier partagé ────────────────────────────────────────────────────────

    @action(detail=True, methods=['get'])
    def cart(self, request, pk=None):
        """
        GET /api/sessions/{id}/cart/
        Retourne le panier partagé complet de la session.
        """
        session = self.get_object()
        items = session.cart_items.select_related('participant', 'menu_item')
        serializer = SessionCartItemSerializer(items, many=True)
        items_data = list(serializer.data)
        total = float(sum(float(item.get('total_price', 0)) for item in items_data))
        return Response({
            'items': items_data,
            'total': total,
            'items_count': sum(int(item.get('quantity', 0)) for item in items_data),
        })

    @action(detail=True, methods=['post'])
    def cart_add(self, request, pk=None):
        """
        POST /api/sessions/{id}/cart_add/
        Ajoute un article au panier partagé.
        """
        session = self.get_object()
        participant = self._get_current_participant(request, session)
        if not participant:
            return Response(
                {'error': 'Participant introuvable dans cette session'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = SessionCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        menu_item = serializer.validated_data['menu_item']
        instructions = serializer.validated_data.get('special_instructions', '')

        existing_item = session.cart_items.filter(
            participant=participant,
            menu_item=menu_item,
            special_instructions=instructions,
        ).first()

        if existing_item:
            existing_item.quantity += serializer.validated_data.get('quantity', 1)
            existing_item.customizations = {
                **existing_item.customizations,
                **serializer.validated_data.get('customizations', {})
            }
            existing_item.save()
            item = existing_item
        else:
            item = SessionCartItem.objects.create(
                session=session,
                participant=participant,
                **serializer.validated_data
            )

        _broadcast_cart_update(session)
        return Response(
            SessionCartItemSerializer(item).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['patch'], url_path=r'cart_update/(?P<item_id>[^/.]+)')
    def cart_update_item(self, request, pk=None, item_id=None):
        """
        PATCH /api/sessions/{id}/cart_update/{item_id}/
        Met à jour la quantité ou les instructions d'un article.
        """
        session = self.get_object()
        participant = self._get_current_participant(request, session)

        try:
            item = session.cart_items.get(id=item_id, participant=participant)
        except SessionCartItem.DoesNotExist:
            return Response(
                {'error': 'Article introuvable'},
                status=status.HTTP_404_NOT_FOUND
            )

        quantity = request.data.get('quantity')
        if quantity is not None:
            if int(quantity) <= 0:
                item.delete()
                _broadcast_cart_update(session)
                return Response(status=status.HTTP_204_NO_CONTENT)
            item.quantity = int(quantity)

        if 'special_instructions' in request.data:
            item.special_instructions = request.data['special_instructions']
        if 'customizations' in request.data:
            item.customizations = request.data['customizations']

        item.save()
        _broadcast_cart_update(session)
        return Response(SessionCartItemSerializer(item).data)

    @action(detail=True, methods=['delete'], url_path=r'cart_remove/(?P<item_id>[^/.]+)')
    def cart_remove_item(self, request, pk=None, item_id=None):
        """
        DELETE /api/sessions/{id}/cart_remove/{item_id}/
        Supprime un article du panier partagé.
        """
        session = self.get_object()
        participant = self._get_current_participant(request, session)

        try:
            item = session.cart_items.get(id=item_id, participant=participant)
        except SessionCartItem.DoesNotExist:
            return Response(
                {'error': 'Article introuvable'},
                status=status.HTTP_404_NOT_FOUND
            )

        item.delete()
        _broadcast_cart_update(session)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['delete'])
    def cart_clear(self, request, pk=None):
        """
        DELETE /api/sessions/{id}/cart_clear/
        Vide les articles du participant courant dans le panier partagé.
        """
        session = self.get_object()
        participant = self._get_current_participant(request, session)
        session.cart_items.filter(participant=participant).delete()
        _broadcast_cart_update(session)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Utilitaires ───────────────────────────────────────────────────────────

    def _actor_name(self, request):
        """Récupère le nom de l'acteur depuis la requête"""
        if request.user.is_authenticated:
            return (
                getattr(request.user, 'username', None)
                or getattr(request.user, 'email', None)
                or f"User {request.user.id}"
            )
        return 'Invité'

    def _notify_session_update(self, session, event='update', actor=None):
        """Émet une notification générique de mise à jour de session"""
        try:
            payload = {
                'event': event,
                'actor': actor,
                'session': CollaborativeSessionSerializer(
                    session, context={'request': self.request}
                ).data
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

    def _can_manage_session(self, request, session):
        """Vérifie si l'utilisateur peut gérer la session (hôte ou restaurateur)"""
        if not request.user.is_authenticated:
            return False
        if request.user.is_staff:
            return True
        if hasattr(request.user, 'restaurateur_profile'):
            if session.restaurant in request.user.restaurateur_profile.restaurants.all():
                return True
        if session.host == request.user:
            return True
        return False

    # ── Rate limiting pour create_session ─────────────────────────────────────

    # Limites configurables
    _IP_RATE_LIMIT = 5       # créations max par IP
    _IP_RATE_WINDOW = 600    # fenêtre IP : 10 minutes
    _TABLE_RATE_LIMIT = 3    # créations max par table
    _TABLE_RATE_WINDOW = 3600  # fenêtre table : 60 minutes

    def _get_client_ip(self, request):
        """
        Récupère l'IP cliente réelle.
        En production derrière un reverse-proxy de confiance (nginx, ALB…),
        X-Forwarded-For est fiable. En dehors d'un proxy de confiance, ce
        header peut être forgé — à sécuriser côté infra si nécessaire.
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '0.0.0.0')

    def _check_create_session_rate_limits(self, request, table_key_raw):
        """
        Vérifie les deux niveaux de rate limiting.
        Retourne une Response 429 si une limite est atteinte, None sinon.
        """
        client_ip = self._get_client_ip(request)
        ip_cache_key = f'session_create_ip:{client_ip}'
        table_cache_key = f'session_create_table:{table_key_raw}'

        ip_count = cache.get(ip_cache_key, 0)
        if ip_count >= self._IP_RATE_LIMIT:
            logger.warning(
                f"create_session rate limit IP dépassé : {client_ip} "
                f"({ip_count} tentatives)"
            )
            return Response(
                {'error': 'Trop de tentatives. Réessayez dans quelques minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        table_count = cache.get(table_cache_key, 0)
        if table_count >= self._TABLE_RATE_LIMIT:
            logger.warning(
                f"create_session rate limit table dépassé : table_key={table_key_raw} "
                f"({table_count} créations dans la dernière heure)"
            )
            return Response(
                {
                    'error': (
                        'Cette table a fait l\'objet de trop de créations de session '
                        'récentes. Contactez le personnel du restaurant si le problème '
                        'persiste.'
                    )
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        return None

    def _increment_create_session_counters(self, request, table_key_raw):
        """
        Incrémente les compteurs de rate limiting après une création réussie.
        Utilise cache.add() pour initialiser avec TTL si la clé n'existe pas,
        puis cache.incr() sinon (pattern Django standard).
        """
        client_ip = self._get_client_ip(request)
        ip_cache_key = f'session_create_ip:{client_ip}'
        table_cache_key = f'session_create_table:{table_key_raw}'

        for key, window in [
            (ip_cache_key, self._IP_RATE_WINDOW),
            (table_cache_key, self._TABLE_RATE_WINDOW),
        ]:
            try:
                # add() retourne True si la clé n'existait pas (la crée avec TTL)
                # retourne False si elle existait déjà (on incrémente)
                if not cache.add(key, 1, window):
                    cache.incr(key)
            except Exception as e:
                # Ne pas bloquer la création si le cache est indisponible
                logger.warning(f"Erreur rate limit cache ({key}): {e}")

    def _get_current_participant(self, request, session):
        """
        Récupère le participant actif de la session pour l'appelant courant.

        Chemin 1 — utilisateur authentifié (JWT valide) :
            Résolution par user FK sur SessionParticipant.

        Chemin 2 — identification via header X-Participant-ID :
            Utilisé par les guests (user=None) ET par les participants
            authentifiés dont le JWT est absent (token expiré, autre appareil).
            Sécurité : l'UUID 128-bit est non-devinable ; on vérifie que le
            participant appartient bien à cette session et est actif.
        """
        # Chemin 1 : utilisateur authentifié
        if request.user and request.user.is_authenticated:
            participant = session.participants.filter(
                user=request.user,
                status='active'
            ).first()
            if participant:
                return participant

        # Chemin 2 : identification via header X-Participant-ID
        participant_id = (
            request.headers.get('X-Participant-ID', '').strip()
            or str(request.data.get('participant_id', '')).strip()
        )
        if participant_id:
            return session.participants.filter(
                id=participant_id,
                status='active'
            ).first()

        return None


# ─── Fonction utilitaire au niveau module ─────────────────────────────────────

def _broadcast_cart_update(session):
    """
    Broadcast l'état complet du panier à tous les participants via WS.
    Définie au niveau module pour être accessible depuis les méthodes
    de CollaborativeSessionViewSet via le scope global Python (LEGB).
    """
    import json
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    from api.serializers.collaborative_session_serializers import SessionCartItemSerializer

    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("_broadcast_cart_update: channel layer indisponible")
        return

    try:
        # Reset inactivity timer — toute activité panier maintient la session vivante
        CollaborativeTableSession.objects.filter(id=session.id).update(updated_at=timezone.now())

        items = session.cart_items.select_related(
            'participant', 'participant__user', 'menu_item'
        ).all()
        serializer = SessionCartItemSerializer(items, many=True)
        items_data = json.loads(json.dumps(list(serializer.data), default=str))
        total = float(sum(float(item.get('total_price', 0)) for item in items_data))
        items_count = sum(int(item.get('quantity', 0)) for item in items_data)

        async_to_sync(channel_layer.group_send)(
            f'session_{session.id}',
            {
                'type': 'cart_updated',
                'items': items_data,
                'total': total,
                'items_count': items_count,
            }
        )
    except Exception as exc:
        logger.error(f"_broadcast_cart_update failed (session {session.id}): {exc}")


class SessionParticipantViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet pour gérer les participants d'une session.
    Accès restreint aux sessions dont l'utilisateur est membre ou hôte.
    """
    serializer_class = SessionParticipantSerializer
    permission_classes = [IsAuthenticated]

    def _get_user_session_ids(self):
        """Sessions auxquelles l'utilisateur courant appartient (hôte ou participant)."""
        user = self.request.user
        return CollaborativeTableSession.objects.filter(
            Q(participants__user=user,
              participants__status__in=['active', 'pending']) |
            Q(host=user)
        ).values_list('id', flat=True)

    def get_queryset(self):
        """
        Filtre les participants aux seules sessions de l'utilisateur courant.

        Avant le fix : get_queryset() retournait tous les participants
        globalement (pour les actions de détail) ou de n'importe quelle
        session par session_id, sans vérifier l'appartenance.
        Tout utilisateur authentifié pouvait énumérer les participants
        de n'importe quelle session en connaissant session_id ou pk.
        """
        user_session_ids = self._get_user_session_ids()

        if self.kwargs.get('pk'):
            # retrieve / participant_action : limiter aux sessions de l'utilisateur
            return SessionParticipant.objects.select_related(
                'user', 'session'
            ).filter(session_id__in=user_session_ids)

        session_id = self.request.query_params.get('session_id')
        if session_id:
            return SessionParticipant.objects.filter(
                session_id=session_id,
                session_id__in=user_session_ids
            ).select_related('user', 'session')

        return SessionParticipant.objects.none()

    @extend_schema(
        summary="Actions sur un participant (approve, reject, remove, make_host)"
    )
    @action(detail=True, methods=['post'])
    def participant_action(self, request, pk=None):
        """
        Effectue une action sur un participant.
        Seul l'hôte peut effectuer ces actions.
        """
        participant = self.get_object()
        session = participant.session

        is_host = False
        if request.user.is_authenticated:
            is_host = SessionParticipant.objects.filter(
                session=session,
                user=request.user,
                role='host'
            ).exists()

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
                self._notify_session_update(session, event='participant_rejected', actor=actor)
                return Response({
                    'message': message,
                    'participant': SessionParticipantSerializer(
                        participant, context={'request': request}
                    ).data
                })

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
                SessionParticipant.objects.filter(
                    session=session,
                    role='host'
                ).update(role='member')
                participant.role = 'host'
                participant.save()
                session.host = participant.user
                session.save()
                message = 'Nouveau hôte désigné'
                self._notify_session_update(
                    session, event='make_host', actor=participant.display_name
                )
                return Response({
                    'message': message,
                    'participant': SessionParticipantSerializer(
                        participant, context={'request': request}
                    ).data
                })

            self._notify_session_update(session, event=action_type, actor=actor)

            return Response({
                'message': message,
                'participant': SessionParticipantSerializer(
                    participant, context={'request': request}
                ).data
            })

        except Exception as e:
            logger.exception("Erreur participant_action")
            return Response({
                'error': "Erreur lors de l'action."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
                'session': CollaborativeSessionSerializer(
                    session, context={'request': self.request}
                ).data
            }
            notify_session_update(str(session.id), payload)
        except Exception as e:
            logger.warning("Notif session_update échouée: %s", e)