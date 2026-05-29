"""
Pipeline d'import de menu par IA — point d'entree du package.

Usage courant ::

    from api.services.menu_ai import get_vision_provider, run_menu_extraction

    # Tache asynchrone (recommande) :
    from api.services.menu_ai.tasks import process_menu_scan_job
    process_menu_scan_job.delay(str(job.id))

    # Appel synchrone (tests, debug) :
    result = run_menu_extraction(images_bytes, ['en', 'es'])

Le fournisseur d'IA effectivement utilise depend du reglage
`MENU_AI_PROVIDER` ('anthropic' ou 'openai').

"""
from __future__ import annotations

from django.conf import settings

from .base import MenuAIConfigError, MenuAIError, MenuVisionProvider, ProviderResult
from .providers import AnthropicVisionProvider, OpenAIVisionProvider
from .service import run_menu_extraction

# Registre des fournisseurs disponibles.
_PROVIDERS: dict[str, type[MenuVisionProvider]] = {
    'anthropic': AnthropicVisionProvider,
    'openai': OpenAIVisionProvider,
}


def get_vision_provider(name: str | None = None) -> MenuVisionProvider:
    """Retourne une instance du fournisseur de vision configure.

    Args:
        name: force un fournisseur precis ; si omis, lit `MENU_AI_PROVIDER`.

    Raises:
        MenuAIConfigError: fournisseur inconnu ou mal configure.
    """
    key = (name or getattr(settings, 'MENU_AI_PROVIDER', 'anthropic') or 'anthropic').lower()
    provider_cls = _PROVIDERS.get(key)
    if provider_cls is None:
        raise MenuAIConfigError(
            f"Fournisseur IA inconnu : '{key}'. "
            f"Valeurs possibles : {', '.join(sorted(_PROVIDERS))}."
        )
    return provider_cls()


__all__ = [
    'get_vision_provider',
    'run_menu_extraction',
    'MenuVisionProvider',
    'ProviderResult',
    'MenuAIError',
    'MenuAIConfigError',
    'AnthropicVisionProvider',
    'OpenAIVisionProvider',
]