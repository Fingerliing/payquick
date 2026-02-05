from django.db.models.signals import post_save, pre_save, post_migrate
from django.contrib.auth.models import User, Group
from django.dispatch import receiver
from django.apps import apps as django_apps
from django.utils import timezone
from api.models import (
    RestaurateurProfile,
    Restaurant,
    ClientProfile,
    Order,
    SessionParticipant,
    SplitPaymentPortion,
)
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import datetime
import logging
import time

# WebSocket consumer helpers
from api.consumers import notify_participant_approved

logger = logging.getLogger(__name__)

DEFAULT_GROUPS = ("restaurateur", "client", "admin")


@receiver(post_migrate)
def create_default_groups(sender, **kwargs):
    """
    Créé les groupes par défaut après les migrations.
    On attend que l'app 'auth' (qui contient auth_group) soit migrée.
    """
    if getattr(sender, "name", None) != "django.contrib.auth":
        return

    Group = django_apps.get_model("auth", "Group")
    for name in DEFAULT_GROUPS:
        Group.objects.get_or_create(name=name)
    print(f"✅ [MIGRATE] Groupes par défaut OK: {', '.join(DEFAULT_GROUPS)}")


@receiver(post_save, sender=RestaurateurProfile)
def update_restaurant_stripe_status(sender, instance, **kwargs):
    """Mettre à jour le statut Stripe des restaurants quand le profil restaurateur change"""
    if kwargs.get("update_fields") is None or "stripe_verified" in kwargs.get(
        "update_fields", []
    ):
        try:
            # Mettre à jour tous les restaurants de ce restaurateur
            Restaurant.objects.filter(owner=instance).update(
                is_stripe_active=instance.stripe_verified
            )

            if instance.stripe_verified:
                logger.info(
                    f"Restaurants activés pour le restaurateur {instance.id} ({instance.display_name})"
                )
            else:
                logger.info(
                    f"Restaurants désactivés pour le restaurateur {instance.id} ({instance.display_name})"
                )

        except Exception as e:
            logger.error(
                f"Erreur lors de la mise à jour des restaurants pour le restaurateur {instance.id}: {str(e)}"
            )


@receiver(post_save, sender=Restaurant)
def check_restaurant_stripe_activation(sender, instance, created, **kwargs):
    """Signal pour vérifier l'activation Stripe du restaurant"""
    try:
        update_fields = kwargs.get("update_fields", None)
        if update_fields is None:
            update_fields = []

        if created or "is_stripe_active" in update_fields:
            print(
                f"📍 Signal Restaurant: {instance.name} - Stripe actif: {instance.is_stripe_active}"
            )

            if instance.is_stripe_active:
                print(f"✅ Restaurant {instance.name} activé pour Stripe")
            else:
                print(f"⚠️ Restaurant {instance.name} désactivé pour Stripe")

    except Exception as e:
        print(f"❌ Erreur dans le signal Restaurant: {e}")


@receiver(post_save, sender=RestaurateurProfile)
def assign_restaurateur_group(sender, instance, created, **kwargs):
    """Assigne automatiquement le groupe 'restaurateur' lors de la création du profil"""
    if created:
        try:
            group, group_created = Group.objects.get_or_create(name="restaurateur")
            instance.user.groups.add(group)
            print(
                f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'restaurateur'"
            )

            if group_created:
                print(f"✅ [SIGNAL] Groupe 'restaurateur' créé automatiquement")

        except Exception as e:
            print(f"❌ [SIGNAL] Erreur lors de l'assignation du groupe: {e}")


@receiver(post_save, sender=ClientProfile)
def assign_client_group(sender, instance, created, **kwargs):
    """Assigne automatiquement le groupe 'client' lors de la création du profil client"""
    if created:
        try:
            group, group_created = Group.objects.get_or_create(name="client")
            instance.user.groups.add(group)
            print(
                f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'client'"
            )

        except Exception as e:
            print(f"❌ [SIGNAL] Erreur lors de l'assignation du groupe client: {e}")


@receiver(post_save, sender=User)
def ensure_single_role_group(sender, instance, **kwargs):
    """S'assure qu'un utilisateur n'est que dans un seul groupe de rôle"""
    user_groups = instance.groups.all()
    role_groups = ["restaurateur", "client", "admin"]

    current_role_groups = [g.name for g in user_groups if g.name in role_groups]

    if len(current_role_groups) > 1:
        print(
            f"⚠️ [SIGNAL] Utilisateur {instance.email} dans plusieurs groupes: {current_role_groups}"
        )

        priority_order = ["admin", "restaurateur", "client"]

        for role in priority_order:
            if role in current_role_groups:
                for other_role in role_groups:
                    if other_role != role:
                        try:
                            other_group = Group.objects.get(name=other_role)
                            instance.groups.remove(other_group)
                        except Group.DoesNotExist:
                            pass
                break


# =============================================================================
# SERVICE DE NOTIFICATION WEBSOCKET
# =============================================================================
class OrderNotificationService:
    """Service de notifications WebSocket avec support Channels"""

    def __init__(self):
        self.channel_layer = get_channel_layer()

    def send_order_update(self, order_id, status=None, waiting_time=None, data=None):
        """Envoyer une mise à jour de commande via WebSocket"""
        if not self.channel_layer:
            logger.warning("Channel layer not configured")
            return False

        try:
            message = {
                "type": "order_update",
                "order_id": order_id,
                "status": status,
                "waiting_time": waiting_time,
                "timestamp": datetime.now().isoformat(),
                "data": data or {},
            }

            # Envoyer au groupe de cette commande spécifique
            group_name = f"order_{order_id}"
            async_to_sync(self.channel_layer.group_send)(group_name, message)

            logger.info(
                f"✅ Order update sent via WebSocket for order {order_id}: {status}"
            )

            # Fallback vers SSE si configuré
            self.send_sse_update(order_id, status, waiting_time, data)

            return True

        except Exception as e:
            logger.error(f"❌ Error sending WebSocket order update: {e}")
            return False

    def send_sse_update(self, order_id, status=None, waiting_time=None, data=None):
        """Envoyer aussi via SSE pour compatibilité"""
        try:
            # Import dynamique pour éviter les dépendances circulaires
            from api.views.websocket_views import broadcast_to_sse

            message = {
                "type": "order_update",
                "order_id": order_id,
                "status": status,
                "waiting_time": waiting_time,
                "timestamp": time.time(),
                "data": data or {},
            }

            broadcast_to_sse(order_id, message)
            logger.info(f"✅ Order update sent via SSE for order {order_id}")

        except ImportError:
            # SSE non disponible, continuer silencieusement
            pass
        except Exception as e:
            logger.warning(f"⚠️ SSE fallback failed: {e}")


# Instance globale du service WebSocket/SSE (lazy-loaded)
notification_service = None


def get_notification_service():
    """Récupère l'instance du service de notifications WebSocket/SSE."""
    global notification_service
    if notification_service is None:
        notification_service = OrderNotificationService()
    return notification_service


# =============================================================================
# CAPTURE CHANGEMENTS DE COMMANDE (POUR WS/SSE)
# =============================================================================
@receiver(pre_save, sender="api.Order")
def capture_order_changes(sender, instance, **kwargs):
    """Capturer les changements avant sauvegarde (status, waiting_time)"""
    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._old_status = getattr(old_instance, "status", None)
            instance._old_waiting_time = getattr(old_instance, "waiting_time", None)
        except sender.DoesNotExist:
            instance._old_status = None
            instance._old_waiting_time = None


@receiver(post_save, sender="api.Order")
def order_updated(sender, instance, created, **kwargs):
    """Signal déclenché lors de la mise à jour d'une commande (WebSocket/SSE)"""
    try:
        # Champs additionnels communs au payload
        extra_data_common = {
            "order_number": getattr(instance, "order_number", None),
            "total_amount": float(getattr(instance, "total_amount", 0) or 0),
        }

        if created:
            # Nouvelle commande créée
            logger.info(f"📝 New order created: {instance.id}")
            get_notification_service().send_order_update(
                order_id=instance.id,
                status=getattr(instance, "status", None),
                waiting_time=getattr(instance, "waiting_time", None),
                data={"action": "created", **extra_data_common},
            )
            return

        # Vérifier les changements
        old_status = getattr(instance, "_old_status", None)
        old_waiting_time = getattr(instance, "_old_waiting_time", None)
        current_status = getattr(instance, "status", None)
        current_waiting_time = getattr(instance, "waiting_time", None)

        # Changement de statut
        if old_status != current_status:
            logger.info(
                f"📊 Order {instance.id} status changed: {old_status} → {current_status}"
            )
            get_notification_service().send_order_update(
                order_id=instance.id,
                status=current_status,
                waiting_time=current_waiting_time,
                data={
                    "action": "status_changed",
                    "old_status": old_status,
                    "new_status": current_status,
                    **extra_data_common,
                },
            )

        # Changement de temps d'attente uniquement
        elif old_waiting_time != current_waiting_time:
            logger.info(
                f"⏱️ Order {instance.id} waiting time updated: {old_waiting_time} → {current_waiting_time}"
            )
            get_notification_service().send_order_update(
                order_id=instance.id,
                status=current_status,
                waiting_time=current_waiting_time,
                data={
                    "action": "waiting_time_updated",
                    "old_waiting_time": old_waiting_time,
                    "new_waiting_time": current_waiting_time,
                    **extra_data_common,
                },
            )

    except Exception as e:
        logger.error(f"❌ Error in order_updated signal: {e}")


# FONCTIONS UTILITAIRES WEBSOCKET/SSE
def notify_order_update(order_id, status=None, waiting_time=None, **extra_data):
    """Fonction utilitaire pour envoyer des notifications manuellement"""
    try:
        result = get_notification_service().send_order_update(
            order_id=order_id,
            status=status,
            waiting_time=waiting_time,
            data=extra_data,
        )
        logger.info(f"📤 Manual notification sent for order {order_id}: {result}")
        return result
    except Exception as e:
        logger.error(f"❌ Manual notification failed for order {order_id}: {e}")
        return False


def notify_custom_event(order_id, event_type, message, **data):
    """Envoyer un événement personnalisé"""
    try:
        result = get_notification_service().send_order_update(
            order_id=order_id,
            data={
                "action": "custom_event",
                "event_type": event_type,
                "message": message,
                **data,
            },
        )
        logger.info(f"🎉 Custom event sent for order {order_id}: {event_type}")
        return result
    except Exception as e:
        logger.error(f"❌ Custom event failed for order {order_id}: {e}")
        return False


# FONCTION DE TEST POUR LE DÉVELOPPEMENT
def test_websocket_notification(order_id, test_message="Test notification"):
    """Fonction de test pour vérifier les WebSockets (développement uniquement)"""
    from django.conf import settings

    if not getattr(settings, "DEBUG", False):
        logger.warning("Test notifications only available in DEBUG mode")
        return False

    return notify_custom_event(
        order_id=order_id,
        event_type="test",
        message=test_message,
        timestamp=datetime.now().isoformat(),
        test=True,
    )


# =============================================================================
# MISE À JOUR DES TIMESTAMPS DE COMMANDE
# =============================================================================
@receiver(pre_save, sender=Order)
def update_order_timestamps(sender, instance, **kwargs):
    """Met à jour les timestamps selon le changement de statut"""
    if instance.pk:  # Uniquement pour les updates
        try:
            old_instance = Order.objects.get(pk=instance.pk)

            # Capture du moment où la commande devient ready
            if old_instance.status != "ready" and instance.status == "ready":
                instance.ready_at = timezone.now()

            # Capture du moment où la commande est servie
            if old_instance.status != "served" and instance.status == "served":
                instance.served_at = timezone.now()

        except Order.DoesNotExist:
            pass


# =============================================================================
# SIGNAL PARTICIPANT APPROUVÉ (WEBSOCKET)
# =============================================================================
@receiver(post_save, sender=SessionParticipant)
def participant_post_save(sender, instance, created, **kwargs):
    """
    Signal après changement de statut d'un participant.
    Si un participant passe à 'active' (approuvé), on notifie via WebSocket.
    """
    try:
        if not created and getattr(instance, "status", None) == "active":
            from api.serializers.collaborative_session_serializers import (
                SessionParticipantSerializer,
            )

            participant_data = SessionParticipantSerializer(instance).data
            notify_participant_approved(str(instance.session_id), participant_data)
            logger.info(
                f"👥 Participant approuvé notifié (session={instance.session_id}, participant={instance.id})"
            )
    except Exception as e:
        logger.warning(f"⚠️ Échec notification participant approuvé: {e}")


# =============================================================================
# NOTIFICATIONS PUSH – COMMANDES
# =============================================================================
@receiver(post_save, sender=Order)
def send_order_push_notifications(sender, instance, created, **kwargs):
    """
    Notifs push liées aux commandes (création + changements de statut)
    """
    from api.services.notification_service import notification_service as push_notifications

    try:
        if created:
            logger.info(f"📱 Nouvelle commande #{instance.id} → notif push restaurateur")
            push_notifications.notify_new_order(instance)
            return

        old_status = getattr(instance, "_old_status", None)
        new_status = instance.status

        if old_status == new_status:
            return  # pas de changement utile

        logger.info(
            f"📱 Changement statut commande #{instance.id}: {old_status} → {new_status}"
        )

        if new_status == "confirmed":
            push_notifications.notify_order_confirmed(instance)

        elif new_status == "preparing":
            push_notifications.notify_order_preparing(instance)

        elif new_status == "ready":
            push_notifications.notify_order_ready(instance)

        elif new_status == "served":
            push_notifications.notify_order_served(instance)

        elif new_status == "cancelled":
            # Priorité utilisateur connecté, fallback invité
            if instance.user_id:
                push_notifications.send_to_user(
                    user_id=instance.user_id,
                    title="❌ Commande annulée",
                    body=f"Votre commande #{instance.order_number} a été annulée.",
                    data={"order_id": instance.id, "action": "view_order"},
                    notification_type="order_cancelled",
                    priority="high",
                )
            elif instance.guest_phone:
                push_notifications.send_to_guest(
                    phone=instance.guest_phone,
                    title="❌ Commande annulée",
                    body=f"Votre commande #{instance.order_number} a été annulée.",
                    data={"order_id": instance.id},
                    notification_type="order_cancelled",
                )

    except Exception as e:
        logger.error(f"❌ Erreur notif push commande #{instance.id}: {e}")


# =============================================================================
# NOTIFICATIONS PUSH – PAIEMENT
# =============================================================================
@receiver(pre_save, sender=Order)
def capture_payment_status_change(sender, instance, **kwargs):
    """
    Capture du statut de paiement avant sauvegarde.
    (complémentaire à capture_order_changes / update_order_timestamps)
    """
    if instance.pk:
        try:
            old = Order.objects.get(pk=instance.pk)
            instance._old_payment_status = old.payment_status
        except Order.DoesNotExist:
            instance._old_payment_status = None


@receiver(post_save, sender=Order)
def send_payment_push_notifications(sender, instance, created, **kwargs):
    """
    Notif push → paiement reçu
    """
    if created:
        return

    from api.services.notification_service import notification_service as push_notifications

    try:
        old_payment = getattr(instance, "_old_payment_status", None)
        new_payment = instance.payment_status

        if old_payment == new_payment:
            return

        if new_payment == "paid":
            logger.info(f"💰 Paiement reçu pour commande #{instance.id}")
            push_notifications.notify_payment_received(
                instance, float(instance.total_amount or 0)
            )

    except Exception as e:
        logger.error(f"❌ Erreur notif paiement commande #{instance.id}: {e}")


# =============================================================================
# NOTIFICATIONS PUSH – PAIEMENT DIVISÉ
# =============================================================================
@receiver(pre_save, sender=SplitPaymentPortion)
def capture_portion_payment_change(sender, instance, **kwargs):
    """Capturer le changement de statut de paiement de portion"""
    if instance.pk:
        try:
            old_instance = SplitPaymentPortion.objects.get(pk=instance.pk)
            instance._old_is_paid = getattr(old_instance, "is_paid", False)
        except SplitPaymentPortion.DoesNotExist:
            instance._old_is_paid = False


@receiver(post_save, sender=SplitPaymentPortion)
def send_split_payment_notifications(sender, instance, created, **kwargs):
    """
    Envoyer des notifications lors des paiements de portions.
    """
    from api.services.notification_service import notification_service as push_notifications

    try:
        # Vérifier si la portion vient d'être payée
        if not created and instance.is_paid:
            old_is_paid = getattr(instance, "_old_is_paid", False)

            if not old_is_paid:
                # La portion vient d'être payée
                session = instance.session
                order = session.order

                # Compter les portions
                total_portions = session.portions.count()
                paid_portions = session.portions.filter(is_paid=True).count()

                logger.info(
                    f"💳 Portion payée: {paid_portions}/{total_portions} pour commande #{order.id}"
                )

                # Notifier de l'avancement
                push_notifications.notify_split_payment_update(
                    order=order,
                    portions_paid=paid_portions,
                    total_portions=total_portions,
                )

                # Si toutes les portions sont payées
                if paid_portions == total_portions:
                    push_notifications.notify_payment_received(
                        order, float(order.total_amount or 0)
                    )

    except Exception as e:
        logger.error(f"❌ Erreur notification split payment: {e}")


# =============================================================================
# NOTIFICATIONS PUSH – SESSIONS COLLABORATIVES
# =============================================================================
@receiver(pre_save, sender=SessionParticipant)
def capture_participant_status_change(sender, instance, **kwargs):
    """Capturer le changement de statut de participant (pour push)"""
    if instance.pk:
        try:
            old_instance = SessionParticipant.objects.get(pk=instance.pk)
            instance._old_participant_status = getattr(old_instance, "status", None)
        except SessionParticipant.DoesNotExist:
            instance._old_participant_status = None


@receiver(post_save, sender=SessionParticipant)
def send_session_participant_notifications(sender, instance, created, **kwargs):
    """
    Envoyer des notifications push lors des changements de participants.
    """
    from api.services.notification_service import notification_service as push_notifications

    try:
        if created and instance.status == "active":
            # Nouveau participant actif
            logger.info(f"👥 Nouveau participant dans session {instance.session_id}")
            push_notifications.notify_session_participant_joined(
                session=instance.session,
                participant_name=instance.display_name or "Un invité",
            )

        elif not created:
            # Vérifier si le participant vient d'être approuvé
            old_status = getattr(instance, "_old_participant_status", None)

            if old_status == "pending" and instance.status == "active":
                logger.info(f"✅ Participant approuvé dans session {instance.session_id}")
                push_notifications.notify_session_participant_joined(
                    session=instance.session,
                    participant_name=instance.display_name or "Un invité",
                )

    except Exception as e:
        logger.error(f"❌ Erreur notification participant: {e}")


# =============================================================================
# NOTIFICATIONS PUSH – RESTAURANT / STRIPE
# =============================================================================
@receiver(pre_save, sender=Restaurant)
def capture_restaurant_stripe_change(sender, instance, **kwargs):
    """Capturer le changement de statut Stripe pour push"""
    if instance.pk:
        try:
            old_instance = Restaurant.objects.get(pk=instance.pk)
            instance._old_stripe_active = getattr(
                old_instance, "is_stripe_active", False
            )
        except Restaurant.DoesNotExist:
            instance._old_stripe_active = False


@receiver(post_save, sender=Restaurant)
def send_restaurant_status_notifications(sender, instance, created, **kwargs):
    """
    Notifier les restaurateurs des changements importants (Stripe activé).
    """
    from api.services.notification_service import notification_service as push_notifications

    if created:
        return

    try:
        old_stripe_active = getattr(instance, "_old_stripe_active", None)
        new_stripe_active = instance.is_stripe_active

        if old_stripe_active is False and new_stripe_active is True:
            # Restaurant activé pour les paiements
            owner_id = instance.owner.user_id

            push_notifications.send_to_user(
                user_id=owner_id,
                title="🎉 Paiements activés !",
                body=f"Votre restaurant {instance.name} peut maintenant recevoir des paiements via l'application.",
                data={"restaurant_id": instance.id, "action": "view_restaurant"},
                notification_type="system",
                priority="high",
            )
            logger.info(f"🎉 Restaurant {instance.name} activé pour les paiements")

    except Exception as e:
        logger.error(f"❌ Erreur notification restaurant: {e}")
