"""
Helpers centralisés pour la tarification du menu du jour (formule).

Règle métier (à partir de mai 2026) :
- Le restaurateur fixe UN prix total au niveau du DailyMenu (`special_price`).
- Les `DailyMenuItem` n'ont plus de prix individuel exposé : le champ
  `DailyMenuItem.special_price` reste en BDD pour rétrocompatibilité mais
  n'est plus utilisé en lecture ni en écriture.
- Le prix payé par le client est exactement `DailyMenu.special_price`.
- Le client choisit 1 plat par catégorie distincte représentée dans le menu.
- Le prix unitaire affiché sur chaque DishCard du menu du jour est
  `special_price / nb_catégories_distinctes` (réparti à parts égales).

Ce module expose les helpers utilisés à la fois par les serializers
(affichage) et par les vues de commande (calcul du prix unitaire à
persister sur OrderItem.unit_price).
"""

from decimal import Decimal
from django.utils import timezone


def distinct_category_ids(daily_menu):
    """Set des UUIDs de catégories distinctes représentées par les items
    DISPONIBLES de ce DailyMenu."""
    return set(
        daily_menu.daily_menu_items
            .filter(is_available=True)
            .values_list('menu_item__category_id', flat=True)
            .distinct()
    )


def is_formula(daily_menu):
    """Le menu est en mode formule dès qu'il a un special_price ET au moins
    une catégorie représentée."""
    if daily_menu is None or daily_menu.special_price is None:
        return False
    return len(distinct_category_ids(daily_menu)) > 0


def price_per_category(daily_menu):
    """Prix d'un plat en mode formule = special_price / nb_catégories.
    Renvoie None si on n'est pas en mode formule. Decimal arrondi à 2 décimales.
    """
    if daily_menu is None or daily_menu.special_price is None:
        return None
    cat_ids = distinct_category_ids(daily_menu)
    if not cat_ids:
        return None
    return (
        Decimal(daily_menu.special_price) / Decimal(len(cat_ids))
    ).quantize(Decimal('0.01'))


def get_active_daily_menu(restaurant, today=None):
    """Renvoie le DailyMenu actif pour ce restaurant à la date donnée
    (par défaut aujourd'hui), ou None.

    Importé localement dans les fonctions appelantes pour éviter les imports
    circulaires avec les vues / serializers.
    """
    from api.models import DailyMenu  # local pour éviter cycles
    today = today or timezone.now().date()
    return DailyMenu.objects.filter(
        restaurant=restaurant,
        date=today,
        is_active=True,
    ).prefetch_related('daily_menu_items__menu_item__category').first()


def formula_pricing_context(daily_menu):
    """Construit un contexte (per_cat_price, set d'IDs MenuItem) prêt à être
    consommé par une boucle de validation d'OrderItems.

    Renvoie un tuple (Decimal | None, set[int]).
    """
    if daily_menu is None:
        return None, set()
    per_cat = price_per_category(daily_menu)
    if per_cat is None:
        return None, set()
    menu_item_ids = set(
        daily_menu.daily_menu_items
            .filter(is_available=True)
            .values_list('menu_item_id', flat=True)
    )
    return per_cat, menu_item_ids


def unit_price_for(menu_item, formula_per_cat, formula_menu_item_ids):
    """Renvoie le prix unitaire à appliquer pour un MenuItem donné.

    - Si on est en mode formule ET que le menu_item fait partie de la formule,
      on applique le prix par catégorie.
    - Sinon, on retombe sur le prix de carte du MenuItem.
    """
    if formula_per_cat is not None and menu_item.id in formula_menu_item_ids:
        return formula_per_cat
    return Decimal(str(menu_item.price))


def validate_formula_completeness(daily_menu, ordered_menu_items):
    """Vérifie qu'une commande respecte la règle "1 plat par catégorie" du menu
    du jour formule.

    Règle (option A) :
    - Si AUCUN item de la commande n'appartient à la formule → la règle ne
      s'applique pas, la commande est valide (mode à la carte classique).
    - Si AU MOINS un item appartient à la formule → la commande doit contenir
      exactement une catégorie distincte par catégorie de la formule, sans
      doublon par catégorie. Sinon le client pourrait obtenir des plats à un
      prix formule en n'achetant qu'une partie de la formule.

    @param daily_menu Instance DailyMenu actif (ou None si pas de menu du jour).
    @param ordered_menu_items Iterable de MenuItem (instances Django, avec
        category_id chargé) représentant les lignes de la commande, déjà
        dédupliquées par MenuItem (un même MenuItem n'apparaît qu'une fois
        peu importe sa quantité — la quantité ne change pas la validation).

    @returns (is_valid, error_message). error_message vaut None si is_valid.
    """
    if daily_menu is None or not is_formula(daily_menu):
        return True, None

    formula_items = list(
        daily_menu.daily_menu_items.filter(is_available=True).select_related('menu_item')
    )
    formula_menu_item_ids = {it.menu_item_id for it in formula_items}
    # menu_item_id -> category_id, pour retrouver la catégorie d'un plat de la formule
    formula_item_to_cat = {
        it.menu_item_id: it.menu_item.category_id for it in formula_items
    }
    # category_id -> nom (pour message d'erreur lisible)
    cat_id_to_name = {
        it.menu_item.category_id: (it.menu_item.category.name if it.menu_item.category else 'Autres')
        for it in formula_items if it.menu_item.category_id
    }
    required_cat_ids = set(formula_item_to_cat.values())

    # Catégories couvertes par la commande, comptées
    picked_per_cat = {}
    has_formula_item = False
    for mi in ordered_menu_items:
        if mi.id in formula_menu_item_ids:
            has_formula_item = True
            cat_id = formula_item_to_cat.get(mi.id)
            picked_per_cat[cat_id] = picked_per_cat.get(cat_id, 0) + 1

    if not has_formula_item:
        return True, None

    missing = required_cat_ids - set(picked_per_cat.keys())
    duplicates = [cid for cid, count in picked_per_cat.items() if count > 1]

    if missing:
        names = [cat_id_to_name.get(cid, 'Autres') for cid in missing]
        return False, (
            "Formule incomplète : il manque un plat dans "
            + ", ".join(names) + "."
        )

    if duplicates:
        names = [cat_id_to_name.get(cid, 'Autres') for cid in duplicates]
        return False, (
            "Formule invalide : plusieurs plats sélectionnés dans "
            + ", ".join(names) + "."
        )

    return True, None
