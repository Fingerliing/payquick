"""
Réactivation automatique d'un compte en suppression programmée.

Contexte (RGPD art. 17 / App Store 5.1.1(v)) : `request_account_deletion`
désactive le compte immédiatement (`is_active=False`) et programme la
suppression définitive à J+30. L'UX promise à l'utilisateur (alerte in-app,
email de confirmation, review notes Apple) est : « reconnectez-vous dans les
30 jours pour annuler ».

Or un compte inactif ne peut plus s'authentifier : ModelBackend rejette le
login email/mot de passe, et JWTAuthentication rejette les tokens des
utilisateurs inactifs. Sans ce helper, la promesse est fausse et la
suppression est de facto irréversible dès J+0.

Ce module fournit LE point d'entrée unique à appeler depuis chaque flux
d'authentification (LoginView, GoogleLoginView, AppleLoginView) au moment où
l'identité de l'utilisateur est prouvée (mot de passe vérifié / token OAuth
validé), AVANT tout rejet pour cause d'inactivité.

Sécurité : on ne réactive QUE si l'inactivité est due à une demande de
suppression `pending`. Un compte désactivé pour toute autre raison
(modération, bannissement…) reste inactif.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from api.models import AccountDeletionRequest

logger = logging.getLogger(__name__)


def reactivate_account_if_pending_deletion(user, request=None) -> bool:
    """
    Annule la demande de suppression en cours et réactive le compte, si et
    seulement si le compte est inactif À CAUSE d'une suppression programmée.

    À appeler après vérification de l'identité (mot de passe correct, token
    Google/Apple valide) et avant l'émission des JWT.

    Args:
        user: l'utilisateur authentifié (identité prouvée par l'appelant).
        request: requête HTTP optionnelle (pour le log RGPD).

    Returns:
        True si une réactivation a eu lieu, False sinon (compte déjà actif,
        ou inactif pour une autre raison — dans ce dernier cas l'appelant
        doit laisser l'authentification échouer normalement).
    """
    if user.is_active:
        return False

    deletion_request = AccountDeletionRequest.objects.filter(
        user=user,
        status='pending',
    ).first()
    if deletion_request is None:
        # Inactif pour une autre raison (modération…) : ne pas réactiver.
        return False

    deletion_request.status = 'cancelled'
    deletion_request.cancelled_at = timezone.now()
    deletion_request.save(update_fields=['status', 'cancelled_at'])

    user.is_active = True
    user.save(update_fields=['is_active'])

    logger.info(
        "Réactivation automatique du compte %s : demande de suppression #%s "
        "annulée par reconnexion.",
        user.email,
        deletion_request.id,
    )

    # Log RGPD best-effort (import local : évite les cycles d'imports).
    if request is not None:
        try:
            from api.views.legal_views import log_data_access

            log_data_access(
                user=user,
                action='account_deletion_cancelled',
                request=request,
                details={
                    'request_id': deletion_request.id,
                    'via': 'login_reactivation',
                },
            )
        except Exception:
            logger.exception("Échec du log RGPD lors de la réactivation")

    # Email de confirmation best-effort — ne doit jamais bloquer le login.
    try:
        send_mail(
            subject='Annulation de la suppression de compte EatQuickeR',
            message=(
                f"Bonjour {user.first_name or user.username},\n\n"
                "Vous vous êtes reconnecté(e) : votre demande de suppression "
                "de compte a été annulée, comme prévu.\n\n"
                "Votre compte est de nouveau actif et toutes vos données "
                "sont conservées.\n\n"
                "Si vous n'êtes pas à l'origine de cette connexion, "
                "contactez-nous immédiatement : contact@eatquicker.fr\n\n"
                "Cordialement,\n"
                "L'équipe EatQuickeR"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    except Exception:
        logger.exception("Échec de l'email de réactivation")

    return True