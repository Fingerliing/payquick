from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from api.models import RestaurateurProfile, Restaurant, ClientProfile
import logging

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
    """Vérifier que le restaurant peut être activé seulement si le propriétaire est validé Stripe"""
    if created or 'is_stripe_active' in kwargs.get('update_fields', []):
        if instance.is_stripe_active and not instance.owner.stripe_verified:
            # Le restaurant ne peut pas être actif si le propriétaire n'est pas validé Stripe
            instance.is_stripe_active = False
            instance.save(update_fields=['is_stripe_active'])
            logger.warning(f"Restaurant {instance.id} ({instance.name}) désactivé car le propriétaire n'est pas validé Stripe")
