import logging
import uuid

import stripe
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from api.models import Restaurant, RestaurateurProfile

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

# Base URL de l'API (HTTPS en prod, HTTP en dev)
API_BASE_URL = getattr(settings, 'API_BASE_URL', 'http://localhost:8000')

# URLs HTTPS que Stripe accepte — redirigent vers les deep links de l'app
APP_RETURN_URL = f"{API_BASE_URL}/api/v1/stripe/redirect/success/"
APP_REFRESH_URL = f"{API_BASE_URL}/api/v1/stripe/redirect/refresh/"

# Deep link scheme de l'app (défini dans app.json → "scheme": "eatquicker")
APP_DEEP_LINK_SCHEME = "eatquicker"


# ════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════

def _is_stripe_account_validated(account_data) -> bool:
    """Critère unique pour considérer un compte Stripe Connect comme validé.

    Source de vérité utilisée à la fois par le webhook et par la vue de statut
    pour éviter tout drift de logique entre les deux.

    `payouts_enabled` est essentiel : sans lui, le restaurateur ne reçoit pas
    réellement les fonds, même si `charges_enabled` est True.
    """
    return (
        account_data.get('charges_enabled', False)
        and account_data.get('details_submitted', False)
        and account_data.get('payouts_enabled', False)
    )


def _activate_restaurateur(profile: RestaurateurProfile) -> None:
    """Active le restaurateur et tous ses restaurants après validation Stripe."""
    profile.stripe_verified = True
    profile.stripe_onboarding_completed = True
    profile.is_validated = True
    profile.is_active = True
    profile.save(update_fields=[
        'stripe_verified',
        'stripe_onboarding_completed',
        'is_validated',
        'is_active',
    ])
    Restaurant.objects.filter(owner=profile).update(
        is_stripe_active=True,
        is_active=True,
    )
    logger.info(f"Stripe validé — restaurateur {profile.id} activé")


def _deactivate_stripe(profile: RestaurateurProfile) -> None:
    """Désactive Stripe sur les restaurants sans toucher au profil lui-même
    (cas transitoire : le compte peut redevenir valide)."""
    profile.stripe_verified = False
    profile.save(update_fields=['stripe_verified'])
    updated = Restaurant.objects.filter(
        owner=profile, is_stripe_active=True
    ).update(is_stripe_active=False)
    if updated:
        logger.info(
            f"Stripe désactivé sur {updated} restaurant(s) du profil {profile.id}"
        )


def _render_redirect_html(emoji: str, title: str, message: str, deep_link: str) -> str:
    """Page HTML intermédiaire qui redirige vers le deep link de l'app."""
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{title}</title>
    <meta http-equiv="refresh" content="2;url={deep_link}">
    <style>
        body {{ font-family: -apple-system, sans-serif; display: flex; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0; background: #F7F7FA;
               text-align: center; padding: 20px; }}
        .card {{ background: white; border-radius: 16px; padding: 40px; max-width: 400px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08); }}
        h1 {{ color: #111827; font-size: 22px; }}
        p {{ color: #6B7280; font-size: 16px; }}
        a {{ color: #1E2A78; text-decoration: none; font-weight: 600; }}
    </style>
</head>
<body>
    <div class="card">
        <p style="font-size:40px">{emoji}</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <p><a href="{deep_link}">Ouvrir EatQuickeR</a></p>
    </div>
</body>
</html>"""


def _resolve_business_name(profile: RestaurateurProfile) -> str:
    """Préfère la raison sociale (entité légale) au nom personnel."""
    raison_sociale = getattr(profile, 'raison_sociale', None)
    if raison_sociale:
        return raison_sociale
    user = profile.user
    return user.get_full_name() or user.first_name or user.username


def _resolve_email(profile: RestaurateurProfile) -> str | None:
    """Retourne l'email du restaurateur uniquement si c'est bien un email."""
    email = profile.user.email
    if email and '@' in email:
        return email
    return None


# ════════════════════════════════════════════════════════════════════
# Vues de redirection Stripe → Deep link app
# ════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([AllowAny])
def stripe_redirect_success(request):
    """Stripe redirige ici après onboarding réussi → redirige vers l'app."""
    deep_link = f"{APP_DEEP_LINK_SCHEME}://stripe/success"
    html = _render_redirect_html(
        emoji="✅",
        title="Configuration terminée !",
        message="Vous allez être redirigé vers l'application...",
        deep_link=deep_link,
    )
    return HttpResponse(html, content_type='text/html')


@api_view(['GET'])
@permission_classes([AllowAny])
def stripe_redirect_refresh(request):
    """Stripe redirige ici si le lien a expiré → relance l'app."""
    deep_link = f"{APP_DEEP_LINK_SCHEME}://stripe/refresh"
    html = _render_redirect_html(
        emoji="🔄",
        title="Lien expiré",
        message="Retour vers l'application pour générer un nouveau lien...",
        deep_link=deep_link,
    )
    return HttpResponse(html, content_type='text/html')


# ════════════════════════════════════════════════════════════════════
# Vues Stripe Connect
# ════════════════════════════════════════════════════════════════════

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_stripe_account(request):
    """Créer un compte Stripe Connect Express pour un restaurateur."""
    user = request.user

    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Seuls les restaurateurs peuvent créer un compte Stripe'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if restaurateur_profile.stripe_account_id:
        return Response(
            {'error': 'Un compte Stripe existe déjà pour cet utilisateur'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = _resolve_email(restaurateur_profile)
    if not email:
        return Response(
            {'error': "Adresse email manquante ou invalide sur le profil"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        # Idempotency key : si la requête est rejouée (réseau qui retry),
        # Stripe renverra le même Account au lieu d'en créer un nouveau.
        idempotency_key = f"acct-create-{restaurateur_profile.id}-{uuid.uuid4().hex[:8]}"

        account = stripe.Account.create(
            type='express',
            country='FR',
            email=email,
            business_type='individual',  # à adapter si tu gères aussi les sociétés
            business_profile={
                'name': _resolve_business_name(restaurateur_profile),
                'product_description': 'Restaurant et commande de repas via EatQuickeR',
            },
            metadata={
                'user_id': str(user.id),
                'user_email': email,
                'siret': restaurateur_profile.siret,
                'profile_id': str(restaurateur_profile.id),
                'app': 'EatQuickeR',
            },
            idempotency_key=idempotency_key,
        )

        restaurateur_profile.stripe_account_id = account.id
        restaurateur_profile.stripe_account_created = timezone.now()
        restaurateur_profile.save(update_fields=[
            'stripe_account_id',
            'stripe_account_created',
        ])

        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=APP_REFRESH_URL,
            return_url=APP_RETURN_URL,
            type='account_onboarding',
        )

        logger.info(
            f"Compte Stripe créé pour restaurateur {restaurateur_profile.id} "
            f"({user.username})"
        )

        return Response({
            'account_id': account.id,
            'onboarding_url': account_link.url,
            'message': 'Compte Stripe créé avec succès',
        })

    except stripe.error.StripeError:
        logger.exception(
            f"Erreur Stripe création compte pour restaurateur {restaurateur_profile.id}"
        )
        return Response(
            {'error': 'Erreur lors de la création du compte Stripe'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception:
        logger.exception(
            f"Erreur inattendue création compte pour restaurateur {restaurateur_profile.id}"
        )
        return Response(
            {'error': 'Erreur interne'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_stripe_account_status(request):
    """Récupérer le statut du compte Stripe Connect.

    En plus du retour, applique une réconciliation BDD :
    le webhook est la source principale, mais cette vue sert de défense
    en profondeur si un event a été manqué.
    """
    user = request.user

    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Profil restaurateur non trouvé'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not restaurateur_profile.stripe_account_id:
        return Response({
            'status': 'no_account',
            'has_validated_profile': False,
        })

    try:
        account = stripe.Account.retrieve(restaurateur_profile.stripe_account_id)
    except stripe.error.StripeError:
        logger.exception(
            f"Erreur récupération compte {restaurateur_profile.stripe_account_id}"
        )
        return Response(
            {'error': 'Erreur lors de la vérification du compte'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    has_validated = _is_stripe_account_validated(account)

    # Réconciliation BDD si l'état a changé
    if has_validated and not restaurateur_profile.stripe_verified:
        _activate_restaurateur(restaurateur_profile)
    elif not has_validated and restaurateur_profile.stripe_verified:
        _deactivate_stripe(restaurateur_profile)

    return Response({
        'status': 'account_exists',
        'account_id': restaurateur_profile.stripe_account_id,
        'charges_enabled': account.get('charges_enabled', False),
        'details_submitted': account.get('details_submitted', False),
        'payouts_enabled': account.get('payouts_enabled', False),
        'has_validated_profile': has_validated,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_onboarding_link(request):
    """Créer un nouveau lien d'onboarding Stripe (en cas de lien expiré)."""
    user = request.user

    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Seuls les restaurateurs peuvent accéder à cette fonctionnalité'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not restaurateur_profile.stripe_account_id:
        return Response(
            {'error': 'Aucun compte Stripe trouvé'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        account_link = stripe.AccountLink.create(
            account=restaurateur_profile.stripe_account_id,
            refresh_url=APP_REFRESH_URL,
            return_url=APP_RETURN_URL,
            type='account_onboarding',
        )
        return Response({'onboarding_url': account_link.url})

    except stripe.error.StripeError:
        logger.exception(
            f"Erreur création lien onboarding pour {restaurateur_profile.id}"
        )
        return Response(
            {'error': 'Erreur lors de la création du lien'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ════════════════════════════════════════════════════════════════════
# Webhook Stripe Connect (account events)
#
# Dashboard Stripe : Developers → Webhooks → Connect tab → Add endpoint
# URL : https://api.eatquicker.fr/api/v1/stripe/connect/webhook/
# Events : account.updated, account.application.authorized,
#          account.application.deauthorized
# ════════════════════════════════════════════════════════════════════

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_connect_webhook(request):
    """Reçoit les événements Stripe sur les comptes connectés des restaurateurs."""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    endpoint_secret = getattr(settings, 'STRIPE_CONNECT_WEBHOOK_SECRET', None)

    if not endpoint_secret:
        logger.error("STRIPE_CONNECT_WEBHOOK_SECRET non configuré")
        return HttpResponse(status=500)

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except ValueError:
        logger.warning("Payload invalide dans webhook Stripe Connect")
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        logger.warning("Signature invalide dans webhook Stripe Connect")
        return HttpResponse(status=400)

    event_type = event['type']
    account = event['data']['object']

    if event_type == 'account.updated':
        _handle_account_updated(account)
    elif event_type == 'account.application.authorized':
        logger.info(f"Compte Stripe autorisé: {account.get('id')}")
    elif event_type == 'account.application.deauthorized':
        _handle_account_deauthorized(account)
    else:
        logger.info(f"Événement Stripe Connect non géré: {event_type}")

    return HttpResponse(status=200)


def _handle_account_updated(account):
    """Gestion d'un account.updated : synchronise l'état BDD avec Stripe."""
    account_id = account.get('id')
    if not account_id:
        return

    try:
        profile = RestaurateurProfile.objects.get(stripe_account_id=account_id)
    except RestaurateurProfile.DoesNotExist:
        logger.warning(f"Webhook: aucun profil pour compte Stripe {account_id}")
        return

    try:
        if _is_stripe_account_validated(account):
            if not profile.stripe_verified:
                _activate_restaurateur(profile)
        else:
            if profile.stripe_verified:
                _deactivate_stripe(profile)
    except Exception:
        logger.exception(f"Erreur _handle_account_updated pour {account_id}")


def _handle_account_deauthorized(account):
    """Le restaurateur a révoqué l'accès depuis son dashboard Stripe."""
    account_id = account.get('id')
    if not account_id:
        return

    try:
        profile = RestaurateurProfile.objects.get(stripe_account_id=account_id)
    except RestaurateurProfile.DoesNotExist:
        logger.warning(f"Webhook: profil non trouvé pour compte déautorisé {account_id}")
        return

    profile.stripe_verified = False
    profile.stripe_onboarding_completed = False
    profile.is_validated = False
    profile.is_active = False
    profile.save(update_fields=[
        'stripe_verified',
        'stripe_onboarding_completed',
        'is_validated',
        'is_active',
    ])
    Restaurant.objects.filter(owner=profile).update(is_stripe_active=False)
    logger.info(f"Compte Stripe déautorisé — profil {profile.id} désactivé")