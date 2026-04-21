import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, HttpResponseRedirect
from api.models import RestaurateurProfile, ClientProfile, Restaurant
import json
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

# Base URL de l'API (HTTPS en prod, HTTP en dev)
API_BASE_URL = getattr(settings, 'API_BASE_URL', 'http://localhost:8000')

# URLs HTTPS que Stripe accepte — redirigent vers les deep links de l'app
APP_RETURN_URL  = f"{API_BASE_URL}/api/v1/stripe/redirect/success/"
APP_REFRESH_URL = f"{API_BASE_URL}/api/v1/stripe/redirect/refresh/"

# Deep link scheme de l'app (défini dans app.json → "scheme": "eatquicker")
APP_DEEP_LINK_SCHEME = "eatquicker"


# -----------------------
# Vues de redirection Stripe → Deep link app
# -----------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def stripe_redirect_success(request):
    """Stripe redirige ici après onboarding réussi → redirige vers l'app via deep link"""
    deep_link = f"{APP_DEEP_LINK_SCHEME}://stripe/success"
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Configuration Stripe terminée</title>
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
        <p style="font-size:40px">✅</p>
        <h1>Configuration terminée !</h1>
        <p>Vous allez être redirigé vers l'application...</p>
        <p><a href="{deep_link}">Ouvrir EatQuickeR</a></p>
    </div>
</body>
</html>"""
    return HttpResponse(html, content_type='text/html')


@api_view(['GET'])
@permission_classes([AllowAny])
def stripe_redirect_refresh(request):
    """Stripe redirige ici si le lien a expiré → redirige vers l'app pour relancer"""
    deep_link = f"{APP_DEEP_LINK_SCHEME}://stripe/refresh"
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Lien Stripe expiré</title>
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
        <p style="font-size:40px">🔄</p>
        <h1>Lien expiré</h1>
        <p>Retour vers l'application pour générer un nouveau lien...</p>
        <p><a href="{deep_link}">Ouvrir EatQuickeR</a></p>
    </div>
</body>
</html>"""
    return HttpResponse(html, content_type='text/html')


# -----------------------
# Vues Stripe Connect
# -----------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_stripe_account(request):
    """Créer un compte Stripe Connect pour un restaurateur"""
    user = request.user
    
    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Seuls les restaurateurs peuvent créer un compte Stripe'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if restaurateur_profile.stripe_account_id:
        return Response(
            {'error': 'Un compte Stripe existe déjà pour cet utilisateur'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        account = stripe.Account.create(
            type='express',
            country='FR',
            email=user.email or user.username,
            business_profile={
                'name': restaurateur_profile.user.get_full_name() or restaurateur_profile.user.first_name or restaurateur_profile.user.username,
                'product_description': 'Restaurant et livraison de repas via Eat&Go',
            },
            metadata={
                'user_id': str(user.id),
                'user_email': user.email or user.username,
                'siret': restaurateur_profile.siret,
                'app': 'Eat&Go',
                'profile_id': str(restaurateur_profile.id),
            }
        )
        
        restaurateur_profile.stripe_account_id = account.id
        restaurateur_profile.stripe_account_created = timezone.now()
        restaurateur_profile.save()
        
        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=APP_REFRESH_URL,
            return_url=APP_RETURN_URL, 
            type='account_onboarding',
        )
        
        logger.info(f"Compte Stripe créé pour le restaurateur {restaurateur_profile.id} ({user.username})")
        
        return Response({
            'account_id': account.id,
            'onboarding_url': account_link.url,
            'message': 'Compte Stripe créé avec succès'
        })
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe pour restaurateur {restaurateur_profile.id}: {e}")
        return Response(
            {'error': 'Erreur lors de la création du compte Stripe'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        logger.error(f"Erreur inattendue pour restaurateur {restaurateur_profile.id}: {e}")
        return Response(
            {'error': 'Erreur interne'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_stripe_account_status(request):
    """Récupérer le statut du compte Stripe Connect"""
    user = request.user

    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Profil restaurateur non trouvé'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    if not restaurateur_profile.stripe_account_id:
        return Response({
            'status': 'no_account',
            'has_validated_profile': False,
        })
    
    try:
        account = stripe.Account.retrieve(restaurateur_profile.stripe_account_id)
        
        charges_enabled = account.get('charges_enabled', False)
        details_submitted = account.get('details_submitted', False)
        payouts_enabled = account.get('payouts_enabled', False)
        
        has_validated = charges_enabled and details_submitted
        
        if has_validated and not restaurateur_profile.stripe_verified:
            restaurateur_profile.stripe_verified = True
            restaurateur_profile.stripe_onboarding_completed = True
            restaurateur_profile.is_validated = True
            restaurateur_profile.is_active = True
            restaurateur_profile.save(update_fields=[
                'stripe_verified',
                'stripe_onboarding_completed',
                'is_validated',
                'is_active',
            ])
            for restaurant in Restaurant.objects.filter(owner=restaurateur_profile):
                restaurant.is_stripe_active = True
                restaurant.is_active = True
                restaurant.save(update_fields=['is_stripe_active', 'is_active'])
            logger.info(f"Profil Stripe validé pour restaurateur {restaurateur_profile.id}")

        if not has_validated:
            for restaurant in Restaurant.objects.filter(owner=restaurateur_profile):
                if restaurant.is_stripe_active:
                    restaurant.is_stripe_active = False
                    restaurant.save(update_fields=['is_stripe_active'])
                    logger.info(f"Restaurants désactivés pour le restaurateur {restaurateur_profile.id} ({user.username})")
        
        return Response({
            'status': 'account_exists',
            'account_id': restaurateur_profile.stripe_account_id,
            'charges_enabled': charges_enabled,
            'details_submitted': details_submitted,
            'payouts_enabled': payouts_enabled,
            'has_validated_profile': has_validated,
        })
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur lors de la récupération du compte {restaurateur_profile.stripe_account_id}: {e}")
        return Response({'error': 'Erreur lors de la vérification du compte'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_onboarding_link(request):
    """Créer un nouveau lien d'onboarding si nécessaire"""
    user = request.user
    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        return Response(
            {'error': 'Seuls les restaurateurs peuvent accéder à cette fonctionnalité'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if not restaurateur_profile.stripe_account_id:
        return Response(
            {'error': 'Aucun compte Stripe trouvé'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        account_link = stripe.AccountLink.create(
            account=restaurateur_profile.stripe_account_id,
            refresh_url=APP_REFRESH_URL,
            return_url=APP_RETURN_URL, 
            type='account_onboarding',
        )
        
        return Response({
            'onboarding_url': account_link.url
        })
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur création lien onboarding pour {restaurateur_profile.id}: {e}")
        return Response(
            {'error': 'Erreur lors de la création du lien'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@csrf_exempt
@api_view(['POST'])
@permission_classes([])
def stripe_webhook(request):
    """Webhook Stripe pour recevoir les événements de compte Connect"""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    webhook_secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', None)

    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET non configuré")
        return HttpResponse(status=500)

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except ValueError:
        logger.warning("Payload webhook invalide")
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        logger.warning("Signature webhook invalide")
        return HttpResponse(status=400)

    event_type = event.get('type', '')
    data = event.get('data', {}).get('object', {})

    if event_type == 'account.updated':
        account_id = data.get('id')
        if account_id:
            try:
                profile = RestaurateurProfile.objects.get(stripe_account_id=account_id)
                charges_enabled = data.get('charges_enabled', False)
                details_submitted = data.get('details_submitted', False)
                has_validated = charges_enabled and details_submitted

                if has_validated and not profile.stripe_verified:
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
                    for restaurant in Restaurant.objects.filter(owner=profile):
                        restaurant.is_stripe_active = True
                        restaurant.is_active = True
                        restaurant.save(update_fields=['is_stripe_active', 'is_active'])
                    logger.info(f"Webhook: Stripe validé pour restaurateur {profile.id}")
                    
            except RestaurateurProfile.DoesNotExist:
                logger.warning(f"Webhook: Aucun profil pour compte Stripe {account_id}")

    return HttpResponse(status=200)