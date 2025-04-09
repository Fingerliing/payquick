from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.contrib.auth import authenticate
from .models import Restaurant, ClientProfile, RestaurateurProfile
from .serializers import RestaurantSerializer
import requests
from django.conf import settings


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get("username")
    password = request.data.get("password")
    recaptcha_response = request.data.get("recaptcha_response")

    if not recaptcha_response:
        return Response({"error": "Captcha manquant"}, status=400)

    # Vérification du captcha (sauf en test)
    if not getattr(settings, 'TESTING', False):
        verify_url = "https://www.google.com/recaptcha/api/siteverify"
        payload = {
            "secret": settings.RECAPTCHA_SECRET_KEY,
            "response": recaptcha_response
        }
        r = requests.post(verify_url, data=payload)
        result = r.json()

        if not result.get("success"):
            return Response({"error": "Captcha invalide"}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Utilisateur déjà existant"}, status=400)

    user = User.objects.create_user(username=username, password=password)
    return Response({"user": {"username": user.username}}, status=201)

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if user is not None:
        return Response({"user": {"username": user.username}}, status=status.HTTP_200_OK)
    else:
        return Response({"error": "Identifiants invalides"}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST'])
def restaurant_list_create(request):
    if request.method == 'GET':
        restaurants = Restaurant.objects.all()
        serializer = RestaurantSerializer(restaurants, many=True)
        return Response(serializer.data)

    if request.method == 'POST':
        name = request.data.get('name')
        city = request.data.get('city')
        description = request.data.get('description')
        username = request.data.get('username')

        if not all([name, city, description]):
            return Response({"error": "Tous les champs sont requis"}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise"}, status=status.HTTP_401_UNAUTHORIZED)

        if request.user.username != username:
            return Response({"error": "Non autorisé à créer un restaurant pour un autre utilisateur"}, status=status.HTTP_403_FORBIDDEN)

        # Requête OpenStreetMap Nominatim avec nom + ville
        try:
            osm_url = "https://nominatim.openstreetmap.org/search"
            params = {
                'q': f"{name}, {city}",
                'format': 'json',
                'limit': 1
            }
            osm_response = requests.get(osm_url, params=params, headers={"User-Agent": "resto-app/1.0"})
            osm_data = osm_response.json()
            if not osm_data:
                return Response({"error": "Établissement non reconnu via OpenStreetMap"}, status=404)

            lat = float(osm_data[0].get("lat"))
            lon = float(osm_data[0].get("lon"))
        except Exception as e:
            return Response({"error": f"Erreur OpenStreetMap : {str(e)}"}, status=500)

        data = {
            "name": name,
            "description": description,
            "latitude": lat,
            "longitude": lon
        }
        serializer = RestaurantSerializer(data=data)
        if serializer.is_valid():
            serializer.save(owner=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(['POST'])
@permission_classes([AllowAny])
def client_register(request):
    username = request.data.get("username")
    password = request.data.get("password")
    email = request.data.get("email")
    phone = request.data.get("phone")
    recaptcha_response = request.data.get("recaptcha")

    if not recaptcha_response:
        return Response({"error": "Captcha manquant"}, status=400)

    verify_url = "https://www.google.com/recaptcha/api/siteverify"
    payload = {
        "secret": settings.RECAPTCHA_SECRET_KEY,
        "response": recaptcha_response
    }
    r = requests.post(verify_url, data=payload)
    result = r.json()

    if not result.get("success"):
        return Response({"error": "Captcha invalide"}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Utilisateur déjà existant"}, status=400)

    user = User.objects.create_user(username=username, password=password, email=email)
    ClientProfile.objects.create(user=user, phone=phone)
    return Response({"user": {"username": user.username}}, status=201)

@api_view(['POST'])
@permission_classes([AllowAny])
def client_login(request):
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if user is not None:
        return Response({"user": {"username": user.username}}, status=200)
    else:
        return Response({"error": "Identifiants invalides"}, status=400)

@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def restaurateur_register(request):
    username = request.data.get("username")
    password = request.data.get("password")
    email = request.data.get("email")
    siret = request.data.get("siret")
    id_card = request.FILES.get("id_card")
    kbis = request.FILES.get("kbis")

    # Vérification des champs requis
    missing_fields = []
    if not username:
        missing_fields.append("username")
    if not password:
        missing_fields.append("password")
    if not email:
        missing_fields.append("email")
    if not siret:
        missing_fields.append("siret")
    if not id_card:
        missing_fields.append("id_card")
    if not kbis:
        missing_fields.append("kbis")

    if missing_fields:
        return Response({"error": f"Champs manquants : {', '.join(missing_fields)}"}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Ce nom d'utilisateur est déjà utilisé."}, status=400)

    # Vérification du SIRET via l'API Sirene (sauf en test)
    if not getattr(settings, 'TESTING', False):
        try:
            sirene_token = settings.SIRENE_API_TOKEN
            headers = {"Authorization": f"Bearer {sirene_token}"}
            response = requests.get(f"https://api.insee.fr/entreprises/sirene/V3/siret/{siret}", headers=headers)
            
            if response.status_code == 404:
                return Response({"error": "Numéro SIRET introuvable."}, status=400)
            elif response.status_code != 200:
                return Response({"error": "Erreur lors de la vérification du SIRET."}, status=400)
                
            data = response.json()
        except requests.exceptions.RequestException as e:
            return Response({"error": "Erreur de connexion à l'API Sirene."}, status=400)
        except Exception as e:
            return Response({"error": f"Erreur lors de la vérification du SIRET : {str(e)}"}, status=400)

    try:
        # Création utilisateur et profil restaurateur
        user = User.objects.create_user(username=username, password=password, email=email)
        try:
            RestaurateurProfile.objects.create(
                user=user,
                siret=siret,
                id_card=id_card,
                kbis=kbis
            )
            return Response({"user": {"username": user.username}}, status=201)
        except Exception as e:
            # Si la création du profil échoue, supprimer l'utilisateur
            user.delete()
            return Response({"error": f"Erreur lors de la création du profil : {str(e)}"}, status=500)
    except Exception as e:
        return Response({"error": f"Erreur lors de la création de l'utilisateur : {str(e)}"}, status=500)

@api_view(['POST'])
@permission_classes([AllowAny])
def restaurateur_login(request):
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if not user:
        return Response({"error": "Identifiants invalides"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = user.restaurateur_profile
        if not profile.is_validated:
            return Response({"error": "Votre compte est en cours de validation."}, status=status.HTTP_403_FORBIDDEN)
    except RestaurateurProfile.DoesNotExist:
        return Response({"error": "Aucun profil restaurateur trouvé pour cet utilisateur."}, status=status.HTTP_404_NOT_FOUND)

    return Response({"user": {"username": user.username}}, status=status.HTTP_200_OK)