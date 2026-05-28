"""
Tache Celery — traduction automatique du menu existant.

Decouverte : importer depuis `backend/api/tasks.py` au meme endroit que la
tache d'extraction :
    from api.services.menu_ai import tasks as _menu_ai_tasks          # noqa
    from api.services.menu_ai import translate_tasks as _menu_ai_tr   # noqa
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='api.menu_ai.translate_menu_job', bind=True, max_retries=1)
def translate_menu_job(self, job_id):
    """Complete les traductions manquantes du menu d'un restaurant.

    pending -> processing -> done | failed
    """
    from api.models import MenuTranslationJob
    from .base import MenuAIConfigError
    from .translate_menu import translate_restaurant_menu

    try:
        job = MenuTranslationJob.objects.select_related('restaurant').get(id=job_id)
    except MenuTranslationJob.DoesNotExist:
        logger.error("MenuTranslationJob %s introuvable.", job_id)
        return f"Job {job_id} introuvable"

    if job.status == MenuTranslationJob.Status.DONE:
        return f"Job {job_id} deja termine"

    job.status = MenuTranslationJob.Status.PROCESSING
    job.error_message = ''
    job.save(update_fields=['status', 'error_message', 'updated_at'])

    def _on_progress(done, total):
        # Ecriture ciblee : auto_now ne se declenche pas via update().
        MenuTranslationJob.objects.filter(id=job_id).update(
            progress_done=done, progress_total=total, updated_at=timezone.now(),
        )

    try:
        report = translate_restaurant_menu(
            restaurant_id=job.restaurant_id,
            target_languages=job.target_languages or [],
            on_progress=_on_progress,
        )
    except (MenuAIConfigError, ValueError) as exc:
        logger.exception("Traduction impossible (job %s).", job_id)
        job.refresh_from_db(fields=['status'])
        job.status = MenuTranslationJob.Status.FAILED
        job.error_message = str(exc)
        job.save(update_fields=['status', 'error_message', 'updated_at'])
        return f"Job {job_id} : echec"
    except Exception as exc:  # noqa: BLE001
        logger.exception("Echec traduction job %s.", job_id)
        try:
            raise self.retry(exc=exc, countdown=20)
        except self.MaxRetriesExceededError:
            job.refresh_from_db(fields=['status'])
            job.status = MenuTranslationJob.Status.FAILED
            job.error_message = "La traduction a echoue. Reessayez plus tard."
            job.save(update_fields=['status', 'error_message', 'updated_at'])
            return f"Job {job_id} : echec definitif"

    job.refresh_from_db(fields=['status'])
    job.report = report
    job.status = MenuTranslationJob.Status.DONE
    job.completed_at = timezone.now()
    job.save(update_fields=['report', 'status', 'completed_at', 'updated_at'])
    logger.info("Job de traduction %s termine.", job_id)
    return f"Job {job_id} termine"
