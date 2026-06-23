"""
Tarification et ventilation TVA d'une formule (option A : 1 OrderItem = 1 formule).

Règle :
- `formule.price` est le prix de base TTC pour la sélection standard.
- Chaque plat choisi peut porter un supplément (`FormuleCourseItem.extra_price`),
  qui s'ajoute au prix payé.
- Le prix de base est réparti sur les plats choisis AU PRORATA de leur prix carte
  (plus défendable fiscalement qu'une répartition égale) afin de ventiler la TVA
  par taux. Le dernier composant absorbe l'arrondi pour que la somme des parts
  soit exactement égale à `formule.price`.
- Les prix étant TTC : TVA = base − base / (1 + taux).

Les montants renvoyés par `build_formule_components` sont PAR UNITÉ de formule.
La multiplication par la quantité se fait au niveau de la ligne OrderItem.
"""
from decimal import Decimal, ROUND_HALF_UP


def _q(amount):
    return Decimal(amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _rate(menu_item):
    raw = getattr(menu_item, 'vat_rate', None) or Decimal('0.100')
    return Decimal(str(raw)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)


def build_formule_components(formule, chosen):
    """
    Paramètres
    ----------
    formule : Formule
    chosen  : list[dict] — un par plat choisi, dans l'ordre des crans :
              { 'course': FormuleCourse,
                'menu_item': MenuItem,
                'extra_price': Decimal }

    Retour
    ------
    (unit_price_ttc: Decimal, components: list[dict])
    où chaque component est prêt à instancier un OrderItemComponent (valeurs
    PAR UNITÉ de formule).
    """
    if not chosen:
        return _q(formule.price), []

    base = Decimal(formule.price)
    weights = [Decimal(c['menu_item'].price or 0) for c in chosen]
    total_w = sum(weights)
    n = len(chosen)

    components = []
    allocated_sum = Decimal('0.00')

    for i, c in enumerate(chosen):
        # Répartition du prix de base ; le dernier composant absorbe l'arrondi
        # → somme exacte des allocations = base.
        if i < n - 1:
            if total_w > 0:
                alloc = _q(base * (weights[i] / total_w))
            else:
                alloc = _q(base / n)
            allocated_sum += alloc
        else:
            alloc = _q(base - allocated_sum)

        mi = c['menu_item']
        extra = _q(c.get('extra_price') or 0)
        rate = _rate(mi)
        taxable_ttc = alloc + extra
        vat = _q(taxable_ttc - (taxable_ttc / (Decimal('1') + rate)))

        components.append({
            'course_name': c['course'].name,
            'menu_item': mi,
            'menu_item_name': mi.name,
            'allocated_price': alloc,
            'extra_price': extra,
            'vat_rate': rate,
            'vat_amount': vat,
            'display_order': c['course'].order,
        })

    unit_price = _q(base + sum(c['extra_price'] for c in components))
    return unit_price, components
