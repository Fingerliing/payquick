"""
Vues pour la gestion des aspects légaux et RGPD
- Consentement aux CGU et Politique de confidentialité
- Export de données (Article 20 RGPD)
- Suppression de compte (Article 17 RGPD)
- Gestion des droits utilisateurs
"""

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import UserRateThrottle
from django.utils import timezone
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from datetime import timedelta
import json
import logging

from api.models import (
    LegalConsent,
    AccountDeletionRequest,
    DataAccessLog,
    Order,
)
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)

# ============================================================================
# THROTTLING
# ============================================================================

class DataExportThrottle(UserRateThrottle):
    """Limite les exports de données à 3 par jour"""
    rate = '3/day'


class AccountDeletionThrottle(UserRateThrottle):
    """Limite les demandes de suppression à 2 par jour"""
    rate = '2/day'


# ============================================================================
# HELPERS
# ============================================================================

def log_data_access(user, action, request, details=None):
    """
    Log toutes les actions sensibles RGPD
    
    Args:
        user: Utilisateur concerné
        action: Type d'action (export, view, delete, etc.)
        request: Requête HTTP
        details: Détails supplémentaires (dict)
    """
    try:
        DataAccessLog.objects.create(
            user=user,
            action=action,
            ip_address=request.META.get('REMOTE_ADDR', ''),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            details=details or {}
        )
        logger.info(f"Action RGPD enregistrée: {action} pour {user.email}")
    except Exception as e:
        logger.error(f"Erreur lors du logging RGPD: {str(e)}")


def send_data_export_email(user, download_url):
    """
    Envoie un email avec le lien de téléchargement des données
    
    Args:
        user: Utilisateur
        download_url: URL de téléchargement
    """
    subject = 'Votre export de données Eat&Go est prêt'
    
    context = {
        'user_name': user.first_name or user.username,
        'download_url': download_url,
        'expiry_days': 7,
    }
    
    # Version texte
    text_content = f'''
Bonjour {context['user_name']},

Votre export de données est prêt à être téléchargé.

Lien de téléchargement : {download_url}
(valable {context['expiry_days']} jours)

Cet export contient toutes vos données personnelles conformément à l'Article 20 du RGPD.

Cordialement,
L'équipe Eat&Go
Privacy Team
privacy@eatandgo.com
    '''
    
    # Version HTML (optionnel, nécessite un template)
    try:
        html_content = render_to_string('emails/data_export.html', context)
    except:
        html_content = None
    
    # Envoi
    if html_content:
        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email]
        )
        email.attach_alternative(html_content, "text/html")
        email.send()
    else:
        send_mail(
            subject=subject,
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )


def send_account_deletion_email(user, deletion_date):
    """
    Envoie un email de confirmation de demande de suppression
    
    Args:
        user: Utilisateur
        deletion_date: Date prévue de suppression
    """
    subject = 'Confirmation de suppression de compte Eat&Go'
    
    message = f'''
Bonjour {user.first_name or user.username},

Nous avons bien reçu votre demande de suppression de compte.

Votre compte sera supprimé le : {deletion_date.strftime('%d/%m/%Y')}
(dans 30 jours conformément au délai légal)

Toutes vos données personnelles seront définitivement effacées, à l'exception des données que nous sommes légalement tenus de conserver (factures, données comptables).

Si vous changez d'avis, reconnectez-vous avant cette date pour annuler la suppression.

Pour toute question, contactez-nous : privacy@eatandgo.com

Cordialement,
L'équipe Eat&Go
Privacy Team
    '''
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


# ============================================================================
# CONSENTEMENT LÉGAL
# ============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def record_legal_consent(request):
    """
    Enregistre le consentement de l'utilisateur aux documents légaux
    
    Body:
    {
        "terms_version": "1.0.0",
        "privacy_version": "1.0.0"
    }
    
    Returns:
        201: Consentement enregistré
        400: Données invalides
    """
    user = request.user
    terms_version = request.data.get('terms_version')
    privacy_version = request.data.get('privacy_version')
    
    if not terms_version or not privacy_version:
        return Response({
            'error': 'Les versions des documents sont requises',
            'required_fields': ['terms_version', 'privacy_version']
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Créer ou mettre à jour le consentement
        consent, created = LegalConsent.objects.update_or_create(
            user=user,
            defaults={
                'terms_version': terms_version,
                'privacy_version': privacy_version,
                'consent_date': timezone.now(),
                'ip_address': request.META.get('REMOTE_ADDR'),
                'user_agent': request.META.get('HTTP_USER_AGENT', '')
            }
        )
        
        # Log l'action
        log_data_access(
            user=user,
            action='consent_recorded',
            request=request,
            details={
                'terms_version': terms_version,
                'privacy_version': privacy_version,
                'is_new': created
            }
        )
        
        logger.info(f"Consentement enregistré pour {user.email}: CGU v{terms_version}, Politique v{privacy_version}")
        
        return Response({
            'success': True,
            'message': 'Consentement enregistré avec succès',
            'consent_id': consent.id,
            'is_new': created
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erreur lors de l'enregistrement du consentement: {str(e)}")
        return Response({
            'error': 'Erreur lors de l\'enregistrement du consentement',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_legal_consent(request):
    """
    Récupère le consentement actuel de l'utilisateur
    
    Returns:
        200: Consentement trouvé
        404: Aucun consentement
    """
    user = request.user
    
    try:
        consent = LegalConsent.objects.get(user=user)
        
        return Response({
            'terms_version': consent.terms_version,
            'privacy_version': consent.privacy_version,
            'consent_date': consent.consent_date.isoformat(),
            'created_at': consent.created_at.isoformat(),
            'updated_at': consent.updated_at.isoformat(),
        }, status=status.HTTP_200_OK)
        
    except LegalConsent.DoesNotExist:
        return Response({
            'message': 'Aucun consentement enregistré',
            'requires_consent': True
        }, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# EXPORT DE DONNÉES (RGPD Article 20)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([DataExportThrottle])
def export_user_data(request):
    """
    Exporte toutes les données de l'utilisateur au format JSON
    (RGPD Article 20 - Droit à la portabilité)
    
    Returns:
        200: Données exportées
        429: Trop de requêtes
    """
    user = request.user
    
    try:
        # Collecter toutes les données
        user_data = {
            'export_info': {
                'export_date': timezone.now().isoformat(),
                'format': 'JSON',
                'version': '1.0.0',
                'user_id': user.id,
            },
            'profile': {
                'email': user.email,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None,
                'is_active': user.is_active,
            },
            'orders': [],
            'favorites': [],
            'preferences': {},
            'legal_consent': {},
        }
        
        # Ajouter le profil spécifique (client ou restaurateur)
        if hasattr(user, 'clientprofile'):
            profile = user.clientprofile
            user_data['profile'].update({
                'type': 'client',
                'phone': profile.phone if hasattr(profile, 'phone') else None,
            })
        elif hasattr(user, 'restaurateur_profile'):
            profile = user.restaurateur_profile
            user_data['profile'].update({
                'type': 'restaurateur',
                'telephone': profile.telephone if hasattr(profile, 'telephone') else None,
                'siret': profile.siret if hasattr(profile, 'siret') else None,
            })
        
        # Ajouter les commandes (anonymiser les données sensibles si nécessaire)
        if hasattr(user, 'client_orders'):
            orders = user.client_orders.all().values(
                'id',
                'order_number',
                'created_at',
                'total_amount',
                'status',
                'payment_method',
            )
            user_data['orders'] = [
                {
                    **order,
                    'created_at': order['created_at'].isoformat() if order['created_at'] else None,
                    'total_amount': str(order['total_amount']) if order['total_amount'] else None,
                }
                for order in orders
            ]
        
        # Ajouter le consentement légal
        try:
            consent = LegalConsent.objects.get(user=user)
            user_data['legal_consent'] = {
                'terms_version': consent.terms_version,
                'privacy_version': consent.privacy_version,
                'consent_date': consent.consent_date.isoformat(),
            }
        except LegalConsent.DoesNotExist:
            pass
        
        # Ajouter les accès aux données (logs)
        access_logs = DataAccessLog.objects.filter(user=user).order_by('-timestamp')[:50]
        user_data['data_access_history'] = [
            {
                'action': log.action,
                'timestamp': log.timestamp.isoformat(),
                'ip_address': log.ip_address,
            }
            for log in access_logs
        ]
        
        # Log l'action
        log_data_access(
            user=user,
            action='data_exported',
            request=request,
            details={'export_size': len(json.dumps(user_data))}
        )
        
        logger.info(f"Export de données effectué pour {user.email}")
        
        return Response(user_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erreur lors de l'export des données: {str(e)}")
        return Response({
            'error': 'Erreur lors de l\'export des données',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([DataExportThrottle])
def request_data_export(request):
    """
    Demande un export complet des données par email
    (Processus asynchrone pour les gros volumes)
    
    Returns:
        202: Demande acceptée, email envoyé ultérieurement
        429: Trop de requêtes
    """
    user = request.user
    
    try:
        # Log l'action
        log_data_access(
            user=user,
            action='data_export_requested',
            request=request,
            details={'method': 'email'}
        )
        
        # Dans une vraie application, créer une tâche Celery ici
        # pour générer l'export en arrière-plan
        # export_user_data_task.delay(user.id)
        
        # Pour l'instant, on envoie juste un email de confirmation
        send_mail(
            subject='Export de vos données Eat&Go en cours',
            message=f'''Bonjour {user.first_name or user.username},

Nous avons bien reçu votre demande d'export de données.

Votre export sera prêt sous 48 heures maximum. Vous recevrez un email avec un lien de téléchargement sécurisé.

Le lien sera valable 7 jours.

Cordialement,
L'équipe Eat&Go
privacy@eatandgo.com
            ''',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        logger.info(f"Demande d'export par email enregistrée pour {user.email}")
        
        return Response({
            'success': True,
            'message': 'Votre demande d\'export a été enregistrée. Vous recevrez un email sous 48h.',
            'email': user.email
        }, status=status.HTTP_202_ACCEPTED)
        
    except Exception as e:
        logger.error(f"Erreur lors de la demande d'export: {str(e)}")
        return Response({
            'error': 'Erreur lors de la demande d\'export',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# SUPPRESSION DE COMPTE (RGPD Article 17)
# ============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AccountDeletionThrottle])
def request_account_deletion(request):
    """
    Demande de suppression de compte (RGPD Article 17 - Droit à l'oubli)
    Délai de 30 jours avant suppression effective
    
    Body (optionnel):
    {
        "reason": "Raison de la suppression"
    }
    
    Returns:
        201: Demande enregistrée
        400: Commandes en cours ou autre problème
        429: Trop de requêtes
    """
    user = request.user
    reason = request.data.get('reason', '')
    
    try:
        # Vérifier si l'utilisateur a des commandes en cours
        active_orders = Order.objects.filter(
            client=user,
            status__in=['pending', 'in_progress', 'ready']
        ).exists()
        
        if active_orders:
            return Response({
                'error': 'Impossible de supprimer le compte avec des commandes en cours.',
                'message': 'Veuillez finaliser ou annuler vos commandes en cours avant de supprimer votre compte.',
                'has_active_orders': True
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Vérifier s'il n'y a pas déjà une demande en cours
        existing_request = AccountDeletionRequest.objects.filter(
            user=user,
            status='pending'
        ).first()
        
        if existing_request:
            return Response({
                'error': 'Une demande de suppression est déjà en cours',
                'deletion_date': existing_request.scheduled_deletion_date.isoformat(),
                'can_cancel': True
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Créer la demande de suppression
        deletion_request = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=timezone.now(),
            reason=reason,
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        
        # Log l'action
        log_data_access(
            user=user,
            action='account_deletion_requested',
            request=request,
            details={'reason': reason}
        )
        
        # Envoyer l'email de confirmation
        send_account_deletion_email(user, deletion_request.scheduled_deletion_date)
        
        # Désactiver le compte immédiatement (l'utilisateur peut se reconnecter pour annuler)
        user.is_active = False
        user.save()
        
        logger.warning(f"Demande de suppression de compte pour {user.email}")
        
        return Response({
            'success': True,
            'message': 'Votre demande de suppression a été enregistrée.',
            'deletion_date': deletion_request.scheduled_deletion_date.isoformat(),
            'request_id': deletion_request.id,
            'can_cancel_until': deletion_request.scheduled_deletion_date.isoformat(),
            'days_until_deletion': 30
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"Erreur lors de la demande de suppression: {str(e)}")
        return Response({
            'error': 'Erreur lors de la demande de suppression',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_account_deletion(request):
    """
    Annule une demande de suppression de compte en cours
    
    Returns:
        200: Annulation réussie
        404: Aucune demande en cours
    """
    user = request.user
    
    try:
        deletion_request = AccountDeletionRequest.objects.get(
            user=user,
            status='pending'
        )
        
        # Annuler la demande
        deletion_request.status = 'cancelled'
        deletion_request.cancelled_at = timezone.now()
        deletion_request.save()
        
        # Réactiver le compte
        user.is_active = True
        user.save()
        
        # Log l'action
        log_data_access(
            user=user,
            action='account_deletion_cancelled',
            request=request,
            details={'request_id': deletion_request.id}
        )
        
        # Envoyer un email de confirmation
        send_mail(
            subject='Annulation de la suppression de compte Eat&Go',
            message=f'''Bonjour {user.first_name or user.username},

Votre demande de suppression de compte a été annulée avec succès.

Votre compte est de nouveau actif et toutes vos données sont conservées.

Bienvenue de retour sur Eat&Go !

Cordialement,
L'équipe Eat&Go
            ''',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        logger.info(f"Annulation de suppression de compte pour {user.email}")
        
        return Response({
            'success': True,
            'message': 'Votre demande de suppression a été annulée. Votre compte est de nouveau actif.'
        }, status=status.HTTP_200_OK)
        
    except AccountDeletionRequest.DoesNotExist:
        return Response({
            'error': 'Aucune demande de suppression en cours trouvée.'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error(f"Erreur lors de l'annulation: {str(e)}")
        return Response({
            'error': 'Erreur lors de l\'annulation',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# RÉCUPÉRATION DES DOCUMENTS LÉGAUX (OPTIONNEL)
# ============================================================================

@api_view(['GET'])
@permission_classes([AllowAny])
def get_legal_documents(request):
    """
    Retourne les versions actuelles des documents légaux
    (Optionnel - peut aussi être servi depuis le frontend)
    
    Returns:
        200: Documents légaux
    """
    documents = {
        'terms_of_service': {
            'version': '1.0.0',
            'last_update': '2025-10-16',
            'url': f"{settings.FRONTEND_URL}/(legal)/terms"
        },
        'privacy_policy': {
            'version': '1.0.0',
            'last_update': '2025-10-16',
            'url': f"{settings.FRONTEND_URL}/(legal)/privacy"
        },
        'current_versions': {
            'terms': '1.0.0',
            'privacy': '1.0.0'
        }
    }
    
    return Response(documents, status=status.HTTP_200_OK)


# ============================================================================
# STATISTIQUES RGPD (ADMIN UNIQUEMENT)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_gdpr_stats(request):
    """
    Statistiques RGPD pour les administrateurs
    (À protéger avec une permission admin)
    
    Returns:
        200: Statistiques
        403: Non autorisé
    """
    # Vérifier que l'utilisateur est admin/staff
    if not request.user.is_staff:
        return Response({
            'error': 'Accès non autorisé'
        }, status=status.HTTP_403_FORBIDDEN)
    
    try:
        stats = {
            'consents': {
                'total': LegalConsent.objects.count(),
                'last_30_days': LegalConsent.objects.filter(
                    created_at__gte=timezone.now() - timedelta(days=30)
                ).count(),
            },
            'data_exports': {
                'total': DataAccessLog.objects.filter(action='data_exported').count(),
                'last_30_days': DataAccessLog.objects.filter(
                    action='data_exported',
                    timestamp__gte=timezone.now() - timedelta(days=30)
                ).count(),
            },
            'account_deletions': {
                'pending': AccountDeletionRequest.objects.filter(status='pending').count(),
                'completed': AccountDeletionRequest.objects.filter(status='completed').count(),
                'cancelled': AccountDeletionRequest.objects.filter(status='cancelled').count(),
            }
        }
        
        return Response(stats, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des stats RGPD: {str(e)}")
        return Response({
            'error': 'Erreur lors de la récupération des statistiques',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)