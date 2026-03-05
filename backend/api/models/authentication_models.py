"""
Modèles Authentication pour EatQuickeR
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


class EmailVerification(models.Model):
    """
    Modèle pour gérer la vérification des adresses email.

    Supporte:
    - Utilisateurs authentifiés (user renseigné)
    - Utilisateurs non authentifiés (user=None, ex: inscription)

    La vérification est identifiée par:
    - id (verification_id) — recommandé
    - email + user (si authentifié)
    - email seul (si non authentifié)
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='email_verifications',
        null=True,
        blank=True,
        help_text="Utilisateur associé (optionnel pour vérification pré-inscription)"
    )
    email = models.EmailField()
    code = models.CharField(max_length=6)
    is_verified = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_resend_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'email', 'is_verified']),
            models.Index(fields=['email', 'is_verified']),
            models.Index(fields=['code', 'created_at']),
        ]

    def __str__(self):
        user_str = self.user.username if self.user else "Anonymous"
        return f"EmailVerification({user_str}, {self.email})"

    def is_expired(self):
        """Vérifie si le code a expiré"""
        expiry_minutes = getattr(settings, 'SMS_CODE_EXPIRY_MINUTES', 10)
        expiry_time = self.created_at + timedelta(minutes=expiry_minutes)
        return timezone.now() > expiry_time

    def can_resend(self):
        """Vérifie si on peut renvoyer un code (cooldown respecté)"""
        if not self.last_resend_at:
            return True
        cooldown_seconds = getattr(settings, 'SMS_RESEND_COOLDOWN_SECONDS', 60)
        cooldown = timedelta(seconds=cooldown_seconds)
        return timezone.now() > (self.last_resend_at + cooldown)

    def generate_code(self):
        """Génère un code à 6 chiffres"""
        self.code = ''.join(random.choices(string.digits, k=6))
        return self.code

    def increment_attempts(self):
        """Incrémente le compteur de tentatives"""
        self.attempts += 1
        self.save(update_fields=['attempts'])

    def mark_verified(self):
        """Marque la vérification comme réussie"""
        self.is_verified = True
        self.verified_at = timezone.now()
        self.save(update_fields=['is_verified', 'verified_at'])


class PhoneVerification(models.Model):
    """
    Modèle legacy — conservé pour compatibilité des migrations.
    La vérification se fait désormais par email via EmailVerification.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='phone_verifications',
        null=True,
        blank=True,
    )
    phone_number = models.CharField(max_length=20)
    code = models.CharField(max_length=6)
    is_verified = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_resend_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'phone_number', 'is_verified']),
            models.Index(fields=['phone_number', 'is_verified']),
            models.Index(fields=['code', 'created_at']),
        ]

    def __str__(self):
        user_str = self.user.username if self.user else "Anonymous"
        return f"PhoneVerification({user_str}, {self.phone_number})"

    def is_expired(self):
        expiry_minutes = getattr(settings, 'SMS_CODE_EXPIRY_MINUTES', 10)
        expiry_time = self.created_at + timedelta(minutes=expiry_minutes)
        return timezone.now() > expiry_time

    def can_resend(self):
        if not self.last_resend_at:
            return True
        cooldown_seconds = getattr(settings, 'SMS_RESEND_COOLDOWN_SECONDS', 60)
        cooldown = timedelta(seconds=cooldown_seconds)
        return timezone.now() > (self.last_resend_at + cooldown)

    def generate_code(self):
        self.code = ''.join(random.choices(string.digits, k=6))
        return self.code

    def increment_attempts(self):
        self.attempts += 1
        self.save(update_fields=['attempts'])

    def mark_verified(self):
        self.is_verified = True
        self.verified_at = timezone.now()
        self.save(update_fields=['is_verified', 'verified_at'])


class PendingRegistration(models.Model):
    """
    Stocke temporairement les données d'inscription en attente de validation par email.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    nom = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=[('client', 'Client'), ('restaurateur', 'Restaurateur')])
    # telephone est conservé pour archivage mais n'est plus requis pour la vérification
    telephone = models.CharField(max_length=20, blank=True, default='')
    siret = models.CharField(max_length=14, blank=True, null=True)

    # Vérification par email
    verification_code = models.CharField(max_length=6)
    code_sent_at = models.DateTimeField(auto_now_add=True)
    last_resend_at = models.DateTimeField(null=True, blank=True)
    attempts = models.IntegerField(default=0)
    is_verified = models.BooleanField(default=False)

    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['email', 'verification_code']),
            models.Index(fields=['email', 'is_verified']),
            models.Index(fields=['created_at']),
        ]

    def is_expired(self):
        """Vérifie si le code a expiré"""
        expiry_time = self.code_sent_at + timedelta(minutes=settings.SMS_CODE_EXPIRY_MINUTES)
        return timezone.now() > expiry_time

    def is_registration_expired(self):
        """Vérifie si l'inscription temporaire a expiré"""
        expiry_time = self.created_at + timedelta(minutes=settings.REGISTRATION_TEMP_DATA_EXPIRY_MINUTES)
        return timezone.now() > expiry_time

    def can_resend(self):
        """Vérifie si on peut renvoyer un code"""
        if not self.last_resend_at:
            return True
        cooldown = timedelta(seconds=settings.SMS_RESEND_COOLDOWN_SECONDS)
        return timezone.now() > (self.last_resend_at + cooldown)

    def generate_code(self):
        """Génère un code à 6 chiffres"""
        self.verification_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        self.code_sent_at = timezone.now()
        return self.verification_code

    def increment_attempts(self):
        """Incrémente le compteur de tentatives"""
        self.attempts += 1
        self.save(update_fields=['attempts'])

    def mark_verified(self):
        """Marque comme vérifié"""
        self.is_verified = True
        self.save(update_fields=['is_verified'])

    def __str__(self):
        return f"PendingRegistration({self.email})"


@shared_task
def cleanup_expired_registrations():
    """Nettoie les inscriptions expirées"""
    from datetime import timedelta
    from django.utils import timezone

    expiry_date = timezone.now() - timedelta(minutes=30)
    deleted_count = PendingRegistration.objects.filter(
        created_at__lt=expiry_date,
        is_verified=False
    ).delete()[0]

    return f"Supprimé {deleted_count} inscriptions expirées"