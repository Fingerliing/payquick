"""
Modèles Order pour EatQuickeR
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

    objects = OrderManager()
    
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
        
        for item in self.items.all():
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


class OrderItem(models.Model):
    order = models.ForeignKey('Order', related_name='items', on_delete=models.CASCADE)
    menu_item = models.ForeignKey('MenuItem', on_delete=models.CASCADE)
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

