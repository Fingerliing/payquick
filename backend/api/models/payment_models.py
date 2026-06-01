"""
Modèles Payment pour EatQuickeR
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


class SplitPaymentSession(models.Model):
    """Session de paiement divisé pour une commande"""
    
    SPLIT_TYPES = [
        ('equal', 'Équitable'),
        ('custom', 'Personnalisé'),
        ('items', 'Par article'),
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
        """Marquer la session comme terminée."""
        
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save()

    # ── Mode `items` : claim-based dynamic split ──────────────────────────

    def get_unclaimed_order_items(self):
        """
        QuerySet des OrderItem de la commande qui ne sont pas encore claim
        par au moins une portion (mode `items` uniquement).
        """
        OrderItem = self.order.items.model  # accès dynamique pour éviter import circulaire
        claimed_ids = SplitPaymentItemClaim.objects.filter(
            portion__session=self
        ).values_list('order_item_id', flat=True)
        return self.order.items.exclude(id__in=list(claimed_ids))

    def recompute_portions_from_claims(self):
        """
        Recalcule le montant de chaque portion en fonction des claims actuels.
        Règle : chaque OrderItem est partagé équitablement entre ses claimants
        (par ordre d'arrivée, le dernier absorbe le remainder pour gérer les
        centimes). Le pourboire est distribué proportionnellement aux bases.

        Les portions déjà payées (`is_paid=True`) ne sont JAMAIS modifiées
        — leur montant est figé au moment du paiement.
        """
        if self.split_type != 'items':
            return

        cent = Decimal('0.01')

        # 1. Base par portion à partir des claims
        portion_bases = {}  # portion_id -> Decimal
        for portion in self.portions.all():
            portion_bases[portion.id] = Decimal('0.00')

        for order_item in self.order.items.all():
            claims = SplitPaymentItemClaim.objects.filter(
                portion__session=self,
                order_item=order_item,
            ).order_by('created_at')
            n = claims.count()
            if n == 0:
                continue

            item_total = Decimal(str(order_item.total_price))
            share = (item_total / n).quantize(cent, rounding=ROUND_HALF_UP)
            distributed = share * (n - 1)
            last_share = item_total - distributed  # absorbe le remainder

            for i, claim in enumerate(claims):
                allocated = last_share if i == n - 1 else share
                portion_bases[claim.portion_id] = portion_bases.get(
                    claim.portion_id, Decimal('0.00')
                ) + allocated

        # 2. Distribution du pourboire au prorata des bases (parmi les non-payées)
        unpaid_portions = list(self.portions.filter(is_paid=False))
        unpaid_base_total = sum(
            portion_bases.get(p.id, Decimal('0.00')) for p in unpaid_portions
        )
        tip = Decimal(str(self.tip_amount or 0))

        tip_allocations = {p.id: Decimal('0.00') for p in unpaid_portions}
        if tip > 0 and unpaid_base_total > 0:
            distributed_tip = Decimal('0.00')
            last_with_base = None
            for p in unpaid_portions:
                if portion_bases.get(p.id, Decimal('0.00')) > 0:
                    last_with_base = p.id
            for p in unpaid_portions:
                base = portion_bases.get(p.id, Decimal('0.00'))
                if base <= 0:
                    continue
                if p.id == last_with_base:
                    tip_allocations[p.id] = tip - distributed_tip
                else:
                    share = (tip * base / unpaid_base_total).quantize(
                        cent, rounding=ROUND_HALF_UP
                    )
                    tip_allocations[p.id] = share
                    distributed_tip += share

        # 3. Application sur les portions non payées uniquement
        for p in unpaid_portions:
            new_amount = (
                portion_bases.get(p.id, Decimal('0.00'))
                + tip_allocations.get(p.id, Decimal('0.00'))
            ).quantize(cent, rounding=ROUND_HALF_UP)
            if p.amount != new_amount:
                p.amount = new_amount
                p.save(update_fields=['amount', 'updated_at'])

class SplitPaymentPortion(models.Model):
    """Une portion d'un paiement divisé"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        SplitPaymentSession, 
        on_delete=models.CASCADE,
        related_name='portions'
    )
    name = models.CharField(max_length=100, blank=True, default='')
    participant = models.ForeignKey(
        'SessionParticipant', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='split_portions'
    )
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

    @property
    def claimed_item_ids(self):
        """Liste des IDs des OrderItem claim par cette portion (mode `items`)."""
        return list(
            self.item_claims.values_list('order_item_id', flat=True)
        )


class SplitPaymentItemClaim(models.Model):
    """
    Lien N-N entre une portion et un OrderItem (mode `items` uniquement).

    Plusieurs portions peuvent claim le même OrderItem → le prix est divisé
    équitablement entre les claimants (cf. SplitPaymentSession.recompute_portions_from_claims).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portion = models.ForeignKey(
        SplitPaymentPortion,
        on_delete=models.CASCADE,
        related_name='item_claims',
    )
    order_item = models.ForeignKey(
        'OrderItem',
        on_delete=models.CASCADE,
        related_name='split_claims',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'split_payment_item_claims'
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['portion', 'order_item'],
                name='uniq_claim_portion_item',
            ),
        ]
        indexes = [
            models.Index(fields=['order_item'], name='split_claim_item_idx'),
        ]

    def __str__(self):
        return f"Claim portion={self.portion_id} item={self.order_item_id}"