from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from api.models import ClientProfile, RestaurateurProfile
from api.serializers import RegisterSerializer
from api.throttles import RegisterThrottle
from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema

@extend_schema(
    tags=["Auth"],
    summary="Inscription",
    description="Crée un nouvel utilisateur et retourne les tokens JWT.",
    request=RegisterSerializer,
    responses={
        201: {
            'type': 'object',
            'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
            }
        },
        400: {'description': 'Erreur de validation'}
    }
)
class RegisterView(APIView):
    """
    Crée un nouvel utilisateur (client ou restaurateur) et retourne les tokens JWT.
    Accessible sans authentification.
    """
    throttle_classes = [RegisterThrottle]
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@extend_schema(
    tags=["Auth"],
    summary="Infos utilisateur connecté",
    description="Retourne les informations du compte utilisateur connecté via un token JWT.",
    responses={
        200: {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'email': {'type': 'string'},
                'role': {'type': 'string', 'example': 'client'},
            }
        },
        401: {'description': 'Token manquant ou invalide'}
    }
)
class MeView(APIView):
    """
    Retourne les informations de l'utilisateur connecté (username, email, rôle).
    Nécessite un token JWT valide.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = "unknown"
        if ClientProfile.objects.filter(user=user).exists():
            role = "client"
        elif RestaurateurProfile.objects.filter(user=user).exists():
            role = "restaurateur"

        return Response({
            "username": user.username,
            "email": user.email,
            "role": role,
        })

@extend_schema(
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string', 'example': 'johndoe'},
                'password': {'type': 'string', 'example': 'secret123'},
            },
            'required': ['username', 'password'],
        }
    },
    responses={
        200: {
            'type': 'object',
            'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
            },
        },
        401: {'description': 'Identifiants invalides'},
        400: {'description': 'Champs manquants'},
    },
    tags=["Auth"],
    summary="Connexion (JWT)",
    description="Authentifie un utilisateur et retourne les tokens JWT."
)
class LoginView(APIView):
    """
    Authentifie un utilisateur avec son username et mot de passe.
    Retourne les tokens JWT s’il est valide.
    Accessible sans authentification.
    """

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({"detail": "Nom d'utilisateur et mot de passe requis."},
                            status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)

        if user is not None:
            refresh = RefreshToken.for_user(user)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh)
            })
        else:
            return Response({"detail": "Identifiants invalides."},
                            status=status.HTTP_401_UNAUTHORIZED)