from django.db.models.signals import post_save, pre_save
from django.contrib.auth.models import User, Group
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
    """
    Signal pour vérifier l'activation Stripe du restaurant
    """
    try:
        # CORRECTION: Gérer le cas où update_fields est None
        update_fields = kwargs.get('update_fields', None)
        if update_fields is None:
            update_fields = []
        
        # Maintenant on peut vérifier sans erreur
        if created or 'is_stripe_active' in update_fields:
            print(f"🔔 Signal Restaurant: {instance.name} - Stripe actif: {instance.is_stripe_active}")
            
            # Votre logique métier ici
            if instance.is_stripe_active:
                print(f"✅ Restaurant {instance.name} activé pour Stripe")
            else:
                print(f"⚠️  Restaurant {instance.name} désactivé pour Stripe")
                
    except Exception as e:
        print(f"❌ Erreur dans le signal Restaurant: {e}")
        # Ne pas faire planter la sauvegarde à cause d'un signal
        pass

@receiver(post_save, sender=RestaurateurProfile)
def assign_restaurateur_group(sender, instance, created, **kwargs):
    """
    Assigne automatiquement le groupe 'restaurateur' lors de la création du profil
    🎯 Cette fonction résout le problème d'assignation des groupes !
    """
    if created:  # Seulement lors de la création, pas des modifications
        try:
            # Créer le groupe s'il n'existe pas
            group, group_created = Group.objects.get_or_create(name="restaurateur")
            
            # Assigner l'utilisateur au groupe
            instance.user.groups.add(group)
            
            print(f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'restaurateur'")
            
            if group_created:
                print(f"✅ [SIGNAL] Groupe 'restaurateur' créé automatiquement")
                
        except Exception as e:
            print(f"❌ [SIGNAL] Erreur lors de l'assignation du groupe: {e}")

@receiver(post_save, sender=ClientProfile)
def assign_client_group(sender, instance, created, **kwargs):
    """
    Assigne automatiquement le groupe 'client' lors de la création du profil client
    """
    if created:
        try:
            group, group_created = Group.objects.get_or_create(name="client")
            instance.user.groups.add(group)
            
            print(f"✅ [SIGNAL] Utilisateur {instance.user.email} ajouté au groupe 'client'")
            
        except Exception as e:
            print(f"❌ [SIGNAL] Erreur lors de l'assignation du groupe client: {e}")

# Signal pour nettoyer les groupes lors de la suppression d'un profil
@receiver(post_save, sender=User)
def ensure_single_role_group(sender, instance, **kwargs):
    """
    S'assure qu'un utilisateur n'est que dans un seul groupe de rôle
    """
    user_groups = instance.groups.all()
    role_groups = ['restaurateur', 'client', 'admin']
    
    # Compter les groupes de rôle
    current_role_groups = [g.name for g in user_groups if g.name in role_groups]
    
    # Si l'utilisateur est dans plusieurs groupes de rôle, nettoyer
    if len(current_role_groups) > 1:
        print(f"⚠️ [SIGNAL] Utilisateur {instance.email} dans plusieurs groupes: {current_role_groups}")
        
        # Garder seulement le dernier groupe assigné (ou prioritaire)
        priority_order = ['admin', 'restaurateur', 'client']
        
        for role in priority_order:
            if role in current_role_groups:
                # Supprimer tous les autres groupes de rôle
                for other_role in role_groups:
                    if other_role != role:
                        try:
                            other_group = Group.objects.get(name=other_role)
                            instance.groups.remove(other_group)
                        except Group.DoesNotExist:
                            pass
                break