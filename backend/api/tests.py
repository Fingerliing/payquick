from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from .models import Restaurant
import json

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
