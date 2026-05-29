"""
Tache Celery du pipeline d'import de menu par IA.

Decouverte par Celery : ce module N'EST PAS nomme `tasks.py` a la racine de
l'app, donc `autodiscover_tasks()` ne le voit pas tout seul. Il faut l'importer
depuis `backend/api/tasks.py` (cf. note d'integration) :

    from api.services.menu_ai import tasks as _menu_ai_tasks  # noqa: F401

Emplacement : backend/api/services/menu_ai/tasks.py
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    name='api.menu_ai.process_menu_scan_job',
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def process_menu_scan_job(self, job_id):
    """Traite un `MenuScanJob` : extraction vision + charte + traductions.

    Cycle de statut :
        pending -> processing -> translating -> ready   (succes)
        pending -> processing -> failed                 (echec)

    - Idempotent : relit toujours les photos depuis zero.
    - Une erreur de configuration (cle API manquante...) -> echec immediat,
      sans retry (inutile de retenter).
    - Une autre erreur (reseau, rate limit, JSON invalide) -> retry x2, puis
      echec definitif.
    """
    from api.models import MenuScanJob
    from .base import MenuAIConfigError
    from .service import run_menu_extraction

    try:
        job = MenuScanJob.objects.select_related('restaurant').get(id=job_id)
    except MenuScanJob.DoesNotExist:
        logger.error("MenuScanJob %s introuvable.", job_id)
        return f"Job {job_id} introuvable"

    # Garde-fou : ne jamais retraiter un job deja valide / applique.
    if job.status == MenuScanJob.Status.APPLIED:
        logger.info("Job %s deja applique — ignore.", job_id)
        return f"Job {job_id} deja applique"

    # ── Passage en traitement ───────────────────────────────────────────────
    job.status = MenuScanJob.Status.PROCESSING
    job.error_message = ''
    job.save(update_fields=['status', 'error_message', 'updated_at'])

    # ── Lecture des photos (compatible stockage local et S3) ───────────────
    images_bytes: list[bytes] = []
    for scan_image in job.images.order_by('order', 'created_at'):
        try:
            scan_image.image.open('rb')
            images_bytes.append(scan_image.image.read())
        finally:
            scan_image.image.close()

    if not images_bytes:
        job.status = MenuScanJob.Status.FAILED
        job.error_message = "Aucune photo de carte attachee a ce job."
        job.save(update_fields=['status', 'error_message', 'updated_at'])
        return f"Job {job_id} : aucune image"

    # Callback de phase : reflete l'avancement dans le statut (polling front).
    def _set_phase(phase: str) -> None:
        mapping = {
            'processing': MenuScanJob.Status.PROCESSING,
            'translating': MenuScanJob.Status.TRANSLATING,
        }
        new_status = mapping.get(phase)
        if new_status:
            # update() : ecriture ciblee, on fixe updated_at explicitement
            # puisque auto_now ne se declenche pas via QuerySet.update().
            MenuScanJob.objects.filter(id=job_id).update(
                status=new_status,
                updated_at=timezone.now(),
            )

    # ── Extraction + traduction ─────────────────────────────────────────────
    try:
        result = run_menu_extraction(
            images_bytes=images_bytes,
            target_languages=job.target_languages or [],
            on_phase=_set_phase,
        )
    except MenuAIConfigError as exc:
        # Erreur de configuration : non transitoire, pas de retry.
        logger.exception("Configuration IA invalide (job %s).", job_id)
        job.refresh_from_db(fields=['status'])
        job.status = MenuScanJob.Status.FAILED
        job.error_message = f"Configuration IA invalide : {exc}"
        job.save(update_fields=['status', 'error_message', 'updated_at'])
        return f"Job {job_id} : configuration invalide"
    except Exception as exc:  # noqa: BLE001
        logger.exception("Echec de l'analyse du job %s.", job_id)
        # Erreur potentiellement transitoire : on retente.
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            job.refresh_from_db(fields=['status'])
            job.status = MenuScanJob.Status.FAILED
            job.error_message = f"Echec de l'analyse de la carte : {exc}"
            job.save(update_fields=['status', 'error_message', 'updated_at'])
            return f"Job {job_id} : echec definitif"

    # ── Persistance du resultat ─────────────────────────────────────────────
    job.refresh_from_db(fields=['status'])
    job.extracted_data = result['extracted_data']
    job.branding_data = result['branding_data']
    job.raw_response = result['raw_response']
    job.model_used = result['model_used']
    job.tokens_used = result['tokens_used']
    job.status = MenuScanJob.Status.READY
    job.completed_at = timezone.now()
    job.save()

    logger.info(
        "Job %s pret — %s categorie(s), %s plat(s), %s token(s).",
        job_id, job.categories_count, job.items_count, job.tokens_used,
    )
    return f"Job {job_id} pret"
