"""
Modèles User pour EatQuickeR
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

from .validators import validate_siret, validate_phone

class RestaurateurProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="restaurateur_profile")
    siret = models.CharField(max_length=14, unique=True)
    is_validated = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    stripe_verified = models.BooleanField(default=False)
    stripe_account_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_onboarding_completed = models.BooleanField(default=False)
    stripe_account_created = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.siret}"
    
    @property
    def has_validated_profile(self):
        """Alias pour stripe_verified pour compatibilité"""
        return self.stripe_verified
    
    @has_validated_profile.setter
    def has_validated_profile(self, value):
        """Setter pour maintenir la compatibilité"""
        self.stripe_verified = value

    @property
    def display_name(self):
        """Retourne le nom d'affichage du restaurateur"""
        if hasattr(self.user, 'first_name') and self.user.first_name:
            return self.user.first_name
        return self.user.username
    

class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.user.username} - {self.phone}"

