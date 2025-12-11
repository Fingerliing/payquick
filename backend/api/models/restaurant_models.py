"""
Modèles Restaurant pour EatQuickeR
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

class Restaurant(models.Model):
    """Modèle Restaurant étendu pour correspondre au frontend"""
    
    name = models.CharField(max_length=100, verbose_name="Nom du restaurant")
    description = models.TextField(blank=True, verbose_name="Description")
    owner = models.ForeignKey(
        'RestaurateurProfile',
        on_delete=models.CASCADE,
        related_name='restaurants',
        verbose_name="Propriétaire"
    )
    
    address = models.CharField(max_length=255, verbose_name="Adresse")
    city = models.CharField(max_length=100, verbose_name="Ville")
    zip_code = models.CharField(max_length=10, verbose_name="Code postal")
    country = models.CharField(max_length=100, default='France', verbose_name="Pays")
    
    # Informations de contact
    phone = models.CharField(
        max_length=20, 
        validators=[validate_phone],
        verbose_name="Téléphone"
    )
    email = models.EmailField(verbose_name="Email de contact")
    website = models.URLField(blank=True, null=True, verbose_name="Site web")

    accepts_meal_vouchers = models.BooleanField(
        default=False,
        help_text="Indique si le restaurant accepte les titres-restaurant"
    )
    
    # Informations sur les titres-restaurant acceptés
    meal_voucher_info = models.TextField(
        blank=True,
        null=True,
        help_text="Informations supplémentaires sur les titres-restaurant acceptés (ex: types, conditions)"
    )
    
    # Informations métier
    CUISINE_CHOICES = [
        ('french', 'Française'),
        ('italian', 'Italienne'),
        ('asian', 'Asiatique'),
        ('mexican', 'Mexicaine'),
        ('indian', 'Indienne'),
        ('american', 'Américaine'),
        ('mediterranean', 'Méditerranéenne'),
        ('japanese', 'Japonaise'),
        ('chinese', 'Chinoise'),
        ('thai', 'Thaïlandaise'),
        ('other', 'Autre'),
    ]
    cuisine = models.CharField(
        max_length=50, 
        choices=CUISINE_CHOICES,
        verbose_name="Type de cuisine"
    )
    
    PRICE_RANGE_CHOICES = [
        (1, '€'),
        (2, '€€'),
        (3, '€€€'),
        (4, '€€€€'),
    ]
    price_range = models.IntegerField(
        choices=PRICE_RANGE_CHOICES,
        default=2,
        verbose_name="Gamme de prix"
    )
    
    # Données métier
    rating = models.DecimalField(
        max_digits=3, 
        decimal_places=2, 
        default=0.00,
        verbose_name="Note moyenne"
    )
    review_count = models.IntegerField(default=0, verbose_name="Nombre d'avis")
    
    # Image et médias
    image = models.ImageField(
        upload_to='restaurants/%Y/%m/', 
        blank=True, 
        null=True,
        verbose_name="Photo du restaurant"
    )
    
    # Géolocalisation
    latitude = models.DecimalField(
        max_digits=9, 
        decimal_places=6, 
        blank=True, 
        null=True,
        verbose_name="Latitude"
    )
    longitude = models.DecimalField(
        max_digits=9, 
        decimal_places=6, 
        blank=True, 
        null=True,
        verbose_name="Longitude"
    )
    
    # Statut et gestion
    is_active = models.BooleanField(default=True, verbose_name="Restaurant actif")
    siret = models.CharField(
        max_length=14,
        validators=[validate_siret],
        unique=True,
        help_text="Numéro SIRET à 14 chiffres",
        verbose_name="SIRET"
    )
    is_stripe_active = models.BooleanField(default=False, verbose_name="Paiements Stripe actifs")
    
    # NOUVEAU: Support des fermetures manuelles
    is_manually_overridden = models.BooleanField(default=False, verbose_name="Fermeture manuelle active")
    manual_override_reason = models.TextField(
        blank=True, 
        null=True,
        verbose_name="Raison de la fermeture manuelle"
    )
    manual_override_until = models.DateTimeField(
        blank=True, 
        null=True,
        verbose_name="Fermeture manuelle jusqu'à "
    )
    last_status_changed_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='restaurant_status_changes',
        verbose_name="Dernière modification par"
    )
    last_status_changed_at = models.DateTimeField(
        blank=True, 
        null=True,
        verbose_name="Dernière modification le"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifié le")
    
    class Meta:
        verbose_name = "Restaurant"
        verbose_name_plural = "Restaurants"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} - {self.city}"
    
    def save(self, *args, **kwargs):
        # Nettoyer l'override expiré automatiquement
        if self.is_manually_overridden and self.manual_override_until:
            if timezone.now() > self.manual_override_until:
                self.is_manually_overridden = False
                self.manual_override_reason = None
                self.manual_override_until = None
        
        super().save(*args, **kwargs)
    
    @property
    def can_receive_orders(self):
        """Vérifie si le restaurant peut recevoir des commandes"""
        # Vérifier l'override manuel en premier
        if self.is_manually_overridden:
            if self.manual_override_until and timezone.now() > self.manual_override_until:
                # Override expiré, le nettoyer
                self.is_manually_overridden = False
                self.manual_override_reason = None
                self.manual_override_until = None
                self.save(update_fields=[
                    'is_manually_overridden', 
                    'manual_override_reason', 
                    'manual_override_until'
                ])
            else:
                return False  # Fermé manuellement
        
        return (
            self.owner.stripe_verified and 
            self.owner.is_active and 
            self.is_stripe_active and
            self.is_active
        )
    
    @property
    def full_address(self):
        """Retourne l'adresse complète formatée"""
        return f"{self.address}, {self.zip_code} {self.city}, {self.country}"
    
    @property
    def price_range_display(self):
        """Retourne l'affichage de la gamme de prix"""
        return '€' * self.price_range

# NOUVEAU: Support des périodes multiples avec ID auto-incrémentés

class OpeningPeriod(models.Model):
    """Période d'ouverture dans une journée (ex: service midi, service soir)"""
    
    # Garder l'ID auto-incrémenté par défaut de Django
    opening_hours = models.ForeignKey(
        'OpeningHours',
        on_delete=models.CASCADE,
        related_name='periods'
    )
    
    start_time = models.TimeField(verbose_name="Heure d'ouverture")
    end_time = models.TimeField(verbose_name="Heure de fermeture")
    name = models.CharField(
        max_length=100, 
        blank=True, 
        null=True,
        help_text="Nom du service (ex: Service midi, Service soir)"
    )
    
    class Meta:
        ordering = ['start_time']
        verbose_name = "Période d'ouverture"
        verbose_name_plural = "Périodes d'ouverture"
    
    def __str__(self):
        name_part = f"{self.name} - " if self.name else ""
        return f"{name_part}{self.start_time} - {self.end_time}"
    
    def clean(self):
        if self.start_time and self.end_time:
            # Convertir en minutes pour comparaison
            start_minutes = self.start_time.hour * 60 + self.start_time.minute
            end_minutes = self.end_time.hour * 60 + self.end_time.minute
            
            # Vérifier durée minimale (30 minutes)
            if end_minutes > start_minutes:
                duration = end_minutes - start_minutes
            else:
                # Service qui traverse minuit
                duration = (24 * 60) - start_minutes + end_minutes
            
            if duration < 30:
                raise ValidationError(
                    "Une période doit durer au moins 30 minutes"
                )
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

# MODIFIÉ: Modèle des horaires d'ouverture - GARDER L'ID AUTO-INCRÉMENTÉ

class OpeningHours(models.Model):
    """Horaires d'ouverture d'un restaurant - Version multi-périodes"""
    
    DAYS_OF_WEEK = [
        (0, 'Dimanche'),
        (1, 'Lundi'),
        (2, 'Mardi'),
        (3, 'Mercredi'),
        (4, 'Jeudi'),
        (5, 'Vendredi'),
        (6, 'Samedi'),
    ]
    
    # GARDER l'ID auto-incrémenté de Django pour éviter les problèmes
    restaurant = models.ForeignKey(
        Restaurant, 
        on_delete=models.CASCADE, 
        related_name='opening_hours'
    )
    day_of_week = models.IntegerField(choices=DAYS_OF_WEEK)
    is_closed = models.BooleanField(default=False, verbose_name="Fermé ce jour")
    
    # DÉPRÉCIÉ: Garder pour rétrocompatibilité
    opening_time = models.TimeField(blank=True, null=True)
    closing_time = models.TimeField(blank=True, null=True)
    
    class Meta:
        unique_together = ('restaurant', 'day_of_week')
        ordering = ['day_of_week']
        verbose_name = "Horaires d'ouverture"
        verbose_name_plural = "Horaires d'ouverture"
    
    def __str__(self):
        day_name = dict(self.DAYS_OF_WEEK)[self.day_of_week]
        if self.is_closed:
            return f"{day_name}: Fermé"
        
        if self.periods.exists():
            periods_text = ', '.join([
                f"{p.start_time}-{p.end_time}" for p in self.periods.all()
            ])
            return f"{day_name}: {periods_text}"
        elif self.opening_time and self.closing_time:
            # Rétrocompatibilité
            return f"{day_name}: {self.opening_time} - {self.closing_time}"
        else:
            return f"{day_name}: Non défini"
    
    def clean(self):
        """Validation des périodes"""
        super().clean()
        
        # Pas de validation si fermé
        if self.is_closed:
            return
        
        # Si sauvegardé, vérifier les chevauchements de périodes
        if self.pk:
            periods = list(self.periods.all().order_by('start_time'))
            for i in range(len(periods) - 1):
                current = periods[i]
                next_period = periods[i + 1]
                
                if current.end_time > next_period.start_time:
                    raise ValidationError(
                        f"Chevauchement entre les périodes: "
                        f"{current.start_time}-{current.end_time} et "
                        f"{next_period.start_time}-{next_period.end_time}"
                    )

# NOUVEAU: Template d'horaires

class RestaurantHoursTemplate(models.Model):
    """Templates prédéfinis d'horaires pour différents types de restaurants"""
    
    CATEGORIES = [
        ('traditional', 'Restaurant traditionnel'),
        ('brasserie', 'Brasserie/Bistrot'),
        ('fast_food', 'Restauration rapide'),
        ('gastronomic', 'Restaurant gastronomique'),
        ('cafe', 'Café'),
        ('bar', 'Bar'),
        ('custom', 'Personnalisé'),
    ]
    
    # Utiliser UUID seulement pour les nouveaux modèles
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, verbose_name="Nom du template")
    description = models.TextField(verbose_name="Description")
    category = models.CharField(max_length=20, choices=CATEGORIES)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    # Données des horaires au format JSON
    hours_data = models.JSONField(
        help_text="Structure: [{dayOfWeek: 0, isClosed: false, periods: [...]}]"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['category', 'name']
        verbose_name = "Template d'horaires"
        verbose_name_plural = "Templates d'horaires"
    
    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"

