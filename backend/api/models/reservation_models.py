"""
Système de réservation avec pré-commande prépayée.

Flux :
  1. Réservation simple            → status='confirmed' immédiatement (gratuit)
  2. Réservation + pré-commande    → status='pending_payment' (créneau bloqué
     RESERVATION_PAYMENT_HOLD_MINUTES), Order en status='scheduled',
     paiement 100% obligatoire via PaymentIntent.
  3. Webhook payment_intent.succeeded → confirm_after_payment()
  4. Celery (fire_scheduled_preorders) → à starts_at - prep_lead_minutes,
     l'Order passe 'scheduled' → 'pending' et entre en file cuisine.
  5. Check-in (scan QR table)      → status='seated' ; si la cuisine n'a pas
     encore été déclenchée, déclenchement immédiat.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


def reservation_payment_deadline():
    minutes = getattr(django_settings, 'RESERVATION_PAYMENT_HOLD_MINUTES', 15)
    return timezone.now() + timedelta(minutes=minutes)


class Reservation(models.Model):
    STATUS_CHOICES = [
        ('pending_payment', 'En attente de paiement'),
        ('confirmed', 'Confirmée'),
        ('seated', 'Client installé'),
        ('completed', 'Terminée'),
        ('cancelled', 'Annulée'),
        ('no_show', 'Non présenté'),
        ('expired', 'Expirée (paiement non finalisé)'),
    ]

    # Statuts qui bloquent un créneau/table
    BLOCKING_STATUSES = ('pending_payment', 'confirmed', 'seated')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant', on_delete=models.CASCADE, related_name='reservations'
    )
    table = models.ForeignKey(
        'Table', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reservations',
        help_text="Table assignée automatiquement à la création"
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reservations'
    )

    # Contact (obligatoire pour les invités, pré-rempli pour les connectés)
    customer_name = models.CharField(max_length=100)
    customer_phone = models.CharField(max_length=20)
    customer_email = models.EmailField(blank=True)

    # Créneau
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(
        help_text="starts_at + duration_minutes (dénormalisé pour les requêtes d'overlap)"
    )
    duration_minutes = models.PositiveSmallIntegerField(default=90)
    party_size = models.PositiveSmallIntegerField(default=2)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='confirmed', db_index=True
    )

    # Pré-commande prépayée (100% obligatoire si présente)
    pre_order = models.OneToOneField(
        'Order', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reservation'
    )
    # Avance de déclenchement cuisine avant starts_at
    prep_lead_minutes = models.PositiveSmallIntegerField(default=15)
    kitchen_fired_at = models.DateTimeField(null=True, blank=True)

    # Cycle de vie
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Deadline de paiement pour pending_payment"
    )
    checked_in_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    refund_id = models.CharField(max_length=100, blank=True)

    special_requests = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['starts_at']
        indexes = [
            models.Index(fields=['restaurant', 'starts_at', 'status']),
            models.Index(fields=['table', 'starts_at']),
            models.Index(fields=['status', 'expires_at']),
        ]
        verbose_name = 'Réservation'
        verbose_name_plural = 'Réservations'

    def __str__(self):
        return (
            f"Résa {self.customer_name} — {self.restaurant.name} "
            f"table {self.table.number if self.table else '?'} "
            f"{timezone.localtime(self.starts_at):%d/%m %H:%M}"
        )

    # ── Helpers métier ───────────────────────────────────────────────────

    @property
    def has_paid_pre_order(self):
        return bool(self.pre_order and self.pre_order.payment_status == 'paid')

    @property
    def fire_kitchen_at(self):
        """Instant où la pré-commande doit partir en cuisine."""
        return self.starts_at - timedelta(minutes=self.prep_lead_minutes)

    def free_cancellation_deadline(self):
        minutes = getattr(
            django_settings, 'RESERVATION_FREE_CANCELLATION_MINUTES', 120
        )
        return self.starts_at - timedelta(minutes=minutes)

    def is_refundable(self):
        return (
            self.has_paid_pre_order
            and timezone.now() <= self.free_cancellation_deadline()
        )

    def confirm_after_payment(self):
        """Appelé par le webhook Stripe une fois le PaymentIntent succeeded."""
        if self.status == 'pending_payment':
            self.status = 'confirmed'
            self.expires_at = None
            self.save(update_fields=['status', 'expires_at', 'updated_at'])

    def fire_kitchen(self):
        """Bascule la pré-commande en file cuisine ('scheduled' → 'pending')."""
        if self.kitchen_fired_at or not self.has_paid_pre_order:
            return False
        order = self.pre_order
        if order.status != 'scheduled':
            return False
        order.status = 'pending'
        order.save(update_fields=['status'])
        self.kitchen_fired_at = timezone.now()
        self.save(update_fields=['kitchen_fired_at', 'updated_at'])
        return True

    def check_in(self):
        """Le client scanne le QR de sa table réservée."""
        self.status = 'seated'
        self.checked_in_at = timezone.now()
        self.save(update_fields=['status', 'checked_in_at', 'updated_at'])
        # Client en avance → on déclenche la cuisine tout de suite
        self.fire_kitchen()
