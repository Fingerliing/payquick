"""
Occupation de table hors réservation (walk-ins, blocages).

Deux sources :
  - 'manual' : le restaurateur marque la table occupée depuis le plan de salle
               (clients installés sans commande app)
  - 'order'  : créée automatiquement quand une commande active existe sur la
               table sans réservation associée (hook optionnel)

Une occupation active bloque les créneaux de réservation qui chevauchent
[started_at, expected_end_at) — cf. patch availability.
"""
import uuid
from datetime import timedelta

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

DEFAULT_OCCUPANCY_MINUTES = 90


def default_expected_end():
    return timezone.now() + timedelta(minutes=DEFAULT_OCCUPANCY_MINUTES)


class TableOccupancyQuerySet(models.QuerySet):
    def active(self):
        return self.filter(ended_at__isnull=True)

    def overlapping(self, table_ids, starts_at, ends_at):
        """Occupations actives chevauchant [starts_at, ends_at)."""
        return self.active().filter(
            table_id__in=table_ids,
            started_at__lt=ends_at,
            expected_end_at__gt=starts_at,
        )


class TableOccupancy(models.Model):
    SOURCE_CHOICES = [
        ('manual', 'Manuel (staff)'),
        ('order', 'Commande app'),
        ('blocked', 'Table bloquée'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant', on_delete=models.CASCADE, related_name='table_occupancies'
    )
    table = models.ForeignKey(
        'Table', on_delete=models.CASCADE, related_name='occupancies'
    )
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='manual')

    party_size = models.PositiveSmallIntegerField(default=2)
    started_at = models.DateTimeField(default=timezone.now)
    expected_end_at = models.DateTimeField(default=default_expected_end)
    ended_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    notes = models.CharField(max_length=200, blank=True)

    objects = TableOccupancyQuerySet.as_manager()

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['table', 'ended_at']),
            models.Index(fields=['restaurant', 'ended_at']),
        ]
        verbose_name = 'Occupation de table'
        verbose_name_plural = 'Occupations de tables'

    def __str__(self):
        return (
            f"Table {self.table.number} occupée ({self.get_source_display()}) "
            f"depuis {timezone.localtime(self.started_at):%H:%M}"
        )

    @property
    def is_active(self):
        return self.ended_at is None

    @property
    def is_overdue(self):
        return self.is_active and timezone.now() > self.expected_end_at

    def release(self):
        self.ended_at = timezone.now()
        self.save(update_fields=['ended_at'])

    def extend(self, minutes=30):
        self.expected_end_at += timedelta(minutes=minutes)
        self.save(update_fields=['expected_end_at'])
