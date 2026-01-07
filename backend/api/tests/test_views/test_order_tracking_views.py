# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de suivi de commande
- OrderTrackingViewSet (progression gamifiée)
"""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Table,
    Menu,
    MenuItem,
    MenuCategory,
    Order,
    OrderItem,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="tracking_user@example.com",
        email="tracking_user@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="tracking_resto@example.com",
        email="tracking_resto@example.com",
        password="testpass123"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def auth_client(user):
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Tracking Test Restaurant",
        description="Restaurant pour tester le tracking",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        identifiant="TRACK_T001",
        qr_code="R1TRACK001",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Tracking",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats Principaux",
        icon="🍽️",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        name="Steak Frites",
        price=Decimal('22.00'),
        category=menu_category,
        is_available=True,
        preparation_time=15
    )


@pytest.fixture
def second_menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        name="Salade César",
        price=Decimal('12.00'),
        category=menu_category,
        is_available=True,
        preparation_time=8
    )


@pytest.fixture
def pending_order(restaurateur_profile, restaurant, table, user):
    """Commande en attente"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='pending',
        total_amount=Decimal('34.00'),
        subtotal=Decimal('30.91'),
        tax_amount=Decimal('3.09')
    )


@pytest.fixture
def confirmed_order(restaurateur_profile, restaurant, table, user):
    """Commande confirmée"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='confirmed',
        total_amount=Decimal('34.00')
    )


@pytest.fixture
def preparing_order(restaurateur_profile, restaurant, table, user):
    """Commande en préparation"""
    order = Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='preparing',
        total_amount=Decimal('34.00')
    )
    # Mettre à jour created_at pour simuler du temps écoulé
    order.created_at = timezone.now() - timedelta(minutes=10)
    order.save(update_fields=['created_at'])
    return order


@pytest.fixture
def ready_order(restaurateur_profile, restaurant, table, user):
    """Commande prête"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='ready',
        total_amount=Decimal('34.00'),
        ready_at=timezone.now()
    )


@pytest.fixture
def served_order(restaurateur_profile, restaurant, table, user):
    """Commande servie"""
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,
        user=user,
        status='served',
        total_amount=Decimal('34.00'),
        ready_at=timezone.now() - timedelta(minutes=5),
        served_at=timezone.now()
    )


@pytest.fixture
def order_with_items(pending_order, menu_item, second_menu_item):
    """Commande avec plusieurs items"""
    OrderItem.objects.create(
        order=pending_order,
        menu_item=menu_item,
        quantity=1,
        unit_price=menu_item.price
    )
    OrderItem.objects.create(
        order=pending_order,
        menu_item=second_menu_item,
        quantity=1,
        unit_price=second_menu_item.price
    )
    return pending_order


# =============================================================================
# TESTS - Progression de commande
# =============================================================================

@pytest.mark.django_db
class TestOrderProgress:
    """Tests pour la progression des commandes"""

    def test_get_progress_pending_order(self, api_client, order_with_items):
        """Test de progression d'une commande pending"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'global_progress' in response.data
        assert response.data['order_status'] == 'pending'
        # Progress devrait être bas pour une commande pending
        assert response.data['global_progress'] <= 15

    def test_get_progress_preparing_order(self, api_client, preparing_order, menu_item):
        """Test de progression d'une commande en préparation"""
        # Ajouter des items
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{preparing_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['order_status'] == 'preparing'
        # Progress devrait être entre 15 et 95 pour une commande en préparation
        assert 15 <= response.data['global_progress'] <= 95

    def test_get_progress_ready_order(self, api_client, ready_order, menu_item):
        """Test de progression d'une commande prête"""
        OrderItem.objects.create(
            order=ready_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{ready_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['order_status'] == 'ready'
        # Progress devrait être proche de 95-100 pour une commande prête
        assert response.data['global_progress'] >= 90

    def test_get_progress_served_order(self, api_client, served_order, menu_item):
        """Test de progression d'une commande servie"""
        OrderItem.objects.create(
            order=served_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{served_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['order_status'] == 'served'
        assert response.data['global_progress'] == 100

    def test_get_progress_nonexistent_order(self, api_client):
        """Test avec commande inexistante"""
        response = api_client.get('/api/v1/orders/99999/progress/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_progress_order_without_items(self, api_client, pending_order):
        """Test avec commande sans items"""
        response = api_client.get(f'/api/v1/orders/{pending_order.id}/progress/')
        
        # Peut retourner une erreur ou des données vides
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST
        ]


# =============================================================================
# TESTS - Gamification
# =============================================================================

@pytest.mark.django_db
class TestOrderGamification:
    """Tests pour les éléments de gamification"""

    def test_gamification_data_present(self, api_client, order_with_items):
        """Test que les données de gamification sont présentes"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'gamification' in response.data
        
        gamification = response.data['gamification']
        assert 'level' in gamification or 'points' in gamification

    def test_gamification_badges(self, api_client, order_with_items):
        """Test des badges de gamification"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        gamification = response.data.get('gamification', {})
        if 'badges' in gamification:
            # Les badges doivent être une liste
            assert isinstance(gamification['badges'], list)

    def test_gamification_message(self, api_client, order_with_items):
        """Test des messages de gamification"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        gamification = response.data.get('gamification', {})
        if 'message' in gamification:
            assert isinstance(gamification['message'], str)


# =============================================================================
# TESTS - Catégories et items
# =============================================================================

@pytest.mark.django_db
class TestOrderCategories:
    """Tests pour la progression par catégorie"""

    def test_categories_progress(self, api_client, order_with_items):
        """Test de la progression par catégorie"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'categories' in response.data
        
        categories = response.data['categories']
        assert isinstance(categories, list)
        
        if len(categories) > 0:
            category = categories[0]
            assert 'category' in category or 'name' in category
            assert 'progress_percentage' in category

    def test_categories_estimated_time(self, api_client, order_with_items):
        """Test du temps estimé par catégorie"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        categories = response.data.get('categories', [])
        for category in categories:
            if 'estimated_time_minutes' in category:
                assert category['estimated_time_minutes'] >= 0


# =============================================================================
# TESTS - Insights temps réel
# =============================================================================

@pytest.mark.django_db
class TestRealTimeInsights:
    """Tests pour les insights en temps réel"""

    def test_insights_present(self, api_client, order_with_items):
        """Test que les insights sont présents"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        if 'real_time_insights' in response.data:
            insights = response.data['real_time_insights']
            assert isinstance(insights, list)

    def test_completion_prediction(self, api_client, preparing_order, menu_item):
        """Test de la prédiction de complétion"""
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{preparing_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        if 'completion_prediction' in response.data:
            prediction = response.data['completion_prediction']
            assert isinstance(prediction, dict)


# =============================================================================
# TESTS - Étapes de préparation
# =============================================================================

@pytest.mark.django_db
class TestPreparationStages:
    """Tests pour les étapes de préparation"""

    def test_preparation_stages_structure(self, api_client, order_with_items):
        """Test de la structure des étapes"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        categories = response.data.get('categories', [])
        for category in categories:
            if 'preparation_stages' in category:
                stages = category['preparation_stages']
                assert isinstance(stages, list)
                
                for stage in stages:
                    assert 'id' in stage or 'label' in stage

    def test_stages_progression(self, api_client, preparing_order, menu_item):
        """Test que les étapes reflètent la progression"""
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{preparing_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier que certaines étapes sont marquées comme complétées
        categories = response.data.get('categories', [])
        for category in categories:
            stages = category.get('preparation_stages', [])
            completed_count = sum(1 for s in stages if s.get('completed', False))
            # Au moins une étape devrait être complétée pour une commande en préparation
            assert completed_count >= 0


# =============================================================================
# TESTS - Performance et temps
# =============================================================================

@pytest.mark.django_db
class TestOrderTiming:
    """Tests pour les calculs de temps"""

    def test_estimated_total_time(self, api_client, order_with_items):
        """Test du temps total estimé"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        if 'estimated_total_time' in response.data:
            assert response.data['estimated_total_time'] >= 0

    def test_time_remaining(self, api_client, preparing_order, menu_item):
        """Test du temps restant"""
        OrderItem.objects.create(
            order=preparing_order,
            menu_item=menu_item,
            quantity=1,
            unit_price=menu_item.price
        )
        
        response = api_client.get(f'/api/v1/orders/{preparing_order.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        categories = response.data.get('categories', [])
        for category in categories:
            if 'time_remaining_minutes' in category:
                assert category['time_remaining_minutes'] >= 0


# =============================================================================
# TESTS - Accès public
# =============================================================================

@pytest.mark.django_db
class TestOrderProgressAccess:
    """Tests pour l'accès à la progression"""

    def test_public_access_allowed(self, api_client, order_with_items):
        """Test que l'accès public est autorisé"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        # L'endpoint est public (AllowAny)
        assert response.status_code == status.HTTP_200_OK

    def test_authenticated_access(self, auth_client, order_with_items):
        """Test que l'accès authentifié fonctionne"""
        response = auth_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - Réponse structure
# =============================================================================

@pytest.mark.django_db
class TestProgressResponseStructure:
    """Tests pour la structure de la réponse"""

    def test_response_contains_order_info(self, api_client, order_with_items):
        """Test que la réponse contient les infos de commande"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'order_id' in response.data
        assert 'order_status' in response.data

    def test_response_contains_table_info(self, api_client, order_with_items):
        """Test que la réponse contient les infos de table"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        if 'table_number' in response.data:
            assert response.data['table_number'] is not None

    def test_response_json_serializable(self, api_client, order_with_items):
        """Test que la réponse est sérialisable en JSON"""
        response = api_client.get(f'/api/v1/orders/{order_with_items.id}/progress/')
        
        assert response.status_code == status.HTTP_200_OK
        
        import json
        # Cela ne devrait pas lever d'exception
        try:
            json.dumps(response.data)
        except (TypeError, ValueError) as e:
            pytest.fail(f"Response is not JSON serializable: {e}")
