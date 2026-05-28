"""
Implementations concretes des fournisseurs de vision.

- `AnthropicVisionProvider` : API Claude (SDK `anthropic`).
- `OpenAIVisionProvider`    : API OpenAI (SDK `openai`).

Les deux respectent le contrat `MenuVisionProvider`. On peut donc basculer de
l'un a l'autre via le reglage `MENU_AI_PROVIDER`, ou meme router extraction et
traduction sur des fournisseurs differents en instanciant directement la
classe voulue.

Multi-pages : `extract_menu` etiquette chaque photo ("Page N :") avant de
l'envoyer, pour aider le modele a ordonner les pages et a fusionner une
categorie qui se poursuit d'une page a l'autre. Si la reponse est tronquee
(plafond de tokens atteint sur une carte tres volumineuse), une `MenuAIError`
explicite est levee plutot que de laisser un JSON casse.
"""
from __future__ import annotations

import json
import logging

from django.conf import settings

from .base import (
    MenuAIConfigError,
    MenuAIError,
    MenuVisionProvider,
    ProviderResult,
    parse_json_response,
)
from .image_utils import PreparedImage
from .prompts import MENU_EXTRACTION_PROMPT, build_translation_prompt

logger = logging.getLogger(__name__)

# Plafond de tokens en sortie. Releve pour absorber les cartes multi-pages
# volumineuses (~150 plats avec descriptions ~= 12-15k tokens de JSON).
MAX_OUTPUT_TOKENS = 16384

# Message d'erreur commun en cas de reponse tronquee.
_TRUNCATED_MSG = (
    "Reponse du modele tronquee (plafond de tokens atteint) : la carte est "
    "trop volumineuse pour un seul traitement. Decoupez-la en plusieurs jobs "
    "(moins de pages par job)."
)


# -----------------------------------------------------------------------------
# Anthropic
# -----------------------------------------------------------------------------
class AnthropicVisionProvider(MenuVisionProvider):
    """Fournisseur base sur l'API Claude (Anthropic)."""

    name = 'anthropic'

    # Sonnet pour la vision (bon rapport qualite/prix sur l'OCR structure),
    # Haiku pour la traduction (tache texte simple, ~3x moins cher).
    DEFAULT_VISION_MODEL = 'claude-sonnet-4-6'
    DEFAULT_TEXT_MODEL = 'claude-haiku-4-5-20251001'

    def __init__(self):
        api_key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
        if not api_key:
            raise MenuAIConfigError("ANTHROPIC_API_KEY manquante dans la configuration.")

        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - depend de l'environnement
            raise MenuAIConfigError(
                "Le paquet 'anthropic' n'est pas installe (pip install anthropic)."
            ) from exc

        self._client = anthropic.Anthropic(api_key=api_key)
        self.vision_model = getattr(settings, 'MENU_AI_VISION_MODEL', '') or self.DEFAULT_VISION_MODEL
        self.text_model = getattr(settings, 'MENU_AI_TEXT_MODEL', '') or self.DEFAULT_TEXT_MODEL

    @staticmethod
    def _first_text(content) -> str:
        """Extrait le premier bloc texte d'une reponse Messages API."""
        for block in content or []:
            if getattr(block, 'type', None) == 'text':
                return block.text or ''
        return ''

    @staticmethod
    def _ensure_complete(response) -> None:
        """Leve une erreur si la generation a ete coupee au plafond de tokens."""
        if getattr(response, 'stop_reason', None) == 'max_tokens':
            raise MenuAIError(_TRUNCATED_MSG)

    def extract_menu(self, images: list[PreparedImage]) -> ProviderResult:
        # On etiquette chaque page avant son image (ordre + continuite).
        content: list = []
        for page_number, img in enumerate(images, start=1):
            content.append({'type': 'text', 'text': f'Page {page_number} :'})
            content.append({
                'type': 'image',
                'source': {
                    'type': 'base64',
                    'media_type': img.media_type,
                    'data': img.base64,
                },
            })
        content.append({'type': 'text', 'text': MENU_EXTRACTION_PROMPT})

        response = self._client.messages.create(
            model=self.vision_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            messages=[{'role': 'user', 'content': content}],
        )
        self._ensure_complete(response)
        return ProviderResult(
            data=parse_json_response(self._first_text(response.content)),
            model=self.vision_model,
            input_tokens=getattr(response.usage, 'input_tokens', 0),
            output_tokens=getattr(response.usage, 'output_tokens', 0),
        )

    def translate(self, payload: dict[str, str], target_language_label: str) -> ProviderResult:
        response = self._client.messages.create(
            model=self.text_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=build_translation_prompt(target_language_label),
            messages=[{
                'role': 'user',
                'content': json.dumps(payload, ensure_ascii=False),
            }],
        )
        self._ensure_complete(response)
        return ProviderResult(
            data=parse_json_response(self._first_text(response.content)),
            model=self.text_model,
            input_tokens=getattr(response.usage, 'input_tokens', 0),
            output_tokens=getattr(response.usage, 'output_tokens', 0),
        )


# -----------------------------------------------------------------------------
# OpenAI
# -----------------------------------------------------------------------------
class OpenAIVisionProvider(MenuVisionProvider):
    """Fournisseur base sur l'API OpenAI."""

    name = 'openai'

    # GPT-4.1 pour la vision ; GPT-4.1-mini pour la traduction (texte pur).
    # NB : ne pas utiliser un modele 'mini' pour la VISION — son multiplicateur
    # de tokens-image gonfle le cout des photos.
    DEFAULT_VISION_MODEL = 'gpt-4.1'
    DEFAULT_TEXT_MODEL = 'gpt-4.1-mini'

    def __init__(self):
        api_key = getattr(settings, 'OPENAI_API_KEY', '') or ''
        if not api_key:
            raise MenuAIConfigError("OPENAI_API_KEY manquante dans la configuration.")

        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depend de l'environnement
            raise MenuAIConfigError(
                "Le paquet 'openai' n'est pas installe (pip install openai)."
            ) from exc

        self._client = OpenAI(api_key=api_key)
        self.vision_model = getattr(settings, 'MENU_AI_VISION_MODEL', '') or self.DEFAULT_VISION_MODEL
        self.text_model = getattr(settings, 'MENU_AI_TEXT_MODEL', '') or self.DEFAULT_TEXT_MODEL

    @staticmethod
    def _usage(response) -> tuple[int, int]:
        usage = getattr(response, 'usage', None)
        if not usage:
            return 0, 0
        return getattr(usage, 'prompt_tokens', 0), getattr(usage, 'completion_tokens', 0)

    @staticmethod
    def _ensure_complete(response) -> None:
        """Leve une erreur si la generation a ete coupee au plafond de tokens."""
        choice = response.choices[0] if response.choices else None
        if choice is not None and getattr(choice, 'finish_reason', None) == 'length':
            raise MenuAIError(_TRUNCATED_MSG)

    def extract_menu(self, images: list[PreparedImage]) -> ProviderResult:
        content: list = [{'type': 'text', 'text': MENU_EXTRACTION_PROMPT}]
        for page_number, img in enumerate(images, start=1):
            content.append({'type': 'text', 'text': f'Page {page_number} :'})
            content.append({'type': 'image_url', 'image_url': {'url': img.data_url}})

        response = self._client.chat.completions.create(
            model=self.vision_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            response_format={'type': 'json_object'},
            messages=[{'role': 'user', 'content': content}],
        )
        self._ensure_complete(response)
        input_tokens, output_tokens = self._usage(response)
        return ProviderResult(
            data=parse_json_response(response.choices[0].message.content),
            model=self.vision_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    def translate(self, payload: dict[str, str], target_language_label: str) -> ProviderResult:
        response = self._client.chat.completions.create(
            model=self.text_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            response_format={'type': 'json_object'},
            messages=[
                {'role': 'system', 'content': build_translation_prompt(target_language_label)},
                {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)},
            ],
        )
        self._ensure_complete(response)
        input_tokens, output_tokens = self._usage(response)
        return ProviderResult(
            data=parse_json_response(response.choices[0].message.content),
            model=self.text_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
