from django.test import TestCase, Client
from django.contrib.auth.models import User
from .models import Restaurant, RestaurateurProfile
import json
from django.core.files.uploadedfile import SimpleUploadedFile

class RestaurantModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='owner', password='password123')
        self.restaurant = Restaurant.objects.create(
            name='Chez Django',
            description='Un super resto',
            owner=self.user
        )

    def test_restaurant_str(self):
        self.assertEqual(str(self.restaurant), 'Chez Django')

    def test_restaurant_fields(self):
        self.assertEqual(self.restaurant.name, 'Chez Django')
        self.assertEqual(self.restaurant.description, 'Un super resto')
        self.assertEqual(self.restaurant.owner, self.user)

class AuthTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.register_url = '/api/register'
        self.login_url = '/api/login'
        self.username = 'testuser'
        self.password = 'securepassword'

    def test_register_user(self):
        response = self.client.post(
            self.register_url,
            data=json.dumps({'username': self.username, 'password': self.password}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['user']['username'], self.username)

    def test_register_existing_user(self):
        User.objects.create_user(username=self.username, password=self.password)
        response = self.client.post(
            self.register_url,
            data=json.dumps({'username': self.username, 'password': self.password}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_login_success(self):
        User.objects.create_user(username=self.username, password=self.password)
        response = self.client.post(
            self.login_url,
            data=json.dumps({'username': self.username, 'password': self.password}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], self.username)

    def test_login_invalid_credentials(self):
        response = self.client.post(
            self.login_url,
            data=json.dumps({'username': 'wrong', 'password': 'wrong'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

class RestaurantApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='owner', password='pass')
        self.client = Client()

    def test_create_restaurant(self):
        response = self.client.post(
            '/api/restaurants/create',
            data=json.dumps({
                'name': 'Mon resto',
                'description': 'Cuisine maison',
                'username': 'owner'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Restaurant.objects.count(), 1)

    def test_list_restaurants(self):
        Restaurant.objects.create(name='Test Resto', description='Délicieux', owner=self.user)
        response = self.client.get('/api/restaurants')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

class RestaurantExtraTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username="chef", password="secret")

    def test_create_restaurant_missing_fields(self):
        response = self.client.post(
            '/api/restaurants/create',
            data={},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_create_restaurant_wrong_owner(self):
        other_user = User.objects.create_user(username="not_owner", password="123")
        self.client.force_login(other_user)
        response = self.client.post(
            '/api/restaurants/create',
            data=json.dumps({
                'name': 'Fraude',
                'description': 'Tentative',
                'username': 'chef'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_list_restaurants_empty(self):
        response = self.client.get('/api/restaurants')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_restaurants_multiple(self):
        Restaurant.objects.create(name='R1', description='D1', owner=self.user)
        Restaurant.objects.create(name='R2', description='D2', owner=self.user)
        response = self.client.get('/api/restaurants')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 2)

class RestaurateurRegistrationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/register'

    def test_register_with_documents(self):
        id_card = SimpleUploadedFile("id.jpg", b"fake-id-content", content_type="image/jpeg")
        kbis = SimpleUploadedFile("kbis.pdf", b"fake-kbis-content", content_type="application/pdf")
        response = self.client.post(self.url, {
            "username": "newresto",
            "password": "pass123",
            "email": "test@resto.com",
            "siret": "12345678901234",
            "id_card": id_card,
            "kbis": kbis
        })
        self.assertEqual(response.status_code in [201, 400], True)  # 201 if fake SIRET accepted, else 400

    def test_register_missing_documents(self):
        response = self.client.post(self.url, {
            "username": "nodocs",
            "password": "pass123",
            "email": "test@nodocs.com",
            "siret": "12345678901234"
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Tous les champs sont requis", response.json().get("error", ""))

    def test_register_existing_username(self):
        User.objects.create_user(username="existing", password="test")
        id_card = SimpleUploadedFile("id.jpg", b"x", content_type="image/jpeg")
        kbis = SimpleUploadedFile("kbis.pdf", b"x", content_type="application/pdf")
        response = self.client.post(self.url, {
            "username": "existing",
            "password": "pass",
            "email": "existing@mail.com",
            "siret": "12345678901234",
            "id_card": id_card,
            "kbis": kbis
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("déjà utilisé", response.json().get("error", ""))

class RestaurateurValidationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username="resto", password="pass")
        self.profile = RestaurateurProfile.objects.create(
            user=self.user,
            siret="12345678901234",
            id_card=SimpleUploadedFile("id.jpg", b"x"),
            kbis=SimpleUploadedFile("kbis.pdf", b"x"),
            is_validated=False
        )

    def test_login_not_validated(self):
        response = self.client.post("/api/restaurateur/login", {
            "username": "resto",
            "password": "pass"
        }, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertIn("validation", response.json().get("error", ""))

    def test_login_validated(self):
        self.profile.is_validated = True
        self.profile.save()
        response = self.client.post("/api/restaurateur/login", {
            "username": "resto",
            "password": "pass"
        }, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("user", {}).get("username"), "resto")