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

# COMMANDES FANTÔMES
# ============================================================================

@shared_task(name='api.tasks.auto_cancel_stale_orders')
def auto_cancel_stale_orders(hours=24):
    """
    Annule les commandes actives abandonnées (« fantômes »).

    Contexte : dans un service à table, une commande pending/confirmed sans
    aucun mouvement depuis 24 h est morte par définition. Sans cette tâche,
    elle reste active pour toujours : invisible dans le kanban (filtre 24 h
    côté app) mais comptée dans les stats et BLOQUANTE pour la suppression
    de compte RGPD (cf. commandes #4 et #10 découvertes le 15/07/2026).

    ⚠️ Garde-fou paiement : une commande DÉJÀ PAYÉE (paid / partial_paid)
    n'est JAMAIS annulée automatiquement — un client débité mais jamais
    servi doit être traité par un humain (remboursement). Ces cas sont
    seulement signalés en warning dans les logs.

    Critère d'inactivité : updated_at (auto_now) — tout changement de statut,
    de paiement ou d'items le rafraîchit.

    S'exécute quotidiennement via Celery Beat. Même pattern que
    force_archive_abandoned_sessions.
    """
    from api.models import Order

    logger.info(f"👻 Recherche de commandes fantômes (inactives >{hours}h)...")

    try:
        cutoff = timezone.now() - timedelta(hours=hours)
        ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready']
        SAFE_TO_CANCEL_PAYMENT = ['unpaid', 'pending', 'cash_pending', 'failed']

        stale_orders = Order.objects.filter(
            status__in=ACTIVE_STATUSES,
            updated_at__lt=cutoff,
        )

        cancelled = 0
        flagged_paid = 0

        for order in stale_orders:
            try:
                if order.payment_status not in SAFE_TO_CANCEL_PAYMENT:
                    # Payée (totalement ou partiellement) mais jamais servie :
                    # intervention humaine requise (remboursement ?). On ne
                    # touche pas, on signale.
                    flagged_paid += 1
                    logger.warning(
                        f"⚠️ Commande #{order.id} ({order.order_number}) inactive "
                        f">{hours}h mais payment_status='{order.payment_status}' : "
                        f"NON annulée — vérifier manuellement (remboursement ?)"
                    )
                    continue

                note = (
                    f"[{timezone.now().strftime('%Y-%m-%d %H:%M')}] "
                    f"Annulation automatique : commande inactive depuis plus "
                    f"de {hours}h (statut '{order.status}', paiement "
                    f"'{order.payment_status}')."
                )
                new_notes = f"{order.notes}\n{note}".strip() if order.notes else note

                # update() ciblé : pas de signaux, pas de refresh d'auto_now
                # sur d'autres champs que ceux listés.
                Order.objects.filter(id=order.id).update(
                    status='cancelled',
                    notes=new_notes,
                )
                cancelled += 1
                logger.info(
                    f"👻 Commande #{order.id} ({order.order_number}) annulée "
                    f"automatiquement (inactive >{hours}h)"
                )
            except Exception as e:
                logger.error(f"Erreur annulation commande {order.id}: {e}")

        logger.info(
            f"✅ Commandes fantômes : {cancelled} annulée(s), "
            f"{flagged_paid} payée(s) signalée(s) pour traitement manuel"
        )
        return f"{cancelled} annulée(s), {flagged_paid} signalée(s)"

    except Exception as e:
        logger.exception("Erreur lors de l'annulation des commandes fantômes")
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
    'fire_scheduled_preorders',
    'expire_pending_reservations',
    'mark_reservation_no_shows',
    'auto_release_occupancies',
    'process_scheduled_account_deletions',
    'auto_cancel_stale_orders',
]

from api.services.menu_ai import tasks as _menu_ai_tasks
from api.services.menu_ai import translate_tasks as _menu_ai_tr