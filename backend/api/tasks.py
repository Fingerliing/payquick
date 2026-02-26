from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from api.utils.websocket_notifications import notify_session_archived
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
            created_at__lt=cutoff_time
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
    'cleanup_old_archived_sessions',
    'force_archive_abandoned_sessions',
    'generate_monthly_recap',
    'sync_stripe_daily',
    'cleanup_old_exports',
    'generate_ecritures_comptables',
    'generate_fec_async',
]