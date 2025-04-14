from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.contrib.auth import authenticate
from .models import Restaurant, ClientProfile, RestaurateurProfile, Menu, MenuItem
from .serializers import RestaurantSerializer, MenuSerializer, MenuItemSerializer
import requests
from django.conf import settings
from django.core.mail import send_mail


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
    if not getattr(settings, 'TESTING', False) and not getattr(settings, 'DEBUG', False):
        try:
            sirene_token = settings.SIRENE_API_TOKEN
            print(f"Token SIRENE utilisé : {sirene_token}")  # Log pour débogage
            if sirene_token == 'test-token':
                return Response({"error": "Le service de vérification SIRET n'est pas configuré. Veuillez contacter l'administrateur."}, status=400)
                
            headers = {"Authorization": f"Bearer {sirene_token}"}
            try:
                response = requests.get(f"https://api.insee.fr/entreprises/sirene/V3/siret/{siret}", headers=headers)
            except requests.exceptions.ConnectionError:
                return Response({"error": "Impossible de se connecter au service de vérification SIRET. Veuillez réessayer plus tard."}, status=400)
            
            if response.status_code == 404:
                return Response({"error": "Numéro SIRET introuvable. Veuillez vérifier le numéro saisi."}, status=400)
            elif response.status_code == 401:
                return Response({"error": "Erreur d'authentification avec le service de vérification SIRET. Veuillez contacter l'administrateur."}, status=400)
            elif response.status_code != 200:
                return Response({"error": "Erreur lors de la vérification du SIRET. Veuillez réessayer plus tard."}, status=400)
                
            data = response.json()
            # Récupération du SIREN (les 9 premiers chiffres du SIRET)
            siren = siret[:9]

            # Récupération de tous les établissements liés à ce SIREN
            response = requests.get(
                f"https://api.insee.fr/entreprises/sirene/V3/siren/{siren}/etablissements",
                headers=headers,
                params={"etatAdministratifEtablissement": "A"}
            )

            if response.status_code != 200:
                return Response({"error": "Impossible de récupérer les établissements liés à ce SIREN."}, status=400)

            etablissements = response.json().get("etablissements", [])
            restaurants = []

            for e in etablissements:
                siret_etab = e.get("siret")
                nom = (
                    e.get("unite_legale", {}).get("denomination") or
                    e.get("unite_legale", {}).get("nom_usage") or
                    e.get("unite_legale", {}).get("nom") or
                    "Nom inconnu"
                )
                restaurants.append({"nom": nom, "siret": siret_etab})

        except Exception as e:
            return Response({"error": f"Erreur lors de la vérification du SIRET : {str(e)}"}, status=400)

    try:
        # Création utilisateur et profil restaurateur
        user = User.objects.create_user(username=username, password=password, email=email)
        try:
            restaurateur_profile = RestaurateurProfile.objects.create(
                user=user,
                siret=siret,
                id_card=id_card,
                kbis=kbis
            )
            # Création des restaurants liés
            for r in restaurants:
                Restaurant.objects.create(
                    restaurateur=restaurateur_profile,
                    nom=r["nom"],
                    siret=r["siret"]
                )
            
            # Envoi de l'email de confirmation
            subject = "Inscription PayQuick - Votre compte est en cours de validation"
            message = f"""
            Bonjour {username},

            Votre inscription sur PayQuick a bien été prise en compte.
            Votre compte est actuellement en cours de validation par notre équipe.
            Vous recevrez un email dès que votre compte sera validé.

            Cordialement,
            L'équipe PayQuick
            """
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            
            return Response({"user": {"username": user.username}}, status=201)
        except Exception as e:
            # Si la création du profil échoue, supprimer l'utilisateur
            user.delete()
            return Response({"error": f"Erreur lors de la création du profil : {str(e)}"}, status=400)
    except Exception as e:
        return Response({"error": f"Erreur lors de la création de l'utilisateur : {str(e)}"}, status=400)

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

@api_view(['POST'])
@permission_classes([AllowAny])
def validate_restaurateur(request):
    username = request.data.get("username")
    
    try:
        user = User.objects.get(username=username)
        profile = user.restaurateur_profile
        profile.is_validated = True
        profile.save()
        
        # Envoi de l'email de validation
        subject = "PayQuick - Votre compte a été validé"
        message = f"""
        Bonjour {username},

        Votre compte PayQuick a été validé avec succès.
        Vous pouvez maintenant vous connecter à votre espace restaurateur.

        Cordialement,
        L'équipe PayQuick
        """
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
        
        return Response({"message": "Compte validé avec succès"}, status=200)
    except User.DoesNotExist:
        return Response({"error": "Utilisateur non trouvé"}, status=404)
    except RestaurateurProfile.DoesNotExist:
        return Response({"error": "Profil restaurateur non trouvé"}, status=404)
    except Exception as e:
        return Response({"error": f"Erreur lors de la validation : {str(e)}"}, status=500)

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def menu_management(request, restaurant_id):
    try:
        restaurant = Restaurant.objects.get(id=restaurant_id, owner=request.user)
    except Restaurant.DoesNotExist:
        return Response({"error": "Restaurant non trouvé ou non autorisé"}, status=404)

    if request.method == 'GET':
        menu, created = Menu.objects.get_or_create(restaurant=restaurant)
        serializer = MenuSerializer(menu)
        return Response(serializer.data)

    if request.method == 'POST':
        menu, created = Menu.objects.get_or_create(restaurant=restaurant)
        data = request.data
        data['menu'] = menu.id
        serializer = MenuItemSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def menu_item_management(request, item_id):
    try:
        item = MenuItem.objects.get(id=item_id)
        if item.menu.restaurant.owner != request.user:
            return Response({"error": "Non autorisé"}, status=403)
    except MenuItem.DoesNotExist:
        return Response({"error": "Item non trouvé"}, status=404)

    if request.method == 'PUT':
        serializer = MenuItemSerializer(item, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    if request.method == 'DELETE':
        item.delete()
        return Response(status=204)