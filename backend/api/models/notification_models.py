"""
Modèles pour le système de notifications push EatQuickeR
"""

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid


class PushNotificationToken(models.Model):
    """
    Stocke les tokens Expo Push pour chaque appareil utilisateur.
    Un utilisateur peut avoir plusieurs appareils.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='push_tokens',
        null=True,  # Permet les tokens pour invités
        blank=True
    )
    
    # Token Expo Push (format: ExponentPushToken[xxx])
    expo_token = models.CharField(max_length=255, unique=True)
    
    # Identifiant de l'appareil (pour éviter les doublons)
    device_id = models.CharField(max_length=255, null=True, blank=True)
    device_name = models.CharField(max_length=255, null=True, blank=True)
    device_platform = models.CharField(
        max_length=20,
        choices=[('ios', 'iOS'), ('android', 'Android'), ('web', 'Web')],
        default='android'
    )
    
    # Pour les invités sans compte
    guest_phone = models.CharField(max_length=20, null=True, blank=True)
    
    # Métadonnées
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'push_notification_tokens'
        verbose_name = 'Token de notification push'
        verbose_name_plural = 'Tokens de notification push'
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['expo_token']),
            models.Index(fields=['guest_phone']),
        ]
    
    def __str__(self):
        if self.user:
            return f"Token {self.user.username} - {self.device_platform}"
        return f"Token invité {self.guest_phone} - {self.device_platform}"
    
    def mark_as_used(self):
        """Marquer le token comme utilisé"""
        self.last_used_at = timezone.now()
        self.save(update_fields=['last_used_at'])


class NotificationPreferences(models.Model):
    """
    Préférences de notification par utilisateur.
    """
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='notification_preferences'
    )
    
    # Types de notifications activées
    order_updates = models.BooleanField(default=True, help_text="Mises à jour des commandes")
    order_ready = models.BooleanField(default=True, help_text="Commande prête")
    payment_received = models.BooleanField(default=True, help_text="Paiement reçu")
    new_orders = models.BooleanField(default=True, help_text="Nouvelles commandes (restaurateurs)")
    promotions = models.BooleanField(default=False, help_text="Offres promotionnelles")
    
    # Heures silencieuses (ne pas déranger)
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_hours_start = models.TimeField(null=True, blank=True, default="22:00")
    quiet_hours_end = models.TimeField(null=True, blank=True, default="08:00")
    
    # Son et vibration
    sound_enabled = models.BooleanField(default=True)
    vibration_enabled = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'notification_preferences'
        verbose_name = 'Préférences de notification'
        verbose_name_plural = 'Préférences de notification'
    
    def __str__(self):
        return f"Préférences de {self.user.username}"
    
    def is_quiet_time(self):
        """Vérifier si on est dans les heures silencieuses"""
        if not self.quiet_hours_enabled:
            return False
        
        now = timezone.localtime().time()
        start = self.quiet_hours_start
        end = self.quiet_hours_end
        
        if start <= end:
            return start <= now <= end
        else:
            # Passage de minuit (ex: 22h-8h)
            return now >= start or now <= end


class Notification(models.Model):
    """
    Historique des notifications envoyées.
    """
    NOTIFICATION_TYPES = [
        ('order_created', 'Commande créée'),
        ('order_confirmed', 'Commande confirmée'),
        ('order_preparing', 'Commande en préparation'),
        ('order_ready', 'Commande prête'),
        ('order_served', 'Commande servie'),
        ('order_cancelled', 'Commande annulée'),
        ('payment_received', 'Paiement reçu'),
        ('payment_failed', 'Échec de paiement'),
        ('split_payment_update', 'Mise à jour paiement divisé'),
        ('session_joined', 'Participant rejoint'),
        ('session_left', 'Participant parti'),
        ('promotion', 'Promotion'),
        ('system', 'Système'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Basse'),
        ('normal', 'Normale'),
        ('high', 'Haute'),
        ('critical', 'Critique'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Destinataire
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='notifications',
        null=True,
        blank=True
    )
    guest_phone = models.CharField(max_length=20, null=True, blank=True)
    
    # Contenu
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    body = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    
    # Référence optionnelle
    order_id = models.IntegerField(null=True, blank=True)
    restaurant_id = models.IntegerField(null=True, blank=True)
    
    # Statut
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Envoi push
    push_sent = models.BooleanField(default=False)
    push_sent_at = models.DateTimeField(null=True, blank=True)
    push_error = models.TextField(null=True, blank=True)
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'notifications'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
            models.Index(fields=['notification_type']),
            models.Index(fields=['order_id']),
        ]
    
    def __str__(self):
        return f"{self.notification_type}: {self.title}"
    
    def mark_as_read(self):
        """Marquer comme lu"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
    
    @property
    def is_expired(self):
        """Vérifier si la notification est expirée"""
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False