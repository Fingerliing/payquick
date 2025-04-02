from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.urls import path
from .models import Restaurant
import json

@csrf_exempt
@require_http_methods(["POST"])
def register(request):
    data = json.loads(request.body)
    username = data.get('username')
    password = data.get('password')

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Utilisateur déjà existant'}, status=400)

    user = User.objects.create_user(username=username, password=password)
    return JsonResponse({'user': {'username': user.username}}, status=201)

@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    data = json.loads(request.body)
    username = data.get('username')
    password = data.get('password')

    user = authenticate(username=username, password=password)
    if user is not None:
        return JsonResponse({'user': {'username': user.username}}, status=200)
    else:
        return JsonResponse({'error': 'Identifiants invalides'}, status=400)

@csrf_exempt
@require_http_methods(["GET"])
def list_restaurants(request):
    restaurants = Restaurant.objects.all()
    data = [
        {
            'id': r.id,
            'name': r.name,
            'description': r.description,
            'owner': r.owner.username
        }
        for r in restaurants
    ]
    return JsonResponse(data, safe=False)

@csrf_exempt
@require_http_methods(["POST"])
def create_restaurant(request):
    data = json.loads(request.body)
    name = data.get('name')
    description = data.get('description', '')
    username = data.get('username')

    try:
        owner = User.objects.get(username=username)
        restaurant = Restaurant.objects.create(
            name=name,
            description=description,
            owner=owner
        )
        return JsonResponse({
            'id': restaurant.id,
            'name': restaurant.name,
            'description': restaurant.description,
            'owner': restaurant.owner.username
        }, status=201)
    except User.DoesNotExist:
        return JsonResponse({'error': 'Utilisateur non trouvé'}, status=404)
