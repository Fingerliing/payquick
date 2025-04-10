from django.test import TestCase, Client, override_settings
from django.contrib.auth.models import User
from .models import Restaurant, RestaurateurProfile, ClientProfile
import json
from django.core.files.uploadedfile import SimpleUploadedFile
import requests
from unittest.mock import MagicMock, patch
from importlib import reload
from django.urls import clear_url_caches

class BaseTest(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Stocker le contenu une seule fois
        cls.id_card_content = b"fake-id-content"
        cls.kbis_content = b"fake-kbis-content"

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

        # Recréation des fichiers à chaque test
        self.id_card = SimpleUploadedFile("id.jpg", self.__class__.id_card_content, content_type="image/jpeg")
        self.kbis = SimpleUploadedFile("kbis.pdf", self.__class__.kbis_content, content_type="application/pdf")

        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'siret': '12345678901234',
            'id_card': self.id_card,
            'kbis': self.kbis
        }

    def tearDown(self):
        # Fermer proprement les fichiers
        self.id_card.close()
        self.kbis.close()
        super().tearDown()


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
        self.assertIn('Authentification requise', response.json()['error'])

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
        self.assertIn('Non autorisé', response.json()['error'])

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
        self.assertIn('Tous les champs sont requis', response.json()['error'])

    @patch('requests.get')
    def test_create_restaurant_osm_error(self, mock_get):
        """Test la création d'un restaurant avec une erreur OpenStreetMap"""
        mock_get.side_effect = requests.exceptions.RequestException("Erreur de connexion")
        
        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 500)
        self.assertIn('Erreur OpenStreetMap', response.json()['error'])

    @patch('requests.get')
    def test_create_restaurant_osm_not_found(self, mock_get):
        """Test la création d'un restaurant avec un établissement non trouvé"""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = []
        
        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn('Établissement non reconnu', response.json()['error'])

    def test_create_restaurant_serializer_errors(self):
        """Test la création d'un restaurant avec des données invalides"""
        self.client.force_login(self.user)
        invalid_data = {
            'name': '',  # Nom vide
            'description': '',  # Description vide
            'latitude': 'invalid',  # Latitude invalide
            'longitude': 'invalid',  # Longitude invalide
            'city': '',  # Ville vide
            'username': self.user.username
        }
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(invalid_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())
        self.assertEqual(response.json()['error'], 'Tous les champs sont requis')

class RestaurateurTests(BaseTest):
    def setUp(self):
        super().setUp()

    @patch('requests.get')
    def test_restaurateur_registration_sirene_error(self, mock_get):
        """Test l'inscription d'un restaurateur avec une erreur de l'API Sirene"""
        mock_get.side_effect = requests.exceptions.ConnectionError("Erreur de connexion")
        
        with patch('django.conf.settings.TESTING', False), \
             patch('django.conf.settings.SIRENE_API_TOKEN', 'test-token'):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur de connexion à l\'API Sirene', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_registration_sirene_request_exception(self, mock_get):
        """Test l'inscription d'un restaurateur avec une RequestException lors de la vérification du SIRET"""
        mock_get.side_effect = requests.exceptions.RequestException("Erreur lors de la vérification du SIRET")
        
        with patch('django.conf.settings.TESTING', False), \
             patch('django.conf.settings.SIRENE_API_TOKEN', 'test-token'):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur de connexion à l\'API Sirene', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_registration_sirene_api_error(self, mock_get):
        """Test l'inscription d'un restaurateur avec une erreur de l'API Sirene"""
        mock_get.return_value.status_code = 500
        mock_get.return_value.json.return_value = {}
        
        with patch('django.conf.settings.TESTING', False):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur lors de la vérification du SIRET', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_registration(self, mock_get):
        """Test l'inscription d'un restaurateur"""
        # Mock de la réponse de l'API Sirene
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"etablissement": {"siret": self.register_data['siret']}}
        
        response = self.client.post(
            '/api/restaurateur/register',
            self.register_data,
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
            self.register_data,
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
                self.register_data,
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
            id_card=self.id_card,
            kbis=self.kbis,
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

    @patch('requests.get')
    def test_restaurateur_registration_sirene_request_exception_specific(self, mock_get):
        """Test l'inscription d'un restaurateur avec une RequestException spécifique lors de la deuxième tentative"""
        mock_get.side_effect = [
            requests.exceptions.ConnectionError("Première erreur"),
            requests.exceptions.RequestException("Deuxième erreur")
        ]
        
        with patch('django.conf.settings.TESTING', False), \
             patch('django.conf.settings.SIRENE_API_TOKEN', 'test-token'):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur de connexion à l\'API Sirene', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_registration_sirene_status_500(self, mock_get):
        """Test l'inscription d'un restaurateur avec un code de statut 500 de l'API Sirene"""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response
        
        with patch('django.conf.settings.TESTING', False), \
             patch('django.conf.settings.SIRENE_API_TOKEN', 'test-token'):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur lors de la vérification du SIRET', response.json()['error'])

class ClientProfileTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.client_profile = ClientProfile.objects.create(
            user=self.user,
            phone='0123456789'
        )

    def test_client_profile_creation(self):
        """Vérifie la création d'un profil client"""
        self.assertEqual(str(self.client_profile), 'testuser - 0123456789')
        self.assertEqual(self.client_profile.user, self.user)

class RestaurateurProfileTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.restaurateur_profile = RestaurateurProfile.objects.create(
            user=self.user,
            siret='12345678901234',
            id_card=self.id_card,
            kbis=self.kbis
        )

    def test_restaurateur_profile_creation(self):
        """Vérifie la création d'un profil restaurateur"""
        self.assertEqual(str(self.restaurateur_profile), 'testuser - 12345678901234')
        self.assertEqual(self.restaurateur_profile.user, self.user)

class ClientTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'phone': '0123456789',
            'recaptcha': 'test-captcha'
        }

    def test_client_registration(self):
        """Test l'inscription d'un client"""
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(self.register_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ClientProfile.objects.filter(user__username=self.user_data['username']).exists())

    def test_client_registration_missing_fields(self):
        """Test l'inscription d'un client avec des champs manquants"""
        incomplete_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(incomplete_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_client_login(self):
        """Test la connexion d'un client"""
        User.objects.create_user(**self.user_data)
        ClientProfile.objects.create(
            user=User.objects.get(username=self.user_data['username']),
            phone='0123456789'
        )
        response = self.client.post(
            '/api/client/login',
            data=json.dumps({
                'username': self.user_data['username'],
                'password': self.user_data['password']
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('user', response.json())

    def test_client_login_failure(self):
        """Test l'échec de la connexion d'un client"""
        response = self.client.post(
            '/api/client/login',
            data=json.dumps({
                'username': 'wrong',
                'password': 'wrong'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_client_login_no_profile(self):
        """Test la connexion avec un utilisateur sans profil client"""
        user = User.objects.create_user(username='noclient', password='testpass')
        response = self.client.post(
            '/api/client/login',
            data=json.dumps({
                'username': 'noclient',
                'password': 'testpass'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], 'noclient')

class RestaurateurLoginTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.profile = RestaurateurProfile.objects.create(
            user=self.user,
            siret='12345678901234',
            id_card=self.id_card,
            kbis=self.kbis
        )
        self.login_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }

    def test_restaurateur_login_success(self):
        """Test la connexion réussie d'un restaurateur validé"""
        self.profile.is_validated = True
        self.profile.save()
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps(self.login_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], self.user_data['username'])

    def test_restaurateur_login_not_validated(self):
        """Test la connexion d'un restaurateur non validé"""
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps(self.login_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn('en cours de validation', response.json()['error'])

    def test_restaurateur_login_no_profile(self):
        """Test la connexion avec un utilisateur sans profil restaurateur"""
        user = User.objects.create_user(username='norestau', password='testpass')
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps({
                'username': 'norestau',
                'password': 'testpass'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn('Aucun profil restaurateur', response.json()['error'])

    def test_restaurateur_login_invalid_credentials(self):
        """Test la connexion avec des identifiants invalides"""
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps({
                'username': self.user_data['username'],
                'password': 'wrongpass'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

    def test_restaurateur_login_missing_fields(self):
        """Test la connexion avec des champs manquants"""
        data = {
            'username': self.user_data['username']
        }
        response = self.client.post(
            '/api/restaurateur/login',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

class RestaurateurRegisterErrorTests(BaseTest):
    def setUp(self):
        super().setUp()

    def test_restaurateur_register_profile_creation_error(self):
        """Test l'erreur lors de la création du profil restaurateur"""
        with patch('api.models.RestaurateurProfile.objects.create') as mock_create:
            mock_create.side_effect = Exception('Erreur test')
            response = self.client.post('/api/restaurateur/register', self.register_data)
            self.assertEqual(response.status_code, 500)
            self.assertIn('Erreur lors de la création du profil', response.json()['error'])

    def test_restaurateur_register_user_creation_error(self):
        """Test l'erreur lors de la création de l'utilisateur"""
        with patch('django.contrib.auth.models.User.objects.create_user') as mock_create:
            mock_create.side_effect = Exception('Erreur test')
            response = self.client.post('/api/restaurateur/register', self.register_data)
            self.assertEqual(response.status_code, 500)

class UrlsRateLimitTest(BaseTest):
    @override_settings(TESTING=False)
    def test_ratelimit_applied_in_production(self):
        clear_url_caches()

        with patch('django_ratelimit.decorators.ratelimit') as mock_ratelimit:
            import importlib
            import api.urls
            importlib.reload(api.urls)

            self.assertTrue(mock_ratelimit.called)

    @override_settings(TESTING=True)
    def test_ratelimit_not_applied_in_testing(self):
        clear_url_caches()
        with patch('django_ratelimit.decorators.ratelimit') as mock_ratelimit:
            import importlib
            import api.urls
            importlib.reload(api.urls)

            self.assertFalse(mock_ratelimit.called)

class RestaurantAuthTests(BaseTest):
    def test_create_restaurant_unauthenticated(self):
        data = {
            "name": "NoAuth",
            "city": "Paris",
            "description": "Sans login",
            "username": "someone"
        }
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("Authentification requise", response.json()["error"])

class RestaurantOSMNotFoundTests(BaseTest):
    @patch('requests.get')
    def test_create_restaurant_osm_empty(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = []

        self.user = User.objects.create_user(**self.user_data)
        self.client.force_login(self.user)

        data = {
            "name": "Ghost Restaurant",
            "city": "Nowhere",
            "description": "Invisible",
            "username": self.user.username
        }
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("OpenStreetMap", response.json()["error"])

class RestaurateurErrorTests(BaseTest):
    @patch('django.contrib.auth.models.UserManager.create_user', side_effect=Exception("Simulated error"))
    def test_restaurateur_user_creation_exception(self, mock_create_user):
        response = self.client.post(
            '/api/restaurateur/register',
            data=self.register_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 500)
        self.assertIn("Erreur lors de la création de l'utilisateur", response.json()["error"])

class RegisterCaptchaTests(BaseTest):
    @override_settings(TESTING=False)
    @patch('requests.post')
    def test_register_with_invalid_captcha(self, mock_post):
        mock_post.return_value.json.return_value = {"success": False}
        mock_post.return_value.status_code = 200

        response = self.client.post(
            '/api/register',
            data={
                'username': 'invalidcaptcha',
                'password': 'pass123',
                'recaptcha_response': 'invalid-captcha'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Captcha invalide", response.json()["error"])

class RegisterTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'recaptcha_response': 'test-captcha'
        }

    def test_register_success(self):
        """Test l'inscription réussie d'un utilisateur"""
        response = self.client.post(
            '/api/register',
            data=json.dumps(self.register_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username=self.user_data['username']).exists())

    def test_register_missing_captcha(self):
        """Test l'inscription sans captcha"""
        data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }
        response = self.client.post(
            '/api/register',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Captcha manquant', response.json()['error'])

    def test_register_duplicate_username(self):
        """Test l'inscription avec un nom d'utilisateur existant"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            '/api/register',
            data=json.dumps(self.register_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Utilisateur déjà existant', response.json()['error'])

    @patch('requests.post')
    def test_register_invalid_captcha(self, mock_post):
        """Test l'inscription avec un captcha invalide"""
        mock_post.return_value.json.return_value = {'success': False}
        mock_post.return_value.status_code = 200

        with patch('django.conf.settings.TESTING', False):
            response = self.client.post(
                '/api/register',
                data=json.dumps(self.register_data),
                content_type='application/json'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Captcha invalide', response.json()['error'])

class LoginTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.login_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }

    def test_login_success(self):
        """Test la connexion réussie"""
        response = self.client.post(
            '/api/login',
            data=json.dumps(self.login_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], self.user_data['username'])

    def test_login_invalid_credentials(self):
        """Test la connexion avec des identifiants invalides"""
        data = {
            'username': self.user_data['username'],
            'password': 'wrongpassword'
        }
        response = self.client.post(
            '/api/login',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

    def test_login_missing_fields(self):
        """Test la connexion avec des champs manquants"""
        data = {
            'username': self.user_data['username']
        }
        response = self.client.post(
            '/api/login',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

class ClientRegisterTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'phone': '0123456789',
            'recaptcha': 'test-captcha'
        }

    def test_client_register_success(self):
        """Test l'inscription réussie d'un client"""
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(self.register_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username=self.user_data['username']).exists())
        self.assertTrue(ClientProfile.objects.filter(user__username=self.user_data['username']).exists())

    def test_client_register_missing_captcha(self):
        """Test l'inscription d'un client sans captcha"""
        data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'phone': '0123456789'
        }
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Captcha manquant', response.json()['error'])

    def test_client_register_duplicate_username(self):
        """Test l'inscription d'un client avec un nom d'utilisateur existant"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(self.register_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Utilisateur déjà existant', response.json()['error'])

    @patch('requests.post')
    def test_client_register_invalid_captcha(self, mock_post):
        """Test l'inscription d'un client avec un captcha invalide"""
        mock_post.return_value.json.return_value = {'success': False}
        mock_post.return_value.status_code = 200

        with patch('django.conf.settings.TESTING', False):
            response = self.client.post(
                '/api/client/register',
                data=json.dumps(self.register_data),
                content_type='application/json'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Captcha invalide', response.json()['error'])

    def test_client_register_missing_fields(self):
        """Test l'inscription d'un client avec des champs manquants"""
        data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }
        response = self.client.post(
            '/api/client/register',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

class ClientLoginTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.client_profile = ClientProfile.objects.create(
            user=self.user,
            phone='0123456789'
        )
        self.login_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }

    def test_client_login_success(self):
        """Test la connexion réussie d'un client"""
        response = self.client.post(
            '/api/client/login',
            data=json.dumps(self.login_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], self.user_data['username'])

    def test_client_login_invalid_credentials(self):
        """Test la connexion avec des identifiants invalides"""
        data = {
            'username': self.user_data['username'],
            'password': 'wrongpassword'
        }
        response = self.client.post(
            '/api/client/login',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

    def test_client_login_missing_fields(self):
        """Test la connexion avec des champs manquants"""
        data = {
            'username': self.user_data['username']
        }
        response = self.client.post(
            '/api/client/login',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Identifiants invalides', response.json()['error'])

    def test_client_login_no_profile(self):
        """Test la connexion avec un utilisateur sans profil client"""
        user = User.objects.create_user(username='noclient', password='testpass')
        response = self.client.post(
            '/api/client/login',
            data=json.dumps({
                'username': 'noclient',
                'password': 'testpass'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['username'], 'noclient')

class RestaurateurRegisterTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.register_data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'siret': '12345678901234',
            'id_card': self.id_card,
            'kbis': self.kbis
        }

    @patch('requests.get')
    def test_restaurateur_register_success(self, mock_get):
        """Test l'inscription réussie d'un restaurateur"""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"etablissement": {"siret": self.register_data['siret']}}
        
        response = self.client.post(
            '/api/restaurateur/register',
            self.register_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username=self.user_data['username']).exists())
        self.assertTrue(RestaurateurProfile.objects.filter(user__username=self.user_data['username']).exists())

    def test_restaurateur_register_missing_fields(self):
        """Test l'inscription d'un restaurateur avec des champs manquants"""
        data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'siret': '12345678901234'
        }
        response = self.client.post(
            '/api/restaurateur/register',
            data=data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Champs manquants', response.json()['error'])

    def test_restaurateur_register_missing_username(self):
        """Test l'inscription d'un restaurateur sans username"""
        data = {
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'siret': '12345678901234',
            'id_card': self.id_card,
            'kbis': self.kbis
        }
        response = self.client.post(
            '/api/restaurateur/register',
            data=data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.json()['error'])

    def test_restaurateur_register_missing_password(self):
        """Test l'inscription d'un restaurateur sans password"""
        data = {
            'username': self.user_data['username'],
            'email': self.user_data['email'],
            'siret': '12345678901234',
            'id_card': self.id_card,
            'kbis': self.kbis
        }
        response = self.client.post(
            '/api/restaurateur/register',
            data=data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.json()['error'])

    def test_restaurateur_register_missing_siret(self):
        """Test l'inscription d'un restaurateur sans siret"""
        data = {
            'username': self.user_data['username'],
            'password': self.user_data['password'],
            'email': self.user_data['email'],
            'id_card': self.id_card,
            'kbis': self.kbis
        }
        response = self.client.post(
            '/api/restaurateur/register',
            data=data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('siret', response.json()['error'])

    def test_restaurateur_register_duplicate_username(self):
        """Test l'inscription d'un restaurateur avec un nom d'utilisateur existant"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(
            '/api/restaurateur/register',
            self.register_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Ce nom d\'utilisateur est déjà utilisé', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_register_sirene_404(self, mock_get):
        """Test l'inscription d'un restaurateur avec un SIRET introuvable"""
        mock_get.return_value.status_code = 404
        
        with patch('django.conf.settings.TESTING', False), \
             patch('django.conf.settings.SIRENE_API_TOKEN', 'test-token'):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Numéro SIRET introuvable', response.json()['error'])

    @patch('requests.get')
    def test_restaurateur_register_sirene_api_error(self, mock_get):
        """Test l'inscription d'un restaurateur avec une erreur de l'API Sirene"""
        mock_get.return_value.status_code = 500
        mock_get.return_value.json.return_value = {}
        
        with patch('django.conf.settings.TESTING', False):
            response = self.client.post(
                '/api/restaurateur/register',
                self.register_data,
                format='multipart'
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn('Erreur lors de la vérification du SIRET', response.json()['error'])

class RestaurantListCreateTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(**self.user_data)
        self.restaurant_data = {
            'name': 'Test Restaurant',
            'city': 'Paris',
            'description': 'A test restaurant',
            'username': self.user.username
        }

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

    @patch('requests.get')
    def test_create_restaurant_success(self, mock_get):
        """Test la création réussie d'un restaurant"""
        # Mock de la réponse OpenStreetMap
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = [{
            "lat": "48.8566",
            "lon": "2.3522"
        }]

        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=self.restaurant_data,
            format='multipart'
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Restaurant.objects.filter(name='Test Restaurant').exists())

    def test_create_restaurant_unauthorized(self):
        """Test la création d'un restaurant sans authentification"""
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn('Authentification requise', response.json()['error'])

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
        self.assertIn('Non autorisé', response.json()['error'])

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
        self.assertIn('Tous les champs sont requis', response.json()['error'])

    @patch('requests.get')
    def test_create_restaurant_osm_error(self, mock_get):
        """Test la création d'un restaurant avec une erreur OpenStreetMap"""
        mock_get.side_effect = requests.exceptions.RequestException("Erreur de connexion")
        
        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 500)
        self.assertIn('Erreur OpenStreetMap', response.json()['error'])

    @patch('requests.get')
    def test_create_restaurant_osm_not_found(self, mock_get):
        """Test la création d'un restaurant avec un établissement non trouvé"""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = []
        
        self.client.force_login(self.user)
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(self.restaurant_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn('Établissement non reconnu', response.json()['error'])

    def test_create_restaurant_empty_fields(self):
        """Test la création d'un restaurant avec des champs vides"""
        self.client.force_login(self.user)
        data = {
            'name': '',
            'city': '',
            'description': '',
            'username': self.user.username
        }
        response = self.client.post(
            '/api/restaurants',
            data=json.dumps(data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Tous les champs sont requis', response.json()['error'])