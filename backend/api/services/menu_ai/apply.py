"""
Materialisation d'un brouillon `MenuScanJob` en menu reel.

L'action `apply` (cf. menu_ai_views.py) appelle `apply_scan_job()` pour
transformer `extracted_data` en `MenuCategory` / `MenuSubCategory` / `MenuItem`
reels, et `branding_data` en `RestaurantBranding`.

Principes :
- Tout se fait dans une transaction atomique : en cas d'erreur, rien n'est
  ecrit (pas de menu a moitie importe).
- `MenuItem.menu` est un FK obligatoire -> on rattache les plats a un `Menu`
  du restaurant (le premier disponible, sinon on en cree un).
- `MenuCategory` est unique par (restaurant, name) et `MenuSubCategory` par
  (category, name) : on fait du get_or_create pour pouvoir relancer un import
  sans tout dupliquer (les plats, eux, sont toujours crees).
- Le champ `translations` n'est ecrit sur les modeles que s'il existe
  reellement (compatibilite : la migration qui l'ajoute peut ne pas encore
  etre appliquee).
- Les prix hors bornes du DecimalField (max_digits=6 -> < 10000) sont ignores.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from .allergens import normalize_allergens

logger = logging.getLogger(__name__)

# DecimalField(max_digits=6, decimal_places=2) -> valeur strictement < 10000.
_MAX_PRICE = Decimal('9999.99')


@dataclass
class ApplyReport:
    """Bilan d'une materialisation, renvoye a l'API."""

    categories_created: int = 0
    categories_reused: int = 0
    subcategories_created: int = 0
    subcategories_reused: int = 0
    items_created: int = 0
    branding_applied: bool = False
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'categories_created': self.categories_created,
            'categories_reused': self.categories_reused,
            'subcategories_created': self.subcategories_created,
            'subcategories_reused': self.subcategories_reused,
            'items_created': self.items_created,
            'branding_applied': self.branding_applied,
            'warnings': self.warnings,
        }


def _model_has_field(model_cls, field_name: str) -> bool:
    """Indique si un modele possede un champ concret donne."""
    return any(f.name == field_name for f in model_cls._meta.get_fields())


def _coerce_price(raw) -> Decimal | None:
    """Convertit un prix brouillon ('12.50') en Decimal valide, sinon None."""
    if raw in (None, ''):
        return None
    try:
        amount = Decimal(str(raw)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if amount < 0 or amount > _MAX_PRICE:
        return None
    return amount


def _resolve_menu(restaurant, preferred_menu=None):
    """Retourne le `Menu` cible pour rattacher les plats importes.

    Priorite :
      1. `preferred_menu` — le menu depuis lequel l'import a ete lance.
      2. a defaut, le premier menu existant du restaurant.
      3. a defaut, on en cree un (« Carte »).

    Le menu prefere n'est retenu que s'il appartient bien au restaurant
    (garde-fou contre un job dont le menu aurait change de main).
    """
    from api.models import Menu

    if preferred_menu is not None and preferred_menu.restaurant_id == restaurant.id:
        return preferred_menu

    menu = Menu.objects.filter(restaurant=restaurant).order_by('created_at').first()
    if menu is not None:
        return menu

    create_kwargs = {'restaurant': restaurant, 'name': 'Carte'}
    if _model_has_field(Menu, 'is_available'):
        create_kwargs['is_available'] = True
    return Menu.objects.create(**create_kwargs)


def _build_item_kwargs(menu, category, subcategory, item_data, item_model, report):
    """Construit les kwargs de creation d'un `MenuItem` a partir du brouillon."""
    price = _coerce_price(item_data.get('price'))
    name = (item_data.get('name') or '').strip()

    if price is None:
        # Prix obligatoire (DecimalField non nullable) : on met 0 et on alerte.
        report.warnings.append(
            f"Plat « {name or 'sans nom'} » : prix absent ou invalide, "
            f"fixe a 0.00 — a corriger."
        )
        price = Decimal('0.00')

    kwargs = {
        'menu': menu,
        'category': category,
        'subcategory': subcategory,
        'name': name[:100],
        'description': (item_data.get('description') or '').strip(),
        'price': price,
        'is_available': True,
        'is_vegetarian': bool(item_data.get('is_vegetarian')),
        'is_vegan': bool(item_data.get('is_vegan')),
        'is_gluten_free': bool(item_data.get('is_gluten_free')),
        'allergens': normalize_allergens(item_data.get('allergens')),
    }

    # Traductions : uniquement si le champ existe sur le modele.
    if _model_has_field(item_model, 'translations'):
        kwargs['translations'] = item_data.get('translations') or {}

    return kwargs


@transaction.atomic
def apply_scan_job(job) -> ApplyReport:
    """Materialise un `MenuScanJob` en menu reel. Idempotent sur les catégories.

    Args:
        job: instance `MenuScanJob` au statut `ready`.

    Returns:
        ApplyReport: bilan chiffre de l'operation.

    Raises:
        ValueError: le job n'est pas dans un etat applicable, ou son brouillon
                    est vide.
    """
    from api.models import (
        MenuScanJob, MenuCategory, MenuSubCategory, MenuItem, RestaurantBranding,
    )

    if job.status != MenuScanJob.Status.READY:
        raise ValueError(
            f"Le job doit etre au statut « {MenuScanJob.Status.READY} » "
            f"pour etre applique (statut actuel : « {job.status} »)."
        )

    categories = (job.extracted_data or {}).get('categories', [])
    if not categories:
        raise ValueError("Le brouillon ne contient aucune categorie a appliquer.")

    restaurant = job.restaurant
    menu = _resolve_menu(restaurant, getattr(job, 'menu', None))
    report = ApplyReport()

    # Ordre de base : on place les nouvelles categories apres les existantes.
    existing_categories = MenuCategory.objects.filter(restaurant=restaurant).count()

    for cat_index, cat_data in enumerate(categories):
        cat_name = (cat_data.get('name') or '').strip()
        if not cat_name:
            report.warnings.append("Une categorie sans nom a ete ignoree.")
            continue

        category, created = MenuCategory.objects.get_or_create(
            restaurant=restaurant,
            name=cat_name[:100],
            defaults={
                'icon': (cat_data.get('icon') or '')[:10] or None,
                'order': existing_categories + cat_index + 1,
                'is_active': True,
            },
        )
        if created:
            report.categories_created += 1
        else:
            report.categories_reused += 1

        # Traductions de categorie (si le champ existe).
        cat_translations = cat_data.get('translations') or {}
        if cat_translations and _model_has_field(MenuCategory, 'translations'):
            category.translations = cat_translations
            category.save(update_fields=['translations'])

        # -- Plats directement rattaches a la categorie ----------------------
        for item_data in cat_data.get('items', []):
            if not (item_data.get('name') or '').strip():
                continue
            MenuItem.objects.create(**_build_item_kwargs(
                menu, category, None, item_data, MenuItem, report,
            ))
            report.items_created += 1

        # -- Sous-categories et leurs plats ----------------------------------
        for sub_index, sub_data in enumerate(cat_data.get('subcategories', [])):
            sub_name = (sub_data.get('name') or '').strip()
            if not sub_name:
                report.warnings.append(
                    f"Une sous-categorie sans nom (categorie « {cat_name} ») "
                    f"a ete ignoree."
                )
                continue

            subcategory, sub_created = MenuSubCategory.objects.get_or_create(
                category=category,
                name=sub_name[:100],
                defaults={'order': sub_index + 1, 'is_active': True},
            )
            if sub_created:
                report.subcategories_created += 1
            else:
                report.subcategories_reused += 1

            sub_translations = sub_data.get('translations') or {}
            if sub_translations and _model_has_field(MenuSubCategory, 'translations'):
                subcategory.translations = sub_translations
                subcategory.save(update_fields=['translations'])

            for item_data in sub_data.get('items', []):
                if not (item_data.get('name') or '').strip():
                    continue
                MenuItem.objects.create(**_build_item_kwargs(
                    menu, category, subcategory, item_data, MenuItem, report,
                ))
                report.items_created += 1

    # -- Charte graphique ----------------------------------------------------
    branding_data = job.branding_data or {}
    if branding_data:
        defaults = {
            'is_ai_generated': True,
            'source_job': job,
            'style_descriptor': (branding_data.get('style') or '')[:120],
        }
        for color_field in RestaurantBranding.HEX_FIELDS:
            value = branding_data.get(color_field)
            if value:
                defaults[color_field] = value

        RestaurantBranding.objects.update_or_create(
            restaurant=restaurant,
            defaults=defaults,
        )
        report.branding_applied = True

    # -- Cloture du job ------------------------------------------------------
    job.status = MenuScanJob.Status.APPLIED
    job.completed_at = job.completed_at or timezone.now()
    job.save(update_fields=['status', 'completed_at', 'updated_at'])

    logger.info(
        "Job %s applique : %s categorie(s), %s sous-categorie(s), %s plat(s).",
        job.id,
        report.categories_created + report.categories_reused,
        report.subcategories_created + report.subcategories_reused,
        report.items_created,
    )
    return report