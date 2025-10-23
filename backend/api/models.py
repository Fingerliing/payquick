import uuid
import random
import string
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from celery import shared_task

def validate_siret(value):
    if not value.isdigit():
        raise ValidationError("Le SIRET doit contenir uniquement des chiffres.")
    if len(value) != 14:
        raise ValidationError("Le SIRET doit contenir exactement 14 chiffres.")

def validate_phone(value):
    # Simple validation pour le téléphone français
    import re
    pattern = r'^(\+33|0)[1-9](\d{8})$'
    if not re.match(pattern, value.replace(' ', '').replace('.', '').replace('-', '')):
        raise ValidationError("Format de téléphone invalide")

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

class Menu(models.Model):
    name = models.CharField(max_length=100)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='menu')
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Menu de {self.restaurant.name}"

class MenuCategory(models.Model):
    """
    Modèle pour les catégories principales de menu (Entrées, Plats, Desserts, etc.)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant', 
        on_delete=models.CASCADE, 
        related_name='menu_categories',
        verbose_name="Restaurant"
    )
    
    # Informations de base
    name = models.CharField(
        max_length=100, 
        verbose_name="Nom de la catégorie"
    )
    description = models.TextField(
        blank=True, 
        null=True,
        verbose_name="Description"
    )
    
    # Apparence
    icon = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        verbose_name="Icône emoji",
        help_text="Emoji représentant la catégorie (ex: 🥗, 🍽️, 🍰)"
    )
    color = models.CharField(
        max_length=7,
        default='#1E2A78',
        verbose_name="Couleur",
        help_text="Code couleur hexadécimal (ex: #1E2A78)"
    )
    
    # Gestion
    is_active = models.BooleanField(
        default=True,
        verbose_name="Actif"
    )
    order = models.PositiveIntegerField(
        default=0,
        verbose_name="Ordre d'affichage"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Catégorie de menu"
        verbose_name_plural = "Catégories de menu"
        ordering = ['restaurant', 'order', 'name']
        unique_together = [['restaurant', 'name']]
        indexes = [
            models.Index(fields=['restaurant', 'is_active']),
            models.Index(fields=['restaurant', 'order']),
        ]
    
    def __str__(self):
        return f"{self.restaurant.name} - {self.name}"
    
    def clean(self):
        """Validation personnalisée"""
        if self.color and not self.color.startswith('#'):
            raise ValidationError("La couleur doit être un code hexadécimal (ex: #1E2A78)")
        
        if len(self.color) != 7:
            raise ValidationError("La couleur doit être au format #RRGGBB")
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def active_subcategories_count(self):
        """Retourne le nombre de sous-catégories actives"""
        return self.subcategories.filter(is_active=True).count()
    
    @property
    def total_menu_items_count(self):
        """Retourne le nombre total de plats dans cette catégorie"""
        return MenuItem.objects.filter(category=self, is_available=True).count()

class MenuSubCategory(models.Model):
    """
    Modèle pour les sous-catégories (Terre, Mer, Végétarien, etc.)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        MenuCategory,
        on_delete=models.CASCADE,
        related_name='subcategories',
        verbose_name="Catégorie parent"
    )
    
    # Informations de base
    name = models.CharField(
        max_length=100,
        verbose_name="Nom de la sous-catégorie"
    )
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name="Description"
    )
    
    # Gestion
    is_active = models.BooleanField(
        default=True,
        verbose_name="Actif"
    )
    order = models.PositiveIntegerField(
        default=0,
        verbose_name="Ordre d'affichage"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Sous-catégorie de menu"
        verbose_name_plural = "Sous-catégories de menu"
        ordering = ['category', 'order', 'name']
        unique_together = [['category', 'name']]
        indexes = [
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['category', 'order']),
        ]
    
    def __str__(self):
        return f"{self.category.name} > {self.name}"
    
    @property
    def restaurant(self):
        """Raccourci vers le restaurant via la catégorie parent"""
        return self.category.restaurant
    
    @property
    def menu_items_count(self):
        """Retourne le nombre de plats dans cette sous-catégorie"""
        return MenuItem.objects.filter(
            category=self.category,
            subcategory=self,
            is_available=True
        ).count()

class MenuItem(models.Model):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=6, decimal_places=2)
    category = models.ForeignKey(
        MenuCategory,
        on_delete=models.CASCADE,
        related_name='menu_items',
        verbose_name="Catégorie",
        null=True,  # Temporaire pour la migration
        blank=True
    )
    subcategory = models.ForeignKey(
        MenuSubCategory,
        on_delete=models.SET_NULL,
        related_name='menu_items',
        verbose_name="Sous-catégorie",
        null=True,
        blank=True
    )
    is_available = models.BooleanField(default=True)
    allergens = models.JSONField(default=list, blank=True, help_text="Liste des allergènes présents")
    is_vegetarian = models.BooleanField(default=False, verbose_name="Végétarien")
    is_vegan = models.BooleanField(default=False, verbose_name="Vegan")
    is_gluten_free = models.BooleanField(default=False, verbose_name="Sans gluten")
        # Informations nutritionnelles optionnelles
    calories = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Calories (pour 100g)"
    )
    
    preparation_time = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(120)],
        verbose_name="Temps de préparation (minutes)"
    )
    
    # Gestion des stocks (optionnel)
    stock_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Quantité en stock"
    )
    
    stock_alert_threshold = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Seuil d'alerte stock"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    image = models.ImageField(
        upload_to='menu_items/%Y/%m/',
        blank=True, null=True,
        verbose_name="Photo du plat"
    )
    
    class Meta:
        ordering = ['category', 'name']
        verbose_name = "Plat"
        verbose_name_plural = "Plats"

        # TVA
    VAT_CATEGORIES = [
        ('FOOD', 'Aliments (sur place ou à emporter)'),
        ('DRINK_SOFT', 'Boissons sans alcool'),
        ('DRINK_ALCOHOL', 'Boissons alcoolisées'),
        ('PACKAGED', 'Produits préemballés'),
    ]
    
    VAT_RATES = {
        'FOOD': Decimal('0.100'),
        'DRINK_SOFT': Decimal('0.100'),
        'DRINK_ALCOHOL': Decimal('0.200'),
        'PACKAGED': Decimal('0.055'),
    }
    
    vat_category = models.CharField(
        max_length=20,
        choices=VAT_CATEGORIES,
        default='FOOD',
        verbose_name="Catégorie TVA"
    )
    
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=3,
        default=0.10,
        verbose_name="Taux de TVA",
        help_text="Taux de TVA applicable (ex: 0.10 pour 10%)"
    )
    
    def save(self, *args, **kwargs):
        # Déterminer le taux depuis la catégorie si demandé
        if self.vat_category and not kwargs.get('skip_vat_calculation'):
            self.vat_rate = self.VAT_RATES.get(self.vat_category, Decimal('0.100'))
        # Arrondir systématiquement à 3 décimales
        if self.vat_rate is not None:
            self.vat_rate = Decimal(str(self.vat_rate)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
        # Valider puis sauvegarder
        self.full_clean()
        super().save(*args, **kwargs)
        
    @property
    def price_excl_vat(self):
        """Prix HT calculé depuis le prix TTC"""
        return self.price / (1 + self.vat_rate)
    
    @property
    def vat_amount(self):
        """Montant de la TVA pour ce produit"""
        return self.price - self.price_excl_vat
    
    @property
    def vat_rate_display(self):
        """Affichage du taux de TVA en pourcentage"""
        return f"{(self.vat_rate * 100):.1f}%"

    def __str__(self):
        return f"{self.name} - {self.price:.2f}€"

    def clean(self):
        """Validation personnalisée"""
        super().clean()
        
        # Si vegan, alors forcément végétarien
        if self.is_vegan and not self.is_vegetarian:
            self.is_vegetarian = True
        
        # Si sans gluten, ne doit pas contenir l'allergène gluten
        if self.is_gluten_free and 'gluten' in self.allergens:
            raise ValidationError("Un plat sans gluten ne peut pas contenir l'allergène gluten")
        
        # Si vegan, ne doit pas contenir lait ou œufs
        if self.is_vegan:
            vegan_incompatible = {'milk', 'eggs'}
            if any(allergen in vegan_incompatible for allergen in self.allergens):
                raise ValidationError("Un plat vegan ne peut pas contenir de lait ou d'œufs")
            if not self.is_vegetarian:
                self.is_vegetarian = True
    
        if self.subcategory and self.category:
            if self.subcategory.category != self.category:
                raise ValidationError(
                    "La sous-catégorie doit appartenir à la catégorie sélectionnée"
                )

    @property
    def allergen_display(self):
        """Retourne les noms des allergènes pour l'affichage"""
        allergen_names = {
            'gluten': 'Gluten',
            'crustaceans': 'Crustacés',
            'eggs': 'Œufs',
            'fish': 'Poissons',
            'peanuts': 'Arachides',
            'soybeans': 'Soja',
            'milk': 'Lait',
            'nuts': 'Fruits à coque',
            'celery': 'Céleri',
            'mustard': 'Moutarde',
            'sesame': 'Sésame',
            'sulphites': 'Sulfites',
            'lupin': 'Lupin',
            'molluscs': 'Mollusques',
        }
        return [allergen_names.get(allergen, allergen) for allergen in self.allergens]

    @property
    def dietary_tags(self):
        """Retourne les tags diététiques pour l'affichage"""
        tags = []
        if self.is_vegan:
            tags.append('Vegan')
        elif self.is_vegetarian:
            tags.append('Végétarien')
        if self.is_gluten_free:
            tags.append('Sans gluten')
        return tags

class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.user.username} - {self.phone}"

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

class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'En Attente'),
        ('confirmed', 'Confirmée'),
        ('preparing', 'En Préparation'),
        ('ready', 'Prête'),
        ('served', 'Servie'),
        ('cancelled', 'Annulée'),
    ]
    
    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Non payé'),
        ('pending', 'En Attente'),
        ('paid', 'Payé'),
        ('partial_paid', 'Partiellement payé'),
        ('cash_pending', 'En attente espèces'),
        ('failed', 'Échoué'),
    ]
    
    ORDER_TYPE_CHOICES = [
        ('dine_in', 'Sur Place'),
        ('takeaway', 'À Emporter'),
    ]
    
    # Identifiants
    order_number = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    restaurant = models.ForeignKey('Restaurant', on_delete=models.CASCADE)
    
    # Type et détails commande
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='dine_in')
    table_number = models.CharField(max_length=10, blank=True, null=True)
    customer_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    
    # Support pour regroupement de commandes
    table_session_id = models.UUIDField(default=uuid.uuid4, editable=False, help_text="Identifie une session de table pour regrouper les commandes")
    order_sequence = models.PositiveIntegerField(default=1, help_text="Numéro de séquence pour cette table/session")
    is_main_order = models.BooleanField(default=True, help_text="Première commande de la session de table")
    
    # Statuts
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    payment_method = models.CharField(max_length=50, blank=True)
    
    # Montants
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Timing
    estimated_ready_time = models.TimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    served_at = models.DateTimeField(null=True, blank=True)
    
    # Métadonnées
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Champs pour commandes invités
    source = models.CharField(max_length=10, default="user")
    guest_contact_name = models.CharField(max_length=120, blank=True, null=True)
    guest_phone = models.CharField(max_length=32, blank=True, null=True)
    guest_email = models.EmailField(blank=True, null=True)
    
    # Paiement divisé
    is_split_payment = models.BooleanField(default=False)

    # Session collaborative
    collaborative_session = models.ForeignKey(
        'CollaborativeTableSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        verbose_name="Session collaborative"
    )
    
    participant = models.ForeignKey(
        'SessionParticipant',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        verbose_name="Participant"
    )
    
    # Indique si cette commande est visible par tous les participants
    is_visible_to_session = models.BooleanField(
        default=True,
        verbose_name="Visible par la session"
    )

    # Détail TVA
    vat_details = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Détail TVA par taux",
        help_text='{"10": {"ht": 45.45, "tva": 4.55, "ttc": 50}, ...}'
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurant', 'table_number', 'status']),
            models.Index(fields=['table_session_id']),
            models.Index(fields=['restaurant', 'created_at']),
        ]

    def calculate_vat_breakdown(self):
        """Calcule la répartition de la TVA par taux"""
        vat_breakdown = {}
        
        for item in self.order_items.all():
            vat_key = f"{(item.vat_rate * 100):.1f}"
            if vat_key not in vat_breakdown:
                vat_breakdown[vat_key] = {
                    'ht': Decimal('0.00'),
                    'tva': Decimal('0.00'),
                    'ttc': Decimal('0.00')
                }
            
            item_ht = item.total_price / (1 + item.vat_rate)
            vat_breakdown[vat_key]['ht'] += item_ht
            vat_breakdown[vat_key]['tva'] += item.vat_amount
            vat_breakdown[vat_key]['ttc'] += item.total_price
        
        # Arrondir les valeurs
        for vat_rate in vat_breakdown:
            for key in vat_breakdown[vat_rate]:
                vat_breakdown[vat_rate][key] = round(vat_breakdown[vat_rate][key], 2)
        
        self.vat_details = vat_breakdown
        return vat_breakdown
    
    def __str__(self):
        return f"Order #{self.order_number} - {self.get_payment_status_display()}"
    
    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = self.generate_order_number()
        
        # Gestion automatique de la séquence pour la table
        if not self.pk and self.table_number:
            self.set_order_sequence()
        
        super().save(*args, **kwargs)
    
    def generate_order_number(self):
        """Génère un numéro de commande unique pour la production"""
        from django.utils import timezone
        from django.db.models import Max
        import random
        
        prefix = "T" if self.order_type == "dine_in" else "E"
        today = timezone.now().date()
        
        # Pour les commandes de table avec séquence
        if self.table_number and hasattr(self, 'order_sequence'):
            return f"{prefix}{self.table_number}-{self.order_sequence:02d}"
        
        # Méthode basée sur le max existant
        last_order = Order.objects.filter(
            restaurant=self.restaurant,
            created_at__date=today,
            order_number__regex=f'^{prefix}[0-9]+$'  # Seulement les numéros standard
        ).aggregate(
            max_num=Max('order_number')
        )
        
        if last_order['max_num']:
            try:
                # Extraire le numéro du dernier order_number
                last_num = int(last_order['max_num'][1:])
                next_num = last_num + 1
            except (ValueError, IndexError):
                next_num = 1
        else:
            next_num = 1
        
        # Générer le numéro avec vérification anti-collision
        max_attempts = 100
        for attempt in range(max_attempts):
            order_number = f"{prefix}{next_num:03d}"
            
            # Vérifier que ce numéro n'existe pas déjà
            if not Order.objects.filter(order_number=order_number).exists():
                return order_number
            
            next_num += 1
        
        # Fallback ultime : ajouter timestamp + random pour garantir l'unicité
        # Format : E001_143525_42 (pour 14:35:25 + nombre aléatoire)
        timestamp = timezone.now().strftime('%H%M%S')
        random_suffix = random.randint(10, 99)
        return f"{prefix}{next_num:03d}_{timestamp}_{random_suffix}"
    
    def set_order_sequence(self):
        """Définit la séquence de commande pour cette table"""
        if not self.table_number:
            return
        
        # Trouver la dernière commande active de cette table
        last_order = Order.objects.filter(
            restaurant=self.restaurant,
            table_number=self.table_number,
            status__in=['pending', 'confirmed', 'preparing', 'ready']
        ).order_by('-created_at').first()
        
        if last_order and last_order.table_session_id:
            # Continuer la session existante
            self.table_session_id = last_order.table_session_id
            self.order_sequence = last_order.order_sequence + 1
            self.is_main_order = False
        else:
            # Nouvelle session de table
            self.table_session_id = uuid.uuid4()
            self.order_sequence = 1
            self.is_main_order = True
    
    def can_be_cancelled(self):
        """Vérifie si une commande peut être annulée"""
        # Ne peut plus être annulée si déjà servie ou annulée
        if self.status in ['served', 'cancelled']:
            return False
        
        # Ne peut plus être annulée si en préparation depuis trop longtemps
        if self.status == 'preparing':
            elapsed = timezone.now() - self.created_at
            # Pas d'annulation si préparation depuis plus de 15 minutes
            return elapsed.total_seconds() < 900  # 15 minutes
        
        # Peut être annulée si pending, confirmed ou ready depuis peu
        return True
    
    def get_preparation_time(self):
        """Calcule le temps de préparation estimé en minutes"""
        if not self.items.exists():
            return 10  # Temps par défaut
        
        total_time = 0
        for item in self.items.all():
            # Vérifier que quantity n'est pas None
            quantity = item.quantity
            if quantity is None or quantity <= 0:
                continue  # Ignorer les items avec quantité invalide
            
            # Utiliser preparation_time du MenuItem si disponible
            prep_time = getattr(item.menu_item, 'preparation_time', 5)
            if prep_time is None:
                prep_time = 5  # Valeur par défaut si preparation_time est None
            
            total_time += prep_time * quantity
        
        # Ajouter un temps de base et un buffer
        base_time = 5
        buffer = max(5, total_time * 0.2)  # 20% de buffer, minimum 5min
        
        return int(base_time + total_time + buffer)
    
    @property
    def table_orders(self):
        """Retourne toutes les commandes de cette session de table"""
        if self.table_session_id:
            return Order.objects.filter(
                table_session_id=self.table_session_id
            ).order_by('created_at')
        return Order.objects.filter(id=self.id)
    
    @property
    def table_total_amount(self):
        """Montant total de toutes les commandes de cette table"""
        return self.table_orders.aggregate(
            total=models.Sum('total_amount')
        )['total'] or 0
    
    @property
    def table_status_summary(self):
        """Résumé des statuts pour cette session de table"""
        orders = self.table_orders
        statuses = orders.values_list('status', flat=True)
        
        return {
            'total_orders': orders.count(),
            'pending': statuses.filter(status='pending').count(),
            'confirmed': statuses.filter(status='confirmed').count(),
            'preparing': statuses.filter(status='preparing').count(),
            'ready': statuses.filter(status='ready').count(),
            'served': statuses.filter(status='served').count(),
            'cancelled': statuses.filter(status='cancelled').count(),
        }
    
    def can_add_order_to_table(self):
        """Vérifie si on peut ajouter une commande à cette table"""
        if not self.table_number:
            return False
        
        # Vérifier qu'il n'y a pas trop de commandes en attente
        pending_orders = Order.objects.filter(
            restaurant=self.restaurant,
            table_number=self.table_number,
            status__in=['pending', 'confirmed', 'preparing']
        ).count()
        
        # Limite configurable (par exemple 5 commandes max en cours)
        return pending_orders < 5
    
    def get_table_waiting_time(self):
        """Temps d'attente pour la table (basé sur la commande la plus ancienne)"""
        oldest_order = self.table_orders.filter(
            status__in=['pending', 'confirmed', 'preparing']
        ).order_by('created_at').first()
        
        if oldest_order:
            elapsed = timezone.now() - oldest_order.created_at
            return int(elapsed.total_seconds() / 60)
        return 0
    
    @property
    def has_split_payment(self):
        """Vérifie si cette commande a un paiement divisé"""
        return hasattr(self, 'split_payment_session')

    @property
    def split_payment_progress(self):
        """Retourne le progrès du paiement divisé (0-100)"""
        if not self.has_split_payment:
            return 100 if self.payment_status == 'paid' else 0
            
        session = self.split_payment_session
        total_with_tip = session.total_amount + session.tip_amount
        paid_amount = session.total_paid
        
        if total_with_tip <= 0:
            return 100
            
        progress = (paid_amount / total_with_tip) * 100
        return min(100, max(0, progress))


# Manager personnalisé pour les commandes
class OrderManager(models.Manager):
    def for_table(self, restaurant, table_number):
        """Toutes les commandes pour une table donnée"""
        return self.filter(
            restaurant=restaurant,
            table_number=table_number
        ).order_by('-created_at')
    
    def active_for_table(self, restaurant, table_number):
        """Commandes actives pour une table"""
        return self.for_table(restaurant, table_number).filter(
            status__in=['pending', 'confirmed', 'preparing', 'ready']
        )
    
    def by_table_session(self, session_id):
        """Commandes par session de table"""
        return self.filter(table_session_id=session_id).order_by('created_at')
    
    def table_statistics(self, restaurant, table_number):
        """Statistiques pour une table"""
        orders = self.for_table(restaurant, table_number)
        
        return {
            'total_orders': orders.count(),
            'total_revenue': orders.aggregate(
                total=models.Sum('total_amount')
            )['total'] or 0,
            'average_order_value': orders.aggregate(
                avg=models.Avg('total_amount')
            )['avg'] or 0,
            'active_orders': orders.filter(
                status__in=['pending', 'confirmed', 'preparing', 'ready']
            ).count()
        }
Order.add_to_class('objects', OrderManager())

class TableSession(models.Model):
    """Modèle pour suivre les sessions de table et regrouper les commandes"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey('Restaurant', on_delete=models.CASCADE)
    table_number = models.CharField(max_length=10)
    
    # Session info
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    # Customer info (pour la session)
    primary_customer_name = models.CharField(max_length=100, blank=True)
    primary_phone = models.CharField(max_length=20, blank=True)
    guest_count = models.PositiveIntegerField(default=1)
    
    # Notes de session
    session_notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['restaurant', 'table_number', 'is_active']),
        ]
    
    def __str__(self):
        return f"Session Table {self.table_number} - {self.restaurant.name}"
    
    @property
    def orders(self):
        """Toutes les commandes de cette session"""
        return Order.objects.filter(table_session_id=self.id)
    
    @property
    def total_amount(self):
        """Montant total de la session"""
        return self.orders.aggregate(
            total=models.Sum('total_amount')
        )['total'] or 0
    
    @property
    def orders_count(self):
        """Nombre de commandes dans cette session"""
        return self.orders.count()
    
    @property
    def duration(self):
        """Durée de la session"""
        end_time = self.ended_at or timezone.now()
        return end_time - self.started_at
    
    def end_session(self):
        """Termine la session de table"""
        self.is_active = False
        self.ended_at = timezone.now()
        self.save()
    
    def can_add_order(self):
        """Vérifie si on peut ajouter une commande à cette session"""
        if not self.is_active:
            return False
        
        # Vérifier le nombre de commandes en cours
        active_orders = self.orders.filter(
            status__in=['pending', 'confirmed', 'preparing']
        ).count()
        
        return active_orders < 5  # Limite configurable
        
def default_expires_at():
    return timezone.now() + timedelta(minutes=15)

class DraftOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE)
    table_number = models.CharField(max_length=12, blank=True, null=True)
    items = models.JSONField()  # [{menu_item_id, quantity, options}]
    amount = models.PositiveIntegerField(help_text="centimes")
    currency = models.CharField(max_length=10, default="eur")
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=32)
    email = models.EmailField(blank=True, null=True)
    payment_method = models.CharField(
        max_length=10,
        choices=[("online","online"),("cash","cash")]
    )
    payment_intent_id = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(
        max_length=20,
        default="created"  # created|pi_succeeded|failed|expired|confirmed_cash
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_expires_at)

    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Personnalisations
    customizations = models.JSONField(default=dict, blank=True)
    special_instructions = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    # TVA
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=3,
        default=0.10,
        verbose_name="Taux de TVA appliqué"
    )
    vat_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Montant TVA"
    )
    
    def save(self, *args, **kwargs):
        # Récupérer le taux TVA du MenuItem avec arrondi
        if self.menu_item and not self.vat_rate:
            menu_vat_rate = self.menu_item.vat_rate or Decimal('0.10')
            # Arrondir à 3 décimales pour respecter la contrainte
            self.vat_rate = Decimal(str(menu_vat_rate)).quantize(
                Decimal('0.001'), 
                rounding=ROUND_HALF_UP
            )
        
        # S'assurer que vat_rate est toujours arrondi même si assigné directement
        if self.vat_rate:
            self.vat_rate = Decimal(str(self.vat_rate)).quantize(
                Decimal('0.001'), 
                rounding=ROUND_HALF_UP
            )
        
        # Calculer le montant TVA
        if self.total_price:
            price_excl_vat = self.total_price / (1 + self.vat_rate)
            self.vat_amount = self.total_price - price_excl_vat
        
        super().save(*args, **kwargs)
    
    def clean(self):
        """Validation avant sauvegarde"""
        super().clean()
        
        if self.quantity is None:
            raise ValidationError("La quantité ne peut pas être None")
        if not isinstance(self.quantity, int) or self.quantity <= 0:
            raise ValidationError("La quantité doit être un entier positif")

        # Vérifier que unit_price n'est pas None
        if self.unit_price is None:
            raise ValidationError("Le prix unitaire ne peut pas être None")
        
        try:
            from decimal import Decimal
            unit_price_decimal = Decimal(str(self.unit_price))
            if unit_price_decimal < 0:
                raise ValidationError("Le prix unitaire ne peut pas être négatif")
        except (ValueError, TypeError):
            raise ValidationError("Le prix unitaire doit être un nombre valide")
        
        # Valider que vat_rate respecte la contrainte
        if self.vat_rate is not None:
            try:
                # Vérifier que le vat_rate n'a pas plus de 3 décimales
                vat_decimal = Decimal(str(self.vat_rate))
                # Tester si l'arrondi à 3 décimales change la valeur
                rounded_vat = vat_decimal.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
                if vat_decimal != rounded_vat:
                    # Auto-correction si possible
                    self.vat_rate = rounded_vat
            except (ValueError, TypeError):
                raise ValidationError("Le taux de TVA doit être un nombre valide")

    class Meta:
        verbose_name = "Article de commande"
        verbose_name_plural = "Articles de commande"
        
    def __str__(self):
        return f"{self.menu_item.name} x{self.quantity} - {self.total_price}€"

class DailyMenu(models.Model):
    """
    Menu du jour pour un restaurant à une date donnée.
    Optionnel - pas tous les restaurants utilisent cette fonctionnalité.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='daily_menus',
        verbose_name="Restaurant"
    )
    date = models.DateField(
        verbose_name="Date du menu",
        help_text="Date pour laquelle ce menu du jour est valide"
    )
    
    # Configuration
    is_active = models.BooleanField(
        default=True,
        verbose_name="Menu actif",
        help_text="Si False, le menu du jour n'apparaît pas côté client"
    )
    special_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Prix menu complet",
        help_text="Prix spécial pour l'ensemble du menu (optionnel)"
    )
    
    # Texte promotionnel
    title = models.CharField(
        max_length=200,
        default="Menu du Jour",
        verbose_name="Titre du menu"
    )
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name="Description",
        help_text="Description ou note spéciale pour ce menu"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Créé par"
    )
    
    class Meta:
        verbose_name = "Menu du jour"
        verbose_name_plural = "Menus du jour"
        ordering = ['-date', '-created_at']
        unique_together = [['restaurant', 'date']]
        indexes = [
            models.Index(fields=['restaurant', 'date']),
            models.Index(fields=['restaurant', 'is_active']),
            models.Index(fields=['date', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.restaurant.name} - {self.title} ({self.date})"
    
    def clean(self):
        """Validation personnalisée"""
        # Vérifier que la date n'est pas trop ancienne
        if self.date < timezone.now().date() - timedelta(days=7):
            raise ValidationError("Impossible de créer un menu pour une date antérieure à 7 jours")
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def is_today(self):
        """Vérifie si ce menu est pour aujourd'hui"""
        return self.date == timezone.now().date()
    
    @property
    def is_future(self):
        """Vérifie si ce menu est pour une date future"""
        return self.date > timezone.now().date()
    
    @property
    def total_items_count(self):
        """Nombre total d'items disponibles dans ce menu"""
        return self.daily_menu_items.filter(is_available=True).count()
    
    @property
    def estimated_total_price(self):
        """Prix total estimé si on commande tous les plats"""
        items = self.daily_menu_items.filter(is_available=True)
        total = sum(item.effective_price for item in items)
        return total


class DailyMenuItem(models.Model):
    """
    Association entre un menu du jour et un plat avec configuration spécifique.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    daily_menu = models.ForeignKey(
        DailyMenu,
        on_delete=models.CASCADE,
        related_name='daily_menu_items',
        verbose_name="Menu du jour"
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='daily_menu_appearances',
        verbose_name="Plat"
    )
    
    # Configuration spécifique pour ce jour
    is_available = models.BooleanField(
        default=True,
        verbose_name="Disponible aujourd'hui"
    )
    special_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Prix spécial",
        help_text="Prix pour ce jour (si différent du prix normal)"
    )
    display_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Ordre d'affichage"
    )
    
    # Notes spéciales
    special_note = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        verbose_name="Note spéciale",
        help_text="Note visible côté client (ex: 'Fait maison', 'Produit frais du jour')"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Plat du menu du jour"
        verbose_name_plural = "Plats des menus du jour"
        ordering = ['daily_menu__date', 'display_order', 'menu_item__category__order']
        unique_together = [['daily_menu', 'menu_item']]
        indexes = [
            models.Index(fields=['daily_menu', 'is_available']),
            models.Index(fields=['daily_menu', 'display_order']),
        ]
    
    def __str__(self):
        return f"{self.daily_menu.restaurant.name} - {self.menu_item.name} ({self.daily_menu.date})"
    
    def clean(self):
        """Validation personnalisée"""
        if self.menu_item.menu.restaurant != self.daily_menu.restaurant:
            raise ValidationError(
                "Le plat doit appartenir au même restaurant que le menu du jour"
            )
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def effective_price(self):
        """Prix effectif (spécial si défini, sinon prix normal)"""
        return self.special_price if self.special_price is not None else self.menu_item.price
    
    @property
    def has_discount(self):
        """Vérifie si le plat a un prix réduit"""
        return (
            self.special_price is not None and 
            self.special_price < self.menu_item.price
        )
    
    @property
    def discount_percentage(self):
        """Calcule le pourcentage de réduction"""
        if not self.has_discount:
            return 0
        original = float(self.menu_item.price)
        special = float(self.special_price)
        return round((original - special) / original * 100)


class DailyMenuTemplate(models.Model):
    """
    Templates pour faciliter la création de menus du jour récurrents.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='daily_menu_templates',
        verbose_name="Restaurant"
    )
    
    # Informations du template
    name = models.CharField(
        max_length=100,
        verbose_name="Nom du template"
    )
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name="Description"
    )
    
    # Configuration
    is_active = models.BooleanField(
        default=True,
        verbose_name="Template actif"
    )
    day_of_week = models.PositiveIntegerField(
        null=True,
        blank=True,
        choices=[
            (1, 'Lundi'),
            (2, 'Mardi'),
            (3, 'Mercredi'),
            (4, 'Jeudi'),
            (5, 'Vendredi'),
            (6, 'Samedi'),
            (7, 'Dimanche'),
        ],
        verbose_name="Jour de la semaine",
        help_text="Si défini, ce template sera suggéré pour ce jour"
    )
    
    # Prix par défaut
    default_special_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Prix menu par défaut"
    )
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    usage_count = models.PositiveIntegerField(
        default=0,
        verbose_name="Nombre d'utilisations"
    )
    last_used = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Dernière utilisation"
    )
    
    class Meta:
        verbose_name = "Template de menu du jour"
        verbose_name_plural = "Templates de menus du jour"
        ordering = ['restaurant', 'name']
        unique_together = [['restaurant', 'name']]
    
    def __str__(self):
        return f"{self.restaurant.name} - {self.name}"
    
    def apply_to_date(self, date, user=None):
        """
        Applique ce template pour créer un menu du jour à la date donnée.
        """
        # Vérifier si un menu existe déjà pour cette date
        existing_menu = DailyMenu.objects.filter(
            restaurant=self.restaurant,
            date=date
        ).first()
        
        if existing_menu:
            raise ValidationError(f"Un menu du jour existe déjà pour le {date}")
        
        # Créer le menu du jour
        daily_menu = DailyMenu.objects.create(
            restaurant=self.restaurant,
            date=date,
            title=f"Menu du Jour - {self.name}",
            special_price=self.default_special_price,
            created_by=user
        )
        
        # Ajouter les plats du template
        for template_item in self.template_items.all():
            DailyMenuItem.objects.create(
                daily_menu=daily_menu,
                menu_item=template_item.menu_item,
                special_price=template_item.default_special_price,
                display_order=template_item.display_order,
                special_note=template_item.default_note
            )
        
        # Mettre à jour les statistiques du template
        self.usage_count += 1
        self.last_used = timezone.now()
        self.save(update_fields=['usage_count', 'last_used'])
        
        return daily_menu


class DailyMenuTemplateItem(models.Model):
    """
    Plats inclus dans un template de menu du jour.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        DailyMenuTemplate,
        on_delete=models.CASCADE,
        related_name='template_items',
        verbose_name="Template"
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        verbose_name="Plat"
    )
    
    # Configuration par défaut
    default_special_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Prix spécial par défaut"
    )
    display_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Ordre d'affichage"
    )
    default_note = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        verbose_name="Note par défaut"
    )
    
    class Meta:
        verbose_name = "Plat de template"
        verbose_name_plural = "Plats de templates"
        ordering = ['template', 'display_order']
        unique_together = [['template', 'menu_item']]
    
    def __str__(self):
        return f"{self.template.name} - {self.menu_item.name}"

class SplitPaymentSession(models.Model):
    """Session de paiement divisé pour une commande"""
    
    SPLIT_TYPES = [
        ('equal', 'Équitable'),
        ('custom', 'Personnalisé'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Terminée'),
        ('cancelled', 'Annulée'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(
        'Order', 
        on_delete=models.CASCADE, 
        related_name='split_payment_session'
    )
    split_type = models.CharField(max_length=10, choices=SPLIT_TYPES)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    tip_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='created_split_sessions'
    )

    class Meta:
        db_table = 'split_payment_sessions'
        ordering = ['-created_at']

    def __str__(self):
        return f"Split Payment #{self.order.id} - {self.split_type}"

    @property
    def is_completed(self):
        """Vérifier si tous les paiements sont effectués"""
        return self.status == 'completed' or (
            self.portions.exists() and 
            not self.portions.filter(is_paid=False).exists()
        )

    @property
    def total_paid(self):
        """Montant total déjà payé"""
        return self.portions.filter(is_paid=True).aggregate(
            total=models.Sum('amount')
        )['total'] or 0

    @property
    def remaining_amount(self):
        """Montant restant à payer"""
        total_with_tip = self.total_amount + self.tip_amount
        return total_with_tip - self.total_paid

    @property
    def remaining_portions_count(self):
        """Nombre de portions non payées"""
        return self.portions.filter(is_paid=False).count()

    def mark_as_completed(self):
        """Marquer la session comme terminée"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save()

        # Marquer la commande comme payée
        if hasattr(self.order, 'payment_status'):
            self.order.payment_status = 'paid'
            self.order.save()


class SplitPaymentPortion(models.Model):
    """Une portion d'un paiement divisé"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        SplitPaymentSession, 
        on_delete=models.CASCADE,
        related_name='portions'
    )
    name = models.CharField(max_length=100, blank=True, default='')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    is_paid = models.BooleanField(default=False)
    payment_intent_id = models.CharField(max_length=255, blank=True, null=True)
    payment_method = models.CharField(max_length=50, blank=True, default='online')
    
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='paid_portions'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'split_payment_portions'
        ordering = ['created_at']

    def __str__(self):
        status = "Payé" if self.is_paid else "En attente"
        name = self.name or "Anonyme"
        return f"{name} - {self.amount}€ ({status})"

    def mark_as_paid(self, payment_intent_id=None, user=None, payment_method='online'):
        """Marquer cette portion comme payée"""
        self.is_paid = True
        self.paid_at = timezone.now()
        self.payment_intent_id = payment_intent_id
        self.paid_by = user
        self.payment_method = payment_method
        self.save()

        # Vérifier si toutes les portions de la session sont payées
        session = self.session
        if not session.portions.filter(is_paid=False).exists():
            session.mark_as_completed()

class PhoneVerification(models.Model):
    """Modèle pour gérer la vérification des numéros de téléphone"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='phone_verifications')
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
            models.Index(fields=['code', 'created_at']),
        ]
    
    def is_expired(self):
        from django.conf import settings
        expiry_time = self.created_at + timedelta(minutes=settings.SMS_CODE_EXPIRY_MINUTES)
        return timezone.now() > expiry_time
    
    def can_resend(self):
        from django.conf import settings
        if not self.last_resend_at:
            return True
        cooldown = timedelta(seconds=settings.SMS_RESEND_COOLDOWN_SECONDS)
        return timezone.now() > (self.last_resend_at + cooldown)
    
    def generate_code(self):
        """Génère un code à 6 chiffres"""
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
    Stocke temporairement les données d'inscription en attente de validation SMS
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)  # username dans le système
    password_hash = models.CharField(max_length=255)  # Mot de passe hashé
    nom = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=[('client', 'Client'), ('restaurateur', 'Restaurateur')])
    telephone = models.CharField(max_length=20)
    siret = models.CharField(max_length=14, blank=True, null=True)
    
    # Vérification SMS
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
            models.Index(fields=['telephone', 'is_verified']),
            models.Index(fields=['created_at']),
        ]
    
    def is_expired(self):
        """Vérifie si le code a expiré"""
        from django.conf import settings
        expiry_time = self.code_sent_at + timedelta(minutes=settings.SMS_CODE_EXPIRY_MINUTES)
        return timezone.now() > expiry_time
    
    def is_registration_expired(self):
        """Vérifie si l'inscription temporaire a expiré"""
        from django.conf import settings
        expiry_time = self.created_at + timedelta(minutes=settings.REGISTRATION_TEMP_DATA_EXPIRY_MINUTES)
        return timezone.now() > expiry_time
    
    def can_resend(self):
        """Vérifie si on peut renvoyer un code"""
        from django.conf import settings
        if not self.last_resend_at:
            return True
        cooldown = timedelta(seconds=settings.SMS_RESEND_COOLDOWN_SECONDS)
        return timezone.now() > (self.last_resend_at + cooldown)
    
    def generate_code(self):
        """Génère un code à 6 chiffres"""
        import random
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


# Tâche de nettoyage périodique
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