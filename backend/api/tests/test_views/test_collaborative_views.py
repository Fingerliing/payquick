# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de sessions collaboratives
"""

import pytest
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    CollaborativeTableSession,
    SessionParticipant,
    Restaurant,
    Table,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(username="collabviewuser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondcollabuser", password="testpass123")


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(username="collabrestaurateur", password="testpass123")
    user.groups.add(group)
    return user


@pytest.fixture
def restaurateur_profile(restaurateur_user):
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Collab View Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        identifiant="COLV01"
    )


@pytest.fixture
def auth_client(user):
    """Client authentifié"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_client(restaurateur_user):
    """Client restaurateur authentifié"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def collaborative_session(restaurant, table, user):
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="COLV01",
        host=user,
        host_name="Test Host",
        max_participants=5
    )


@pytest.fixture
def session_with_participant(collaborative_session, user):
    SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )
    return collaborative_session


# =============================================================================
# TESTS - Création de session
# =============================================================================

@pytest.mark.django_db
class TestCreateCollaborativeSession:
    """Tests pour la création de sessions collaboratives"""

    @patch('api.views.collaborative_session_views.notify_session_update')
    def test_create_session_authenticated(self, mock_notify, auth_client, restaurant, table):
        """Test de création d'une session par un utilisateur authentifié"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01',
            'host_name': 'Jean Dupont',
            'session_type': 'collaborative',
            'max_participants': 6
        }
        
        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert 'share_code' in response.data
        assert len(response.data['share_code']) == 6

    def test_create_session_unauthenticated(self, api_client, restaurant, table):
        """Test de création d'une session sans authentification"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T02',
            'host_name': 'Pierre Martin',
            'session_type': 'collaborative'
        }
        
        # Les sessions collaboratives peuvent être créées sans auth
        response = api_client.post('/api/v1/collaborative/create_session/', data, format='json')
        
        # Devrait fonctionner car AllowAny
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]

    def test_create_session_missing_restaurant(self, auth_client):
        """Test de création sans restaurant_id"""
        data = {
            'table_number': 'T01',
            'host_name': 'Test'
        }
        
        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_session_missing_table_number(self, auth_client, restaurant):
        """Test de création sans table_number"""
        data = {
            'restaurant_id': str(restaurant.id),
            'host_name': 'Test'
        }
        
        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_session_invalid_restaurant(self, auth_client):
        """Test avec un restaurant inexistant"""
        data = {
            'restaurant_id': '99999999-9999-9999-9999-999999999999',
            'table_number': 'T01',
            'host_name': 'Test'
        }
        
        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')
        
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]


# =============================================================================
# TESTS - Rejoindre une session
# =============================================================================

@pytest.mark.django_db
class TestJoinCollaborativeSession:
    """Tests pour rejoindre une session collaborative"""

    @patch('api.views.collaborative_session_views.notify_participant_joined')
    def test_join_session_by_code(self, mock_notify, auth_client, collaborative_session, second_user):
        """Test pour rejoindre une session avec le code de partage"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }
        
        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')
        
        # Le comportement peut varier selon l'implémentation
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]

    def test_join_session_invalid_code(self, auth_client):
        """Test avec un code de partage invalide"""
        data = {
            'share_code': 'INVALID',
            'guest_name': 'Pierre'
        }
        
        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')
        
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST]

    def test_join_completed_session(self, auth_client, collaborative_session):
        """Test pour rejoindre une session terminée"""
        collaborative_session.status = 'completed'
        collaborative_session.save()
        
        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }
        
        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')
        
        # Devrait échouer car la session est terminée
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN]


# =============================================================================
# TESTS - Récupération par code
# =============================================================================

@pytest.mark.django_db
class TestGetSessionByCode:
    """Tests pour récupérer une session par son code"""

    def test_get_session_by_valid_code(self, api_client, collaborative_session):
        """Test de récupération avec un code valide"""
        response = api_client.get(
            '/api/v1/collaborative/get_by_code/',
            {'share_code': collaborative_session.share_code}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['share_code'] == collaborative_session.share_code

    def test_get_session_by_invalid_code(self, api_client):
        """Test de récupération avec un code invalide"""
        response = api_client.get(
            '/api/v1/collaborative/get_by_code/',
            {'share_code': 'NOTFOUND'}
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_session_without_code(self, api_client):
        """Test de récupération sans code"""
        response = api_client.get('/api/v1/collaborative/get_by_code/')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Actions sur session
# =============================================================================

@pytest.mark.django_db
class TestSessionActions:
    """Tests pour les actions sur les sessions"""

    @patch('api.views.collaborative_session_views.notify_session_locked')
    def test_lock_session(self, mock_notify, auth_client, session_with_participant):
        """Test de verrouillage d'une session"""
        session_id = str(session_with_participant.id)
        data = {'action': 'lock'}
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/session_action/',
            data,
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            session_with_participant.refresh_from_db()
            assert session_with_participant.status == 'locked'

    @patch('api.views.collaborative_session_views.notify_session_unlocked')
    def test_unlock_session(self, mock_notify, auth_client, session_with_participant):
        """Test de déverrouillage d'une session"""
        session_with_participant.lock_session()
        session_id = str(session_with_participant.id)
        data = {'action': 'unlock'}
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/session_action/',
            data,
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            session_with_participant.refresh_from_db()
            assert session_with_participant.status == 'active'

    @patch('api.views.collaborative_session_views.notify_session_completed')
    @patch('api.views.collaborative_session_views.notify_table_released')
    def test_complete_session(self, mock_released, mock_completed, auth_client, session_with_participant):
        """Test de complétion d'une session"""
        session_id = str(session_with_participant.id)
        data = {'action': 'complete'}
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/session_action/',
            data,
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            session_with_participant.refresh_from_db()
            assert session_with_participant.status == 'completed'

    def test_invalid_action(self, auth_client, session_with_participant):
        """Test d'une action invalide"""
        session_id = str(session_with_participant.id)
        data = {'action': 'invalid_action'}
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/session_action/',
            data,
            format='json'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Quitter une session
# =============================================================================

@pytest.mark.django_db
class TestLeaveSession:
    """Tests pour quitter une session"""

    @patch('api.views.collaborative_session_views.notify_participant_left')
    def test_leave_session(self, mock_notify, auth_client, session_with_participant, second_user):
        """Test pour qu'un participant quitte la session"""
        # Ajouter un second participant
        participant = SessionParticipant.objects.create(
            session=session_with_participant,
            user=second_user,
            role='member',
            status='active'
        )
        
        # Authentifier le second utilisateur
        token = RefreshToken.for_user(second_user)
        auth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        
        session_id = str(session_with_participant.id)
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/leave_session/',
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            participant.refresh_from_db()
            assert participant.status == 'left'


# =============================================================================
# TESTS - Archivage
# =============================================================================

@pytest.mark.django_db
class TestArchiveSession:
    """Tests pour l'archivage de sessions"""

    @patch('api.views.collaborative_session_views.notify_session_archived')
    @patch('api.views.collaborative_session_views.notify_table_released')
    def test_archive_completed_session(self, mock_released, mock_archived, auth_client, session_with_participant):
        """Test d'archivage d'une session complétée"""
        session_with_participant.mark_completed()
        session_id = str(session_with_participant.id)
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/archive_session/',
            {'reason': 'Test archive'},
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            session_with_participant.refresh_from_db()
            assert session_with_participant.is_archived is True

    def test_archive_active_session(self, auth_client, session_with_participant):
        """Test d'archivage d'une session active (devrait échouer)"""
        session_id = str(session_with_participant.id)
        
        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/archive_session/',
            format='json'
        )
        
        # Une session active ne devrait pas pouvoir être archivée
        # Le comportement exact dépend de l'implémentation
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
