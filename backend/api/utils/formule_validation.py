"""
Validation et tarification des formules pour le flux INVITÉ (draft).

Miroir de OrderCreateSerializer.validate_formules, mais conçu pour un restaurant
déjà résolu (le flux invité passe par GuestPrepare). Garde la logique d'éligibilité
au même endroit et renvoie une forme JSON stockable telle quelle dans
DraftOrder.formules.
"""
from decimal import Decimal

from rest_framework import serializers

from api.models import Formule, FormuleCourseItem


def validate_guest_formules(restaurant, formules):
    """Valide les formules invité et renvoie une liste normalisée JSON.

    Lève serializers.ValidationError si une formule/un plat/une contrainte est
    invalide. Retour :
        [{'formule': str, 'quantity': int,
          'selections': [{'course': str, 'menu_item': int}]}]
    """
    normalized = []
    for idx, f in enumerate(formules or []):
        try:
            formule = (
                Formule.objects
                .prefetch_related('courses__items__menu_item')
                .get(id=f['formule'], restaurant=restaurant, is_active=True)
            )
        except Formule.DoesNotExist:
            raise serializers.ValidationError(
                f"Formule {idx}: introuvable, inactive, ou hors de ce restaurant"
            )

        courses = list(formule.courses.all())
        courses_by_id = {str(c.id): c for c in courses}
        picked = {str(c.id): [] for c in courses}
        sel_norm = []

        for sel in f.get('selections', []):
            course = courses_by_id.get(str(sel['course']))
            if not course:
                raise serializers.ValidationError(
                    f"Formule {idx}: cran inconnu pour cette formule"
                )
            eligible = {
                ci.menu_item_id: ci
                for ci in course.items.all()
                if ci.is_available and ci.menu_item and ci.menu_item.is_available
            }
            mi_id = int(sel['menu_item'])
            if mi_id not in eligible:
                raise serializers.ValidationError(
                    f"Formule {idx}: plat indisponible dans le cran « {course.name} »"
                )
            picked[str(course.id)].append(mi_id)
            sel_norm.append({'course': str(course.id), 'menu_item': mi_id})

        for course in courses:
            n = len(picked[str(course.id)])
            if course.is_required and n < course.min_choices:
                raise serializers.ValidationError(
                    f"Formule {idx}: « {course.name} » nécessite au moins "
                    f"{course.min_choices} choix"
                )
            if n > course.max_choices:
                raise serializers.ValidationError(
                    f"Formule {idx}: « {course.name} » accepte au plus "
                    f"{course.max_choices} choix"
                )

        normalized.append({
            'formule': str(formule.id),
            'quantity': int(f.get('quantity', 1)),
            'selections': sel_norm,
        })

    return normalized


def formules_amount_cents(restaurant, normalized_formules):
    """Montant en centimes des formules : (prix de base + suppléments) × quantité.

    Cohérent avec build_formule_components.unit_price (base + Σ suppléments).
    """
    total = 0
    for f in normalized_formules or []:
        try:
            formule = Formule.objects.get(
                id=f['formule'], restaurant=restaurant, is_active=True
            )
        except Formule.DoesNotExist:
            continue
        unit = Decimal(formule.price)
        for sel in f.get('selections', []):
            ci = FormuleCourseItem.objects.filter(
                course__formule=formule,
                course_id=sel['course'],
                menu_item_id=sel['menu_item'],
            ).first()
            if ci:
                unit += Decimal(ci.extra_price or 0)
        total += int(unit * 100) * int(f.get('quantity', 1))
    return total