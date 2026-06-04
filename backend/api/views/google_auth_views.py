"""
Vue d'authentification via Google Sign-In (OAuth 2.0 / OpenID Connect).

Le client mobile (React Native via @react-native-google-signin/google-signin)
obtient un `id_token` JWT signé par Google et l'envoie à cet endpoint.
Le backend vérifie la signature et l'audience auprès de Google, puis :
  - cherche un User existant par email (case-insensitive) → rattache au compte
  - sinon crée un nouvel utilisateur + ClientProfile
  - émet les tokens JWT EatQuickeR

Pourquoi rechercher par email et non par username :
  Historiquement, certains User ont `username != email` (vieux comptes créés
  avant la convention "username = email"). Chercher par username crée alors
  un doublon de compte à chaque login Google. La recherche par email évite
  ça en rattachant systématiquement au compte historique.

Sécurité :
  - La vérification est faite côté serveur via la bibliothèque officielle
    `google-auth`, donc impossible à contourner.
  - L'audience (aud) doit correspondre à un des Client IDs déclarés dans
    settings.GOOGLE_OAUTH_CLIENT_IDS (Web, iOS, Android).
  - Le `email_verified` du payload Google doit être True : on refuse les
    comptes Google dont l'email n'a pas été confirmé. Sans ça, n'importe
    qui ayant l'email pourrait "réclamer" un compte EatQuickeR.
  - Throttle hérité de LoginThrottle pour limiter les tentatives.
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import ClientProfile, RestaurateurProfile
from api.throttles import LoginHourThrottle, LoginThrottle

logger = logging.getLogger(__name__)


# ─── Vérification du token Google ────────────────────────────────────────────

def _verify_google_id_token(token: str):
    """
    Vérifie l'`id_token` signé par Google.

    Retourne le payload décodé (dict) si valide, None sinon.
    Le payload contient notamment : sub, email, email_verified, name, picture,
    given_name, family_name, aud, iss, iat, exp.
    """
    try:
        # Import paresseux pour éviter de planter l'import du module si
        # google-auth n'est pas (encore) installé en dev.
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError:
        logger.error(
            "google-auth n'est pas installé. "
            "Ajoutez `google-auth>=2.29.0` dans requirements.txt"
        )
        return None

    allowed_client_ids = getattr(settings, 'GOOGLE_OAUTH_CLIENT_IDS', [])
    if not allowed_client_ids:
        logger.error("GOOGLE_OAUTH_CLIENT_IDS n'est pas configuré dans settings.")
        return None

    try:
        # On ne passe pas `audience=` à verify_oauth2_token car le client peut
        # être l'un parmi plusieurs (Web/iOS/Android). On vérifie l'aud nous-même.
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
        )
    except ValueError as e:
        # Token invalide, expiré, signature incorrecte, etc.
        logger.warning(f"Vérification du token Google échouée : {e}")
        return None
    except Exception:
        logger.exception("Erreur inattendue lors de la vérification du token Google")
        return None

    # Vérification manuelle de l'audience contre la whitelist
    aud = idinfo.get('aud')
    if aud not in allowed_client_ids:
        logger.warning(
            f"Audience Google non autorisée : {aud}. "
            f"Whitelist : {allowed_client_ids}"
        )
        return None

    # L'issuer est déjà vérifié par verify_oauth2_token (accounts.google.com).
    # On exige cependant que l'email soit vérifié par Google.
    if not idinfo.get('email_verified', False):
        logger.warning(
            f"Tentative de connexion Google avec un email non vérifié : "
            f"{idinfo.get('email')}"
        )
        return None

    return idinfo


# ─── Recherche du User existant par email ────────────────────────────────────

def _find_existing_user_by_email(email: str):
    """
    Cherche un User par email case-insensitive.

    Si plusieurs User matchent (doublon historique en base), retourne celui
    qui a un profil actif. Sinon, retourne le plus ancien (priorité au compte
    historique vs un éventuel doublon récent).

    Retourne (User, bool: a_un_profil) ou (None, False) si rien trouvé.
    """
    candidates = list(
        User.objects.filter(
            Q(email__iexact=email) | Q(username__iexact=email)
        ).order_by('date_joined')
    )

    if not candidates:
        return None, False

    if len(candidates) == 1:
        user = candidates[0]
        has_profile = (
            ClientProfile.objects.filter(user=user).exists()
            or RestaurateurProfile.objects.filter(user=user).exists()
        )
        return user, has_profile

    # Plusieurs candidats — privilégier celui qui a un profil actif.
    # Cas pathologique mais possible avec des données historiques.
    logger.warning(
        f"Plusieurs User trouvés pour l'email {email} : "
        f"{[(u.id, u.username) for u in candidates]}. "
        f"Sélection du compte avec un profil actif."
    )
    for user in candidates:
        has_client = ClientProfile.objects.filter(user=user).exists()
        has_resto = RestaurateurProfile.objects.filter(user=user).exists()
        if has_client or has_resto:
            return user, True

    # Aucun n'a de profil — prendre le plus ancien
    return candidates[0], False


# ─── Vue ─────────────────────────────────────────────────────────────────────

@extend_schema(
    tags=["Auth"],
    summary="Connexion via Google Sign-In",
    description=(
        "Authentifie un utilisateur via un `id_token` Google obtenu par le SDK "
        "`@react-native-google-signin/google-signin` côté mobile.\n\n"
        "- Si l'email Google n'existe pas en base : création automatique d'un "
        "compte **client** (les restaurateurs doivent passer par l'inscription "
        "classique avec SIRET).\n"
        "- Si l'email existe déjà : connexion au compte existant (recherche "
        "case-insensitive sur `email` ou `username`).\n\n"
        "Retourne les tokens JWT EatQuickeR (access + refresh) et un flag "
        "`is_new_user` pour permettre au client d'afficher un message de "
        "bienvenue le cas échéant."
    ),
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'id_token': {
                    'type': 'string',
                    'description': 'JWT Google obtenu via GoogleSignin.signIn()',
                },
            },
            'required': ['id_token'],
        }
    },
    responses={
        200: {
            'type': 'object',
            'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
                'is_new_user': {'type': 'boolean'},
            },
        },
        400: {'description': "Token manquant ou invalide"},
        401: {'description': "Token Google rejeté (signature, audience ou email non vérifié)"},
        429: {'description': 'Trop de tentatives'},
    },
)
class GoogleLoginView(APIView):
    """
    POST /api/v1/auth/google/
    Body : { "id_token": "<JWT signé par Google>" }
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginThrottle, LoginHourThrottle]

    def post(self, request):
        id_token_str = request.data.get('id_token')

        if not id_token_str or not isinstance(id_token_str, str):
            return Response(
                {"detail": "Le champ `id_token` est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        idinfo = _verify_google_id_token(id_token_str)
        if idinfo is None:
            return Response(
                {"detail": "Token Google invalide ou non autorisé."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        email = (idinfo.get('email') or '').strip().lower()
        if not email:
            return Response(
                {"detail": "Le token Google ne contient pas d'adresse email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        google_sub = idinfo.get('sub')  # identifiant unique Google (stable)
        given_name = idinfo.get('given_name') or idinfo.get('name') or ''

        try:
            with transaction.atomic():
                existing_user, has_profile = _find_existing_user_by_email(email)

                if existing_user is not None:
                    # Compte existant — on se connecte simplement.
                    user = existing_user
                    created = False

                    # Si le compte existait mais n'avait aucun profil
                    # (cas très rare, mais on assure la cohérence), on lui
                    # crée un ClientProfile par défaut.
                    if not has_profile:
                        ClientProfile.objects.create(user=user, phone='')
                        logger.info(
                            f"ClientProfile créé pour le compte existant {user.username} "
                            f"(sans profil préalable)"
                        )

                    logger.info(
                        f"Connexion Google d'un compte existant : "
                        f"id={user.id} username='{user.username}' email='{email}'"
                    )
                else:
                    # Nouveau compte — création complète.
                    user = User.objects.create(
                        username=email,
                        email=email,
                        first_name=given_name[:30],  # User.first_name max_length=30
                        is_active=True,
                    )
                    # Compte créé via Google : pas de mot de passe utilisable.
                    # L'utilisateur devra passer par "Mot de passe oublié" pour
                    # se créer un mot de passe local s'il veut un jour se
                    # connecter sans Google.
                    user.set_unusable_password()
                    user.save(update_fields=['password'])

                    # Profil client par défaut. Les restaurateurs doivent passer
                    # par le flux d'inscription complet (SIRET, Stripe Connect).
                    ClientProfile.objects.create(user=user, phone='')
                    created = True

                    logger.info(
                        f"Nouveau compte Google créé : id={user.id} "
                        f"email='{email}' (google_sub={google_sub})"
                    )

                refresh = RefreshToken.for_user(user)

                return Response(
                    {
                        'access': str(refresh.access_token),
                        'refresh': str(refresh),
                        'is_new_user': created,
                    },
                    status=status.HTTP_200_OK,
                )

        except IntegrityError:
            logger.exception(f"IntegrityError lors du login Google pour {email}")
            return Response(
                {"detail": "Erreur lors de la création du compte."},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            logger.exception(f"Erreur inattendue lors du login Google pour {email}")
            return Response(
                {"detail": "Erreur serveur lors de la connexion Google."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )