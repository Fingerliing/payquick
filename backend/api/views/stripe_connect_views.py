import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from api.models import RestaurateurProfile, ClientProfile, Restaurant
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY
APP_RETURN_URL  = "eatandgo://stripe/success"
APP_REFRESH_URL = "eatandgo://stripe/refresh"

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_stripe_account(request):
    """Créer un compte Stripe Connect pour un restaurateur"""
    user = request.user
    
    # Vérifier que l'utilisateur est un restaurateur
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
        # Créer un compte Stripe Connect
        account = stripe.Account.create(
            type='express',
            country='FR',
            email=user.email or user.username,
            business_profile={
                'name': restaurateur_profile.display_name,
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
        
        # Sauvegarder l'ID du compte Stripe
        restaurateur_profile.stripe_account_id = account.id
        restaurateur_profile.stripe_account_created = datetime.now()
        restaurateur_profile.save()
        
        # Créer un lien d'onboarding avec des URLs adaptées à votre app
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
        logger.error(f"Erreur Stripe pour restaurateur {restaurateur_profile.id}: {str(e)}")
        return Response(
            {'error': 'Erreur lors de la création du compte Stripe'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        logger.error(f"Erreur inattendue lors de la création du compte Stripe: {str(e)}")
        return Response(
            {'error': 'Erreur inattendue lors de la création du compte'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_stripe_account_status(request):
    """Vérifier le statut du compte Stripe"""
    user = request.user
    
    # Vérifier si l'utilisateur est un restaurateur
    try:
        restaurateur_profile = RestaurateurProfile.objects.get(user=user)
    except RestaurateurProfile.DoesNotExist:
        # Si c'est un client, retourner un statut simple
        try:
            ClientProfile.objects.get(user=user)
            return Response({
                'status': 'client_account',
                'has_validated_profile': True,
                'message': 'Compte client - aucune validation Stripe requise'
            })
        except ClientProfile.DoesNotExist:
            return Response({'status': 'unknown_user'})
    
    if not restaurateur_profile.stripe_account_id:
        return Response({
            'status': 'no_account',
            'has_validated_profile': False,
        })
    
    try:
        account = stripe.Account.retrieve(restaurateur_profile.stripe_account_id)
        
        return Response({
            'status': 'account_exists',
            'account_id': account.id,
            'charges_enabled': account.charges_enabled,
            'details_submitted': account.details_submitted,
            'payouts_enabled': account.payouts_enabled,
            'requirements': account.requirements,
            'has_validated_profile': restaurateur_profile.stripe_verified,
        })
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur lors de la récupération du compte {restaurateur_profile.stripe_account_id}: {str(e)}")
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
        logger.error(f"Erreur création lien onboarding pour {restaurateur_profile.id}: {str(e)}")
        return Response(
            {'error': 'Erreur lors de la création du lien'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@csrf_exempt
@api_view(['POST'])
def stripe_webhook(request):
    """Gérer les webhooks Stripe"""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError:
        logger.error("Payload invalide dans webhook Stripe")
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        logger.error("Signature invalide dans webhook Stripe")
        return HttpResponse(status=400)
    
    # Gérer l'événement
    if event['type'] == 'account.updated':
        handle_account_updated(event['data']['object'])
    elif event['type'] == 'account.application.authorized':
        handle_account_authorized(event['data']['object'])
    elif event['type'] == 'account.application.deauthorized':
        handle_account_deauthorized(event['data']['object'])
    else:
        logger.info(f"Événement Stripe non géré: {event['type']}")
    
    return HttpResponse(status=200)

def handle_account_updated(account):
    """Gérer la mise à jour d'un compte Stripe"""
    try:
        restaurateur_profile = RestaurateurProfile.objects.get(stripe_account_id=account['id'])
        
        # Vérifier si le compte est maintenant validé
        is_validated = (
            account.get('charges_enabled', False) and 
            account.get('details_submitted', False) and
            account.get('payouts_enabled', False)
        )
        
        if is_validated:
            restaurateur_profile.stripe_verified = True
            restaurateur_profile.stripe_onboarding_completed = True
            restaurateur_profile.is_validated = True
            restaurateur_profile.is_active = True
            
            # Activer les restaurants de ce restaurateur
            Restaurant.objects.filter(owner=restaurateur_profile).update(is_stripe_active=True)
            
            logger.info(f"Compte Stripe validé pour le restaurateur {restaurateur_profile.id} ({restaurateur_profile.display_name})")
        else:
            restaurateur_profile.stripe_verified = False
            Restaurant.objects.filter(owner=restaurateur_profile).update(is_stripe_active=False)
            
            logger.info(f"Compte Stripe non validé pour le restaurateur {restaurateur_profile.id}")
            
        restaurateur_profile.save()
        
    except RestaurateurProfile.DoesNotExist:
        logger.error(f"RestaurateurProfile non trouvé pour le compte Stripe {account['id']}")
    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour du compte Stripe: {str(e)}")

def handle_account_authorized(account):
    """Gérer l'autorisation d'un compte"""
    logger.info(f"Compte Stripe autorisé: {account['id']}")

def handle_account_deauthorized(account):
    """Gérer la déauthorisation d'un compte"""
    try:
        restaurateur_profile = RestaurateurProfile.objects.get(stripe_account_id=account['id'])
        restaurateur_profile.stripe_verified = False
        restaurateur_profile.stripe_onboarding_completed = False
        restaurateur_profile.is_validated = False
        restaurateur_profile.is_active = False
        
        # Désactiver les restaurants
        Restaurant.objects.filter(owner=restaurateur_profile).update(is_stripe_active=False)
        
        restaurateur_profile.save()
        
        logger.info(f"Compte Stripe déautorisé pour le restaurateur {restaurateur_profile.id}")
        
    except RestaurateurProfile.DoesNotExist:
        logger.error(f"RestaurateurProfile non trouvé pour le compte Stripe déautorisé {account['id']}")
