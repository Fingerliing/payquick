"""
Normalisation des allergenes detectes par l'IA.

Le modele de vision lit la carte en francais et renvoie donc des allergenes
en francais ("lait", "fruits a coque"...). Or `MenuItem.allergens` et le
serializer attendent les 14 codes reglementaires normalises (anglais) :
    gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts,
    celery, mustard, sesame, sulfites, lupin, mollusks

Ce module fait le pont. Un allergene non reconnu est simplement ignore
(jamais d'invention : la relecture restaurateur reste maitresse).
"""
from __future__ import annotations

import unicodedata

# Codes reglementaires valides cote backend (cf. menu_serializers.py).
VALID_ALLERGEN_CODES = {
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
    'nuts', 'celery', 'mustard', 'sesame', 'sulfites', 'lupin', 'mollusks',
}

# Synonymes francais (et quelques variantes anglaises) -> code normalise.
# Les cles sont comparees apres passage en minuscules + suppression des accents.
_ALLERGEN_SYNONYMS = {
    # gluten
    'gluten': 'gluten',
    'ble': 'gluten',
    'froment': 'gluten',
    'cereales': 'gluten',
    'cereale': 'gluten',
    # crustaces
    'crustaces': 'crustaceans',
    'crustace': 'crustaceans',
    'crevette': 'crustaceans',
    'crevettes': 'crustaceans',
    'crabe': 'crustaceans',
    'homard': 'crustaceans',
    'langoustine': 'crustaceans',
    # oeufs
    'oeuf': 'eggs',
    'oeufs': 'eggs',
    # poisson
    'poisson': 'fish',
    'poissons': 'fish',
    # arachides
    'arachide': 'peanuts',
    'arachides': 'peanuts',
    'cacahuete': 'peanuts',
    'cacahuetes': 'peanuts',
    # soja
    'soja': 'soy',
    'soy': 'soy',
    # lait
    'lait': 'milk',
    'lactose': 'milk',
    'produits laitiers': 'milk',
    'creme': 'milk',
    'beurre': 'milk',
    'fromage': 'milk',
    # fruits a coque
    'fruits a coque': 'nuts',
    'fruit a coque': 'nuts',
    'noix': 'nuts',
    'noisette': 'nuts',
    'noisettes': 'nuts',
    'amande': 'nuts',
    'amandes': 'nuts',
    'pistache': 'nuts',
    'pistaches': 'nuts',
    'noix de cajou': 'nuts',
    'noix de pecan': 'nuts',
    'noix de macadamia': 'nuts',
    # celeri
    'celeri': 'celery',
    # moutarde
    'moutarde': 'mustard',
    # sesame
    'sesame': 'sesame',
    'graines de sesame': 'sesame',
    # sulfites
    'sulfites': 'sulfites',
    'sulfite': 'sulfites',
    'anhydride sulfureux': 'sulfites',
    'dioxyde de soufre': 'sulfites',
    # lupin
    'lupin': 'lupin',
    # mollusques
    'mollusques': 'mollusks',
    'mollusque': 'mollusks',
    'moule': 'mollusks',
    'moules': 'mollusks',
    'huitre': 'mollusks',
    'huitres': 'mollusks',
    'escargot': 'mollusks',
    'escargots': 'mollusks',
    'calmar': 'mollusks',
    'seiche': 'mollusks',
    'poulpe': 'mollusks',
}


def _normalize_key(value: str) -> str:
    """Minuscule + suppression des accents pour une comparaison robuste."""
    text = (value or '').strip().lower()
    decomposed = unicodedata.normalize('NFKD', text)
    return ''.join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize_allergens(raw_allergens) -> list[str]:
    """Convertit une liste d'allergenes bruts en codes reglementaires.

    - Accepte deja un code valide tel quel ('milk' -> 'milk').
    - Traduit un libelle francais reconnu ('lait' -> 'milk').
    - Ignore silencieusement tout terme inconnu.
    - Deduplique en conservant l'ordre d'apparition.
    """
    if not isinstance(raw_allergens, (list, tuple)):
        return []

    result: list[str] = []
    seen: set[str] = set()

    for raw in raw_allergens:
        if not isinstance(raw, str):
            continue
        key = _normalize_key(raw)
        if not key:
            continue

        code = key if key in VALID_ALLERGEN_CODES else _ALLERGEN_SYNONYMS.get(key)
        if code and code not in seen:
            seen.add(code)
            result.append(code)

    return result
