# backend/backend/celery.py
from celery import Celery
from celery.schedules import crontab

app = Celery('eatquicker')
app.config_from_object('django.conf:settings', namespace='CELERY')

# Tâches planifiées
app.conf.beat_schedule = {
    'process-account-deletions': {
        'task': 'api.tasks.process_account_deletions',
        'schedule': crontab(hour=2, minute=0),  # Tous les jours à 2h du matin
    },
    'clean-old-data': {
        'task': 'api.tasks.clean_old_data',
        'schedule': crontab(day_of_month=1, hour=3, minute=0),  # 1er de chaque mois
    },
}