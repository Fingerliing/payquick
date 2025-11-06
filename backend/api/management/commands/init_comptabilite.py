from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
import logging

from api.models import (
    RestaurateurProfile,
    ComptabiliteSettings,
    RecapitulatifTVA,
    Order,
    Restaurant,
)

logger = logging.getLogger('comptabilite')


class Command(BaseCommand):
    help = """
    Initialise le module comptabilité pour les restaurateurs existants.
    
    Cette commande:
    - Crée les paramètres comptables par défaut
    - Génère les récapitulatifs TVA historiques
    - Vérifie l'intégrité des données
    """
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--restaurateur-id',
            type=int,
            help='ID spécifique d\'un restaurateur (sinon tous)'
        )
        
        parser.add_argument(
            '--months-back',
            type=int,
            default=3,
            help='Nombre de mois d\'historique à générer (défaut: 3)'
        )
        
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Mode simulation sans modifications'
        )
        
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force la régénération même si déjà existant'
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('=== Initialisation Module Comptabilité ===\n'))
        
        restaurateur_id = options.get('restaurateur_id')
        months_back = options['months_back']
        dry_run = options['dry_run']
        force = options['force']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('🔍 MODE SIMULATION ACTIVÉ\n'))
        
        # Récupérer les restaurateurs
        if restaurateur_id:
            try:
                restaurateurs = [RestaurateurProfile.objects.get(id=restaurateur_id)]
            except RestaurateurProfile.DoesNotExist:
                raise CommandError(f'Restaurateur {restaurateur_id} introuvable')
        else:
            restaurateurs = RestaurateurProfile.objects.filter(
                is_active=True
            ).order_by('id')
        
        self.stdout.write(f'📊 {len(restaurateurs)} restaurateur(s) à traiter\n')
        
        success_count = 0
        error_count = 0
        
        for restaurateur in restaurateurs:
            try:
                self.stdout.write(f'\n▶️  Restaurateur {restaurateur.id}: {restaurateur.user.get_full_name()}')
                
                with transaction.atomic():
                    # 1. Créer les paramètres comptables
                    settings_created = self.create_settings(restaurateur, dry_run, force)
                    
                    # 2. Vérifier les données
                    issues = self.check_data_integrity(restaurateur)
                    if issues:
                        self.stdout.write(self.style.WARNING(f'   ⚠️  Problèmes détectés:'))
                        for issue in issues:
                            self.stdout.write(f'      - {issue}')
                    
                    # 3. Générer les récapitulatifs historiques
                    recaps_created = self.generate_historical_recaps(
                        restaurateur, months_back, dry_run, force
                    )
                    
                    # 4. Afficher le résumé
                    self.display_summary(restaurateur, settings_created, recaps_created)
                    
                    if dry_run:
                        # Annuler la transaction en mode simulation
                        raise Exception('Dry run - rollback')
                
                success_count += 1
                self.stdout.write(self.style.SUCCESS(f'   ✅ Traitement réussi'))
                
            except Exception as e:
                if dry_run and str(e) == 'Dry run - rollback':
                    self.stdout.write(self.style.WARNING(f'   🔄 Simulation terminée (rollback)'))
                else:
                    error_count += 1
                    self.stdout.write(self.style.ERROR(f'   ❌ Erreur: {str(e)}'))
                    logger.error(f'Erreur init comptabilité {restaurateur.id}: {str(e)}')
        
        # Résumé final
        self.stdout.write('\n' + '='*50)
        self.stdout.write(self.style.SUCCESS(f'\n✅ Succès: {success_count}'))
        if error_count:
            self.stdout.write(self.style.ERROR(f'❌ Erreurs: {error_count}'))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\n⚠️  AUCUNE MODIFICATION EFFECTUÉE (mode simulation)'))
    
    def create_settings(self, restaurateur, dry_run=False, force=False):
        """Crée les paramètres comptables"""
        
        if not force and hasattr(restaurateur, 'comptabilite_settings'):
            self.stdout.write('   📋 Paramètres existants')
            return False
        
        if dry_run:
            self.stdout.write('   📋 [SIMULATION] Création des paramètres')
            return True
        
        settings, created = ComptabiliteSettings.objects.get_or_create(
            restaurateur=restaurateur,
            defaults={
                'invoice_prefix': 'FACT',
                'invoice_year_reset': True,
                'tva_regime': 'normal',
                'export_format_default': 'FEC',
                'siret': restaurateur.siret or '',
            }
        )
        
        if created:
            self.stdout.write('   📋 Paramètres créés')
        else:
            self.stdout.write('   📋 Paramètres mis à jour')
        
        return created
    
    def check_data_integrity(self, restaurateur):
        """Vérifie l'intégrité des données"""
        issues = []
        
        # SIRET
        if not restaurateur.siret:
            issues.append('SIRET manquant')
        elif len(restaurateur.siret) != 14:
            issues.append(f'SIRET invalide ({len(restaurateur.siret)} caractères)')
        
        # Stripe
        if not restaurateur.stripe_account_id:
            issues.append('Compte Stripe non configuré')
        elif not restaurateur.stripe_verified:
            issues.append('Compte Stripe non vérifié')
        
        # Restaurant
        restaurants = Restaurant.objects.filter(owner=restaurateur)
        if not restaurants.exists():
            issues.append('Aucun restaurant')
        else:
            inactive = restaurants.filter(is_stripe_active=False).count()
            if inactive:
                issues.append(f'{inactive} restaurant(s) sans Stripe actif')
        
        return issues
    
    def generate_historical_recaps(self, restaurateur, months_back, dry_run=False, force=False):
        """Génère les récapitulatifs TVA historiques"""
        
        now = timezone.now()
        recaps_created = 0
        
        for i in range(months_back):
            # Calculer le mois
            date = now - timedelta(days=30 * i)
            year = date.year
            month = date.month
            
            # Vérifier si existe
            if not force and RecapitulatifTVA.objects.filter(
                restaurateur=restaurateur,
                year=year,
                month=month
            ).exists():
                continue
            
            if dry_run:
                self.stdout.write(f'   📊 [SIMULATION] Récap {month:02d}/{year}')
                recaps_created += 1
                continue
            
            # Créer le récap
            recap = self.create_recap_for_month(restaurateur, year, month)
            if recap:
                recaps_created += 1
                self.stdout.write(
                    f'   📊 Récap {month:02d}/{year}: '
                    f'{recap.nombre_factures} factures, '
                    f'CA: {recap.ca_ttc:.2f}€'
                )
        
        return recaps_created
    
    def create_recap_for_month(self, restaurateur, year, month):
        """Crée un récapitulatif pour un mois donné"""
        
        # Dates de la période
        date_debut = datetime(year, month, 1).date()
        if month == 12:
            date_fin = datetime(year + 1, 1, 1).date() - timedelta(days=1)
        else:
            date_fin = datetime(year, month + 1, 1).date() - timedelta(days=1)
        
        # Récupérer les commandes
        orders = Order.objects.filter(
            restaurant__owner=restaurateur,
            created_at__date__gte=date_debut,
            created_at__date__lte=date_fin,
            payment_status='paid'
        )
        
        if not orders.exists():
            return None
        
        # Créer le récap
        recap = RecapitulatifTVA.objects.create(
            restaurateur=restaurateur,
            year=year,
            month=month
        )
        
        # Calculer les totaux
        from django.db.models import Sum
        totals = orders.aggregate(
            total=Sum('total_amount'),
            count=Count('id')
        )
        
        recap.ca_ttc = totals['total'] or Decimal('0')
        recap.nombre_factures = totals['count'] or 0
        
        if recap.nombre_factures > 0:
            recap.ticket_moyen = recap.ca_ttc / recap.nombre_factures
        
        # Simplification: TVA 10% pour tout
        recap.ca_ht = recap.ca_ttc / Decimal('1.10')
        recap.tva_10_base = recap.ca_ht
        recap.tva_10_montant = recap.ca_ttc - recap.ca_ht
        recap.tva_total = recap.tva_10_montant
        
        recap.save()
        return recap
    
    def display_summary(self, restaurateur, settings_created, recaps_created):
        """Affiche le résumé pour un restaurateur"""
        
        # Statistiques globales
        total_orders = Order.objects.filter(
            restaurant__owner=restaurateur,
            payment_status='paid'
        ).count()
        
        total_ca = Order.objects.filter(
            restaurant__owner=restaurateur,
            payment_status='paid'
        ).aggregate(Sum('total_amount'))['total_amount__sum'] or Decimal('0')
        
        self.stdout.write(f'   📈 Statistiques globales:')
        self.stdout.write(f'      - Commandes totales: {total_orders}')
        self.stdout.write(f'      - CA total: {total_ca:.2f}€')
        self.stdout.write(f'      - Paramètres: {"créés" if settings_created else "existants"}')
        self.stdout.write(f'      - Récaps créés: {recaps_created}')