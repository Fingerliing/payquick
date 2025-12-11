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

