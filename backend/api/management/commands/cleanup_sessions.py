from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta
from api.models import CollaborativeTableSession

class Command(BaseCommand):
    help = 'Gère le nettoyage et l\'archivage des sessions collaboratives'

    def add_arguments(self, parser):
        # Mode d'opération
        parser.add_argument(
            '--mode',
            type=str,
            default='archive',
            choices=['archive', 'cleanup', 'both'],
            help='Mode: archive (archiver), cleanup (supprimer), both (les deux)'
        )
        
        # Durée avant archivage (en minutes)
        parser.add_argument(
            '--archive-after-minutes',
            type=int,
            default=5,
            help='Archiver les sessions completed depuis X minutes (défaut: 5)'
        )
        
        # Durée avant suppression (en jours)
        parser.add_argument(
            '--delete-after-days',
            type=int,
            default=30,
            help='Supprimer les sessions archivées depuis X jours (défaut: 30)'
        )
        
        # Options avancées
        parser.add_argument(
            '--force',
            action='store_true',
            help='Forcer l\'archivage des sessions abandonnées (actives > 12h)'
        )
        
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Afficher ce qui serait fait sans rien modifier'
        )

    def handle(self, *args, **options):
        mode = options['mode']
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('🔍 MODE DRY-RUN - Aucune modification'))
        
        self.stdout.write(
            self.style.SUCCESS(f'\n🚀 Démarrage du nettoyage des sessions - Mode: {mode}\n')
        )
        
        # Archiver les sessions éligibles
        if mode in ['archive', 'both']:
            self._archive_eligible_sessions(
                options['archive_after_minutes'],
                dry_run
            )
        
        # Forcer l'archivage des sessions abandonnées
        if options['force']:
            self._force_archive_abandoned(dry_run)
        
        # Nettoyer les sessions archivées anciennes
        if mode in ['cleanup', 'both']:
            self._cleanup_old_sessions(
                options['delete_after_days'],
                dry_run
            )
        
        self.stdout.write(self.style.SUCCESS('\n✅ Nettoyage terminé\n'))

    def _archive_eligible_sessions(self, minutes, dry_run):
        """Archive les sessions completed/cancelled depuis X minutes"""
        self.stdout.write('\n📦 ARCHIVAGE DES SESSIONS ÉLIGIBLES')
        self.stdout.write('-' * 50)
        
        cutoff_time = timezone.now() - timedelta(minutes=minutes)
        
        eligible = CollaborativeTableSession.objects.filter(
            status__in=['completed', 'cancelled'],
            is_archived=False,
            completed_at__lt=cutoff_time
        )
        
        count = eligible.count()
        
        if count == 0:
            self.stdout.write(self.style.WARNING('Aucune session à archiver'))
            return
        
        self.stdout.write(f'Sessions à archiver: {count}')
        
        if not dry_run:
            archived = 0
            for session in eligible:
                try:
                    session.archive(
                        reason=f"Archivage automatique ({minutes}min après completion)"
                    )
                    archived += 1
                    self.stdout.write(
                        f'  ✓ Session {session.share_code} '
                        f'(Table {session.table_number}) archivée'
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  ✗ Erreur session {session.share_code}: {e}'
                        )
                    )
            
            self.stdout.write(
                self.style.SUCCESS(f'✅ {archived} session(s) archivée(s)')
            )

    def _force_archive_abandoned(self, dry_run):
        """Archive de force les sessions abandonnées"""
        self.stdout.write('\n⚠️  ARCHIVAGE FORCÉ DES SESSIONS ABANDONNÉES')
        self.stdout.write('-' * 50)
        
        cutoff_time = timezone.now() - timedelta(hours=12)
        
        abandoned = CollaborativeTableSession.objects.filter(
            status__in=['active', 'locked'],
            is_archived=False,
            created_at__lt=cutoff_time
        )
        
        count = abandoned.count()
        
        if count == 0:
            self.stdout.write(self.style.WARNING('Aucune session abandonnée'))
            return
        
        self.stdout.write(
            self.style.WARNING(f'Sessions abandonnées détectées: {count}')
        )
        
        if not dry_run:
            archived = 0
            for session in abandoned:
                try:
                    session.status = 'cancelled'
                    session.save(update_fields=['status'])
                    session.archive(reason="Session abandonnée (inactif >12h)")
                    archived += 1
                    self.stdout.write(
                        f'  ✓ Session {session.share_code} '
                        f'(Table {session.table_number}) archivée (abandonnée)'
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  ✗ Erreur session {session.share_code}: {e}'
                        )
                    )
            
            self.stdout.write(
                self.style.WARNING(f'⚠️  {archived} session(s) abandonnée(s) archivée(s)')
            )

    def _cleanup_old_sessions(self, days, dry_run):
        """Supprime les sessions archivées depuis X jours"""
        self.stdout.write('\n🧹 SUPPRESSION DES SESSIONS ARCHIVÉES ANCIENNES')
        self.stdout.write('-' * 50)
        
        cutoff_date = timezone.now() - timedelta(days=days)
        
        old_sessions = CollaborativeTableSession.all_objects.filter(
            is_archived=True,
            archived_at__lt=cutoff_date
        )
        
        count = old_sessions.count()
        
        if count == 0:
            self.stdout.write(self.style.WARNING('Aucune session à supprimer'))
            return
        
        self.stdout.write(
            self.style.WARNING(
                f'Sessions à supprimer (archivées >{days} jours): {count}'
            )
        )
        
        # Afficher quelques exemples
        for session in old_sessions[:5]:
            self.stdout.write(
                f'  - {session.share_code} (Table {session.table_number}) '
                f'- Archivée le {session.archived_at.strftime("%Y-%m-%d %H:%M")}'
            )
        
        if count > 5:
            self.stdout.write(f'  ... et {count - 5} autre(s)')
        
        if not dry_run:
            old_sessions.delete()
            self.stdout.write(
                self.style.SUCCESS(f'✅ {count} session(s) supprimée(s)')
            )