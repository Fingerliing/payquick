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
# SUPPRESSION DE COMPTE RGPD (Article 17)
# ============================================================================

@shared_task(name='api.tasks.process_scheduled_account_deletions')
def process_scheduled_account_deletions():
    """
    Exécute les suppressions de compte arrivées à échéance (J+30).

    RGPD art. 17 / App Store 5.1.1(v) : `request_account_deletion` désactive
    le compte et programme la suppression à scheduled_deletion_date. Cette
    tâche (Celery Beat, quotidienne) finalise les demandes échues.

    ANONYMISATION plutôt que suppression physique : les commandes doivent
    être conservées (obligations comptables françaises, 10 ans — le module
    d'écritures comptables en dépend), mais TOUTES les données personnelles
    sont effacées : email, nom, prénom, téléphone, profil client. Le User
    devient une coquille `deleted-<id>` inactive et sans mot de passe.

    Un restaurateur voit en plus ses profils et restaurants désactivés
    (les données SIRET/Stripe restent nécessaires aux obligations légales
    de la plateforme et ne sont pas des données personnelles au sens strict).
    """
    from django.contrib.auth.models import User
    from django.db import transaction
    from api.models import (
        AccountDeletionRequest,
        ClientProfile,
        RestaurateurProfile,
        Restaurant,
        Order,
    )

    now = timezone.now()
    due_requests = AccountDeletionRequest.objects.filter(
        status='pending',
        scheduled_deletion_date__lte=now,
    ).select_related('user')

    count = 0
    errors = 0
    for req in due_requests:
        try:
            with transaction.atomic():
                user = req.user
                uid = user.id
                original_email = user.email

                # 1. Profil client : suppression pure (téléphone, préférences…)
                ClientProfile.objects.filter(user=user).delete()

                # 2. Restaurateur : désactiver profils et restaurants
                for rp in RestaurateurProfile.objects.filter(user=user):
                    rp.is_active = False
                    rp.save(update_fields=['is_active'])
                    Restaurant.objects.filter(owner=rp).update(is_active=False)

                # 3. PII sur les commandes conservées (montants/items gardés
                #    pour la comptabilité, identité effacée)
                Order.objects.filter(user=user).update(
                    customer_name='',
                    phone='',
                )

                # 4. Anonymisation du User (email/username uniques par id)
                user.first_name = ''
                user.last_name = ''
                user.email = f'deleted-{uid}@deleted.eatquicker.fr'
                user.username = f'deleted-{uid}'
                user.is_active = False
                user.set_unusable_password()
                user.save()

                # 5. Clore la demande
                req.status = 'completed'
                req.completed_at = now
                req.save(update_fields=['status', 'completed_at'])

            count += 1
            logger.warning(
                f"🗑️ Compte anonymisé (RGPD art. 17) : user_id={uid} "
                f"(demande #{req.id}, email d'origine masqué : "
                f"{original_email[:2]}***)"
            )
        except Exception:
            errors += 1
            logger.exception(
                f"Erreur lors de la suppression programmée #{req.id}"
            )

    logger.info(
        f"✅ Suppressions RGPD : {count} compte(s) anonymisé(s), "
        f"{errors} erreur(s)"
    )
    return f"{count} compte(s) anonymisé(s), {errors} erreur(s)"



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
    'process_scheduled_account_deletions',
]

from api.services.menu_ai import tasks as _menu_ai_tasks
from api.services.menu_ai import translate_tasks as _menu_ai_tr