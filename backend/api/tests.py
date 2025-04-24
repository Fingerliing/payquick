
from django.test import TestCase
from django.contrib.auth.models import User, Group
from rest_framework import status
from rest_framework.test import APIClient
from api.models import Restaurant, ClientProfile, RestaurateurProfile, Menu, MenuItem
from api.serializers import RestaurantSerializer
from api.permissions import IsRestaurateur, IsClient
from django.core.files.uploadedfile import SimpleUploadedFile

class APITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.restaurateur_group = Group.objects.create(name='restaurateur')
        self.user.groups.add(self.restaurateur_group)
        self.client.force_authenticate(user=self.user)

    def test_get_restaurants(self):
        Restaurant.objects.create(
            name="Le test",
            description="Cuisine test",
            owner=self.user,
            latitude=48.85,
            longitude=2.35
        )
        response = self.client.get('/api/restaurants/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_menu(self):
        resto = Restaurant.objects.create(
            name="Chez dev",
            description="Desc",
            owner=self.user,
            latitude=45.75,
            longitude=4.85
        )
        menu = Menu.objects.create(restaurant=resto)
        self.assertEqual(Menu.objects.filter(restaurant=resto).count(), 1)

    def test_create_menu_item(self):
        resto = Restaurant.objects.create(
            name="Test Resto",
            description="Test",
            owner=self.user,
            latitude=43.6,
            longitude=1.44
        )
        menu = Menu.objects.create(restaurant=resto)
        item = MenuItem.objects.create(
            name="Burger",
            description="Deluxe",
            price=10.5,
            category="Main",
            is_available=True,
            menu=menu
        )
        self.assertEqual(menu.items.count(), 1)

    def test_me_view_authenticated(self):
        response = self.client.get('/api/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_restaurant(self):
        data = {
            "name": "Nouveau Resto",
            "description": "Super cuisine",
            "latitude": 50.0,
            "longitude": 3.0
        }
        response = self.client.post("/api/restaurants/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Nouveau Resto")

class SerializerTests(TestCase):
    def test_restaurant_serializer(self):
        user = User.objects.create_user(username='serialuser', password='123456')
        group = Group.objects.create(name='restaurateur')
        user.groups.add(group)
        resto = Restaurant.objects.create(
            name="Resto Serial",
            description="Desc",
            owner=user,
            latitude=47.2,
            longitude=-1.55
        )
        serializer = RestaurantSerializer(resto)
        self.assertEqual(serializer.data['name'], "Resto Serial")

class PermissionTests(TestCase):
    def setUp(self):
        self.restaurateur_user = User.objects.create_user(username="demo", password="demo123")
        self.restaurateur_group = Group.objects.create(name="restaurateur")
        self.restaurateur_user.groups.add(self.restaurateur_group)

        self.card = SimpleUploadedFile("id.jpg", b"fake-id", content_type="image/jpeg")
        self.kbis = SimpleUploadedFile("kbis.pdf", b"fake-kbis", content_type="application/pdf")
        self.restaurateur = RestaurateurProfile.objects.create(
            user=self.restaurateur_user,
            siret="12345678901234",
            id_card=self.card,
            kbis=self.kbis
        )

        self.client_user = User.objects.create_user(username="client", password="client123")
        self.client_group = Group.objects.create(name="client")
        self.client_user.groups.add(self.client_group)
        self.client_profile = ClientProfile.objects.create(user=self.client_user, phone="0606060606")

    def test_is_restaurateur_permission(self):
        request = type('Request', (), {'user': self.restaurateur_user})()
        perm = IsRestaurateur(groups=["restaurateur"])
        self.assertTrue(perm.has_permission(request, None))

    def test_is_client_permission(self):
        request = type('Request', (), {'user': self.client_user})()
        perm = IsClient(groups=["client"])
        self.assertTrue(perm.has_permission(request, None))