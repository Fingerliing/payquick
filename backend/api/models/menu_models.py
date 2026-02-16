"""
Modèles Menu pour EatQuickeR
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


class Menu(models.Model):
    name = models.CharField(max_length=100)
    restaurant = models.ForeignKey('Restaurant', on_delete=models.CASCADE, related_name='menu')
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
        from api.models import Order
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
    restaurant = models.ForeignKey('Restaurant', on_delete=models.CASCADE)
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