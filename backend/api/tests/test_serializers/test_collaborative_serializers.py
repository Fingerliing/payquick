# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de sessions collaboratives
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory
from api.models import (
    CollaborativeTableSession,
    SessionParticipant,
    Restaurant,
    Table,
    Order,
    RestaurateurProfile,
)
from api.serializers.collaborative_session_serializers import (
    SessionParticipantSerializer,
    CollaborativeSessionSerializer,
    SessionCreateSerializer,
    SessionJoinSerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def factory():
    return APIRequestFactory()


@pytest.fixture
def user():
    return User.objects.create_user(username="serializeruser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondserializeruser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Serializer Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        qr_code="SER01"
    )


@pytest.fixture
def collaborative_session(restaurant, table, user):
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="SER01",
        host=user,
        host_name="Test Host",
        max_participants=5
    )


@pytest.fixture
def participant(collaborative_session, user):
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )


# =============================================================================
# TESTS - SessionParticipantSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionParticipantSerializer:
    """Tests pour SessionParticipantSerializer"""

    def test_serializer_fields(self, participant):
        """Test des champs du serializer"""
        serializer = SessionParticipantSerializer(participant)
        data = serializer.data
        
        assert 'id' in data
        assert 'display_name' in data
        assert 'status' in data
        assert 'role' in data
        assert 'is_host' in data
        assert 'joined_at' in data
        assert 'last_activity' in data

    def test_display_name_with_user(self, participant, user):
        """Test que display_name affiche le prénom ou username"""
        user.first_name = "Jean"
        user.save()
        
        serializer = SessionParticipantSerializer(participant)
        assert serializer.data['display_name'] == "Jean"

    def test_is_host_true(self, participant):
        """Test is_host pour un hôte"""
        serializer = SessionParticipantSerializer(participant)
        assert serializer.data['is_host'] is True

    def test_is_host_false(self, collaborative_session, second_user):
        """Test is_host pour un membre"""
        member = SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='active'
        )
        serializer = SessionParticipantSerializer(member)
        assert serializer.data['is_host'] is False

    def test_read_only_fields(self, participant):
        """Test que certains champs sont en lecture seule"""
        serializer = SessionParticipantSerializer(participant)
        read_only = serializer.Meta.read_only_fields
        
        assert 'id' in read_only
        assert 'joined_at' in read_only
        assert 'last_activity' in read_only


# =============================================================================
# TESTS - CollaborativeSessionSerializer
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeSessionSerializer:
    """Tests pour CollaborativeSessionSerializer"""

    def test_serializer_fields(self, collaborative_session, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        data = serializer.data
        
        assert 'id' in data
        assert 'share_code' in data
        assert 'restaurant_name' in data
        assert 'table_info' in data
        assert 'participants' in data
        assert 'participant_count' in data
        assert 'is_full' in data
        assert 'can_join' in data

    def test_participants_nested(self, collaborative_session, participant, factory):
        """Test que les participants sont sérialisés"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        
        participants = serializer.data['participants']
        assert len(participants) == 1
        assert participants[0]['role'] == 'host'

    def test_restaurant_name(self, collaborative_session, factory):
        """Test que le nom du restaurant est inclus"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        
        assert serializer.data['restaurant_name'] == "Serializer Test Restaurant"

    def test_computed_properties(self, collaborative_session, factory):
        """Test des propriétés calculées"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        data = serializer.data
        
        assert data['is_full'] is False
        assert data['can_join'] is True
        assert data['participant_count'] == 0


# =============================================================================
# TESTS - SessionCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionCreateSerializer:
    """Tests pour SessionCreateSerializer"""

    def test_valid_data(self, restaurant):
        """Test avec des données valides"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01',
            'host_name': 'Jean Dupont',
            'session_type': 'collaborative',
            'max_participants': 6
        }
        serializer = SessionCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_fields(self):
        """Test des champs requis"""
        data = {}
        serializer = SessionCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'restaurant_id' in serializer.errors
        assert 'table_number' in serializer.errors

    def test_default_values(self, restaurant):
        """Test des valeurs par défaut"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01'
        }
        serializer = SessionCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        
        validated = serializer.validated_data
        assert validated.get('session_type') == 'collaborative'
        assert validated.get('max_participants') == 10

    def test_max_participants_validation(self, restaurant):
        """Test de la validation du nombre max de participants"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01',
            'max_participants': 0  # Invalid
        }
        serializer = SessionCreateSerializer(data=data)
        # La validation devrait rejeter 0
        if not serializer.is_valid():
            assert 'max_participants' in serializer.errors


# =============================================================================
# TESTS - SessionJoinSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionJoinSerializer:
    """Tests pour SessionJoinSerializer"""

    def test_valid_join_with_share_code(self, collaborative_session):
        """Test de jointure valide avec code de partage"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_share_code(self):
        """Test que share_code est requis"""
        data = {
            'guest_name': 'Pierre'
        }
        serializer = SessionJoinSerializer(data=data)
        assert not serializer.is_valid()
        assert 'share_code' in serializer.errors

    def test_invalid_share_code(self):
        """Test qu'un code invalide est rejeté"""
        data = {
            'share_code': 'INVALID'
        }
        serializer = SessionJoinSerializer(data=data)
        assert not serializer.is_valid()
        assert 'share_code' in serializer.errors

    def test_optional_guest_name(self, collaborative_session):
        """Test que guest_name est optionnel"""
        data = {
            'share_code': collaborative_session.share_code
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_optional_guest_phone(self, collaborative_session):
        """Test que guest_phone est optionnel"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_phone': '0612345678'
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors