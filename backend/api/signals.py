from django.db.models.signals import post_save, pre_save
from django.contrib.auth.models import User, Group
from django.dispatch import receiver
from api.models import RestaurateurProfile, Restaurant, ClientProfile
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import datetime
import logging
import time

logger = logging.getLogger(__name__)

@receiver(post_save, sender=RestaurateurProfile)
def update_restaurant_stripe_status(sender, instance, **kwargs):
    """Mettre à jour le statut Stripe des restaurants quand le profil restaurateur change"""
    if kwargs.get('update_fields') is None or 'stripe_verified' in kwargs.get('update_fields', []):
        try:
            # Mettre à jour tous les restaurants de ce restaurateur
            Restaurant.objects.filter(owner=instance).update(
                is_stripe_active=instance.stripe_verified
            )
            
            if instance.stripe_verified:
                logger.info(f"Restaurants activés pour le restaurateur {instance.id} ({instance.display_name})")
            else:
                logger.info(f"Restaurants désactivés pour le restaurateur {instance.id} ({instance.display_name})")
                
        except Exception as e:
            logger.error(f"Erreur lors de la mise à jour des restaurants pour le restaurateur {instance.id}: {str(e)}")

@receiver(post_save, sender=Restaurant)
def check_restaurant_stripe_activation(sender, instance, created, **kwargs):
    """Signal pour vérifier l'activation Stripe du restaurant"""
    try:
        update_fields = kwargs.get('update_fields', None)
        if update_fields is None:
            update_fields = []
        
        if created or 'is_stripe_active' in update_fields:
            print(f"📍 Signal Restaurant: {instance.name} - Stripe actif: {instance.is_stripe_active}")
            
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
            print(f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'restaurateur'")
            
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
            print(f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'client'")
            
        except Exception as e:
            print(f"❌ [SIGNAL] Erreur lors de l'assignation du groupe client: {e}")

@receiver(post_save, sender=User)
def ensure_single_role_group(sender, instance, **kwargs):
    """S'assure qu'un utilisateur n'est que dans un seul groupe de rôle"""
    user_groups = instance.groups.all()
    role_groups = ['restaurateur', 'client', 'admin']
    
    current_role_groups = [g.name for g in user_groups if g.name in role_groups]
    
    if len(current_role_groups) > 1:
        print(f"⚠️ [SIGNAL] Utilisateur {instance.email} dans plusieurs groupes: {current_role_groups}")
        
        priority_order = ['admin', 'restaurateur', 'client']
        
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

# ✅ SERVICE DE NOTIFICATION WEBSOCKET AMÉLIORÉ
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
                "type": "order_update",  # ✅ Correspond à la méthode order_update du consumer
                "order_id": order_id,
                "status": status,
                "waiting_time": waiting_time,
                "timestamp": datetime.now().isoformat(),
                "data": data or {}
            }
            
            # ✅ Envoyer au groupe de cette commande spécifique
            group_name = f"order_{order_id}"
            async_to_sync(self.channel_layer.group_send)(group_name, message)
            
            logger.info(f"✅ Order update sent via WebSocket for order {order_id}: {status}")
            
            # ✅ NOUVEAU : Fallback vers SSE si configuré
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
                'type': 'order_update',
                'order_id': order_id,
                'status': status,
                'waiting_time': waiting_time,
                'timestamp': time.time(),
                'data': data or {}
            }
            
            broadcast_to_sse(order_id, message)
            logger.info(f"✅ Order update sent via SSE for order {order_id}")
            
        except ImportError:
            # SSE non disponible, continuer silencieusement
            pass
        except Exception as e:
            logger.warning(f"⚠️ SSE fallback failed: {e}")

# Instance globale du service
notification_service = OrderNotificationService()

@receiver(pre_save, sender='api.Order')
def capture_order_changes(sender, instance, **kwargs):
    """Capturer les changements avant sauvegarde"""
    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._old_status = getattr(old_instance, 'status', None)
            instance._old_waiting_time = getattr(old_instance, 'waiting_time', None)
        except sender.DoesNotExist:
            instance._old_status = None
            instance._old_waiting_time = None

@receiver(post_save, sender='api.Order')
def order_updated(sender, instance, created, **kwargs):
    """Signal déclenché lors de la mise à jour d'une commande - AMÉLIORÉ"""
    
    try:
        if created:
            # Nouvelle commande créée
            logger.info(f"📝 New order created: {instance.id}")
            notification_service.send_order_update(
                order_id=instance.id,
                status=getattr(instance, 'status', None),
                waiting_time=getattr(instance, 'waiting_time', None),
                data={"action": "created"}
            )
            return
        
        # Vérifier les changements
        old_status = getattr(instance, '_old_status', None)
        old_waiting_time = getattr(instance, '_old_waiting_time', None)
        current_status = getattr(instance, 'status', None)
        current_waiting_time = getattr(instance, 'waiting_time', None)
        
        # Changement de statut
        if old_status != current_status:
            logger.info(f"📊 Order {instance.id} status changed: {old_status} → {current_status}")
            notification_service.send_order_update(
                order_id=instance.id,
                status=current_status,
                waiting_time=current_waiting_time,
                data={
                    "action": "status_changed",
                    "old_status": old_status,
                    "new_status": current_status
                }
            )
        
        # Changement de temps d'attente uniquement
        elif old_waiting_time != current_waiting_time:
            logger.info(f"⏱️ Order {instance.id} waiting time updated: {old_waiting_time} → {current_waiting_time}")
            notification_service.send_order_update(
                order_id=instance.id,
                status=current_status,
                waiting_time=current_waiting_time,
                data={
                    "action": "waiting_time_updated",
                    "old_waiting_time": old_waiting_time,
                    "new_waiting_time": current_waiting_time
                }
            )
    
    except Exception as e:
        logger.error(f"❌ Error in order_updated signal: {e}")

# ✅ FONCTIONS UTILITAIRES AMÉLIORÉES
def notify_order_update(order_id, status=None, waiting_time=None, **extra_data):
    """Fonction utilitaire pour envoyer des notifications manuellement"""
    try:
        result = notification_service.send_order_update(
            order_id=order_id,
            status=status,
            waiting_time=waiting_time,
            data=extra_data
        )
        logger.info(f"📤 Manual notification sent for order {order_id}: {result}")
        return result
    except Exception as e:
        logger.error(f"❌ Manual notification failed for order {order_id}: {e}")
        return False

def notify_custom_event(order_id, event_type, message, **data):
    """Envoyer un événement personnalisé"""
    try:
        result = notification_service.send_order_update(
            order_id=order_id,
            data={
                "action": "custom_event",
                "event_type": event_type,
                "message": message,
                **data
            }
        )
        logger.info(f"🎉 Custom event sent for order {order_id}: {event_type}")
        return result
    except Exception as e:
        logger.error(f"❌ Custom event failed for order {order_id}: {e}")
        return False

# ✅ FONCTION DE TEST POUR LE DÉVELOPPEMENT
def test_websocket_notification(order_id, test_message="Test notification"):
    """Fonction de test pour vérifier les WebSockets (développement uniquement)"""
    from django.conf import settings
    
    if not getattr(settings, 'DEBUG', False):
        logger.warning("Test notifications only available in DEBUG mode")
        return False
    
    return notify_custom_event(
        order_id=order_id,
        event_type="test",
        message=test_message,
        timestamp=datetime.now().isoformat(),
        test=True
    )