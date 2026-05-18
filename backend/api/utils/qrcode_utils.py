"""
Utilitaires de génération de QR codes avec logo EatQuickeR intégré au centre.

L'incrustation du logo au centre nécessite un niveau de correction d'erreur
élevé (ERROR_CORRECT_H = 30%) pour que le QR reste scannable.
"""
import logging
import os
from io import BytesIO

import qrcode
from PIL import Image
from django.conf import settings
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)

# Ratio de la largeur du logo par rapport au QR code (max recommandé : 0.25)
LOGO_RATIO = 0.22
# Marge blanche autour du logo (en pixels)
LOGO_PADDING = 6
# Rayon des coins arrondis du fond blanc derrière le logo (en pixels)
LOGO_BG_RADIUS = 12


def _get_logo_path():
    """
    Retourne le chemin absolu vers logo.png ou None si introuvable.

    Cherche dans plusieurs emplacements probables pour rester compatible
    avec différentes configurations (dev, prod, collectstatic).
    """
    candidates = [
        # Chemin direct dans STATIC_ROOT
        os.path.join(getattr(settings, 'STATIC_ROOT', '') or '', 'logo.png'),
        # Chemin direct dans BASE_DIR/static (avant collectstatic)
        os.path.join(getattr(settings, 'BASE_DIR', ''), 'static', 'logo.png'),
        # Chemin dans api/static
        os.path.join(getattr(settings, 'BASE_DIR', ''), 'api', 'static', 'logo.png'),
        # Chemin dans api/static/images
        os.path.join(getattr(settings, 'BASE_DIR', ''), 'api', 'static', 'images', 'logo.png'),
        # Chemin défini en settings personnalisés
        getattr(settings, 'QR_LOGO_PATH', None),
    ]

    for path in candidates:
        if path and os.path.exists(path):
            return path

    logger.warning(
        "Logo introuvable pour intégration QR. Cherché dans : %s",
        [p for p in candidates if p],
    )
    return None


def _embed_logo(qr_img, logo_path=None):
    """
    Incruste le logo au centre d'une image QR code PIL.

    Args:
        qr_img: PIL.Image du QR code (mode RGB ou RGBA)
        logo_path: Chemin optionnel vers le logo. Si None, utilise _get_logo_path().

    Returns:
        PIL.Image avec le logo incrusté au centre. Si le logo est introuvable,
        retourne l'image QR inchangée (mode original conservé).
    """
    if logo_path is None:
        logo_path = _get_logo_path()

    if not logo_path:
        return qr_img

    try:
        qr_img = qr_img.convert('RGBA')
        logo = Image.open(logo_path).convert('RGBA')

        qr_w, qr_h = qr_img.size
        logo_max = int(qr_w * LOGO_RATIO)

        # Redimensionner le logo en conservant les proportions
        logo.thumbnail((logo_max, logo_max), Image.LANCZOS)
        logo_w, logo_h = logo.size

        # Position du logo (centré)
        logo_x = (qr_w - logo_w) // 2
        logo_y = (qr_h - logo_h) // 2

        # Fond blanc derrière le logo pour assurer la lisibilité
        bg_w = logo_w + 2 * LOGO_PADDING
        bg_h = logo_h + 2 * LOGO_PADDING
        bg_x = logo_x - LOGO_PADDING
        bg_y = logo_y - LOGO_PADDING

        # Créer un fond blanc avec coins arrondis
        bg = Image.new('RGBA', (bg_w, bg_h), (255, 255, 255, 0))
        try:
            from PIL import ImageDraw
            draw = ImageDraw.Draw(bg)
            draw.rounded_rectangle(
                [(0, 0), (bg_w - 1, bg_h - 1)],
                radius=LOGO_BG_RADIUS,
                fill=(255, 255, 255, 255),
            )
        except (ImportError, AttributeError):
            # Fallback : rectangle simple sans coins arrondis
            bg.paste((255, 255, 255, 255), (0, 0, bg_w, bg_h))

        qr_img.paste(bg, (bg_x, bg_y), bg)
        qr_img.paste(logo, (logo_x, logo_y), logo)

        return qr_img
    except Exception as e:
        logger.warning("Échec de l'incrustation du logo dans le QR : %s", e)
        return qr_img


def make_qr_with_logo(
    data,
    box_size=10,
    border=4,
    fill_color="black",
    back_color="white",
    logo_path=None,
):
    """
    Génère une image PIL d'un QR code avec le logo EatQuickeR au centre.

    Utilise systématiquement ERROR_CORRECT_H (30% de redondance) pour
    permettre l'incrustation du logo sans casser la lisibilité.

    Args:
        data: Contenu à encoder (URL en général)
        box_size: Taille d'un module en pixels
        border: Largeur de la bordure en modules
        fill_color: Couleur des modules sombres
        back_color: Couleur du fond
        logo_path: Chemin optionnel vers un logo personnalisé

    Returns:
        PIL.Image du QR code avec logo intégré
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    qr_img = qr.make_image(fill_color=fill_color, back_color=back_color)
    return _embed_logo(qr_img, logo_path=logo_path)


def generate_qr_for_table(table):
    """
    Génère et sauvegarde le QR code d'une table avec le logo au centre.
    """
    url = f"{settings.DOMAIN}/table/{table.identifiant}"
    qr_img = make_qr_with_logo(url)

    buffer = BytesIO()
    qr_img.save(buffer, format='PNG')

    filename = f"qr_{table.identifiant}.png"
    table.qr_code_file.save(filename, ContentFile(buffer.getvalue()), save=True)