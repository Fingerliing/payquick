"""
Modèles Legal pour EatQuickeR
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


class LegalConsent(models.Model):
    """Enregistre les consentements RGPD des utilisateurs"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='legal_consent')
    terms_version = models.CharField(max_length=20)  # Ex: "1.0.0"
    privacy_version = models.CharField(max_length=20)
    consent_date = models.DateTimeField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'legal_consent'
        verbose_name = 'Consentement légal'
        verbose_name_plural = 'Consentements légaux'
        
    def __str__(self):
        return f"Consentement de {self.user.username} (v{self.terms_version})"


class AccountDeletionRequest(models.Model):
    """Gestion des demandes de suppression de compte (RGPD)"""
    
    STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('cancelled', 'Annulée'),
        ('completed', 'Effectuée'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    requested_at = models.DateTimeField()
    scheduled_deletion_date = models.DateTimeField()  # 30 jours après la demande
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reason = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True)
    
    # Dates de traitement
    cancelled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'account_deletion_requests'
        ordering = ['-requested_at']
    
    def save(self, *args, **kwargs):
        if not self.scheduled_deletion_date:
            self.scheduled_deletion_date = self.requested_at + timedelta(days=30)
        super().save(*args, **kwargs)



class DataAccessLog(models.Model):
    """Journal des accès aux données (conformité RGPD)"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    action = models.CharField(max_length=50)  # 'export', 'view', 'delete', etc.
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField()
    details = models.JSONField(default=dict, blank=True)
    
    class Meta:
        db_table = 'data_access_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
        ]

