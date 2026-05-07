"""
Modèle Password Reset pour EatQuickeR
Gestion des demandes de réinitialisation de mot de passe par code email.
"""
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from celery import shared_task
import uuid
import random
import string


class PasswordResetCode(models.Model):
    """
    Code de réinitialisation de mot de passe envoyé par email.

    Sécurité:
    - Code à 6 chiffres
    - Expiration courte (10 min par défaut, configurable via settings)
    - Limite de tentatives (3 par défaut)
    - Cooldown de renvoi (60 s par défaut)
    - Lien faible vers User: stocké via user_id, mais l'API n'expose JAMAIS
      l'existence d'un compte (réponse générique côté view).
    - id UUID pour éviter d'énumérer les demandes.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    # On garde une FK nullable pour deux raisons :
    # 1) Si l'email saisi ne correspond à aucun compte, on crée tout de même un
    #    enregistrement "fantôme" (user=None) pour ne pas révéler l'existence
    #    du compte via le timing/nombre de réponses.
    # 2) Si l'utilisateur est supprimé entre la demande et la confirmation,
    #    on ne casse pas la chaîne (on annulera le reset à la confirmation).
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='password_reset_codes',
        null=True,
        blank=True,
    )
    email = models.EmailField()
    code = models.CharField(max_length=6)
    is_used = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)
    last_resend_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'is_used']),
            models.Index(fields=['user', 'is_used']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"PasswordResetCode({self.email}, used={self.is_used})"

    # ── Helpers métier ────────────────────────────────────────────────────────

    def generate_code(self):
        """Génère un code à 6 chiffres."""
        self.code = ''.join(random.choices(string.digits, k=6))
        return self.code

    def is_expired(self):
        """Code expiré ?"""
        expiry_minutes = getattr(settings, 'PASSWORD_RESET_CODE_EXPIRY_MINUTES', 10)
        return timezone.now() > (self.created_at + timedelta(minutes=expiry_minutes))

    def can_resend(self):
        """Cooldown anti-spam respecté ?"""
        if not self.last_resend_at:
            return True
        cooldown = getattr(
            settings,
            'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS',
            getattr(settings, 'SMS_RESEND_COOLDOWN_SECONDS', 60),
        )
        return timezone.now() > (self.last_resend_at + timedelta(seconds=cooldown))

    def increment_attempts(self):
        """Incrémente le compteur de tentatives."""
        self.attempts += 1
        self.save(update_fields=['attempts'])

    def mark_used(self):
        """Marque le code comme utilisé (mot de passe changé)."""
        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=['is_used', 'used_at'])


@shared_task
def cleanup_expired_password_reset_codes():
    """
    Nettoie les codes expirés ou utilisés > 24 h.
    À planifier via Celery Beat (cf. backend/celery.py).
    """
    expiry_minutes = getattr(settings, 'PASSWORD_RESET_CODE_EXPIRY_MINUTES', 10)
    expiry_threshold = timezone.now() - timedelta(minutes=expiry_minutes)
    used_threshold = timezone.now() - timedelta(hours=24)

    deleted_expired = PasswordResetCode.objects.filter(
        created_at__lt=expiry_threshold,
        is_used=False,
    ).delete()[0]

    deleted_used = PasswordResetCode.objects.filter(
        used_at__lt=used_threshold,
        is_used=True,
    ).delete()[0]

    return f"Supprimé {deleted_expired} codes expirés, {deleted_used} codes utilisés."
