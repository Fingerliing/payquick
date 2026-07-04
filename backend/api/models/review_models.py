# -*- coding: utf-8 -*-
"""
Modèle d'avis / notation des restaurants.

Emplacement : backend/api/models/review_models.py

Prépare le futur système de notation sans casser l'existant : le modèle
`Restaurant` porte déjà les champs agrégés `rating` (DecimalField 3,2) et
`review_count` (IntegerField). Ce module ajoute les avis unitaires et
recalcule automatiquement l'agrégat via des signaux.

Règles métier :
  - 1 avis par client et par restaurant (unique_together).
  - Note entière de 1 à 5.
  - `order` optionnel : si présent, l'avis est marqué "achat vérifié".
  - `is_visible` : modération (un avis masqué ne compte pas dans l'agrégat).

Sécurité : le rattachement client ↔ avis se fait côté vue (BOLA). Le modèle ne
fait qu'imposer l'unicité et la cohérence de la note.

⚠️ Après ajout : exposer le modèle dans `api/models/__init__.py`
   (`from .review_models import RestaurantReview`) puis :
   `python manage.py makemigrations api && python manage.py migrate`.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Avg, Count
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver


class RestaurantReview(models.Model):
    restaurant = models.ForeignKey(
        "api.Restaurant",
        on_delete=models.CASCADE,
        related_name="reviews",
        verbose_name="Restaurant",
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="restaurant_reviews",
        verbose_name="Client",
    )
    # Lien facultatif vers une commande → "achat vérifié".
    order = models.ForeignKey(
        "api.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviews",
        verbose_name="Commande liée",
    )

    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        verbose_name="Note (1-5)",
    )
    comment = models.TextField(
        blank=True,
        default="",
        max_length=2000,
        verbose_name="Commentaire",
    )

    # Modération : un avis non visible n'entre pas dans le calcul de la moyenne.
    is_visible = models.BooleanField(default=True, verbose_name="Visible")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Avis restaurant"
        verbose_name_plural = "Avis restaurants"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "client"],
                name="unique_review_per_client_restaurant",
            ),
        ]
        indexes = [
            models.Index(fields=["restaurant", "is_visible"]),
            models.Index(fields=["restaurant", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.client_id} → {self.restaurant_id} : {self.rating}/5"

    @property
    def is_verified_purchase(self) -> bool:
        return self.order_id is not None


def recompute_restaurant_rating(restaurant) -> None:
    """
    Recalcule `rating` (moyenne, 2 décimales) et `review_count` d'un restaurant
    à partir de ses avis visibles. Écrit uniquement les champs concernés.
    """
    if restaurant is None:
        return

    agg = RestaurantReview.objects.filter(
        restaurant=restaurant, is_visible=True
    ).aggregate(avg=Avg("rating"), total=Count("id"))

    avg = agg["avg"] or 0
    total = agg["total"] or 0

    restaurant.rating = Decimal(str(avg)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    restaurant.review_count = total
    restaurant.save(update_fields=["rating", "review_count"])


# ── Signaux : maintenir l'agrégat à jour ─────────────────────────────────────
# Importé via api/models/__init__.py → les receivers sont enregistrés au boot.

@receiver(post_save, sender=RestaurantReview)
def _review_saved(sender, instance, **kwargs):
    recompute_restaurant_rating(instance.restaurant)


@receiver(post_delete, sender=RestaurantReview)
def _review_deleted(sender, instance, **kwargs):
    # instance.restaurant est encore résoluble en post_delete (l'objet Restaurant
    # n'est pas supprimé, seul l'avis l'est).
    try:
        recompute_restaurant_rating(instance.restaurant)
    except Exception:
        # Si le restaurant a été supprimé en cascade, rien à recalculer.
        pass
