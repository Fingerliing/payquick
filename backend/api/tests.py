from django.test import TestCase, Client
from django.contrib.auth.models import User
from .models import Restaurant, RestaurateurProfile
import json
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch

class BaseTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user_data = {
            'username': 'testuser',
            'password': 'testpass123',
            'email': 'test@example.com'
        }
        self.test_user = {
            **self.user_data,
            'recaptcha_response': 'test-captcha'
        }

class RestaurantModelTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.restaurant = Restaurant.objects.create(
            name='Test Restaurant',
            description='A test restaurant',
            owner=self.user,
            latitude=48.8566,
            longitude=2.3522
        )

    def test_restaurant_creation(self):
        """Vérifie la création d'un restaurant"""
        self.assertEqual(str(self.restaurant), 'Test Restaurant (testuser)')
        self.assertEqual(self.restaurant.owner, self.user)

class AuthTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_url = '/api/register'
        self.login_url = '/api/login'

    def test_successful_registration(self):
        """Test l'inscription réussie d'un utilisateur"""
        response = self.client.post(
            self.register_url,
            data={
                'username': self.test_user['username'],
                'password': self.test_user['password'],
                'recaptcha_response': self.test_user['recaptcha_response']
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username=self.test_user['username']).exists())

    def test_duplicate_username(self):
        """Test l'échec de l'inscription avec un nom d'utilisateur existant"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            self.register_url,
            data={
                'username': self.test_user['username'],
                'password': self.test_user['password'],
                'recaptcha_response': self.test_user['recaptcha_response']
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_missing_captcha(self):
        """Test l'échec de l'inscription sans captcha"""
        response = self.client.post(
            self.register_url,
            data={
                'username': self.test_user['username'],
                'password': self.test_user['password']
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_login_success(self):
        """Test la connexion réussie"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            self.login_url,
            data={
                'username': self.user_data['username'],
                'password': self.user_data['password']
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('user', response.json())

    def test_login_failure(self):
        """Test l'échec de la connexion"""
        response = self.client.post(
            self.login_url,
            data={
                'username': 'wrong',
                'password': 'wrong'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

class RestaurantAPITests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.restaurant_data = {
            'name': 'API Restaurant',
            'description': 'Test restaurant via API',
            'latitude': 48.8566,
            'longitude': 2.3522,
            'city': 'Paris',
            'username': self.user.username
        }

    def test_create_restaurant(self):
        """Test la création d'un restaurant via l'API"""
        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Restaurant.objects.count(), 1)

    def test_list_restaurants(self):
        """Test la liste des restaurants"""
        Restaurant.objects.create(
            name='List Test',
            description='For listing',
            owner=self.user,
            latitude=48.8566,
            longitude=2.3522
        )
        response = self.client.get('/api/restaurants')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_create_restaurant_unauthorized(self):
        """Test la création d'un restaurant sans authentification"""
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 401)

    def test_create_restaurant_wrong_user(self):
        """Test la création d'un restaurant pour un autre utilisateur"""
        other_user = User.objects.create_user(username='other', password='otherpass')
        self.client.force_login(other_user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_create_restaurant_missing_fields(self):
        """Test la création d'un restaurant avec des champs manquants"""
        self.client.force_login(self.user)
        incomplete_data = {
            'name': 'Incomplete Restaurant',
            'city': 'Paris'
        }
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(incomplete_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

class RestaurateurTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'siret': '12345678901234',
            'id_card': SimpleUploadedFile("id.jpg", b"fake-id-content", content_type="image/jpeg"),
            'kbis': SimpleUploadedFile("kbis.pdf", b"fake-kbis-content", content_type="application/pdf")
        }

    @patch('requests.get')
    def test_restaurateur_registration(self, mock_get):
        """Test l'inscription d'un restaurateur"""
        # Mock de la réponse de l'API Sirene
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"etablissement": {"siret": self.register_data['siret']}}
        
        response = self.client.post(
            '/api/restaurateur/register',
            data=self.register_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(RestaurateurProfile.objects.filter(user__username=self.user_data['username']).exists())

    def test_restaurateur_registration_missing_fields(self):
        """Test l'inscription d'un restaurateur avec des champs manquants"""
        incomplete_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'siret': '12345678901234'
        }
        response = self.client.post(
            '/api/restaurateur/register',
            data=incomplete_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_restaurateur_registration_duplicate_username(self):
        """Test l'inscription d'un restaurateur avec un nom d'utilisateur existant"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            '/api/restaurateur/register',
            data=self.register_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    @patch('requests.get')
    def test_restaurateur_registration_invalid_siret(self, mock_get):
        """Test l'inscription d'un restaurateur avec un SIRET invalide"""
        # Mock de la réponse de l'API Sirene
        mock_get.return_value.status_code = 404
        
        # Désactiver temporairement le mode test pour ce test
        with patch('django.conf.settings.TESTING', False):
            response = self.client.post(
                '/api/restaurateur/register',
                data=self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('error', response.json())

    def test_restaurateur_validation(self):
        """Test la validation d'un restaurateur"""
        user = User.objects.create_user(**self.user_data)
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret=self.register_data['siret'],
            id_card=self.register_data['id_card'],
            kbis=self.register_data['kbis'],
            is_validated=False
        )

        # Test connexion avant validation
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps({
                'username': self.user_data['username'],
                'password': self.user_data['password']
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

        # Test connexion après validation
        profile.is_validated = True
        profile.save()
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps({
                'username': self.user_data['username'],
                'password': self.user_data['password']
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)