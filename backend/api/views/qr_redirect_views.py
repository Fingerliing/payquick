"""
Vue de redirection intelligente pour les QR codes de table.

Quand un client scanne un QR code avec son appareil photo natif, il arrive sur
une URL HTTPS publique. Cette vue sert une page HTML qui :

1. Tente immédiatement d'ouvrir l'application via le scheme `eatquicker://`.
   Si l'app est installée, les Universal Links / App Links la déclencheront
   automatiquement (configurés via .well-known/apple-app-site-association
   et .well-known/assetlinks.json).

2. Si l'app n'est pas installée, propose un lien vers l'App Store ou le
   Play Store selon la plateforme détectée par user-agent.

3. Fournit une URL de secours pour les utilisateurs desktop ou les cas où
   ni l'app ni le store ne s'ouvrent.

Le code de table est validé côté serveur avant de générer la page : un code
invalide affiche une erreur claire au lieu de rediriger vers une app cassée.
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
    """Page HTML universelle qui essaie d'ouvrir l'app puis tombe sur les stores."""

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
        scripts = ""
    else:
        body = f"""
            <div class="card">
              <p style="font-size:48px">🍽️</p>
              <h1>{restaurant_name}</h1>
              <p class="table">Table {table_number}</p>

              <p>Ouverture de l'application en cours…</p>

              <div class="stores">
                <a href="{APP_STORE_URL}" class="store-btn ios" id="ios-store">
                  Télécharger sur l'App Store
                </a>
                <a href="{PLAY_STORE_URL}" class="store-btn android" id="android-store">
                  Disponible sur Google Play
                </a>
              </div>

              <p class="hint">
                Si l'application ne s'ouvre pas automatiquement, installez-la
                puis scannez à nouveau le QR code.
              </p>

              <p class="manual">
                <a href="{deep_link}">Ouvrir EatQuickeR manuellement</a>
              </p>
            </div>
        """
        # Tente l'ouverture du deep link tout de suite. Le `setTimeout` 1500ms
        # bascule sur le store si rien ne se passe (l'app a intercepté la
        # navigation via Universal Link sinon).
        scripts = f"""
        <script>
          (function() {{
            var ua = navigator.userAgent || navigator.vendor || window.opera;
            var isAndroid = /android/i.test(ua);
            var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

            // Masquer le bouton store de l'OS opposé
            var iosBtn = document.getElementById('ios-store');
            var androidBtn = document.getElementById('android-store');
            if (isAndroid && iosBtn) iosBtn.style.display = 'none';
            if (isIOS && androidBtn) androidBtn.style.display = 'none';

            // Tenter le deep link immédiatement
            if (isIOS || isAndroid) {{
              var fallbackTimer = setTimeout(function() {{
                if (isIOS) window.location.href = '{APP_STORE_URL}';
                else if (isAndroid) window.location.href = '{PLAY_STORE_URL}';
              }}, 1800);

              // Si la page perd le focus, l'app a été ouverte : on annule le fallback
              window.addEventListener('pagehide', function() {{ clearTimeout(fallbackTimer); }});
              window.addEventListener('blur', function() {{ clearTimeout(fallbackTimer); }});

              // Lancer le deep link
              window.location.href = '{deep_link}';
            }}
          }})();
        </script>
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
        .stores {{
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 28px 0 20px;
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
        .store-btn.android {{ background: #1E2A78; color: white; }}
        .hint {{
            color: #6B7280;
            font-size: 13px;
            margin-top: 20px;
            font-style: italic;
        }}
        .manual {{
            margin-top: 16px;
            font-size: 13px;
        }}
        .manual a {{
            color: #1E2A78;
            text-decoration: underline;
            font-weight: 600;
        }}
    </style>
</head>
<body>
    {body}
    {scripts}
</body>
</html>"""


@api_view(['GET'])
@permission_classes([AllowAny])
def qr_table_redirect(request, table_code: str):
    """
    Endpoint public servi sur GET /t/<table_code>/.

    Sert une page HTML qui tente d'ouvrir l'app via deep link et propose
    les stores en fallback. C'est l'URL pointée par les QR codes physiques
    sur les tables.

    Cette vue ne renvoie jamais de JSON : elle est destinée à être atteinte
    par le navigateur natif (Safari / Chrome) au scan d'un QR. Les Universal
    Links / App Links intercepteront l'URL avant que le navigateur ne charge
    cette page si l'application est installée.
    """
    code = (table_code or '').strip()

    if not code:
        html = _render_qr_landing_html(
            table_code='',
            restaurant_name='',
            table_number='',
            error="Aucun code de table fourni dans l'URL.",
        )
        return HttpResponse(html, content_type='text/html', status=400)

    try:
        table = get_object_or_404(Table, qr_code=code)
        restaurant = table.restaurant

        # Vérifier que le restaurant peut recevoir des commandes. On laisse
        # tout de même la page s'afficher : l'app gérera le détail (restaurant
        # fermé, table inactive, etc.) avec un meilleur contexte UX.
        restaurant_name = restaurant.name or "Restaurant"
        table_number = str(table.number) if table.number is not None else code

        html = _render_qr_landing_html(
            table_code=code,
            restaurant_name=restaurant_name,
            table_number=table_number,
        )
        return HttpResponse(html, content_type='text/html')

    except Exception as exc:
        logger.warning(f"QR redirect — code invalide '{code}': {exc}")
        html = _render_qr_landing_html(
            table_code=code,
            restaurant_name='',
            table_number='',
            error="Ce code de table n'existe pas ou n'est plus actif.",
        )
        return HttpResponse(html, content_type='text/html', status=404)