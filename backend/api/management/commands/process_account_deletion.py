from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import AccountDeletionRequest, User
from datetime import timedelta

class Command(BaseCommand):
    help = 'Traite les demandes de suppression de compte expirées'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Trouver les demandes expirées (30 jours)
        expired_requests = AccountDeletionRequest.objects.filter(
            status='pending',
            scheduled_deletion_date__lte=now
        )
        
        for request in expired_requests:
            user = request.user
            
            self.stdout.write(f'Suppression du compte: {user.email}')
            
            # Supprimer toutes les données
            # (les relations CASCADE géreront les dépendances)
            try:
                # Anonymiser d'abord les commandes (obligation légale de conservation)
                user.client_orders.update(
                    customer_name='[Utilisateur supprimé]',
                    email='deleted@eatandgo.com',
                    phone='0000000000'
                )
                
                # Marquer la demande comme complétée
                request.status = 'completed'
                request.completed_at = now
                request.save()
                
                # Supprimer définitivement l'utilisateur
                user.delete()
                
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Compte supprimé: {user.email}')
                )
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'✗ Erreur: {user.email} - {str(e)}')
                )