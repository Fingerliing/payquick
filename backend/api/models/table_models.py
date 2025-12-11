"""
Modèles Table pour EatQuickeR
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


class Table(models.Model):
    """
    Modèle Table pour les QR codes
    """
    restaurant = models.ForeignKey(
        'Restaurant', 
        on_delete=models.CASCADE, 
        related_name='tables',
        verbose_name="Restaurant"
    )
    number = models.CharField(
        max_length=10, 
        verbose_name="Numéro de table",
        help_text="Numéro affiché sur la table (ex: 1, 2, A1, etc.)"
    )
    capacity = models.PositiveSmallIntegerField(
        default=4,
        verbose_name="Capacité",
        help_text="Nombre de personnes que peut accueillir la table"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Table active",
        help_text="Indique si la table peut recevoir des commandes"
    )
    qr_code = models.CharField(
        max_length=100, 
        unique=True, 
        blank=True, 
        null=True,
        verbose_name="Code QR",
        help_text="Identifiant unique pour le QR code (généré automatiquement)"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Créé le"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Modifié le"
    )
    
    class Meta:
        unique_together = ['restaurant', 'number']
        ordering = ['restaurant', 'number']
        verbose_name = "Table"
        verbose_name_plural = "Tables"
        indexes = [
            models.Index(fields=['restaurant', 'is_active']),
            models.Index(fields=['qr_code']),
        ]
    
    def __str__(self):
        return f"Table {self.number} - {self.restaurant.name}"
    
    def clean(self):
        """Validation personnalisée"""
        super().clean()
        
        if self.capacity and (self.capacity < 1 or self.capacity > 50):
            raise ValidationError({
                'capacity': 'La capacité doit être entre 1 et 50 personnes'
            })
    
    def save(self, *args, **kwargs):
        """Génère automatiquement le QR code si absent"""
        if not self.qr_code and self.restaurant_id and self.number:
            self.qr_code = f"R{self.restaurant_id}T{str(self.number).zfill(3)}"
        
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def identifiant(self):
        """Alias pour qr_code pour compatibilité frontend"""
        return self.qr_code
    
    @property
    def manualCode(self):
        """Code manuel pour les clients qui ne peuvent pas scanner"""
        return self.qr_code
    
    @property 
    def qrCodeUrl(self):
        """URL complète du QR code"""
        if self.qr_code:
            from django.conf import settings
            base_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            return f"{base_url}/table/{self.qr_code}"
        return None

# Manager personnalisé pour les commandes
