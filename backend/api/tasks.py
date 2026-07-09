from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from api.utils.websocket_notifications import notify_session_archived, notify_session_completed
import logging

logger = logging.getLogger(__name__)

@shared_task(name='api.tasks.archive_session_delayed')
def archive_session_delayed(session_id, reason="Archivage automatique après completion"):
    """
    Archive une session après un délai (appelé après completion)
    AVEC notification WebSocket
    """
    from api.models import CollaborativeTableSession

    try:
        session = CollaborativeTableSession.all_objects.get(id=session_id)

        if session.is_archived:
            logger.info(f"Session {session_id} déjà archivée")
            return f"Session {session_id} déjà archivée"

        if not session.can_be_archived:
            logger.warning(
                f"Session {session_id} ne peut pas être archivée - "
                f"Status: {session.status}"
            )
            return f"Session {session_id} non éligible pour archivage"

        session.archive(reason=reason)

        logger.info(f"✅ Session {session_id} archivée avec succès")

        try:
            notify_session_archived(
                session_id=str(session.id),
                reason=reason
            )
        except Exception as e:
            logger.warning(f"Notification WebSocket échouée: {e}")

        return f"Session {session_id} archivée"

    except CollaborativeTableSession.DoesNotExist:
        logger.error(f"Session {session_id} introuvable")
        return f"Session {session_id} introuvable"
    except Exception as e:
        logger.exception(f"Erreur lors de l'archivage de la session {session_id}")
        return f"Erreur: {str(e)}"


@shared_task(name='api.tasks.auto_archive_eligible_sessions')
def auto_archive_eligible_sessions():
    """
    Tâche périodique (*/15min) pour archiver automatiquement :
    - Les sessions completed/cancelled depuis plus de 5 minutes
    - Les sessions active/locked sans activité depuis plus de 30 minutes
    """
    from api.models import CollaborativeTableSession

    logger.info("🔄 Démarrage de l'archivage automatique des sessions...")

    try:
        now = timezone.now()
        cutoff_completed = now - timedelta(minutes=5)
        cutoff_inactive  = now - timedelta(minutes=30)

        # --- Cas 1 : sessions terminées/annulées en attente d'archivage ---
        completed_sessions = CollaborativeTableSession.objects.filter(
            status__in=['completed', 'cancelled'],
            is_archived=False,
            completed_at__lt=cutoff_completed
        )

        # --- Cas 2 : sessions actives/verrouillées sans activité récente ---
        # updated_at (auto_now=True) reflète la dernière écriture sur l'objet.
        # Une session qui n'a pas bougé depuis 30 min est considérée abandonnée.
        stale_sessions = CollaborativeTableSession.objects.filter(
            status__in=['active', 'locked'],
            is_archived=False,
            updated_at__lt=cutoff_inactive
        )

        count_completed = 0
        count_stale     = 0

        for session in completed_sessions:
            try:
                session.archive(reason="Archivage automatique (5min après completion)")
                count_completed += 1
                try:
                    notify_session_archived(
                        session_id=str(session.id),
                        reason="Archivage automatique"
                    )
                except Exception as e:
                    logger.warning(f"Notification WebSocket échouée pour {session.id}: {e}")
            except Exception as e:
                logger.error(f"Erreur archivage session complétée {session.id}: {e}")

        for session in stale_sessions:
            try:
                # Marquer cancelled avant d'archiver pour cohérence des données
                # (utilise update() pour ne pas déclencher auto_now sur updated_at)
                CollaborativeTableSession.objects.filter(id=session.id).update(
                    status='cancelled'
                )
                session.refresh_from_db()
                session.archive(reason="Archivage automatique (inactivité >30min)")
                count_stale += 1
                try:
                    notify_session_archived(
                        session_id=str(session.id),
                        reason="Session inactive archivée automatiquement"
                    )
                except Exception as e:
                    logger.warning(f"Notification WebSocket échouée pour {session.id}: {e}")
            except Exception as e:
                logger.error(f"Erreur archivage session inactive {session.id}: {e}")

        total = count_completed + count_stale
        logger.info(
            f"✅ {total} session(s) archivée(s) "
            f"({count_completed} complétées, {count_stale} inactives)"
        )
        return f"{total} session(s) archivée(s)"

    except Exception as e:
        logger.exception("Erreur lors de l'archivage automatique")
        return f"Erreur: {str(e)}"

@shared_task(name='api.tasks.auto_complete_inactive_sessions')
def auto_complete_inactive_sessions():
    """
    Complète automatiquement les sessions actives sans activité depuis 15 minutes.
    Critère d'inactivité : champ updated_at de la session (mis à jour par Django auto_now).
    S'exécute toutes les 5 minutes via Celery Beat.
    """
    from api.models import CollaborativeTableSession

    logger.info("🔄 Vérification des sessions inactives...")

    try:
        inactivity_threshold = timezone.now() - timedelta(minutes=15)

        inactive_sessions = CollaborativeTableSession.objects.filter(
            status__in=['active', 'locked'],
            is_archived=False,
            updated_at__lt=inactivity_threshold
        )

        count = 0
        for session in inactive_sessions:
            try:
                session.mark_completed()

                try:
                    notify_session_completed(str(session.id))
                except Exception as e:
                    logger.warning(f"Notification WebSocket échouée pour {session.id}: {e}")

                count += 1
                logger.info(f"✅ Session {session.id} auto-complétée (inactivité >15min)")

            except Exception as e:
                logger.error(f"Erreur auto-completion session {session.id}: {e}")

        if count > 0:
            # Programmer l'archivage une seule fois pour toutes les sessions complétées
            auto_archive_eligible_sessions.apply_async(countdown=300)

        logger.info(f"✅ {count} session(s) auto-complétée(s) pour inactivité")
        return f"{count} session(s) auto-complétée(s)"

    except Exception as e:
        logger.exception("Erreur lors de l'auto-completion des sessions inactives")
        return f"Erreur: {str(e)}"

@shared_task(name='api.tasks.cleanup_old_archived_sessions')
def cleanup_old_archived_sessions(days=30):
    """
    Nettoie les sessions archivées depuis plus de X jours

    Args:
        days: Nombre de jours après lesquels supprimer (défaut: 30)

    S'exécute quotidiennement via Celery Beat
    """
    from api.models import CollaborativeTableSession

    logger.info(f"🧹 Démarrage du nettoyage des sessions archivées (>{days} jours)...")

    try:
        cutoff_date = timezone.now() - timedelta(days=days)

        old_sessions = CollaborativeTableSession.all_objects.filter(
            is_archived=True,
            archived_at__lt=cutoff_date
        )

        count = old_sessions.count()

        old_sessions.delete()

        logger.info(f"✅ {count} session(s) archivée(s) supprimée(s)")
        return f"{count} session(s) supprimée(s)"

    except Exception as e:
        logger.exception("Erreur lors du nettoyage des sessions")
        return f"Erreur: {str(e)}"


@shared_task(name='api.tasks.force_archive_abandoned_sessions')
def force_archive_abandoned_sessions(hours=12):
    """
    Archive de force les sessions actives abandonnées depuis X heures
    AVEC notifications WebSocket
    """
    from api.models import CollaborativeTableSession

    logger.info(f"⚠️ Recherche de sessions abandonnées (>{hours}h)...")

    try:
        cutoff_time = timezone.now() - timedelta(hours=hours)

        abandoned_sessions = CollaborativeTableSession.objects.filter(
            status__in=['active', 'locked'],
            is_archived=False,
            updated_at__lt=cutoff_time
        )

        count = 0
        for session in abandoned_sessions:
            try:
                # Utiliser update() pour bypasser les signaux Django
                CollaborativeTableSession.objects.filter(id=session.id).update(status='cancelled')
                session.status = 'cancelled'
                session.archive(reason=f"Session abandonnée (inactif >{hours}h)")
                count += 1

                try:
                    notify_session_archived(
                        session_id=str(session.id),
                        reason="Session abandonnée"
                    )
                except Exception as e:
                    logger.warning(f"Notification WebSocket échouée: {e}")

            except Exception as e:
                logger.error(f"Erreur archivage forcé session {session.id}: {e}")

        logger.info(f"⚠️ {count} session(s) abandonnée(s) archivée(s)")
        return f"{count} session(s) abandonnée(s) archivée(s)"

    except Exception as e:
        logger.exception("Erreur lors de l'archivage forcé")
        return f"Erreur: {str(e)}"


# ============================================================================
# TÂCHES RÉSERVATIONS & OCCUPATION DES TABLES
# ============================================================================

NO_SHOW_GRACE_MINUTES = 20


@shared_task(name='api.tasks.fire_scheduled_preorders')
def fire_scheduled_preorders():
    """Bascule en file cuisine les pré-commandes payées dont l'heure de
    préparation est atteinte (starts_at - prep_lead_minutes).
    S'exécute toutes les minutes via Celery Beat."""
    from django.db import transaction
    from api.models import Reservation

    now = timezone.now()
    fired = 0

    # prep_lead_minutes variable par résa → borne large puis filtre Python
    candidates = Reservation.objects.select_related('pre_order').filter(
        status='confirmed',
        kitchen_fired_at__isnull=True,
        pre_order__isnull=False,
        pre_order__payment_status='paid',
        pre_order__status='scheduled',
        starts_at__lte=now + timedelta(minutes=60),
    )

    for reservation in candidates:
        if reservation.fire_kitchen_at > now:
            continue
        try:
            with transaction.atomic():
                locked = (
                    Reservation.objects
                    .select_for_update()
                    .select_related('pre_order')
                    .get(id=reservation.id)
                )
                if locked.fire_kitchen():
                    fired += 1
                    logger.info(
                        f"🔥 Pré-commande {locked.pre_order_id} envoyée en cuisine "
                        f"(résa {locked.id}, table "
                        f"{locked.table.number if locked.table else '?'}, "
                        f"arrivée {timezone.localtime(locked.starts_at):%H:%M})"
                    )
                    # TODO : push Firebase restaurateur (même canal que les
                    # nouvelles commandes classiques)
                    from api.utils.floorplan_notifications import notify_floorplan_update
                    notify_floorplan_update(
                        locked.restaurant_id,
                        event='kitchen_fired',
                        table_id=locked.table_id,
                    )
        except Exception as e:
            logger.error(f"Erreur fire_kitchen résa {reservation.id}: {e}")

    if fired:
        logger.info(f"✅ fire_scheduled_preorders: {fired} commande(s) déclenchée(s)")
    return f"{fired} commande(s) déclenchée(s)"


@shared_task(name='api.tasks.expire_pending_reservations')
def expire_pending_reservations():
    """Libère les créneaux des réservations dont le paiement n'a pas abouti
    dans le délai (RESERVATION_PAYMENT_HOLD_MINUTES).
    S'exécute toutes les minutes via Celery Beat."""
    from django.db import transaction
    from api.models import Reservation

    now = timezone.now()
    expired = 0

    stale = Reservation.objects.select_related('pre_order').filter(
        status='pending_payment',
        expires_at__lt=now,
    )
    for reservation in stale:
        try:
            with transaction.atomic():
                locked = (
                    Reservation.objects
                    .select_for_update()
                    .select_related('pre_order')
                    .get(id=reservation.id)
                )
                # Le webhook a pu passer entre la requête et le verrou
                if locked.status != 'pending_payment':
                    continue
                if locked.pre_order and locked.pre_order.payment_status == 'paid':
                    # Paiement arrivé mais confirmation manquée → rattrapage
                    locked.confirm_after_payment()
                    logger.warning(
                        f"⚠️ Résa {locked.id} confirmée en rattrapage "
                        f"(webhook manqué)"
                    )
                    continue
                locked.status = 'expired'
                locked.save(update_fields=['status', 'updated_at'])
                if locked.pre_order and locked.pre_order.status == 'scheduled':
                    locked.pre_order.status = 'cancelled'
                    locked.pre_order.save(update_fields=['status'])
                expired += 1
                from api.utils.floorplan_notifications import notify_floorplan_update
                notify_floorplan_update(
                    locked.restaurant_id,
                    event='reservation_cancelled',
                    table_id=locked.table_id,
                )
        except Exception as e:
            logger.error(f"Erreur expiration résa {reservation.id}: {e}")

    if expired:
        logger.info(f"✅ expire_pending_reservations: {expired} réservation(s) expirée(s)")
    return f"{expired} réservation(s) expirée(s)"


@shared_task(name='api.tasks.mark_reservation_no_shows')
def mark_reservation_no_shows():
    """Marque no_show les réservations sans check-in après la période de grâce.

    Le montant de la pré-commande reste acquis (non remboursable en cas de
    non-présentation). Si la cuisine a déjà été déclenchée, la commande suit
    son cycle normal — le restaurateur décide quoi en faire.
    S'exécute toutes les 5 minutes via Celery Beat."""
    from api.models import Reservation

    from api.utils.floorplan_notifications import notify_floorplan_update

    now = timezone.now()
    stale = Reservation.objects.filter(
        status='confirmed',
        starts_at__lt=now - timedelta(minutes=NO_SHOW_GRACE_MINUTES),
    )
    # Collecter les couples (restaurant, table) AVANT l'update en masse
    affected = list(stale.values_list('restaurant_id', 'table_id'))
    updated = stale.update(status='no_show', updated_at=now)

    for restaurant_id, table_id in affected:
        notify_floorplan_update(
            restaurant_id, event='reservation_no_show', table_id=table_id
        )

    if updated:
        logger.info(f"✅ mark_reservation_no_shows: {updated} no-show(s)")
    return f"{updated} no-show(s)"


@shared_task(name='api.tasks.auto_release_occupancies')
def auto_release_occupancies():
    """Libère les occupations de table obsolètes :
    - source='order' dont toutes les commandes sont terminées
    - toute occupation dépassant expected_end_at de plus de 2h (filet de
      sécurité si le staff oublie de libérer)
    Les occupations 'manual' ne sont PAS libérées à la fin des commandes :
    les clients peuvent rester à table. S'exécute toutes les 5 minutes."""
    from api.models import Order
    from api.models.table_occupancy_models import TableOccupancy

    now = timezone.now()
    released = 0

    for occ in TableOccupancy.objects.active().select_related('table'):
        try:
            # Filet de sécurité : très overdue → libération
            if now > occ.expected_end_at + timedelta(hours=2):
                occ.release()
                released += 1
                logger.info(
                    f"🧹 Table {occ.table.number} libérée (overdue >2h)"
                )
                from api.utils.floorplan_notifications import notify_floorplan_update
                notify_floorplan_update(
                    occ.restaurant_id, event='table_released', table_id=occ.table_id
                )
                continue
            # Occupations liées aux commandes : plus rien d'actif → libérer
            if occ.source == 'order':
                still_active = Order.objects.filter(
                    restaurant=occ.restaurant,
                    table_number=occ.table.number,
                    status__in=['pending', 'confirmed', 'preparing', 'ready'],
                ).exists()
                if not still_active:
                    occ.release()
                    released += 1
                    from api.utils.floorplan_notifications import notify_floorplan_update
                    notify_floorplan_update(
                        occ.restaurant_id, event='table_released', table_id=occ.table_id
                    )
        except Exception as e:
            logger.error(f"Erreur libération occupation {occ.id}: {e}")

    if released:
        logger.info(f"✅ auto_release_occupancies: {released} table(s) libérée(s)")
    return f"{released} table(s) libérée(s)"




# ============================================================================
# TÂCHES COMPTABILITÉ
# ============================================================================

# from api.tasks.comptabilite_tasks import (
#     generate_monthly_recap,
#     sync_stripe_daily,
#     cleanup_old_exports,
#     generate_ecritures_comptables,
#     generate_fec_async
# )

# Export pour utilisation directe
__all__ = [
    'archive_session_delayed',
    'auto_archive_eligible_sessions',
    'auto_complete_inactive_sessions',
    'cleanup_old_archived_sessions',
    'force_archive_abandoned_sessions',
    'fire_scheduled_preorders',
    'expire_pending_reservations',
    'mark_reservation_no_shows',
    'auto_release_occupancies',
]

from api.services.menu_ai import tasks as _menu_ai_tasks
from api.services.menu_ai import translate_tasks as _menu_ai_tr