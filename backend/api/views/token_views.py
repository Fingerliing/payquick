from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from drf_spectacular.utils import extend_schema, OpenApiParameter
from api.serializers.auth_serializers import AuthRequestSerializer

@extend_schema(
    tags=["Auth"],
    summary="Connexion (JWT)",
    request=AuthRequestSerializer,
    responses={200: {"type": "object", "properties": {"token": {"type": "string"}}}, 401: {"type": "string"}},
    description="Authentifie un utilisateur avec son username et mot de passe.",
    parameters=[
      OpenApiParameter(
          name="username",
          type=str,
          location=OpenApiParameter.PATH,
          required=True,
            description="Nom d'utilisateur"
        ),
        OpenApiParameter(
            name="password",
            type=str,
            location=OpenApiParameter.PATH,
            required=True,
            description="Mot de passe"
      )
  ],
)
class ObtainAuthTokenView(APIView):
    """
    Endpoint pour obtenir un token d'authentification via username et mot de passe.
    """
    authentication_classes = []  # ✅ Aucune authentification requise
    permission_classes = []
    def post(self, request):
        serializer = AuthRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password']
        )
        if user is not None:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key})
        else:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
