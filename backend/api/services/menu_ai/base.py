"""
Interface commune aux fournisseurs d'IA (extraction de menu + traduction).

Le pipeline est agnostique au fournisseur : `AnthropicVisionProvider` et
`OpenAIVisionProvider` (cf. providers.py) implementent ce meme contrat. Le
choix du fournisseur se fait via le reglage `MENU_AI_PROVIDER`.

Emplacement : backend/api/services/menu_ai/base.py
"""
from __future__ import annotations

import abc
import json
from dataclasses import dataclass, field

from .image_utils import PreparedImage


# ─────────────────────────────────────────────────────────────────────────────
# Exceptions
# ─────────────────────────────────────────────────────────────────────────────
class MenuAIError(Exception):
    """Erreur generique du pipeline d'import de menu par IA."""


class MenuAIConfigError(MenuAIError):
    """Configuration invalide (cle API manquante, fournisseur inconnu...).

    Distincte de `MenuAIError` : une erreur de configuration n'est PAS
    transitoire — inutile de retenter la tache Celery.
    """


# ─────────────────────────────────────────────────────────────────────────────
# Resultat normalise
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class ProviderResult:
    """Resultat normalise d'un appel a un fournisseur, quel qu'il soit."""

    data: dict                                # JSON parse renvoye par le modele
    model: str = ''                           # modele effectivement utilise
    input_tokens: int = 0
    output_tokens: int = 0
    raw: dict = field(default_factory=dict)   # metadonnees brutes (debug)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


# ─────────────────────────────────────────────────────────────────────────────
# Contrat fournisseur
# ─────────────────────────────────────────────────────────────────────────────
class MenuVisionProvider(abc.ABC):
    """Contrat d'un fournisseur d'IA pour l'import de menu."""

    #: Identifiant lisible du fournisseur ('anthropic', 'openai').
    name: str = 'base'

    @abc.abstractmethod
    def extract_menu(self, images: list[PreparedImage]) -> ProviderResult:
        """Extrait la structure du menu + la charte graphique depuis des photos.

        `ProviderResult.data` doit respecter EXTRACTION_JSON_SHAPE (cf. prompts).
        """
        raise NotImplementedError

    @abc.abstractmethod
    def translate(
        self,
        payload: dict[str, str],
        target_language_label: str,
    ) -> ProviderResult:
        """Traduit un dictionnaire {cle: texte_fr} vers une langue cible.

        `ProviderResult.data` doit contenir exactement les memes cles que
        `payload`, avec les valeurs traduites.
        """
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def parse_json_response(text: str) -> dict:
    """Parse une reponse modele en JSON, tolerant aux balises Markdown.

    Malgre la consigne « JSON brut », les modeles encadrent parfois leur
    sortie de ```json ... ```. On nettoie avant de parser, puis on isole
    l'objet JSON en dernier recours.

    Leve `MenuAIError` si le contenu n'est pas du JSON exploitable.
    """
    cleaned = (text or '').strip()

    # Retire d'eventuelles balises Markdown ```json ... ```.
    if '```' in cleaned:
        start = cleaned.find('```')
        end = cleaned.rfind('```')
        if end > start:
            inner = cleaned[start + 3:end]
            # Enleve un eventuel libelle de langage en tete de bloc.
            if '\n' in inner:
                first_line, rest = inner.split('\n', 1)
                if first_line.strip().lower() in ('json', ''):
                    inner = rest
            cleaned = inner.strip()

    # Filet de securite : isole l'objet JSON entre la 1re { et la derniere }.
    if not cleaned.startswith('{'):
        first_brace = cleaned.find('{')
        last_brace = cleaned.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace:last_brace + 1]

    try:
        result = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError) as exc:
        raise MenuAIError(f"Reponse du modele non parsable en JSON : {exc}") from exc

    if not isinstance(result, dict):
        raise MenuAIError("La reponse du modele n'est pas un objet JSON.")
    return result
