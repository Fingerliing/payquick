import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('eatquicker')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.update(
    timezone='Europe/Paris',
    enable_utc=True,
    result_backend='redis://redis:6379/0',
    broker_url='redis://redis:6379/0',
    broker_connection_retry_on_startup=True,
    result_expires=3600,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    task_track_started=True,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    worker_hijack_root_logger=False,
    worker_log_format='[%(asctime)s: %(levelname)s/%(processName)s] %(message)s',

    # ── Beat schedule ──────────────────────────────────────────────────────
    # Défini directement dans app.conf.update() et non dans
    # @app.on_after_configure.connect qui peut silencieusement ne pas fire,
    # laissant beat_schedule vide → aucune tâche périodique ne se lance.
    beat_schedule={
        'auto-complete-inactive-sessions': {
            'task': 'api.tasks.auto_complete_inactive_sessions',
            'schedule': crontab(minute='*/5'),
        },
        'auto-archive-sessions': {
            'task': 'api.tasks.auto_archive_eligible_sessions',
            'schedule': crontab(minute='*/15'),
            'options': {'expires': 600},
        },
        'force-archive-abandoned-sessions': {
            'task': 'api.tasks.force_archive_abandoned_sessions',
            'schedule': crontab(minute='*/15'),
            'kwargs': {'hours': 1},
            'options': {'expires': 3600},
        },
        'cleanup-old-archived-sessions': {
            'task': 'api.tasks.cleanup_old_archived_sessions',
            'schedule': crontab(hour=3, minute=0),
            'kwargs': {'days': 30},
            'options': {'expires': 3600},
        },
    },
)

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')