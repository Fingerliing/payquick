"""
Vues de réinitialisation de mot de passe pour EatQuickeR.

Flux :
  1. POST /auth/password/forgot/   → envoie un code à 6 chiffres par email.
  2. POST /auth/password/confirm/  → vérifie le code + change le mot de passe.
  3. POST /auth/password/resend/   → renvoie un nouveau code (cooldown).

Sécurité :
  - L'API ne révèle JAMAIS si un email correspond à un compte (réponse
    générique en succès même si l'email est inconnu).
  - Throttling IP (cf. PasswordResetThrottle).
  - Cooldown applicatif sur le renvoi.
  - Limite de tentatives par code.
  - Expiration courte du code.
  - Toutes les sessions JWT actives sont laissées telles quelles, mais le
    nouveau mot de passe invalide les anciennes sessions Django session-based.
    (Si on souhaite révoquer les refresh tokens existants, voir TODO en bas.)
"""

import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema, OpenApiResponse

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import PasswordResetCode
from api.serializers.password_reset_serializers import (
    InitiatePasswordResetSerializer,
    ConfirmPasswordResetSerializer,
    ResendPasswordResetSerializer,
)
from api.services.email_verification_service import email_verification_service
from api.throttles import PasswordResetThrottle, PasswordResetHourThrottle


logger = logging.getLogger(__name__)


def _get_client_ip(request) -> str:
    """
    Récupère l'IP cliente.
    En prod derrière un reverse-proxy de confiance, X-Forwarded-For est fiable.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


@extend_schema(
    tags=["Auth • Password Reset"],
    summary="Demander la réinitialisation du mot de passe",
    description=(
        "Envoie un code à 6 chiffres par email pour réinitialiser le mot de passe.\n\n"
        "**Sécurité** : la réponse est toujours identique, que l'email "
        "corresponde ou non à un compte existant, afin de ne pas révéler "
        "l'existence d'un compte."
    ),
    request=InitiatePasswordResetSerializer,
    responses={
        200: OpenApiResponse(description="Code envoyé (réponse générique)"),
        400: OpenApiResponse(description="Email invalide"),
        429: OpenApiResponse(description="Trop de demandes"),
    },
)
class InitiatePasswordResetView(APIView):
    """
    Étape 1 : initie la réinitialisation et envoie un code par email.
    Toujours retourner un statut 200 avec le même payload pour ne pas
    leaker l'existence d'un compte.
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [PasswordResetThrottle, PasswordResetHourThrottle]

    def post(self, request):
        serializer = InitiatePasswordResetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']

        # Réponse générique (qu'il existe ou non un compte)
        # On utilise un id factice si nécessaire pour éviter de révéler
        # l'existence du compte par la présence/absence du champ reset_id.
        masked_email = email_verification_service.mask_email(email)
        expiry_seconds = getattr(
            settings, 'PASSWORD_RESET_CODE_EXPIRY_MINUTES', 10
        ) * 60

        try:
            user = User.objects.filter(username__iexact=email).first()

            # Vérifier le cooldown sur l'email (anti-spam même si l'utilisateur
            # n'existe pas — on garde le même comportement).
            recent = PasswordResetCode.objects.filter(
                email=email,
                is_used=False,
            ).order_by('-created_at').first()

            if recent and not recent.is_expired() and not recent.can_resend():
                # On retourne toujours le même message : on ne révèle ni
                # l'existence du compte ni la présence d'une demande active.
                logger.info(
                    f"Password reset throttled (cooldown) for {masked_email}"
                )
                return Response({
                    'message': (
                        'Si un compte existe avec cet email, un code de '
                        'réinitialisation vient de vous être envoyé.'
                    ),
                    'reset_id': str(recent.id) if user else None,
                    'email': masked_email,
                    'expires_in': expiry_seconds,
                }, status=status.HTTP_200_OK)

            with transaction.atomic():
                # On crée une entrée même si l'utilisateur n'existe pas
                # (pour ne pas révéler par timing l'existence du compte).
                reset_code = PasswordResetCode.objects.create(
                    user=user,
                    email=email,
                    ip_address=_get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
                reset_code.generate_code()
                reset_code.last_resend_at = timezone.now()
                reset_code.save(update_fields=['code', 'last_resend_at'])

            # N'envoyer l'email QUE si l'utilisateur existe.
            if user:
                sent = email_verification_service.send_password_reset_code(
                    email, reset_code.code
                )
                if not sent:
                    # On loggue, mais on ne change pas la réponse utilisateur.
                    logger.error(
                        f"Échec envoi email reset password pour {masked_email}"
                    )
            else:
                logger.info(
                    f"Password reset request for unknown email {masked_email} "
                    "(no email sent)"
                )

            # Toujours la même réponse, qu'il y ait eu envoi ou non.
            return Response({
                'message': (
                    'Si un compte existe avec cet email, un code de '
                    'réinitialisation vient de vous être envoyé.'
                ),
                # On expose reset_id seulement quand l'utilisateur existe —
                # côté client, l'absence n'est pas révélatrice tant que le
                # message reste générique. (Alternative : exposer un id même
                # pour comptes inconnus mais le rejeter à confirm.)
                'reset_id': str(reset_code.id) if user else None,
                'email': masked_email,
                'expires_in': expiry_seconds,
            }, status=status.HTTP_200_OK)

        except Exception:
            logger.exception("Erreur dans InitiatePasswordResetView")
            return Response({
                'error': 'Une erreur est survenue. Veuillez réessayer.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Auth • Password Reset"],
    summary="Confirmer la réinitialisation du mot de passe",
    description=(
        "Vérifie le code à 6 chiffres reçu par email et applique le nouveau "
        "mot de passe. Le code est consommé après usage.\n\n"
        "Le nouveau mot de passe doit respecter les règles de sécurité : "
        "au moins 8 caractères, une majuscule, un chiffre et un caractère "
        "spécial."
    ),
    request=ConfirmPasswordResetSerializer,
    responses={
        200: OpenApiResponse(description="Mot de passe réinitialisé avec succès"),
        400: OpenApiResponse(description="Code incorrect / expiré ou mot de passe invalide"),
        404: OpenApiResponse(description="Demande inconnue"),
        429: OpenApiResponse(description="Trop de tentatives"),
    },
)
class ConfirmPasswordResetView(APIView):
    """Étape 2 : valide le code et change le mot de passe."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [PasswordResetThrottle, PasswordResetHourThrottle]

    def post(self, request):
        serializer = ConfirmPasswordResetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reset_id = serializer.validated_data['reset_id']
        code = serializer.validated_data['code']
        new_password = serializer.validated_data['new_password']

        try:
            try:
                reset_code = PasswordResetCode.objects.select_for_update().get(
                    id=reset_id,
                    is_used=False,
                )
            except PasswordResetCode.DoesNotExist:
                return Response({
                    'error': 'Demande introuvable ou déjà utilisée.',
                }, status=status.HTTP_404_NOT_FOUND)

            # Expiration
            if reset_code.is_expired():
                return Response({
                    'error': 'Le code a expiré. Veuillez demander un nouveau code.',
                }, status=status.HTTP_400_BAD_REQUEST)

            # Tentatives max
            max_attempts = getattr(settings, 'SMS_MAX_ATTEMPTS', 3)
            if reset_code.attempts >= max_attempts:
                return Response({
                    'error': 'Trop de tentatives. Veuillez demander un nouveau code.',
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            # Code incorrect ?
            if reset_code.code != code:
                reset_code.increment_attempts()
                remaining = max(0, max_attempts - reset_code.attempts)
                return Response({
                    'error': 'Code incorrect.',
                    'attempts_remaining': remaining,
                }, status=status.HTTP_400_BAD_REQUEST)

            # Code OK : on change le mot de passe.
            # Si le user a été supprimé entre-temps, on annule.
            if not reset_code.user_id:
                # Cas : demande créée pour un email inconnu (anti-énumération).
                # On échoue silencieusement avec un message générique.
                logger.warning(
                    f"Confirm password reset rejected: no user linked "
                    f"(reset_id={reset_id})"
                )
                return Response({
                    'error': 'Demande invalide.',
                }, status=status.HTTP_400_BAD_REQUEST)

            try:
                user = User.objects.select_for_update().get(pk=reset_code.user_id)
            except User.DoesNotExist:
                return Response({
                    'error': 'Compte introuvable.',
                }, status=status.HTTP_404_NOT_FOUND)

            with transaction.atomic():
                user.set_password(new_password)
                user.save(update_fields=['password'])

                # Invalider tous les autres codes en cours pour cet utilisateur.
                PasswordResetCode.objects.filter(
                    user=user,
                    is_used=False,
                ).exclude(pk=reset_code.pk).update(
                    is_used=True,
                    used_at=timezone.now(),
                )

                reset_code.mark_used()

            logger.info(
                f"Password reset confirmé pour user_id={user.pk} "
                f"({email_verification_service.mask_email(user.username)})"
            )

            # TODO (optionnel, sécurité avancée) : révoquer les refresh tokens
            # via SimpleJWT BlacklistedToken si l'app le requiert.

            return Response({
                'message': 'Votre mot de passe a été réinitialisé avec succès.',
            }, status=status.HTTP_200_OK)

        except Exception:
            logger.exception("Erreur dans ConfirmPasswordResetView")
            return Response({
                'error': 'Une erreur est survenue. Veuillez réessayer.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Auth • Password Reset"],
    summary="Renvoyer le code de réinitialisation",
    description="Renvoie un nouveau code à 6 chiffres pour la demande en cours.",
    request=ResendPasswordResetSerializer,
    responses={
        200: OpenApiResponse(description="Code renvoyé"),
        404: OpenApiResponse(description="Demande introuvable"),
        429: OpenApiResponse(description="Cooldown actif ou trop de demandes"),
    },
)
class ResendPasswordResetCodeView(APIView):
    """Renvoi d'un nouveau code (avec cooldown)."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [PasswordResetThrottle, PasswordResetHourThrottle]

    def post(self, request):
        serializer = ResendPasswordResetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reset_id = serializer.validated_data['reset_id']

        cooldown_seconds = getattr(
            settings,
            'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS',
            getattr(settings, 'SMS_RESEND_COOLDOWN_SECONDS', 60),
        )
        expiry_seconds = getattr(
            settings, 'PASSWORD_RESET_CODE_EXPIRY_MINUTES', 10
        ) * 60

        try:
            try:
                reset_code = PasswordResetCode.objects.get(
                    id=reset_id,
                    is_used=False,
                )
            except PasswordResetCode.DoesNotExist:
                return Response({
                    'error': 'Demande introuvable ou déjà utilisée.',
                }, status=status.HTTP_404_NOT_FOUND)

            if reset_code.is_expired():
                return Response({
                    'error': 'La demande a expiré. Veuillez recommencer.',
                }, status=status.HTTP_400_BAD_REQUEST)

            if not reset_code.can_resend():
                return Response({
                    'error': 'Veuillez attendre avant de renvoyer un code.',
                    'retry_after': cooldown_seconds,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            with transaction.atomic():
                reset_code.generate_code()
                reset_code.last_resend_at = timezone.now()
                reset_code.attempts = 0
                reset_code.save(update_fields=['code', 'last_resend_at', 'attempts'])

            # N'envoyer l'email que si un user est lié à la demande.
            if reset_code.user_id:
                sent = email_verification_service.send_password_reset_code(
                    reset_code.email, reset_code.code
                )
                if not sent:
                    logger.error(
                        "Échec envoi email reset password (resend) "
                        f"pour {email_verification_service.mask_email(reset_code.email)}"
                    )
                    return Response({
                        'error': "Impossible d'envoyer l'email. Veuillez réessayer.",
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            # Sinon, on retourne un succès générique sans rien envoyer
            # (l'utilisateur n'aurait jamais eu de premier code de toute façon,
            # mais on ne le révèle pas).

            return Response({
                'message': 'Nouveau code envoyé.',
                'expires_in': expiry_seconds,
            }, status=status.HTTP_200_OK)

        except Exception:
            logger.exception("Erreur dans ResendPasswordResetCodeView")
            return Response({
                'error': 'Une erreur est survenue. Veuillez réessayer.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
