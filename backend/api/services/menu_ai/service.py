"""
Orchestration du pipeline d'import de menu par IA :

    photos --> extraction (vision) --> charte graphique --> traduction N langues

Ce module est :
- independant de Celery     -> testable en synchrone ;
- independant du fournisseur -> il consomme le contrat `MenuVisionProvider`.

Il assainit systematiquement les sorties du modele (prix, couleurs, structure)
car une reponse d'IA n'est jamais garantie conforme.

Hierarchie produite : categorie -> (items directs) + sous-categories -> items.
"""
from __future__ import annotations

import logging
import re
from typing import Callable, Optional

from .base import MenuAIError, MenuVisionProvider
from .image_utils import prepare_image

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Constantes d'assainissement
# -----------------------------------------------------------------------------
_HEX_RE = re.compile(r'^#[0-9a-f]{6}$')
_HEX_SHORT_RE = re.compile(r'^#([0-9a-f]{3})$')

# Couleurs de repli = charte EatQuickeR (cf. designSystem.ts / RestaurantBranding).
_DEFAULT_BRANDING = {
    'primary_color': '#1e2a78',
    'secondary_color': '#d4af37',
    'accent_color': '#2938a3',
    'background_color': '#f9fafb',
    'text_color': '#111827',
    'style': '',
}


# -----------------------------------------------------------------------------
# Helpers d'assainissement
# -----------------------------------------------------------------------------
def _coerce_price(value) -> str:
    """Normalise un prix en chaine '12.50'. Renvoie '' si non exploitable."""
    if value is None:
        return ''
    raw = str(value).strip().replace(',', '.').replace('\u20ac', '').strip()
    if not raw:
        return ''
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        return ''
    if amount < 0:
        return ''
    return f'{amount:.2f}'


def _sanitize_hex(value, fallback: str) -> str:
    """Valide une couleur hexadecimale ; etend #abc -> #aabbcc ; sinon repli."""
    if isinstance(value, str):
        candidate = value.strip().lower()
        if _HEX_RE.match(candidate):
            return candidate
        short = _HEX_SHORT_RE.match(candidate)
        if short:
            c = short.group(1)
            return f'#{c[0] * 2}{c[1] * 2}{c[2] * 2}'
    return fallback


def _sanitize_branding(raw) -> dict:
    """Assainit la charte graphique detectee ; complete avec les defauts."""
    raw = raw if isinstance(raw, dict) else {}
    branding = {}
    for key, fallback in _DEFAULT_BRANDING.items():
        if key == 'style':
            style = raw.get('style')
            branding['style'] = str(style).strip()[:120] if style else ''
        else:
            branding[key] = _sanitize_hex(raw.get(key), fallback)
    return branding


def _normalize_item(raw_item) -> Optional[dict]:
    """Normalise un plat brut. Renvoie None si le plat est inexploitable."""
    if not isinstance(raw_item, dict):
        return None
    name = (raw_item.get('name') or '').strip()
    if not name:
        return None
    return {
        'name': name,
        'description': (raw_item.get('description') or '').strip(),
        'price': _coerce_price(raw_item.get('price')),
        'is_vegetarian': bool(raw_item.get('is_vegetarian')),
        'is_vegan': bool(raw_item.get('is_vegan')),
        'is_gluten_free': bool(raw_item.get('is_gluten_free')),
        'allergens': [
            str(a).strip()
            for a in (raw_item.get('allergens') or [])
            if str(a).strip()
        ],
        'translations': {},
    }


def _normalize_items(raw_items) -> list[dict]:
    """Normalise une liste de plats, en ecartant les entrees invalides."""
    items = []
    for raw_item in raw_items or []:
        item = _normalize_item(raw_item)
        if item is not None:
            items.append(item)
    return items


def _normalize_subcategories(raw_subcategories) -> list[dict]:
    """Normalise les sous-categories d'une categorie."""
    subcategories: list[dict] = []
    if not isinstance(raw_subcategories, list):
        return subcategories

    for raw_sub in raw_subcategories:
        if not isinstance(raw_sub, dict):
            continue
        name = (raw_sub.get('name') or '').strip()
        if not name:
            continue
        subcategories.append({
            'name': name,
            'order': len(subcategories) + 1,
            'items': _normalize_items(raw_sub.get('items')),
            'translations': {},
        })
    return subcategories


def _normalize_categories(raw_categories) -> list[dict]:
    """Normalise la structure brute renvoyee par le modele.

    Garantit la forme attendue par `MenuScanJob.extracted_data` :
        categorie { name, icon, order, items[], subcategories[], translations }
        sous-categorie { name, order, items[], translations }
        plat { name, description, price, flags, allergens, translations }
    """
    categories: list[dict] = []
    if not isinstance(raw_categories, list):
        return categories

    for raw_cat in raw_categories:
        if not isinstance(raw_cat, dict):
            continue
        name = (raw_cat.get('name') or '').strip()
        if not name:
            continue

        icon = (raw_cat.get('icon') or '').strip() or '\U0001F37D'  # 🍽️
        categories.append({
            'name': name,
            'icon': icon,
            'order': len(categories) + 1,
            'items': _normalize_items(raw_cat.get('items')),
            'subcategories': _normalize_subcategories(raw_cat.get('subcategories')),
            'translations': {},
        })

    return categories


def _count_items(categories: list[dict]) -> int:
    """Compte tous les plats : items directs + items des sous-categories."""
    total = 0
    for cat in categories:
        total += len(cat.get('items', []))
        for sub in cat.get('subcategories', []):
            total += len(sub.get('items', []))
    return total


# -----------------------------------------------------------------------------
# Traduction : construction / application du payload
# -----------------------------------------------------------------------------
def _add_item_to_payload(payload: dict[str, str], prefix: str, item: dict) -> None:
    """Ajoute le nom et la description d'un plat au payload de traduction."""
    name = (item.get('name') or '').strip()
    desc = (item.get('description') or '').strip()
    if name:
        payload[f'{prefix}.name'] = name
    if desc:
        payload[f'{prefix}.desc'] = desc


def _build_translation_payload(categories: list[dict]) -> dict[str, str]:
    """Aplati tous les textes francais traduisibles en {cle: texte}.

    Cles stables et explicites (independantes de l'ordre) :
      - c{i}.name             -> categorie i
      - c{i}.s{k}.name        -> sous-categorie k de la categorie i
      - c{i}.i{j}.name|desc   -> plat j directement sous la categorie i
      - c{i}.s{k}.i{j}.name|desc -> plat j de la sous-categorie k de la categorie i
    """
    payload: dict[str, str] = {}
    for i, cat in enumerate(categories):
        cat_name = (cat.get('name') or '').strip()
        if cat_name:
            payload[f'c{i}.name'] = cat_name

        for j, item in enumerate(cat.get('items', [])):
            _add_item_to_payload(payload, f'c{i}.i{j}', item)

        for k, sub in enumerate(cat.get('subcategories', [])):
            sub_name = (sub.get('name') or '').strip()
            if sub_name:
                payload[f'c{i}.s{k}.name'] = sub_name
            for j, item in enumerate(sub.get('items', [])):
                _add_item_to_payload(payload, f'c{i}.s{k}.i{j}', item)

    return payload


def _apply_item_translation(item: dict, prefix: str, lang: str, translated: dict) -> None:
    """Re-injecte la traduction d'un plat (modifie l'item en place)."""
    item_tr = {}
    name_val = translated.get(f'{prefix}.name')
    desc_val = translated.get(f'{prefix}.desc')
    if isinstance(name_val, str) and name_val.strip():
        item_tr['name'] = name_val.strip()
    if isinstance(desc_val, str):
        item_tr['description'] = desc_val.strip()
    if item_tr:
        item.setdefault('translations', {})[lang] = item_tr


def _apply_translations(categories: list[dict], lang: str, translated: dict) -> None:
    """Re-injecte les valeurs traduites dans `categories` (modifie en place)."""
    if not isinstance(translated, dict):
        return

    for i, cat in enumerate(categories):
        cat_name = translated.get(f'c{i}.name')
        if isinstance(cat_name, str) and cat_name.strip():
            cat.setdefault('translations', {})[lang] = {'name': cat_name.strip()}

        for j, item in enumerate(cat.get('items', [])):
            _apply_item_translation(item, f'c{i}.i{j}', lang, translated)

        for k, sub in enumerate(cat.get('subcategories', [])):
            sub_name = translated.get(f'c{i}.s{k}.name')
            if isinstance(sub_name, str) and sub_name.strip():
                sub.setdefault('translations', {})[lang] = {'name': sub_name.strip()}
            for j, item in enumerate(sub.get('items', [])):
                _apply_item_translation(item, f'c{i}.s{k}.i{j}', lang, translated)


# -----------------------------------------------------------------------------
# Point d'entree
# -----------------------------------------------------------------------------
def run_menu_extraction(
    images_bytes: list[bytes],
    target_languages: list[str],
    provider: Optional[MenuVisionProvider] = None,
    on_phase: Optional[Callable[[str], None]] = None,
) -> dict:
    """Execute le pipeline complet et renvoie un resultat pret a persister.

    Args:
        images_bytes:     contenus binaires bruts des photos de carte, dans
                          l'ordre des pages.
        target_languages: codes ISO des langues cibles (hors francais).
        provider:         fournisseur a utiliser ; par defaut celui configure.
        on_phase:         callback optionnel('processing'|'translating') pour
                          refleter l'avancement (mise a jour du statut du job).

    Returns:
        dict : { extracted_data, branding_data, model_used, tokens_used,
                 raw_response }

    Raises:
        MenuAIError : extraction impossible (aucune image, reponse invalide ou
                      tronquee, erreur fournisseur). Les echecs de TRADUCTION
                      sont toleres (best-effort) : le francais reste disponible.
    """
    # Import tardif : evite tout cycle d'import au chargement du package.
    from . import get_vision_provider
    from api.models.ai_menu_models import SUPPORTED_LANGUAGES

    language_labels = dict(SUPPORTED_LANGUAGES)

    if not images_bytes:
        raise MenuAIError("Aucune image a analyser.")

    provider = provider or get_vision_provider()
    prepared = [prepare_image(raw) for raw in images_bytes]

    # -- 1. Extraction vision (toutes les pages en un appel) -----------------
    if on_phase:
        on_phase('processing')

    extraction = provider.extract_menu(prepared)
    raw_data = extraction.data or {}

    categories = _normalize_categories(raw_data.get('categories', []))
    branding = _sanitize_branding(raw_data.get('branding', {}))

    total_input = extraction.input_tokens
    total_output = extraction.output_tokens
    models_used = {extraction.model}

    # -- 2. Traduction multi-langue (best-effort) ----------------------------
    payload = _build_translation_payload(categories)
    languages = [
        lang for lang in (target_languages or [])
        if lang in language_labels and lang != 'fr'
    ]

    if payload and languages:
        if on_phase:
            on_phase('translating')

        for lang in languages:
            label = language_labels[lang]
            try:
                translation = provider.translate(payload, label)
                _apply_translations(categories, lang, translation.data or {})
                total_input += translation.input_tokens
                total_output += translation.output_tokens
                models_used.add(translation.model)
            except Exception as exc:  # noqa: BLE001 - traduction non bloquante
                logger.warning(
                    "Traduction '%s' echouee (le contenu francais reste dispo) : %s",
                    lang, exc,
                )

    items_total = _count_items(categories)
    subcategories_total = sum(len(c.get('subcategories', [])) for c in categories)
    logger.info(
        "Extraction terminee : %s categorie(s), %s sous-categorie(s), "
        "%s plat(s), %s token(s).",
        len(categories), subcategories_total, items_total,
        total_input + total_output,
    )

    return {
        'extracted_data': {'categories': categories},
        'branding_data': branding,
        'model_used': ', '.join(sorted(m for m in models_used if m)),
        'tokens_used': total_input + total_output,
        'raw_response': {
            'provider': provider.name,
            'input_tokens': total_input,
            'output_tokens': total_output,
            'translated_languages': languages,
            'pages_count': len(prepared),
        },
    }
