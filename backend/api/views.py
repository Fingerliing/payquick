from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth import authenticate
from .models import Restaurant, ClientProfile
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
        serializer = RestaurantSerializer(data=request.data)
        if serializer.is_valid():
            try:
                user = User.objects.get(username=request.data.get('username'))
            except User.DoesNotExist:
                return Response({"error": "Utilisateur non trouvé"}, status=status.HTTP_404_NOT_FOUND)

            serializer.save(owner=user)
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
