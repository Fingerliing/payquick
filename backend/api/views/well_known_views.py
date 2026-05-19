"""
Vues qui servent les fichiers `.well-known/` requis pour les Universal Links
(iOS) et les App Links (Android).

Pourquoi servir ces fichiers depuis Django plutôt que depuis le static
hosting OVH :
    OVH static hosting refuse de servir des fichiers sans extension avec
    le bon Content-Type (`application/json`), et les fichiers
    `apple-app-site-association` et `assetlinks.json` doivent
    impérativement être servis avec ce Content-Type pour qu'Apple et
    Google valident le lien entre le domaine et l'app. Servir depuis
    Django garantit le bon header et permet aussi de versionner les
    fingerprints/Team IDs dans le `.env`.

Routes exposées (à câbler dans backend/backend/urls.py) :
    GET /.well-known/apple-app-site-association
    GET /.well-known/assetlinks.json

Variables d'environnement attendues (dans backend/.env) :
    APPLE_TEAM_ID            (10 caractères alphanumériques, ex: A1B2C3D4E5)
    IOS_BUNDLE_ID            (défaut: com.fingerliing.EatQuickeR)
    ANDROID_PACKAGE_NAME     (défaut: com.fingerliing.EatQuickeR)
    ANDROID_SHA256_FINGERPRINTS  (séparés par des virgules ; voir guide)

Vérification après déploiement :
    curl -i https://api.eatquicker.fr/.well-known/apple-app-site-association
    curl -i https://api.eatquicker.fr/.well-known/assetlinks.json

    Les deux doivent retourner HTTP 200, Content-Type: application/json,
    et un body JSON valide.

    Tester côté Apple :
        https://app-site-association.cdn-apple.com/a/v1/api.eatquicker.fr
    Tester côté Google :
        https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://api.eatquicker.fr&relation=delegate_permission/common.handle_all_urls
"""

import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)


# ─── Helpers de configuration ─────────────────────────────────────────────────
def _get_apple_team_id() -> str | None:
    """Apple Team ID — 10 caractères. À récupérer dans developer.apple.com."""
    return getattr(settings, "APPLE_TEAM_ID", None)


def _get_ios_bundle_id() -> str:
    return getattr(settings, "IOS_BUNDLE_ID", "com.fingerliing.EatQuickeR")


def _get_android_package_name() -> str:
    return getattr(settings, "ANDROID_PACKAGE_NAME", "com.fingerliing.EatQuickeR")


def _get_android_sha256_fingerprints() -> list[str]:
    """
    Liste de SHA-256 fingerprints (en hex MAJUSCULES, séparés par ':').
    Stockés dans .env comme une chaîne séparée par des virgules.

    En production, on a généralement DEUX empreintes :
      1. Upload key (utilisée par EAS pour signer l'AAB envoyé à Google)
      2. App signing key (gérée par Google Play App Signing, distincte)

    Pour Universal Links de fonctionner aussi bien en dev/internal-testing
    qu'en prod store, il faut inclure les deux.
    """
    raw = getattr(settings, "ANDROID_SHA256_FINGERPRINTS", "")
    if not raw:
        return []
    return [f.strip().upper() for f in raw.split(",") if f.strip()]


# ─── apple-app-site-association ───────────────────────────────────────────────
@require_GET
@cache_control(public=True, max_age=3600)
def apple_app_site_association(request):
    """
    Fichier de configuration pour les Universal Links iOS.

    Apple télécharge ce fichier la première fois que l'app est lancée
    sur l'appareil (et périodiquement ensuite). Le `appID` est de la
    forme `<TEAM_ID>.<BUNDLE_ID>` et `paths` liste les chemins HTTPS
    interceptés par l'app.

    IMPORTANT :
      - Le fichier doit être servi en HTTPS, sans redirection (301/302
        cassent la vérification Apple), et avec Content-Type
        application/json.
      - Pas de commentaires JSON (// ou /* */) — Apple les refuse.
      - L'URL canonique est /.well-known/apple-app-site-association
        SANS extension de fichier.
    """
    team_id = _get_apple_team_id()
    bundle_id = _get_ios_bundle_id()

    if not team_id:
        logger.warning(
            "APPLE_TEAM_ID non configuré dans settings/.env. "
            "Les Universal Links iOS ne fonctionneront pas tant que ce n'est "
            "pas renseigné."
        )
        # On renvoie quand même un JSON vide valide pour éviter une 500
        # qui casserait le déploiement.
        return JsonResponse({"applinks": {"apps": [], "details": []}})

    aasa = {
        "applinks": {
            "apps": [],
            "details": [
                {
                    "appID": f"{team_id}.{bundle_id}",
                    # Paths interceptés par l'app quand elle est installée.
                    # `/t/*` couvre tous les codes de table.
                    # On peut élargir ici si on ajoute d'autres deep links
                    # (ex: /reset-password/*, /order/*).
                    "paths": ["/t/*"],
                }
            ],
        }
    }

    # JsonResponse fixe automatiquement Content-Type à application/json.
    return JsonResponse(aasa)


# ─── assetlinks.json (Android App Links) ──────────────────────────────────────
@require_GET
@cache_control(public=True, max_age=3600)
def android_assetlinks(request):
    """
    Fichier de configuration pour les Android App Links.

    Google vérifie l'empreinte SHA-256 du certificat de signature de l'APK
    contre ce fichier au moment de l'installation. Si la vérification
    passe (statut `verified` dans `adb shell pm get-app-links`), les
    liens https://api.eatquicker.fr/t/... ouvrent directement l'app sans
    passer par le sélecteur "Ouvrir avec".

    Format de la liste de fingerprints attendu en hex :
        14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5

    Pour récupérer le fingerprint EAS :
        eas credentials --platform android
        # → Sélectionner production → Application signing → Show keystore credentials

    Pour récupérer le fingerprint Google Play App Signing :
        Play Console → ton app → Setup → App integrity → App signing
        → SHA-256 certificate fingerprint
    """
    package_name = _get_android_package_name()
    fingerprints = _get_android_sha256_fingerprints()

    if not fingerprints:
        logger.warning(
            "ANDROID_SHA256_FINGERPRINTS non configuré dans settings/.env. "
            "Les App Links Android ne fonctionneront pas tant que ce n'est "
            "pas renseigné."
        )
        return JsonResponse([], safe=False)

    statements = [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": package_name,
                "sha256_cert_fingerprints": fingerprints,
            },
        }
    ]

    # safe=False car le top-level est une liste, pas un dict.
    return JsonResponse(statements, safe=False)
