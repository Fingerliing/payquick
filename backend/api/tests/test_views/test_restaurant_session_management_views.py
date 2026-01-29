# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de gestion des sessions restaurant
(restaurant_session_management_views.py)

Couverture:
- RestaurantSessionManagementViewSet
  - active_sessions (GET)
  - release_table (POST)
  - bulk_archive (POST)
  - table_status (GET)
  - archived_sessions (GET)

IMPORTANT - Model field notes:
- Table: Use 'number' field (not 'identifiant' which is a read-only property)
- Restaurant: Requires city, zip_code, phone, email, cuisine
- CollaborativeTableSession: Uses table FK and table_number CharField
- CollaborativeTableSession.objects excludes archived sessions by default
- Use CollaborativeTableSession.all_objects to include archived sessions
"""

import pytest
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
    CollaborativeTableSession,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Unauthenticated API client"""
    return APIClient()


@pytest.fixture
def restaurateur_user(db):
    """Restaurateur user with group"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="session_manager@example.com",
        email="session_manager@example.com",
        password="testpass123"
    )
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    """Restaurateur profile"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_123",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurateur_client(restaurateur_user):
    """Authenticated restaurateur client"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(restaurateur_profile):
    """Test restaurant with all required fields"""
    return Restaurant.objects.create(
        name="Session Test Resto",
        description="Restaurant pour tests de sessions",
        address="123 Rue des Sessions",
        city="Paris",
        zip_code="75001",
        phone="0123456789",
        email="sessions@resto.fr",
        cuisine="french",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def second_restaurant(restaurateur_profile):
    """Second test restaurant for the same owner"""
    return Restaurant.objects.create(
        name="Second Session Resto",
        description="Deuxième restaurant",
        address="456 Rue Autre",
        city="Lyon",
        zip_code="69001",
        phone="0456789012",
        email="second@resto.fr",
        cuisine="italian",
        owner=restaurateur_profile,
        siret="11111111111111",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    """
    Test table.
    NOTE: 'identifiant' is a read-only property. Use 'number' field.
    """
    return Table.objects.create(
        restaurant=restaurant,
        number="1",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def second_table(restaurant):
    """Second test table"""
    return Table.objects.create(
        restaurant=restaurant,
        number="2",
        capacity=6,
        is_active=True
    )


@pytest.fixture
def multiple_tables(restaurant):
    """Multiple tables for a restaurant"""
    tables = []
    for i in range(1, 6):
        tables.append(Table.objects.create(
            restaurant=restaurant,
            number=str(i),
            capacity=4,
            is_active=True
        ))
    return tables


@pytest.fixture
def active_session(restaurant, table):
    """Active collaborative session"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number=table.number,
        status='active',
        is_archived=False
    )


@pytest.fixture
def locked_session(restaurant, second_table):
    """Locked collaborative session"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=second_table,
        table_number=second_table.number,
        status='locked',
        is_archived=False
    )


@pytest.fixture
def payment_session(restaurant, table):
    """Session in payment status"""
    # Create a new table for payment session to avoid conflicts
    payment_table = Table.objects.create(
        restaurant=restaurant,
        number="99",
        capacity=4,
        is_active=True
    )
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=payment_table,
        table_number=payment_table.number,
        status='payment',
        is_archived=False
    )


@pytest.fixture
def archived_session(restaurant, table):
    """
    Archived collaborative session.
    NOTE: Use all_objects to create archived sessions since default manager excludes them.
    """
    session = CollaborativeTableSession.all_objects.create(
        restaurant=restaurant,
        table=table,
        table_number=table.number,
        status='completed',
        is_archived=True,
        archived_at=timezone.now() - timedelta(days=5)
    )
    return session


@pytest.fixture
def other_restaurateur(db):
    """Another restaurateur user and profile"""
    other_user = User.objects.create_user(
        username="other_owner@example.com",
        email="other_owner@example.com",
        password="testpass123"
    )
    group, _ = Group.objects.get_or_create(name="restaurateur")
    other_user.groups.add(group)
    
    return RestaurateurProfile.objects.create(
        user=other_user,
        siret="99999999999999",
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def other_user_restaurant(other_restaurateur):
    """Restaurant belonging to another user"""
    return Restaurant.objects.create(
        name="Other Owner Restaurant",
        address="789 Rue Ailleurs",
        city="Marseille",
        zip_code="13001",
        phone="0491234567",
        email="other@resto.fr",
        cuisine="asian",
        owner=other_restaurateur,
        siret="88888888888888",
        is_active=True
    )


# =============================================================================
# TESTS - active_sessions
# =============================================================================

@pytest.mark.django_db
class TestActiveSessions:
    """Tests pour l'endpoint active_sessions"""

    def test_get_active_sessions_success(self, restaurateur_client, restaurant, active_session, locked_session):
        """Test récupération des sessions actives"""
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'count' in response.data
        assert 'by_restaurant' in response.data
        assert response.data['count'] == 2

    def test_get_active_sessions_includes_payment_status(
        self, restaurateur_client, restaurant, active_session, payment_session
    ):
        """Test que les sessions en status 'payment' sont incluses"""
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2

    def test_get_active_sessions_grouped_by_restaurant(
        self, restaurateur_client, restaurant, second_restaurant, table
    ):
        """Test que les sessions sont groupées par restaurant"""
        # Créer une session pour le premier restaurant
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        # Créer une table et session pour le second restaurant
        table2 = Table.objects.create(restaurant=second_restaurant, number="1")
        CollaborativeTableSession.objects.create(
            restaurant=second_restaurant,
            table=table2,
            table_number=table2.number,
            status='active'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert restaurant.name in response.data['by_restaurant']
        assert second_restaurant.name in response.data['by_restaurant']

    def test_get_active_sessions_excludes_archived(
        self, restaurateur_client, restaurant, table
    ):
        """Test que les sessions archivées sont exclues"""
        # Créer une session active (non archivée)
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active',
            is_archived=False
        )
        
        # Créer une session archivée (avec all_objects car le manager par défaut les exclut)
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active',
            is_archived=True,
            archived_at=timezone.now()
        )
        
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        # Seule la session active (non archivée) doit être comptée
        assert response.data['count'] == 1

    def test_get_active_sessions_excludes_completed_and_cancelled(
        self, restaurateur_client, restaurant, table, second_table
    ):
        """Test que les sessions completed/cancelled sont exclues"""
        # Session active - incluse
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        # Session completed - exclue
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=second_table,
            table_number=second_table.number,
            status='completed'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1

    def test_get_active_sessions_no_restaurants(self, db):
        """Test sans restaurants associés (utilisateur sans profil restaurateur)"""
        # Créer un utilisateur sans profil restaurateur
        user = User.objects.create_user(
            username="no_resto@example.com",
            email="no_resto@example.com",
            password="testpass123"
        )
        token = RefreshToken.for_user(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = client.get(url)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'error' in response.data

    def test_get_active_sessions_empty(self, restaurateur_client, restaurant):
        """Test avec aucune session active"""
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 0
        assert response.data['by_restaurant'] == {}

    def test_get_active_sessions_unauthenticated(self, api_client):
        """Test accès non authentifié"""
        url = "/api/v1/restaurants/sessions/sessions/active_sessions/"
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - release_table
# =============================================================================

@pytest.mark.django_db
class TestReleaseTable:
    """Tests pour l'endpoint release_table"""

    def test_release_table_success(self, restaurateur_client, restaurant, table, active_session):
        """Test libération d'une table avec succès"""
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {
            'table_id': table.id,
            'reason': 'Client parti'
        }
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'archived_sessions' in response.data
        assert response.data['archived_sessions'] == 1
        assert response.data['table_number'] == table.number
        
        # Vérifier que la session est archivée (utiliser all_objects)
        updated_session = CollaborativeTableSession.all_objects.get(id=active_session.id)
        assert updated_session.is_archived is True
        assert updated_session.status == 'cancelled'

    def test_release_table_multiple_sessions(
        self, restaurateur_client, restaurant, table
    ):
        """Test libération d'une table avec plusieurs sessions"""
        # Créer plusieurs sessions sur la même table
        for i in range(3):
            CollaborativeTableSession.objects.create(
                restaurant=restaurant,
                table=table,
                table_number=table.number,
                status='active' if i == 0 else 'locked',
                is_archived=False
            )
        
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': table.id}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['archived_sessions'] == 3
        assert len(response.data['sessions']) == 3

    def test_release_table_with_custom_reason(
        self, restaurateur_client, restaurant, table, active_session
    ):
        """Test libération avec raison personnalisée"""
        custom_reason = "Fermeture exceptionnelle"
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {
            'table_id': table.id,
            'reason': custom_reason
        }
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK

    def test_release_table_missing_table_id(self, restaurateur_client):
        """Test sans table_id"""
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'reason': 'Test'}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data
        assert 'table_id' in response.data['error']

    def test_release_table_not_found(self, restaurateur_client):
        """Test avec table inexistante"""
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': 99999}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_release_table_unauthorized(self, restaurateur_client, other_user_restaurant):
        """Test libération d'une table d'un autre restaurant"""
        other_table = Table.objects.create(
            restaurant=other_user_restaurant,
            number="1"
        )
        
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': other_table.id}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_release_table_no_active_sessions(self, restaurateur_client, restaurant, table):
        """Test libération d'une table sans sessions actives"""
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': table.id}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['archived_sessions'] == 0
        assert response.data['sessions'] == []

    def test_release_table_skips_already_archived(
        self, restaurateur_client, restaurant, table
    ):
        """Test que les sessions déjà archivées ne sont pas retraitées"""
        # Créer une session archivée
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now()
        )
        
        # Créer une session active
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active',
            is_archived=False
        )
        
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': table.id}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        # Seule la session non archivée devrait être comptée
        assert response.data['archived_sessions'] == 1


# =============================================================================
# TESTS - bulk_archive
# =============================================================================

@pytest.mark.django_db
class TestBulkArchive:
    """Tests pour l'endpoint bulk_archive"""

    def test_bulk_archive_success(
        self, restaurateur_client, restaurant, table, second_table
    ):
        """Test archivage en masse avec succès"""
        session1 = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        session2 = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=second_table,
            table_number=second_table.number,
            status='locked'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {
            'session_ids': [str(session1.id), str(session2.id)],
            'reason': 'Fin de service'
        }
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_archived'] == 2
        assert response.data['total_requested'] == 2
        assert len(response.data['results']) == 2

    def test_bulk_archive_changes_status_to_cancelled(
        self, restaurateur_client, restaurant, table
    ):
        """Test que le status passe à 'cancelled' si actif/locked"""
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': [str(session.id)]}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier le statut
        updated_session = CollaborativeTableSession.all_objects.get(id=session.id)
        assert updated_session.status == 'cancelled'
        assert updated_session.is_archived is True

    def test_bulk_archive_keeps_completed_status(
        self, restaurateur_client, restaurant, table
    ):
        """Test que le status 'completed' est conservé"""
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': [str(session.id)]}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier le statut conservé
        updated_session = CollaborativeTableSession.all_objects.get(id=session.id)
        assert updated_session.status == 'completed'

    def test_bulk_archive_empty_list(self, restaurateur_client):
        """Test avec liste vide"""
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': []}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_archive_missing_session_ids(self, restaurateur_client):
        """Test sans session_ids"""
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'reason': 'Test'}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_archive_unauthorized_sessions(
        self, restaurateur_client, other_user_restaurant
    ):
        """Test archivage de sessions non autorisées (tout refusé)"""
        other_table = Table.objects.create(
            restaurant=other_user_restaurant,
            number="1"
        )
        other_session = CollaborativeTableSession.objects.create(
            restaurant=other_user_restaurant,
            table=other_table,
            table_number=other_table.number,
            status='active'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': [str(other_session.id)]}
        
        response = restaurateur_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_bulk_archive_mixed_authorization(
        self, restaurateur_client, restaurant, table, other_user_restaurant
    ):
        """Test avec sessions mixtes (autorisées et non autorisées)"""
        # Session autorisée
        my_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        # Session non autorisée
        other_table = Table.objects.create(
            restaurant=other_user_restaurant,
            number="1"
        )
        other_session = CollaborativeTableSession.objects.create(
            restaurant=other_user_restaurant,
            table=other_table,
            table_number=other_table.number,
            status='active'
        )
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': [str(my_session.id), str(other_session.id)]}
        
        response = restaurateur_client.post(url, data, format='json')
        
        # Devrait réussir mais n'archiver que la session autorisée
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_archived'] == 1
        assert response.data['total_requested'] == 2

    def test_bulk_archive_nonexistent_sessions(
        self, restaurateur_client, restaurant, table
    ):
        """Test avec des IDs de sessions inexistantes"""
        # Créer une session valide
        valid_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        # UUID inexistant
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': [str(valid_session.id), fake_uuid]}
        
        response = restaurateur_client.post(url, data, format='json')
        
        # Devrait archiver la session valide et ignorer l'inexistante
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_archived'] == 1


# =============================================================================
# TESTS - table_status
# =============================================================================

@pytest.mark.django_db
class TestTableStatus:
    """Tests pour l'endpoint table_status"""

    def test_get_table_status_success(
        self, restaurateur_client, restaurant, multiple_tables
    ):
        """Test récupération du statut des tables"""
        # Créer une session sur la première table
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=multiple_tables[0],
            table_number=multiple_tables[0].number,
            status='active'
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['restaurant_name'] == restaurant.name
        assert response.data['total_tables'] == 5
        assert response.data['occupied_tables'] == 1
        assert response.data['free_tables'] == 4
        assert 'tables' in response.data
        assert len(response.data['tables']) == 5

    def test_get_table_status_shows_occupied(
        self, restaurateur_client, restaurant, table, active_session
    ):
        """Test que les tables occupées sont correctement identifiées"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Trouver la table dans la réponse
        table_data = next(
            (t for t in response.data['tables'] if t['table_number'] == table.number),
            None
        )
        assert table_data is not None
        assert table_data['is_occupied'] is True
        assert table_data['active_session'] is not None
        assert table_data['active_session']['share_code'] == active_session.share_code
        assert table_data['active_session']['status'] == 'active'

    def test_get_table_status_free_table(
        self, restaurateur_client, restaurant, table
    ):
        """Test qu'une table libre a active_session à None"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        table_data = next(
            (t for t in response.data['tables'] if t['table_number'] == table.number),
            None
        )
        assert table_data is not None
        assert table_data['is_occupied'] is False
        assert table_data['active_session'] is None

    def test_get_table_status_missing_restaurant_id(self, restaurateur_client):
        """Test sans restaurant_id"""
        url = "/api/v1/restaurants/sessions/sessions/table_status/"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_get_table_status_unauthorized(self, restaurateur_client, other_user_restaurant):
        """Test accès à un restaurant non autorisé"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={other_user_restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_table_status_restaurant_not_found(self, restaurateur_client):
        """Test avec restaurant inexistant"""
        url = "/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id=99999"
        
        response = restaurateur_client.get(url)
        
        # 403 car permission check échoue avant la vérification d'existence
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_table_status_all_free(self, restaurateur_client, restaurant, multiple_tables):
        """Test avec toutes les tables libres"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['occupied_tables'] == 0
        assert response.data['free_tables'] == 5

    def test_get_table_status_all_occupied(
        self, restaurateur_client, restaurant, multiple_tables
    ):
        """Test avec toutes les tables occupées"""
        for t in multiple_tables:
            CollaborativeTableSession.objects.create(
                restaurant=restaurant,
                table=t,
                table_number=t.number,
                status='active'
            )
        
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['occupied_tables'] == 5
        assert response.data['free_tables'] == 0

    def test_get_table_status_excludes_archived_sessions(
        self, restaurateur_client, restaurant, table
    ):
        """Test que les sessions archivées ne comptent pas comme occupées"""
        # Créer une session archivée
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active',
            is_archived=True,
            archived_at=timezone.now()
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        table_data = next(
            (t for t in response.data['tables'] if t['table_number'] == table.number),
            None
        )
        assert table_data['is_occupied'] is False

    def test_get_table_status_shows_capacity(
        self, restaurateur_client, restaurant, table
    ):
        """Test que la capacité des tables est incluse"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        table_data = response.data['tables'][0]
        assert 'capacity' in table_data
        assert table_data['capacity'] == table.capacity


# =============================================================================
# TESTS - archived_sessions
# =============================================================================

@pytest.mark.django_db
class TestArchivedSessions:
    """Tests pour l'endpoint archived_sessions"""

    def test_get_archived_sessions_success(
        self, restaurateur_client, restaurant, table
    ):
        """Test récupération des sessions archivées"""
        # Créer une session archivée
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=5)
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'count' in response.data
        assert 'sessions' in response.data
        assert 'period_days' in response.data
        assert response.data['count'] == 1

    def test_get_archived_sessions_default_30_days(
        self, restaurateur_client, restaurant, table
    ):
        """Test filtre par défaut de 30 jours"""
        # Session archivée il y a 10 jours (incluse)
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=10)
        )
        
        # Session archivée il y a 40 jours (exclue)
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=40)
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['period_days'] == 30
        assert response.data['count'] == 1

    def test_get_archived_sessions_with_days_filter(
        self, restaurateur_client, restaurant, table
    ):
        """Test avec filtre de jours personnalisé"""
        # Session archivée il y a 10 jours
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=10)
        )
        
        # Demander les 5 derniers jours seulement
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}&days=5"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['period_days'] == 5
        assert response.data['count'] == 0  # La session il y a 10 jours est exclue

    def test_get_archived_sessions_ordered_by_archived_at(
        self, restaurateur_client, restaurant, table
    ):
        """Test que les sessions sont ordonnées par date d'archivage (récent d'abord)"""
        # Session archivée il y a 10 jours
        older = CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=10)
        )
        
        # Session archivée il y a 2 jours
        newer = CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now() - timedelta(days=2)
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2
        # Le premier devrait être le plus récent
        assert response.data['sessions'][0]['id'] == str(newer.id)

    def test_get_archived_sessions_missing_restaurant_id(self, restaurateur_client):
        """Test sans restaurant_id"""
        url = "/api/v1/restaurants/sessions/sessions/archived_sessions/"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_archived_sessions_unauthorized(
        self, restaurateur_client, other_user_restaurant
    ):
        """Test accès non autorisé"""
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={other_user_restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_archived_sessions_empty(self, restaurateur_client, restaurant):
        """Test sans sessions archivées"""
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 0
        assert response.data['sessions'] == []

    def test_get_archived_sessions_excludes_non_archived(
        self, restaurateur_client, restaurant, table
    ):
        """Test que les sessions non archivées sont exclues"""
        # Session active (non archivée)
        CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active',
            is_archived=False
        )
        
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 0


# =============================================================================
# TESTS - Permissions staff
# =============================================================================

@pytest.mark.django_db
class TestStaffPermissions:
    """Tests des permissions staff"""

    def test_staff_can_access_any_restaurant_table_status(
        self, db, restaurant, table, active_session
    ):
        """Test qu'un admin peut accéder au statut des tables de n'importe quel restaurant"""
        staff_user = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="adminpass",
            is_staff=True
        )
        
        token = RefreshToken.for_user(staff_user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        response = client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['restaurant_name'] == restaurant.name

    def test_staff_can_release_any_table(
        self, db, restaurant, table, active_session
    ):
        """Test qu'un admin peut libérer n'importe quelle table"""
        staff_user = User.objects.create_user(
            username="admin2@example.com",
            email="admin2@example.com",
            password="adminpass",
            is_staff=True
        )
        
        token = RefreshToken.for_user(staff_user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': table.id}
        
        response = client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['archived_sessions'] == 1

    def test_staff_can_view_archived_sessions(
        self, db, restaurant, table
    ):
        """Test qu'un admin peut voir les sessions archivées de n'importe quel restaurant"""
        # Créer une session archivée
        CollaborativeTableSession.all_objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='completed',
            is_archived=True,
            archived_at=timezone.now()
        )
        
        staff_user = User.objects.create_user(
            username="admin3@example.com",
            email="admin3@example.com",
            password="adminpass",
            is_staff=True
        )
        
        token = RefreshToken.for_user(staff_user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        response = client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1


# =============================================================================
# TESTS - Edge cases
# =============================================================================

@pytest.mark.django_db
class TestEdgeCases:
    """Tests des cas limites"""

    def test_release_table_unauthenticated(self, api_client, table):
        """Test libération de table sans authentification"""
        url = "/api/v1/restaurants/sessions/sessions/release_table/"
        data = {'table_id': table.id}
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_bulk_archive_unauthenticated(self, api_client):
        """Test archivage en masse sans authentification"""
        url = "/api/v1/restaurants/sessions/sessions/bulk_archive/"
        data = {'session_ids': ['some-uuid']}
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_table_status_unauthenticated(self, api_client, restaurant):
        """Test statut des tables sans authentification"""
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_archived_sessions_unauthenticated(self, api_client, restaurant):
        """Test sessions archivées sans authentification"""
        url = f"/api/v1/restaurants/sessions/sessions/archived_sessions/?restaurant_id={restaurant.id}"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_session_with_participants_count(
        self, restaurateur_client, restaurant, table
    ):
        """Test que le participant_count est correctement retourné"""
        from api.models import SessionParticipant
        
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number=table.number,
            status='active'
        )
        
        # Créer des participants
        user1 = User.objects.create_user(username="p1@test.com", password="test")
        user2 = User.objects.create_user(username="p2@test.com", password="test")
        
        SessionParticipant.objects.create(session=session, user=user1, status='active')
        SessionParticipant.objects.create(session=session, user=user2, status='active')
        
        url = f"/api/v1/restaurants/sessions/sessions/table_status/?restaurant_id={restaurant.id}"
        response = restaurateur_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        table_data = next(
            (t for t in response.data['tables'] if t['table_number'] == table.number),
            None
        )
        assert table_data['active_session']['participant_count'] == 2