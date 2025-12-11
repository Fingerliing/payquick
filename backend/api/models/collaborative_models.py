"""
Modèles Collaborative pour EatQuickeR
"""
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from celery import shared_task
import uuid
import random
import string


class ActiveSessionManager(models.Manager):
    """
    Manager qui exclut les sessions archivées par défaut
    """
    def get_queryset(self):
        return super().get_queryset().filter(is_archived=False)


class CollaborativeTableSession(models.Model):
    """
    Session collaborative pour une table - permet aux utilisateurs 
    de rejoindre une session commune ou de commander séparément
    """
    
    SESSION_TYPES = [
        ('collaborative', 'Collaborative'),  # Tous partagent la même session
        ('individual', 'Individuelle'),      # Chaque personne a sa propre commande
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('locked', 'Verrouillée'),  # Plus de nouveaux membres
        ('payment', 'En paiement'),
        ('completed', 'Terminée'),
        ('cancelled', 'Annulée'),
    ]
    
    # Identifiants
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    share_code = models.CharField(
        max_length=6,
        unique=True,
        db_index=True,
        verbose_name="Code de partage"
    )
    
    # Relations
    restaurant = models.ForeignKey(
        'Restaurant', 
        on_delete=models.CASCADE,
        related_name='collaborative_sessions'
    )
    table = models.ForeignKey(
        'Table',
        on_delete=models.CASCADE,
        related_name='collaborative_sessions',
        null=True,
        blank=True
    )
    table_number = models.CharField(max_length=10)
    
    # Configuration de session
    session_type = models.CharField(
        max_length=20, 
        choices=SESSION_TYPES,
        default='collaborative'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    # Hôte de la session
    host = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hosted_sessions',
        verbose_name="Hôte"
    )
    host_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Nom de l'hôte"
    )
    
    # Paramètres de session
    max_participants = models.PositiveIntegerField(
        default=10,
        verbose_name="Nombre max de participants"
    )
    require_approval = models.BooleanField(
        default=False,
        verbose_name="Approbation requise pour rejoindre"
    )
    allow_join_after_lock = models.BooleanField(
        default=False,
        verbose_name="Autoriser à rejoindre après verrouillage"
    )
    
    # Paiement
    split_payment_enabled = models.BooleanField(
        default=True,
        verbose_name="Paiement divisé activé"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Notes
    session_notes = models.TextField(blank=True)

    is_archived = models.BooleanField(
        default=False,
        help_text="Indique si la session est archivée (libère la table)"
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date et heure d'archivage de la session"
    )
    
    # ========== MANAGERS ==========
    # Manager par défaut : exclut les sessions archivées
    objects = ActiveSessionManager()
    
    # Manager pour accéder à TOUTES les sessions (y compris archivées)
    all_objects = models.Manager()
    
    class Meta:
        db_table = 'collaborative_table_sessions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurant', 'status']),
            models.Index(fields=['table', 'status']),
            models.Index(fields=['share_code']),
            models.Index(fields=['table', 'is_archived', 'status']),
            models.Index(fields=['is_archived', 'archived_at']),
        ]
    
    def __str__(self):
        return f"Session {self.share_code} - Table {self.table_number}"
    
    def save(self, *args, **kwargs):
        if not self.share_code:
            self.share_code = self.generate_share_code()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_share_code():
        """Génère un code de partage unique à 6 caractères"""
        while True:
            # Format: 3 lettres + 3 chiffres (ex: ABC123)
            letters = ''.join(random.choices(string.ascii_uppercase, k=3))
            digits = ''.join(random.choices(string.digits, k=3))
            code = letters + digits
            
            if not CollaborativeTableSession.objects.filter(share_code=code).exists():
                return code
    
    @property
    def participant_count(self):
        """Nombre de participants actifs"""
        return self.participants.filter(status='active').count()
    
    @property
    def is_full(self):
        """Vérifie si la session est pleine"""
        return self.participant_count >= self.max_participants
    
    @property
    def can_join(self):
        """Vérifie si quelqu'un peut rejoindre"""
        if self.status == 'completed' or self.status == 'cancelled':
            return False
        if self.status == 'locked' and not self.allow_join_after_lock:
            return False
        return not self.is_full
    
    @property
    def total_orders_count(self):
        """Nombre total de commandes dans cette session"""
        return self.orders.count()
    
    @property
    def total_amount(self):
        """Montant total de toutes les commandes"""
        return self.orders.aggregate(
            total=models.Sum('total_amount')
        )['total'] or Decimal('0.00')
    
    @property
    def pending_participants(self):
        """Participants en attente d'approbation"""
        return self.participants.filter(status='pending')
    
    def lock_session(self):
        """Verrouille la session (plus de nouveaux membres)"""
        self.status = 'locked'
        self.locked_at = timezone.now()
        self.save()
    
    def unlock_session(self):
        """Déverrouille la session"""
        if self.status == 'locked':
            self.status = 'active'
            self.locked_at = None
            self.save()
    
    def mark_completed(self):
        """Marque la session comme terminée"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save()

    def archive(self, reason=None):
        """
        Archive la session (libère la table sans supprimer les données)
        """
        self.is_archived = True
        self.archived_at = timezone.now()
        if reason:
            if not self.session_notes:
                self.session_notes = f"Archivé: {reason}"
            else:
                self.session_notes += f"\nArchivé: {reason}"
        self.save(update_fields=['is_archived', 'archived_at', 'session_notes'])
        
        # Log l'archivage
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            f"Session {self.id} archivée - Table {self.table_number} "
            f"- Raison: {reason or 'Non spécifiée'}"
        )
    
    def unarchive(self):
        """
        Désarchive la session (réactive la session)
        Utile si archivage accidentel
        """
        self.is_archived = False
        self.archived_at = None
        self.save(update_fields=['is_archived', 'archived_at'])
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Session {self.id} désarchivée - Table {self.table_number}")
    
    @property
    def can_be_archived(self):
        """
        Vérifie si la session peut être archivée
        """
        # Une session peut être archivée si elle est terminée ou annulée
        return self.status in ['completed', 'cancelled']
    
    @property
    def auto_archive_eligible(self):
        """
        Vérifie si la session est éligible pour l'archivage automatique
        """
        if not self.can_be_archived or self.is_archived:
            return False
        
        # Archiver automatiquement après 5 minutes de completion
        if self.completed_at:
            age = timezone.now() - self.completed_at
            return age.total_seconds() > 300  # 5 minutes
        
        return False
    
    def __str__(self):
        archived_status = " [ARCHIVÉE]" if self.is_archived else ""
        return (
            f"Session {self.share_code} - Table {self.table_number} "
            f"- {self.get_status_display()}{archived_status}"
        )


class SessionParticipant(models.Model):
    """
    Participant dans une session collaborative
    """
    
    PARTICIPATION_STATUS = [
        ('pending', 'En attente'),
        ('active', 'Actif'),
        ('left', 'Parti'),
        ('removed', 'Retiré'),
    ]
    
    PARTICIPATION_ROLE = [
        ('host', 'Hôte'),
        ('member', 'Membre'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    session = models.ForeignKey(
        CollaborativeTableSession,
        on_delete=models.CASCADE,
        related_name='participants'
    )
    
    # Identité du participant
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='table_participations'
    )
    guest_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Nom (invité)"
    )
    guest_phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Téléphone (invité)"
    )
    
    # Statut et rôle
    status = models.CharField(
        max_length=20,
        choices=PARTICIPATION_STATUS,
        default='active'
    )
    role = models.CharField(
        max_length=20,
        choices=PARTICIPATION_ROLE,
        default='member'
    )
    
    # Métadonnées
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)
    
    # Notes
    notes = models.TextField(blank=True)
    
    class Meta:
        db_table = 'session_participants'
        ordering = ['joined_at']
        unique_together = [['session', 'user']]  # Un user ne peut rejoindre qu'une fois
        indexes = [
            models.Index(fields=['session', 'status']),
        ]
    
    def __str__(self):
        name = self.display_name
        return f"{name} - {self.get_status_display()}"
    
    @property
    def display_name(self):
        """Nom d'affichage du participant"""
        if self.user:
            if hasattr(self.user, 'first_name') and self.user.first_name:
                return self.user.first_name
            return self.user.username
        return self.guest_name or "Invité"
    
    @property
    def is_host(self):
        """Vérifie si c'est l'hôte"""
        return self.role == 'host'
    
    @property
    def orders_count(self):
        """Nombre de commandes de ce participant"""
        return self.orders.count()
    
    @property
    def total_spent(self):
        """Montant total dépensé par ce participant"""
        return self.orders.aggregate(
            total=models.Sum('total_amount')
        )['total'] or Decimal('0.00')
    
    def leave_session(self):
        """Quitter la session"""
        self.status = 'left'
        self.left_at = timezone.now()
        self.save()

