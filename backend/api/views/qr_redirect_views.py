"""
Vue de redirection intelligente pour les QR codes de table.

Quand un client scanne un QR code avec son appareil photo natif, il arrive sur
une URL HTTPS publique. Cette vue sert une page HTML qui :

1. Si l'app est installée ET les App Links / Universal Links sont vérifiés
   (`assetlinks.json` / `apple-app-site-association` OK), l'app intercepte
   l'URL avant même que cette vue soit appelée. Cette page n'est donc
   affichée que pour les utilisateurs SANS l'app, ou pour les devices où
   la vérification n'a pas (encore) eu lieu.

2. Pour ces utilisateurs, la page propose un bouton "Ouvrir l'application"
   (qui tente le scheme custom `eatquicker://`) ET un bouton clair vers
   le store correspondant à leur OS.

3. Si le code de table est invalide, la page affiche une erreur explicite
   plutôt que de rediriger vers une app cassée.

⚠️ Ancienne version : la page contenait un script JS qui tentait
   automatiquement `window.location.href = 'eatquicker://...'` avec un
   fallback `setTimeout` vers le store après 1.8s. Cette technique ne
   fonctionne plus avec les versions récentes de Chrome (et iOS Safari) :
   Chrome interprète l'URL custom comme HTTPS et déclenche une 404
   "Impossible de trouver l'URL". La version actuelle s'appuie sur des
   liens cliqués par l'utilisateur (interaction = autorisé par les navs).
"""

import logging

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from api.models import Table

logger = logging.getLogger(__name__)


# Deep link scheme aligné sur app.json → "scheme": "eatquicker"
APP_DEEP_LINK_SCHEME = "eatquicker"

# Liens vers les stores (à remplacer par les vrais IDs une fois publiés)
APP_STORE_URL = "https://apps.apple.com/app/eatquicker/id0000000000"
PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.fingerliing.EatQuickeR"


def _render_qr_landing_html(
    table_code: str,
    restaurant_name: str,
    table_number: str,
    error: str | None = None,
) -> str:
    """Page HTML universelle, sans redirection JS automatique."""

    deep_link = f"{APP_DEEP_LINK_SCHEME}://t/{table_code}"

    if error:
        body = f"""
            <div class="card">
              <p style="font-size:48px">😕</p>
              <h1>QR code invalide</h1>
              <p>{error}</p>
              <p class="hint">Vérifiez le QR code de la table ou demandez de
                 l'aide au personnel du restaurant.</p>
            </div>
        """
    else:
        body = f"""
            <div class="card">
              <p style="font-size:48px">🍽️</p>
              <h1>{restaurant_name}</h1>
              <p class="table">Table {table_number}</p>

              <p>Bienvenue ! Pour commander, ouvrez l'application EatQuickeR.</p>

              <!-- Bouton principal : tentative d'ouverture de l'app -->
              <a href="{deep_link}" class="primary-btn">
                📲 Ouvrir l'application
              </a>

              <p class="separator">— Pas encore installée ? —</p>

              <!-- Boutons stores (un seul affiché selon l'OS via JS plus bas) -->
              <div class="stores">
                <a href="{APP_STORE_URL}" class="store-btn ios" id="ios-store">
                  Télécharger sur l'App Store
                </a>
                <a href="{PLAY_STORE_URL}" class="store-btn android" id="android-store">
                  Disponible sur Google Play
                </a>
              </div>

              <p class="hint">
                Après installation, scannez à nouveau le QR code de votre table.
              </p>
            </div>
        """

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="apple-itunes-app" content="app-id=0000000000, app-argument={deep_link}">
    <title>EatQuickeR — {restaurant_name if not error else "Code invalide"}</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            min-height: 100vh;
            background: linear-gradient(135deg, #1E2A78 0%, #0D1629 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }}
        .card {{
            background: white;
            border-radius: 20px;
            padding: 40px 28px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        }}
        h1 {{
            color: #1E2A78;
            font-size: 24px;
            margin: 12px 0 8px;
            font-weight: 700;
        }}
        p {{
            color: #4B5563;
            font-size: 15px;
            line-height: 1.5;
            margin: 8px 0;
        }}
        .table {{
            color: #D4AF37;
            font-weight: 700;
            font-size: 18px;
            margin-bottom: 24px;
            letter-spacing: 0.5px;
        }}
        .primary-btn {{
            display: block;
            margin: 24px 0 16px;
            padding: 16px 20px;
            background: #1E2A78;
            color: white;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 17px;
            transition: transform 0.1s, opacity 0.2s;
        }}
        .primary-btn:active {{
            opacity: 0.85;
            transform: scale(0.98);
        }}
        .separator {{
            color: #9CA3AF;
            font-size: 13px;
            margin: 20px 0 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .stores {{
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 0 0 20px;
        }}
        .store-btn {{
            display: block;
            padding: 14px 20px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
            transition: opacity 0.2s;
        }}
        .store-btn:active {{ opacity: 0.7; }}
        .store-btn.ios {{ background: #000; color: white; }}
        .store-btn.android {{
            background: white;
            color: #1E2A78;
            border: 2px solid #1E2A78;
        }}
        .hint {{
            color: #6B7280;
            font-size: 13px;
            margin-top: 16px;
            font-style: italic;
        }}
    </style>
</head>
<body>
    {body}

    <script>
      // Affiche uniquement le bouton du store correspondant à l'OS de
      // l'utilisateur. Aucune redirection automatique : ce sont les
      // navigateurs modernes (Chrome, Safari) qui exigent une interaction
      // utilisateur pour ouvrir un scheme custom.
      (function() {{
        var ua = navigator.userAgent || navigator.vendor || window.opera || '';
        var isAndroid = /android/i.test(ua);
        var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

        var iosBtn = document.getElementById('ios-store');
        var androidBtn = document.getElementById('android-store');

        if (isAndroid && iosBtn) iosBtn.style.display = 'none';
        if (isIOS && androidBtn) androidBtn.style.display = 'none';
      }})();
    </script>
</body>
</html>"""


@api_view(['GET'])
@permission_classes([AllowAny])
def qr_table_redirect(request, table_code: str):
    """
    Endpoint public servi sur GET /t/<table_code>/.

    Sert une page HTML qui propose à l'utilisateur d'ouvrir l'app via deep
    link OU d'installer l'app depuis le store. Pas de redirection JS
    automatique : Chrome moderne refuse les redirections non-interactives
    vers des schemes custom et déclenche une 404 "URL introuvable".

    Cette vue ne renvoie jamais de JSON : elle est destinée à être atteinte
    par le navigateur natif (Safari / Chrome) au scan d'un QR.

    Quand les App Links Android / Universal Links iOS sont correctement
    vérifiés sur le device de l'utilisateur, cette vue n'est même pas
    appelée : l'OS ouvre directement l'app installée. Cette page est donc
    le fallback pour les utilisateurs sans l'app.
    """
    try:
        table = Table.objects.select_related('restaurant').get(
            qr_code=table_code,
            is_active=True,
        )
        restaurant = table.restaurant

        if not restaurant.is_active:
            html = _render_qr_landing_html(
                table_code=table_code,
                restaurant_name='',
                table_number='',
                error="Ce restaurant n'est pas actif pour le moment.",
            )
            return HttpResponse(html, content_type='text/html; charset=utf-8', status=503)

        html = _render_qr_landing_html(
            table_code=table_code,
            restaurant_name=restaurant.name,
            table_number=str(table.number),
        )
        return HttpResponse(html, content_type='text/html; charset=utf-8')

    except Table.DoesNotExist:
        logger.warning(f"QR scan : code de table invalide '{table_code}'")
        html = _render_qr_landing_html(
            table_code=table_code,
            restaurant_name='',
            table_number='',
            error="Ce QR code ne correspond à aucune table active.",
        )
        return HttpResponse(html, content_type='text/html; charset=utf-8', status=404)

    except Exception as e:
        logger.exception(f"QR scan : erreur inattendue pour '{table_code}'")
        html = _render_qr_landing_html(
            table_code=table_code,
            restaurant_name='',
            table_number='',
            error="Une erreur est survenue. Réessayez plus tard.",
        )
        return HttpResponse(html, content_type='text/html; charset=utf-8', status=500)