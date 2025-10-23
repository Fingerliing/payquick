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
        # Utiliser all_objects pour accéder même si déjà archivée
        session = CollaborativeTableSession.all_objects.get(id=session_id)
        
        # Vérifier que la session peut être archivée
        if session.is_archived:
            logger.info(f"Session {session_id} déjà archivée")
            return f"Session {session_id} déjà archivée"
        
        if not session.can_be_archived:
            logger.warning(
                f"Session {session_id} ne peut pas être archivée - "
                f"Status: {session.status}"
            )
            return f"Session {session_id} non éligible pour archivage"
        
        # Archiver la session
        session.archive(reason=reason)
        
        logger.info(f"✅ Session {session_id} archivée avec succès")
        
        # 🔔 NOTIFIER via WebSocket
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
    Tâche périodique pour archiver automatiquement les sessions éligibles
    AVEC notifications WebSocket
    """
    from api.models import CollaborativeTableSession
    
    logger.info("🔄 Démarrage de l'archivage automatique des sessions...")
    
    try:
        cutoff_time = timezone.now() - timedelta(minutes=5)
        
        eligible_sessions = CollaborativeTableSession.objects.filter(
            status__in=['completed', 'cancelled'],
            is_archived=False,
            completed_at__lt=cutoff_time
        )
        
        count = 0
        for session in eligible_sessions:
            try:
                session.archive(reason="Archivage automatique (5min après completion)")
                count += 1
                
                # 🔔 Notifier via WebSocket
                try:
                    notify_session_archived(
                        session_id=str(session.id),
                        reason="Archivage automatique"
                    )
                except Exception as e:
                    logger.warning(f"Notification WebSocket échouée pour {session.id}: {e}")
                
            except Exception as e:
                logger.error(f"Erreur archivage session {session.id}: {e}")
        
        logger.info(f"✅ {count} session(s) archivée(s) automatiquement")
        return f"{count} session(s) archivée(s)"
        
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
        
        # Trouver les sessions archivées depuis plus de X jours
        old_sessions = CollaborativeTableSession.all_objects.filter(
            is_archived=True,
            archived_at__lt=cutoff_date
        )
        
        count = old_sessions.count()
        
        # Supprimer les sessions (cascade sur les participants et commandes)
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
                # Marquer comme annulée puis archiver
                session.status = 'cancelled'
                session.save(update_fields=['status'])
                session.archive(reason=f"Session abandonnée (inactif >{hours}h)")
                count += 1
                
                # 🔔 Notifier via WebSocket
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