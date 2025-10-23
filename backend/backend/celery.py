from celery import Celery
from celery.schedules import crontab
import os

# Configuration Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('eatquicker')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# ==================== CELERY BEAT SCHEDULE ====================
app.conf.beat_schedule = {
    # Archivage automatique toutes les 15 minutes
    'auto-archive-sessions': {
        'task': 'api.tasks.auto_archive_eligible_sessions',
        'schedule': crontab(minute='*/15'),  # Toutes les 15 minutes
        'options': {
            'expires': 600,  # Expire après 10 minutes si non exécuté
        }
    },
    
    # Nettoyage quotidien à 3h du matin
    'cleanup-old-archived-sessions': {
        'task': 'api.tasks.cleanup_old_archived_sessions',
        'schedule': crontab(hour=3, minute=0),  # Tous les jours à 3h
        'kwargs': {'days': 30},  # Supprimer après 30 jours
        'options': {
            'expires': 3600,
        }
    },
    
    # Archivage forcé des sessions abandonnées toutes les 6h
    'force-archive-abandoned-sessions': {
        'task': 'api.tasks.force_archive_abandoned_sessions',
        'schedule': crontab(hour='*/6', minute=0),  # Toutes les 6 heures
        'kwargs': {'hours': 12},  # Sessions inactives > 12h
        'options': {
            'expires': 3600,
        }
    },
}


# ==================== CONFIGURATION CELERY ====================
app.conf.update(
    # Timezone
    timezone='Europe/Paris',
    enable_utc=True,
    
    # Résultats
    result_backend='redis://localhost:6379/0',
    result_expires=3600,  # Les résultats expirent après 1h
    
    # Broker
    broker_url='redis://localhost:6379/0',
    broker_connection_retry_on_startup=True,
    
    # Workers
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes max par tâche
    task_soft_time_limit=25 * 60,  # Soft limit à 25 minutes
    
    # Logs
    worker_hijack_root_logger=False,
    worker_log_format='[%(asctime)s: %(levelname)s/%(processName)s] %(message)s',
)


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')