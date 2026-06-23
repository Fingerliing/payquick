"""
Modèles « Formule » pour EatQuickeR.

Une Formule est une offre à prix fixe composée de plusieurs crans
(« Entrée », « Plat », « Dessert »...). Chaque cran propose une liste de plats
éligibles (FormuleCourseItem) parmi lesquels le client choisit.

Contrairement au DailyMenu (formule du jour, bornée à une date, un seul menu/jour,
crans déduits des catégories), une Formule est permanente, multiple par restaurant,
et chaque cran liste explicitement ses plats éligibles.
"""
from decimal import Decimal
import uuid

from django.db import models

from .menu_models import MenuItem


class Formule(models.Model):
    """Offre à prix fixe : ex. 'Formule Midi' = entrée + plat + dessert à 19,90 €."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='formules',
        verbose_name="Restaurant",
    )
    name = models.CharField(max_length=100, verbose_name="Nom")          # "Formule Midi"
    description = models.TextField(blank=True, verbose_name="Description")
    price = models.DecimalField(
        max_digits=6, decimal_places=2,
        verbose_name="Prix total (TTC)",
        help_text="Prix unique payé par le client, réparti entre les crans.",
    )
    is_active = models.BooleanField(default=True, verbose_name="Active")
    order = models.PositiveIntegerField(default=0, verbose_name="Ordre d'affichage")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Formule"
        verbose_name_plural = "Formules"
        ordering = ['restaurant', 'order', 'name']
        indexes = [
            models.Index(fields=['restaurant', 'is_active']),
            models.Index(fields=['restaurant', 'order']),
        ]

    def __str__(self):
        return f"{self.name} ({self.price}€) — {self.restaurant_id}"


class FormuleCourse(models.Model):
    """Un cran de la formule : Entrée, Plat, Dessert."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    formule = models.ForeignKey(
        Formule,
        on_delete=models.CASCADE,
        related_name='courses',
        verbose_name="Formule",
    )
    name = models.CharField(max_length=50, verbose_name="Nom du cran")    # "Entrée"
    order = models.PositiveIntegerField(default=0, verbose_name="Ordre")
    is_required = models.BooleanField(
        default=True,
        verbose_name="Obligatoire",
        help_text="Si décoché, le client peut passer ce cran (ex. dessert optionnel).",
    )
    min_choices = models.PositiveIntegerField(default=1, verbose_name="Choix minimum")
    max_choices = models.PositiveIntegerField(default=1, verbose_name="Choix maximum")

    class Meta:
        verbose_name = "Cran de formule"
        verbose_name_plural = "Crans de formule"
        ordering = ['formule', 'order', 'name']

    def __str__(self):
        return f"{self.formule.name} > {self.name}"


class FormuleCourseItem(models.Model):
    """Un plat éligible pour un cran donné."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(
        FormuleCourse,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Cran",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='formule_appearances',
        verbose_name="Plat",
    )
    extra_price = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        verbose_name="Supplément",
        help_text="Supplément ajouté au prix de la formule si ce plat est choisi.",
    )
    is_available = models.BooleanField(default=True, verbose_name="Disponible")
    display_order = models.PositiveIntegerField(default=0, verbose_name="Ordre")

    class Meta:
        verbose_name = "Plat de formule"
        verbose_name_plural = "Plats de formule"
        ordering = ['course', 'display_order']
        unique_together = [['course', 'menu_item']]
        indexes = [
            models.Index(fields=['course', 'is_available']),
        ]

    def __str__(self):
        return f"{self.course.name} · {self.menu_item.name}"
