import uuid
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from datetime import timedelta

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

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

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
        ('pending', 'En Attente'),
        ('paid', 'Payé'),
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
    
    # NOUVEAU: Support pour regroupement de commandes
    table_session_id = models.UUIDField(default=uuid.uuid4, editable=False, help_text="Identifie une session de table pour regrouper les commandes")
    order_sequence = models.PositiveIntegerField(default=1, help_text="Numéro de séquence pour cette table/session")
    is_main_order = models.BooleanField(default=True, help_text="Première commande de la session de table")
    
    # Statuts
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
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

    source = models.CharField(max_length=10, default="user")
    guest_contact_name = models.CharField(max_length=120, blank=True, null=True)
    guest_phone = models.CharField(max_length=32, blank=True, null=True)
    guest_email = models.EmailField(blank=True, null=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurant', 'table_number', 'status']),
            models.Index(fields=['table_session_id']),
            models.Index(fields=['restaurant', 'created_at']),
        ]
    
    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = self.generate_order_number()
        
        # Gestion automatique de la séquence pour la table
        if not self.pk and self.table_number:
            self.set_order_sequence()
        
        super().save(*args, **kwargs)
    
    def generate_order_number(self):
        """Génère un numéro de commande unique avec séquence table"""
        prefix = "T" if self.order_type == "dine_in" else "E"
        today = timezone.now().date()
        
        # Compter toutes les commandes du jour pour ce restaurant
        count = Order.objects.filter(
            restaurant=self.restaurant,
            created_at__date=today
        ).count() + 1
        
        # Si c'est une commande de table avec séquence
        if self.table_number and hasattr(self, 'order_sequence'):
            return f"{prefix}{self.table_number}-{self.order_sequence:02d}"
        
        return f"{prefix}{count:03d}"
    
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
    
    # ✅ AJOUT: Méthode manquante can_be_cancelled
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
    
    # ✅ AJOUT: Méthode manquante get_preparation_time
    def get_preparation_time(self):
        """Calcule le temps de préparation estimé en minutes"""
        if not self.items.exists():
            return 10  # Temps par défaut
        
        total_time = 0
        for item in self.items.all():
            # Utiliser preparation_time du MenuItem si disponible
            prep_time = getattr(item.menu_item, 'preparation_time', 5)
            total_time += prep_time * item.quantity
        
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


# Nouveau modèle pour suivre les sessions de table
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


# Nouveau manager pour les commandes avec méthodes utilitaires
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

# Ajouter le manager personnalisé au modèle Order
Order.add_to_class('objects', OrderManager())

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
    customizations = models.JSONField(default=dict, blank=True)  # Ex: {"sauce": "mayo", "cuisson": "bien cuit"}
    special_instructions = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.quantity}x {self.menu_item.name}"