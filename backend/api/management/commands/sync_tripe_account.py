import stripe
from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import RestaurateurProfile
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Synchronise les comptes Stripe avec la base de données'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Affiche les changements sans les appliquer',
        )

    def handle(self, *args, **options):
        stripe.api_key = settings.STRIPE_SECRET_KEY
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('Mode DRY RUN - Aucun changement ne sera appliqué'))
        
        restaurateurs_with_stripe = RestaurateurProfile.objects.exclude(stripe_account_id__isnull=True)
        
        for restaurateur in restaurateurs_with_stripe:
            try:
                account = stripe.Account.retrieve(restaurateur.stripe_account_id)
                
                # Vérifier si le compte est validé
                is_validated = (
                    account.get('charges_enabled', False) and 
                    account.get('details_submitted', False) and
                    account.get('payouts_enabled', False)
                )
                
                if is_validated and not restaurateur.stripe_verified:
                    if not dry_run:
                        restaurateur.stripe_verified = True
                        restaurateur.stripe_onboarding_completed = True
                        restaurateur.is_validated = True
                        restaurateur.is_active = True
                        restaurateur.save()
                        
                        # Activer les restaurants
                        restaurateur.restaurants.update(is_stripe_active=True)
                    
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'{"[DRY RUN] " if dry_run else ""}Compte validé pour {restaurateur.display_name} (ID: {restaurateur.id})'
                        )
                    )
                    
                elif not is_validated and restaurateur.stripe_verified:
                    if not dry_run:
                        restaurateur.stripe_verified = False
                        restaurateur.restaurants.update(is_stripe_active=False)
                        restaurateur.save()
                    
                    self.stdout.write(
                        self.style.WARNING(
                            f'{"[DRY RUN] " if dry_run else ""}Compte non validé pour {restaurateur.display_name} (ID: {restaurateur.id})'
                        )
                    )
                else:
                    self.stdout.write(
                        f'Aucun changement pour {restaurateur.display_name} (ID: {restaurateur.id})'
                    )
                        
            except stripe.error.StripeError as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'Erreur Stripe pour {restaurateur.display_name}: {str(e)}'
                    )
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'Erreur pour {restaurateur.display_name}: {str(e)}'
                    )
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'{"[DRY RUN] " if dry_run else ""}Synchronisation terminée'
            )
        )