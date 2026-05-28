"""
Traduction automatique du menu existant d'un restaurant.

Complete les traductions manquantes des `MenuItem`, `MenuCategory` et
`MenuSubCategory` d'un restaurant, en reutilisant le fournisseur de
traduction du pipeline d'import IA (provider.translate).

Ne retraduit PAS ce qui est deja traduit : pour chaque objet et chaque langue
cible, on ne traduit que si la cle de langue est absente de `translations`.
Le restaurateur paie donc uniquement le delta.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)


def _missing_languages(obj, target_languages: list[str]) -> list[str]:
    """Langues cibles pour lesquelles `obj` n'a pas encore de traduction utile."""
    translations = getattr(obj, 'translations', None) or {}
    missing = []
    for lang in target_languages:
        bucket = translations.get(lang)
        # Considere comme manquant si pas de bucket ou bucket sans 'name' utile.
        if not isinstance(bucket, dict) or not (bucket.get('name') or '').strip():
            missing.append(lang)
    return missing


def _translate_name_only(provider, name: str, lang_label: str) -> Optional[str]:
    """Traduit un unique libelle (nom) vers une langue. None si echec."""
    try:
        result = provider.translate({'name': name}, lang_label)
        value = (result.data or {}).get('name')
        if isinstance(value, str) and value.strip():
            return value.strip()
    except Exception as exc:  # noqa: BLE001 - best effort
        logger.warning("Traduction '%s' echouee pour « %s » : %s", lang_label, name, exc)
    return None


def _translate_item(provider, name: str, description: str, lang_label: str) -> dict:
    """Traduit nom + description d'un plat vers une langue. {} si tout echoue."""
    payload = {'name': name}
    if description:
        payload['description'] = description
    try:
        result = provider.translate(payload, lang_label)
        data = result.data or {}
        out = {}
        n = data.get('name')
        d = data.get('description')
        if isinstance(n, str) and n.strip():
            out['name'] = n.strip()
        if isinstance(d, str) and d.strip():
            out['description'] = d.strip()
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("Traduction '%s' echouee pour « %s » : %s", lang_label, name, exc)
        return {}


def translate_restaurant_menu(
    restaurant_id,
    target_languages: list[str],
    provider=None,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> dict:
    """Complete les traductions manquantes de tout le menu d'un restaurant.

    Args:
        restaurant_id:     PK du restaurant.
        target_languages:  codes ISO des langues cibles (hors 'fr').
        provider:          fournisseur de traduction ; defaut = configure.
        on_progress:       callback(traites, total) pour le suivi.

    Returns:
        dict de bilan : { items_translated, categories_translated,
                          subcategories_translated, languages, skipped }
    """
    from django.conf import settings
    from api.models import MenuItem, MenuCategory, MenuSubCategory
    from api.models.ai_menu_models import SUPPORTED_LANGUAGES
    from . import get_vision_provider

    language_labels = dict(SUPPORTED_LANGUAGES)

    # Langues valides, hors francais (langue source).
    langs = [
        l for l in (target_languages or [])
        if l in language_labels and l != 'fr'
    ]
    if not langs:
        raise ValueError("Aucune langue cible valide.")

    provider = provider or get_vision_provider()

    categories = list(MenuCategory.objects.filter(restaurant_id=restaurant_id))
    subcategories = list(
        MenuSubCategory.objects.filter(category__restaurant_id=restaurant_id)
    )
    items = list(MenuItem.objects.filter(menu__restaurant_id=restaurant_id))

    total = len(categories) + len(subcategories) + len(items)
    done = 0
    report = {
        'items_translated': 0,
        'categories_translated': 0,
        'subcategories_translated': 0,
        'languages': langs,
        'skipped': 0,
    }

    def _tick():
        nonlocal done
        done += 1
        if on_progress:
            on_progress(done, total)

    # ── Categories (nom seul) ───────────────────────────────────────────────
    for cat in categories:
        missing = _missing_languages(cat, langs)
        if not missing:
            report['skipped'] += 1
            _tick()
            continue
        translations = dict(getattr(cat, 'translations', None) or {})
        changed = False
        for lang in missing:
            translated = _translate_name_only(provider, cat.name, language_labels[lang])
            if translated:
                translations[lang] = {'name': translated}
                changed = True
        if changed:
            cat.translations = translations
            cat.save(update_fields=['translations'])
            report['categories_translated'] += 1
        _tick()

    # ── Sous-categories (nom seul) ──────────────────────────────────────────
    for sub in subcategories:
        missing = _missing_languages(sub, langs)
        if not missing:
            report['skipped'] += 1
            _tick()
            continue
        translations = dict(getattr(sub, 'translations', None) or {})
        changed = False
        for lang in missing:
            translated = _translate_name_only(provider, sub.name, language_labels[lang])
            if translated:
                translations[lang] = {'name': translated}
                changed = True
        if changed:
            sub.translations = translations
            sub.save(update_fields=['translations'])
            report['subcategories_translated'] += 1
        _tick()

    # ── Plats (nom + description) ───────────────────────────────────────────
    for item in items:
        missing = _missing_languages(item, langs)
        if not missing:
            report['skipped'] += 1
            _tick()
            continue
        translations = dict(getattr(item, 'translations', None) or {})
        changed = False
        for lang in missing:
            tr = _translate_item(
                provider, item.name, item.description or '', language_labels[lang],
            )
            if tr:
                translations[lang] = tr
                changed = True
        if changed:
            item.translations = translations
            item.save(update_fields=['translations'])
            report['items_translated'] += 1
        _tick()

    logger.info(
        "Traduction menu resto %s terminee : %s plat(s), %s categorie(s), "
        "%s sous-categorie(s) traduits.",
        restaurant_id, report['items_translated'],
        report['categories_translated'], report['subcategories_translated'],
    )
    return report
