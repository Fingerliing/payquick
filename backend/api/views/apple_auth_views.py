"""
Vue d'authentification via Sign in with Apple (OpenID Connect).

Le client mobile (React Native via expo-apple-authentication) obtient un
`identityToken` JWT signé par Apple et l'envoie à cet endpoint. Le backend
vérifie la signature (JWKS Apple), l'issuer et l'audience, puis :
  - cherche un User existant par email (case-insensitive) → rattache au compte
  - sinon crée un nouvel utilisateur + ClientProfile
  - émet les tokens JWT EatQuickeR

Particularités Apple (vs Google) :
  - L'email du token peut être un relais privé `@privaterelay.appleid.com`
    (option "Masquer mon adresse e-mail") : il est unique et stable par
    utilisateur+app, on le traite comme un email normal.
  - Le nom complet n'est PAS dans l'identityToken : Apple ne le fournit
    qu'UNE SEULE FOIS, au tout premier sign-in, dans la réponse native du
    SDK. Le client le transmet donc en clair (`given_name`) à côté du token.
    C'est une donnée d'affichage non sensible — l'identité, elle, est
    prouvée par le token signé.
  - `email_verified` peut être un booléen ou la chaîne "true"/"false"
    selon les versions du token.

Sécurité :
  - Vérification de signature via les clés publiques Apple
    (https://appleid.apple.com/auth/keys) avec PyJWT + PyJWKClient
    (nécessite `PyJWT[crypto]`, i.e. le paquet `cryptography`).
  - `iss` doit être https://appleid.apple.com ; `aud` doit correspondre à
    un des bundle IDs déclarés dans settings.APPLE_SIGN_IN_CLIENT_IDS.
  - Même throttle que le login classique (LoginThrottle / LoginHourThrottle).
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import ClientProfile
from api.throttles import LoginHourThrottle, LoginThrottle
from api.views.google_auth_views import _find_existing_user_by_email

logger = logging.getLogger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

# Client JWKS module-level : PyJWKClient met en cache le jeu de clés Apple,
# on évite ainsi un aller-retour réseau à chaque login.
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        import jwt

        _jwks_client = jwt.PyJWKClient(APPLE_JWKS_URL)
    return _jwks_client


# ─── Vérification du token Apple ─────────────────────────────────────────────

def _verify_apple_identity_token(token: str):
    """
    Vérifie l'`identityToken` signé par Apple.

    Retourne le payload décodé (dict) si valide, None sinon.
    Le payload contient notamment : sub (identifiant Apple stable), email,
    email_verified, is_private_email, aud, iss, iat, exp.
    """
    try:
        # Import paresseux : ne plante pas l'import du module si PyJWT/crypto
        # ne sont pas (encore) installés en dev.
        import jwt
        from jwt.exceptions import InvalidTokenError
    except ImportError:
        logger.error(
            "PyJWT n'est pas installé avec le support crypto. "
            "Ajoutez `PyJWT[crypto]>=2.8` dans requirements.txt"
        )
        return None

    allowed_audiences = getattr(settings, 'APPLE_SIGN_IN_CLIENT_IDS', [])
    if not allowed_audiences:
        logger.error("APPLE_SIGN_IN_CLIENT_IDS n'est pas configuré dans settings.")
        return None

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=allowed_audiences,  # liste → jwt accepte si aud ∈ liste
            issuer=APPLE_ISSUER,
        )
    except InvalidTokenError as e:
        # Signature incorrecte, token expiré, audience/issuer invalides, etc.
        logger.warning(f"Vérification du token Apple échouée : {e}")
        return None
    except Exception:
        # Réseau JWKS indisponible, kid inconnu, etc.
        logger.exception("Erreur inattendue lors de la vérification du token Apple")
        return None

    # `email_verified` : bool ou str "true"/"false" selon les tokens Apple.
    email_verified = payload.get('email_verified', True)
    if isinstance(email_verified, str):
        email_verified = email_verified.strip().lower() == 'true'
    if payload.get('email') and not email_verified:
        logger.warning(
            f"Tentative de connexion Apple avec un email non vérifié : "
            f"{payload.get('email')}"
        )
        return None

    return payload


# ─── Vue ─────────────────────────────────────────────────────────────────────

@extend_schema(
    tags=["Auth"],
    summary="Connexion via Sign in with Apple",
    description=(
        "Authentifie un utilisateur via un `identityToken` Apple obtenu par "
        "`expo-apple-authentication` côté mobile.\n\n"
        "- Si l'email Apple (réel ou relais privé) n'existe pas en base : "
        "création automatique d'un compte **client** (les restaurateurs "
        "passent par l'inscription classique avec SIRET).\n"
        "- Si l'email existe déjà : connexion au compte existant (recherche "
        "case-insensitive sur `email` ou `username`).\n\n"
        "`given_name` est optionnel : Apple ne fournit le nom qu'au premier "
        "sign-in, côté SDK natif, jamais dans le token.\n\n"
        "Retourne les tokens JWT EatQuickeR (access + refresh) et un flag "
        "`is_new_user`."
    ),
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'identity_token': {
                    'type': 'string',
                    'description': 'JWT Apple obtenu via AppleAuthentication.signInAsync()',
                },
                'given_name': {
                    'type': 'string',
                    'description': "Prénom fourni par Apple au premier sign-in (optionnel)",
                },
            },
            'required': ['identity_token'],
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
        400: {'description': "Token manquant ou sans email"},
        401: {'description': "Token Apple rejeté (signature, audience, issuer ou email non vérifié)"},
        429: {'description': 'Trop de tentatives'},
    },
)
class AppleLoginView(APIView):
    """
    POST /api/v1/auth/apple/
    Body : { "identity_token": "<JWT signé par Apple>", "given_name": "Alice" }
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginThrottle, LoginHourThrottle]

    def post(self, request):
        identity_token = request.data.get('identity_token')
        given_name = (request.data.get('given_name') or '').strip()

        if not identity_token or not isinstance(identity_token, str):
            return Response(
                {"detail": "Le champ `identity_token` est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = _verify_apple_identity_token(identity_token)
        if payload is None:
            return Response(
                {"detail": "Token Apple invalide ou non autorisé."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        email = (payload.get('email') or '').strip().lower()
        if not email:
            # Ne devrait jamais arriver avec le scope EMAIL demandé côté SDK,
            # mais Apple ne le garantit contractuellement que si l'app le
            # demande — on refuse proprement plutôt que de créer un compte
            # sans identifiant.
            return Response(
                {"detail": "Le token Apple ne contient pas d'adresse email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        apple_sub = payload.get('sub')  # identifiant Apple stable (loggé seulement)

        try:
            with transaction.atomic():
                existing_user, has_profile = _find_existing_user_by_email(email)

                if existing_user is not None:
                    # Compte existant — on se connecte simplement.
                    user = existing_user
                    created = False

                    # Cohérence : un compte sans aucun profil reçoit un
                    # ClientProfile par défaut (même logique que Google).
                    if not has_profile:
                        ClientProfile.objects.create(user=user, phone='')
                        logger.info(
                            f"ClientProfile créé pour le compte existant {user.username} "
                            f"(sans profil préalable)"
                        )

                    # Compléter le prénom si absent — jamais écraser une
                    # valeur existante (l'utilisateur a pu la modifier).
                    if not user.first_name and given_name:
                        user.first_name = given_name[:30]
                        user.save(update_fields=['first_name'])
                        logger.info(
                            f"first_name complété pour le compte existant "
                            f"id={user.id} ('{given_name}')"
                        )

                    logger.info(
                        f"Connexion Apple d'un compte existant : "
                        f"id={user.id} username='{user.username}' email='{email}' "
                        f"(apple_sub={apple_sub})"
                    )
                else:
                    # Nouveau compte — création complète.
                    user = User.objects.create(
                        username=email,
                        email=email,
                        first_name=given_name[:30],  # User.first_name max_length=30
                        is_active=True,
                    )
                    # Compte créé via Apple : pas de mot de passe utilisable.
                    # "Mot de passe oublié" permet d'en créer un plus tard.
                    user.set_unusable_password()
                    user.save(update_fields=['password'])

                    # Profil client par défaut. Les restaurateurs passent par
                    # le flux d'inscription complet (SIRET, Stripe Connect).
                    ClientProfile.objects.create(user=user, phone='')
                    created = True

                    logger.info(
                        f"Nouveau compte Apple créé : id={user.id} "
                        f"email='{email}' (apple_sub={apple_sub})"
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
            logger.exception(f"IntegrityError lors du login Apple pour {email}")
            return Response(
                {"detail": "Erreur lors de la création du compte."},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            logger.exception(f"Erreur inattendue lors du login Apple pour {email}")
            return Response(
                {"detail": "Erreur serveur lors de la connexion Apple."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
