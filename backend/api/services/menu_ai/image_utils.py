"""
Prétraitement des images de carte avant envoi au modèle de vision.

Levier de coût principal : une photo brute de smartphone (~12 Mpx) coûte
~16 000 tokens-image. Redimensionnée à 1568 px de côté max, elle tombe à
~1 600 tokens — soit un facteur ~10. On redimensionne donc systématiquement
avant tout appel API.

Emplacement : backend/api/services/menu_ai/image_utils.py
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass

from PIL import Image, ImageOps

# Côté le plus long, en pixels. 1568 est le seuil au-delà duquel Anthropic
# redimensionne de toute façon ; c'est aussi un bon compromis pour OpenAI
# (tuiles de 512 px). Inutile d'envoyer plus.
MAX_EDGE_PX = 1568
JPEG_QUALITY = 85


@dataclass
class PreparedImage:
    """Image prête à être envoyée à un fournisseur de vision."""

    data: bytes          # JPEG ré-encodé
    base64: str          # même contenu, encodé base64 (ASCII)
    media_type: str      # toujours 'image/jpeg' ici
    width: int
    height: int

    @property
    def data_url(self) -> str:
        """Format attendu par l'API OpenAI (data URL)."""
        return f"data:{self.media_type};base64,{self.base64}"


def prepare_image(raw: bytes) -> PreparedImage:
    """Ouvre, corrige l'orientation, redimensionne et ré-encode une image.

    - ``exif_transpose`` : les photos de smartphone embarquent une orientation
      EXIF ; sans correction, l'OCR lit une carte tournée de 90°.
    - Conversion RGB : supprime le canal alpha et les modes exotiques
      (CMYK, palette P) que JPEG ne sait pas encoder.
    - Redimensionnement : côté long plafonné à ``MAX_EDGE_PX``.
    """
    image = Image.open(io.BytesIO(raw))

    # Applique l'orientation EXIF puis la supprime des métadonnées.
    image = ImageOps.exif_transpose(image)

    if image.mode != 'RGB':
        image = image.convert('RGB')

    longest = max(image.size)
    if longest > MAX_EDGE_PX:
        ratio = MAX_EDGE_PX / longest
        new_size = (
            max(1, round(image.width * ratio)),
            max(1, round(image.height * ratio)),
        )
        image = image.resize(new_size, Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    data = buffer.getvalue()

    return PreparedImage(
        data=data,
        base64=base64.b64encode(data).decode('ascii'),
        media_type='image/jpeg',
        width=image.width,
        height=image.height,
    )
