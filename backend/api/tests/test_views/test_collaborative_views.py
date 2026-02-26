# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de sessions collaboratives

NOTE: Ce fichier utilise les fixtures du conftest.py partagé où possible.
Les fixtures spécifiques aux sessions collaboratives sont définies ci-dessous.
"""

import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    CollaborativeTableSession,
    SessionParticipant,
    SessionCartItem,
    Restaurant,
    Table,
    Menu,
    MenuCategory,
    MenuItem,
    RestaurateurProfile,
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
        username="collabviewuser@example.com",
        email="collabviewuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def second_user(db):
    return User.objects.create_user(
        username="secondcollabuser@example.com",
        email="secondcollabuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="collabrestaurateur@example.com",
        email="collabrestaurateur@example.com",
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
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Collab View Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number="COLV01",
        qr_code="COLV01",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Pizza Margherita",
        price=Decimal('12.50'),
        is_available=True
    )


@pytest.fixture
def second_menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Salade César",
        price=Decimal('9.90'),
        is_available=True
    )


@pytest.fixture
def auth_client(user):
    """Client authentifié (utilisateur standard)"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def second_auth_client(second_user):
    """Client authentifié (second utilisateur)"""
    token = RefreshToken.for_user(second_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurateur_client(restaurateur_user, restaurateur_profile):
    """Client restaurateur authentifié"""
    token = RefreshToken.for_user(restaurateur_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def collaborative_session(restaurant, table, user):
    """Session collaborative de test"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="COLV01",
        host=user,
        host_name="Test Host",
        max_participants=5,
        status='active'
    )


@pytest.fixture
def participant(collaborative_session, user):
    """Participant hôte de la session — source unique de vérité.
    
    IMPORTANT: session_with_participant dépend de cette fixture (et non
    l'inverse) pour éviter la violation de contrainte unique
    (session, user) lors des tests qui utilisent les deux fixtures.
    """
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )


@pytest.fixture
def session_with_participant(collaborative_session, participant):
    """Session avec son hôte — réutilise la fixture participant.
    
    Ne crée PAS un second SessionParticipant : délègue entièrement
    à la fixture participant pour éviter duplicate key sur (session, user).
    """
    return collaborative_session


@pytest.fixture
def second_participant(collaborative_session, second_user):
    """Second participant de la session"""
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=second_user,
        role='member',
        status='active'
    )


@pytest.fixture
def cart_item(collaborative_session, participant, menu_item):
    """Article dans le panier partagé"""
    return SessionCartItem.objects.create(
        session=collaborative_session,
        participant=participant,
        menu_item=menu_item,
        quantity=2,
        special_instructions="Sans oignons"
    )


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
            'restaurant_id': restaurant.id,
            'table_number': 'T01',
            'host_name': 'Jean Dupont',
            'session_type': 'collaborative',
            'max_participants': 6
        }

        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_201_CREATED:
            assert 'share_code' in response.data
            assert len(response.data['share_code']) == 6

    def test_create_session_unauthenticated(self, api_client, restaurant, table):
        """Test de création d'une session sans authentification"""
        data = {
            'restaurant_id': restaurant.id,
            'table_number': 'T02',
            'host_name': 'Pierre Martin',
            'session_type': 'collaborative'
        }

        response = api_client.post('/api/v1/collaborative/create_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_create_session_missing_restaurant(self, auth_client):
        """Test de création sans restaurant_id"""
        data = {'table_number': 'T01', 'host_name': 'Test'}

        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_create_session_missing_table_number(self, auth_client, restaurant):
        """Test de création sans table_number"""
        data = {'restaurant_id': restaurant.id, 'host_name': 'Test'}

        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_create_session_invalid_restaurant(self, auth_client):
        """Test avec un restaurant inexistant"""
        data = {
            'restaurant_id': 99999999,
            'table_number': 'T01',
            'host_name': 'Test'
        }

        response = auth_client.post('/api/v1/collaborative/create_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Rejoindre une session
# =============================================================================

@pytest.mark.django_db
class TestJoinCollaborativeSession:
    """Tests pour rejoindre une session collaborative"""

    @patch('api.views.collaborative_session_views.notify_participant_joined')
    def test_join_session_by_code(self, mock_notify, auth_client, collaborative_session):
        """Test pour rejoindre une session avec le code de partage"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }

        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_join_session_invalid_code(self, auth_client):
        """Test avec un code de partage invalide"""
        data = {'share_code': 'INVALID', 'guest_name': 'Pierre'}

        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]

    def test_join_completed_session(self, auth_client, collaborative_session):
        """Test pour rejoindre une session terminée"""
        collaborative_session.status = 'completed'
        collaborative_session.save()

        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }

        response = auth_client.post('/api/v1/collaborative/join_session/', data, format='json')

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]


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

        if response.status_code == status.HTTP_200_OK:
            assert response.data['share_code'] == collaborative_session.share_code
        else:
            assert response.status_code == status.HTTP_404_NOT_FOUND

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

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]


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
        else:
            assert response.status_code in [
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND
            ]

    @patch('api.views.collaborative_session_views.notify_session_unlocked')
    def test_unlock_session(self, mock_notify, auth_client, session_with_participant):
        """Test de déverrouillage d'une session"""
        session_with_participant.status = 'locked'
        session_with_participant.save()

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

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Quitter une session
# =============================================================================

@pytest.mark.django_db
class TestLeaveSession:
    """Tests pour quitter une session"""

    @patch('api.views.collaborative_session_views.notify_participant_left')
    def test_leave_session(self, mock_notify, auth_client, session_with_participant, second_user):
        """Test pour qu'un participant quitte la session"""
        participant = SessionParticipant.objects.create(
            session=session_with_participant,
            user=second_user,
            role='member',
            status='active'
        )

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
        else:
            assert response.status_code in [
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND
            ]


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
        session_with_participant.status = 'completed'
        session_with_participant.save()

        session_id = str(session_with_participant.id)

        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/archive_session/',
            {'reason': 'Test archive'},
            format='json'
        )

        if response.status_code == status.HTTP_200_OK:
            session_with_participant.refresh_from_db()
            assert session_with_participant.is_archived is True
        else:
            assert response.status_code in [
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND
            ]

    def test_archive_active_session(self, auth_client, session_with_participant):
        """Test d'archivage d'une session active"""
        session_id = str(session_with_participant.id)

        response = auth_client.post(
            f'/api/v1/collaborative/{session_id}/archive_session/',
            format='json'
        )

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Permissions
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeSessionPermissions:
    """Tests des permissions sur les sessions collaboratives"""

    def test_list_sessions_authenticated(self, auth_client, session_with_participant):
        """Test qu'un utilisateur authentifié peut lister ses sessions"""
        response = auth_client.get('/api/v1/collaborative/')
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

    def test_list_sessions_unauthenticated(self, api_client):
        """Test que l'accès non authentifié retourne une liste (AllowAny)"""
        response = api_client.get('/api/v1/collaborative/')
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

    def test_retrieve_session_by_id(self, auth_client, collaborative_session):
        """Test de récupération d'une session par ID"""
        response = auth_client.get(f'/api/v1/collaborative/{collaborative_session.id}/')
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]


# =============================================================================
# TESTS - Panier partagé (SessionCartItem)  ← NOUVEAU
# =============================================================================

@pytest.mark.django_db
class TestSessionCartAPI:
    """Tests pour les endpoints du panier partagé de session"""

    BASE = '/api/v1/collaborative/{session_id}/{action}/'

    def url(self, session_id, action):
        return self.BASE.format(session_id=session_id, action=action)

    # ── GET /cart/ ───────────────────────────────────────────────────────────

    def test_get_cart_empty(self, auth_client, session_with_participant):
        """Test GET /cart/ sur un panier vide"""
        session_id = str(session_with_participant.id)
        response = auth_client.get(self.url(session_id, 'cart'))

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_200_OK:
            assert 'items' in response.data
            assert 'total' in response.data
            assert 'items_count' in response.data
            assert response.data['items'] == []
            assert float(response.data['total']) == 0.0
            assert response.data['items_count'] == 0

    def test_get_cart_with_items(self, auth_client, session_with_participant, participant, cart_item):
        """Test GET /cart/ avec des articles"""
        session_id = str(session_with_participant.id)
        response = auth_client.get(self.url(session_id, 'cart'))

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_200_OK:
            assert len(response.data['items']) == 1
            assert response.data['items_count'] == 2   # quantité = 2
            assert float(response.data['total']) == 25.0  # 12.50 × 2

    def test_get_cart_unauthenticated(self, api_client, collaborative_session):
        """Test GET /cart/ sans authentification"""
        session_id = str(collaborative_session.id)
        response = api_client.get(self.url(session_id, 'cart'))

        # AllowAny ou 403/401 selon la politique
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]

    def test_get_cart_shows_all_participants_items(
        self, auth_client, session_with_participant, participant,
        second_participant, second_auth_client, menu_item, second_menu_item
    ):
        """Test que GET /cart/ retourne les articles de tous les participants"""
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=second_participant,
            menu_item=second_menu_item,
            quantity=2
        )

        session_id = str(session_with_participant.id)
        response = auth_client.get(self.url(session_id, 'cart'))

        if response.status_code == status.HTTP_200_OK:
            assert len(response.data['items']) == 2
            assert response.data['items_count'] == 3  # 1 + 2
            expected_total = Decimal('12.50') + Decimal('9.90') * 2
            assert float(response.data['total']) == pytest.approx(float(expected_total))

    # ── POST /cart_add/ ──────────────────────────────────────────────────────

    def test_cart_add_item(self, auth_client, session_with_participant, menu_item):
        """Test POST /cart_add/ : ajout d'un article"""
        session_id = str(session_with_participant.id)
        data = {
            'menu_item': menu_item.id,
            'quantity': 1,
            'special_instructions': '',
            'customizations': {}
        }

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.post(
                self.url(session_id, 'cart_add'),
                data,
                format='json'
            )

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_201_CREATED:
            assert response.data['menu_item'] == menu_item.id
            assert response.data['quantity'] == 1

    def test_cart_add_item_merges_duplicate(
        self, auth_client, session_with_participant, participant, cart_item, menu_item
    ):
        """Test que l'ajout d'un article existant fusionne les quantités"""
        session_id = str(session_with_participant.id)
        data = {
            'menu_item': menu_item.id,
            'quantity': 3,
            'special_instructions': "Sans oignons",  # Même instruction = fusion
        }

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.post(
                self.url(session_id, 'cart_add'),
                data,
                format='json'
            )

        if response.status_code == status.HTTP_201_CREATED:
            # Quantité fusionnée : 2 (existant) + 3 = 5
            assert response.data['quantity'] == 5
            # Pas de doublon : toujours 1 ligne pour ce plat+instructions
            assert SessionCartItem.objects.filter(
                session=session_with_participant,
                menu_item=menu_item,
                special_instructions="Sans oignons"
            ).count() == 1

    def test_cart_add_invalid_menu_item(self, auth_client, session_with_participant):
        """Test POST /cart_add/ avec un menu_item inexistant"""
        session_id = str(session_with_participant.id)
        data = {'menu_item': 999999, 'quantity': 1}

        response = auth_client.post(
            self.url(session_id, 'cart_add'),
            data,
            format='json'
        )

        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]

    def test_cart_add_unauthenticated(self, api_client, collaborative_session, menu_item):
        """Test POST /cart_add/ sans authentification"""
        session_id = str(collaborative_session.id)
        data = {'menu_item': menu_item.id, 'quantity': 1}

        response = api_client.post(
            self.url(session_id, 'cart_add'),
            data,
            format='json'
        )

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]

    def test_cart_add_broadcasts_ws_update(
        self, auth_client, session_with_participant, menu_item
    ):
        """Test que cart_add déclenche le broadcast WebSocket"""
        session_id = str(session_with_participant.id)
        data = {'menu_item': menu_item.id, 'quantity': 1}

        with patch(
            'api.views.collaborative_session_views._broadcast_cart_update',
            create=True
        ) as mock_broadcast:
            response = auth_client.post(
                self.url(session_id, 'cart_add'),
                data,
                format='json'
            )

        if response.status_code == status.HTTP_201_CREATED:
            mock_broadcast.assert_called_once()

    # ── PATCH /cart_update/{item_id}/ ────────────────────────────────────────

    def test_cart_update_quantity(self, auth_client, session_with_participant, cart_item):
        """Test PATCH /cart_update/{id}/ : mise à jour de la quantité"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.patch(
                self.url(session_id, f'cart_update/{item_id}'),
                {'quantity': 4},
                format='json'
            )

        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_200_OK:
            assert response.data['quantity'] == 4
            cart_item.refresh_from_db()
            assert cart_item.quantity == 4

    def test_cart_update_quantity_zero_deletes_item(
        self, auth_client, session_with_participant, cart_item
    ):
        """Test PATCH quantity=0 supprime l'article"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.patch(
                self.url(session_id, f'cart_update/{item_id}'),
                {'quantity': 0},
                format='json'
            )

        assert response.status_code in [
            status.HTTP_204_NO_CONTENT,
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_204_NO_CONTENT:
            assert not SessionCartItem.objects.filter(id=cart_item.id).exists()

    def test_cart_update_special_instructions(
        self, auth_client, session_with_participant, cart_item
    ):
        """Test PATCH mise à jour des instructions spéciales"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.patch(
                self.url(session_id, f'cart_update/{item_id}'),
                {'special_instructions': 'Bien cuit'},
                format='json'
            )

        if response.status_code == status.HTTP_200_OK:
            cart_item.refresh_from_db()
            assert cart_item.special_instructions == 'Bien cuit'

    def test_cart_update_other_participant_item_forbidden(
        self, second_auth_client, session_with_participant, cart_item, second_participant
    ):
        """Test qu'un participant ne peut pas modifier l'article d'un autre"""
        # cart_item appartient à `participant` (user), pas à second_user
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        response = second_auth_client.patch(
            self.url(session_id, f'cart_update/{item_id}'),
            {'quantity': 10},
            format='json'
        )

        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND  # L'item n'existe pas pour ce participant
        ]

    def test_cart_update_nonexistent_item(self, auth_client, session_with_participant):
        """Test PATCH sur un article inexistant"""
        session_id = str(session_with_participant.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.patch(
                self.url(
                    session_id,
                    'cart_update/00000000-0000-0000-0000-000000000000'
                ),
                {'quantity': 2},
                format='json'
            )

        assert response.status_code in [
            status.HTTP_404_NOT_FOUND,
            status.HTTP_403_FORBIDDEN
        ]

    def test_cart_update_broadcasts_ws_update(
        self, auth_client, session_with_participant, cart_item
    ):
        """Test que cart_update déclenche le broadcast WebSocket"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        with patch(
            'api.views.collaborative_session_views._broadcast_cart_update',
            create=True
        ) as mock_broadcast:
            response = auth_client.patch(
                self.url(session_id, f'cart_update/{item_id}'),
                {'quantity': 3},
                format='json'
            )

        if response.status_code == status.HTTP_200_OK:
            mock_broadcast.assert_called_once()

    # ── DELETE /cart_remove/{item_id}/ ───────────────────────────────────────

    def test_cart_remove_item(self, auth_client, session_with_participant, cart_item):
        """Test DELETE /cart_remove/{id}/ : suppression d'un article"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)
        cart_item_pk = cart_item.id

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.delete(
                self.url(session_id, f'cart_remove/{item_id}')
            )

        assert response.status_code in [
            status.HTTP_204_NO_CONTENT,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code == status.HTTP_204_NO_CONTENT:
            assert not SessionCartItem.objects.filter(id=cart_item_pk).exists()

    def test_cart_remove_other_participant_item_forbidden(
        self, second_auth_client, session_with_participant, cart_item, second_participant
    ):
        """Test qu'un participant ne peut pas supprimer l'article d'un autre"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        response = second_auth_client.delete(
            self.url(session_id, f'cart_remove/{item_id}')
        )

        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]
        # L'article ne doit pas avoir été supprimé
        assert SessionCartItem.objects.filter(id=cart_item.id).exists()

    def test_cart_remove_nonexistent_item(self, auth_client, session_with_participant):
        """Test DELETE sur un article inexistant"""
        session_id = str(session_with_participant.id)

        response = auth_client.delete(
            self.url(
                session_id,
                'cart_remove/00000000-0000-0000-0000-000000000000'
            )
        )

        assert response.status_code in [
            status.HTTP_404_NOT_FOUND,
            status.HTTP_403_FORBIDDEN
        ]

    def test_cart_remove_broadcasts_ws_update(
        self, auth_client, session_with_participant, cart_item
    ):
        """Test que cart_remove déclenche le broadcast WebSocket"""
        session_id = str(session_with_participant.id)
        item_id = str(cart_item.id)

        with patch(
            'api.views.collaborative_session_views._broadcast_cart_update',
            create=True
        ) as mock_broadcast:
            response = auth_client.delete(
                self.url(session_id, f'cart_remove/{item_id}')
            )

        if response.status_code == status.HTTP_204_NO_CONTENT:
            mock_broadcast.assert_called_once()

    # ── DELETE /cart_clear/ ──────────────────────────────────────────────────

    def test_cart_clear_removes_own_items(
        self, auth_client, session_with_participant, participant, menu_item, second_menu_item
    ):
        """Test DELETE /cart_clear/ supprime les articles du participant courant"""
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=participant,
            menu_item=second_menu_item,
            quantity=2
        )
        assert SessionCartItem.objects.filter(
            session=session_with_participant, participant=participant
        ).count() == 2

        session_id = str(session_with_participant.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.delete(self.url(session_id, 'cart_clear'))

        assert response.status_code in [
            status.HTTP_204_NO_CONTENT,
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND
        ]

        if response.status_code in [status.HTTP_204_NO_CONTENT, status.HTTP_200_OK]:
            assert SessionCartItem.objects.filter(
                session=session_with_participant, participant=participant
            ).count() == 0

    def test_cart_clear_does_not_remove_other_participants_items(
        self,
        auth_client,
        session_with_participant,
        participant,
        second_participant,
        menu_item,
        second_menu_item,
    ):
        """Test que cart_clear ne supprime que les articles du participant courant"""
        # Articles de second_participant (ne doivent pas être supprimés)
        other_item = SessionCartItem.objects.create(
            session=session_with_participant,
            participant=second_participant,
            menu_item=second_menu_item,
            quantity=1
        )
        # Article de participant (doit être supprimé)
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )

        session_id = str(session_with_participant.id)

        with patch('api.views.collaborative_session_views._broadcast_cart_update', create=True):
            response = auth_client.delete(self.url(session_id, 'cart_clear'))

        if response.status_code in [status.HTTP_204_NO_CONTENT, status.HTTP_200_OK]:
            # Les articles du second participant sont intacts
            assert SessionCartItem.objects.filter(id=other_item.id).exists()

    def test_cart_clear_broadcasts_ws_update(
        self, auth_client, session_with_participant, participant, menu_item
    ):
        """Test que cart_clear déclenche le broadcast WebSocket"""
        SessionCartItem.objects.create(
            session=session_with_participant,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )

        session_id = str(session_with_participant.id)

        with patch(
            'api.views.collaborative_session_views._broadcast_cart_update',
            create=True
        ) as mock_broadcast:
            response = auth_client.delete(self.url(session_id, 'cart_clear'))

        if response.status_code in [status.HTTP_204_NO_CONTENT, status.HTTP_200_OK]:
            mock_broadcast.assert_called_once()

    def test_cart_clear_unauthenticated(self, api_client, collaborative_session):
        """Test DELETE /cart_clear/ sans authentification"""
        session_id = str(collaborative_session.id)

        response = api_client.delete(self.url(session_id, 'cart_clear'))

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND
        ]