# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles collaboratifs
- CollaborativeTableSession
- SessionParticipant
- ActiveSessionManager
"""

import pytest
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from api.models import (
    CollaborativeTableSession,
    SessionParticipant,
    Restaurant,
    Table,
    Order,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="seconduser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        identifiant="T01"
    )


@pytest.fixture
def collaborative_session(restaurant, table, user):
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="T01",
        host=user,
        host_name="Test Host",
        max_participants=5,
        require_approval=False
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
# TESTS - CollaborativeTableSession
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeTableSession:
    """Tests pour le modèle CollaborativeTableSession"""

    def test_session_creation(self, collaborative_session):
        """Test de la création d'une session collaborative"""
        assert collaborative_session.id is not None
        assert collaborative_session.share_code is not None
        assert len(collaborative_session.share_code) == 6
        assert collaborative_session.status == 'active'
        assert collaborative_session.session_type == 'collaborative'
        assert collaborative_session.is_archived is False

    def test_share_code_generation(self, restaurant, table):
        """Test de la génération automatique du code de partage"""
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02"
        )
        # Format attendu: 3 lettres + 3 chiffres
        assert len(session.share_code) == 6
        assert session.share_code[:3].isalpha()
        assert session.share_code[:3].isupper()
        assert session.share_code[3:].isdigit()

    def test_share_code_uniqueness(self, restaurant, table):
        """Test que les codes de partage sont uniques"""
        codes = set()
        for i in range(10):
            session = CollaborativeTableSession.objects.create(
                restaurant=restaurant,
                table=table,
                table_number=f"T{i:02d}"
            )
            codes.add(session.share_code)
        assert len(codes) == 10  # Tous les codes sont uniques

    def test_session_str_method(self, collaborative_session):
        """Test de la méthode __str__"""
        expected = f"Session {collaborative_session.share_code} - Table {collaborative_session.table_number} - Active"
        assert str(collaborative_session) == expected

    def test_session_str_with_archived(self, collaborative_session):
        """Test de la méthode __str__ avec session archivée"""
        collaborative_session.is_archived = True
        collaborative_session.save()
        assert "[ARCHIVÉE]" in str(collaborative_session)

    def test_participant_count_property(self, collaborative_session, user, second_user):
        """Test de la propriété participant_count"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=user,
            role='host',
            status='active'
        )
        assert collaborative_session.participant_count == 1
        
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='active'
        )
        assert collaborative_session.participant_count == 2

    def test_is_full_property(self, collaborative_session):
        """Test de la propriété is_full"""
        collaborative_session.max_participants = 2
        collaborative_session.save()
        
        assert collaborative_session.is_full is False
        
        # Créer 2 participants
        for i in range(2):
            user = User.objects.create_user(username=f"user{i}", password="pass")
            SessionParticipant.objects.create(
                session=collaborative_session,
                user=user,
                status='active'
            )
        
        assert collaborative_session.is_full is True

    def test_can_join_property(self, collaborative_session):
        """Test de la propriété can_join"""
        assert collaborative_session.can_join is True
        
        # Session complète
        collaborative_session.status = 'completed'
        collaborative_session.save()
        assert collaborative_session.can_join is False
        
        # Session annulée
        collaborative_session.status = 'cancelled'
        collaborative_session.save()
        assert collaborative_session.can_join is False
        
        # Session verrouillée sans allow_join_after_lock
        collaborative_session.status = 'locked'
        collaborative_session.allow_join_after_lock = False
        collaborative_session.save()
        assert collaborative_session.can_join is False
        
        # Session verrouillée avec allow_join_after_lock
        collaborative_session.allow_join_after_lock = True
        collaborative_session.save()
        assert collaborative_session.can_join is True

    def test_lock_session(self, collaborative_session):
        """Test de la méthode lock_session"""
        assert collaborative_session.status == 'active'
        assert collaborative_session.locked_at is None
        
        collaborative_session.lock_session()
        
        assert collaborative_session.status == 'locked'
        assert collaborative_session.locked_at is not None

    def test_unlock_session(self, collaborative_session):
        """Test de la méthode unlock_session"""
        collaborative_session.lock_session()
        assert collaborative_session.status == 'locked'
        
        collaborative_session.unlock_session()
        
        assert collaborative_session.status == 'active'
        assert collaborative_session.locked_at is None

    def test_unlock_session_only_when_locked(self, collaborative_session):
        """Test que unlock_session ne change pas le status si pas verrouillé"""
        collaborative_session.status = 'completed'
        collaborative_session.save()
        
        collaborative_session.unlock_session()
        
        assert collaborative_session.status == 'completed'  # Pas changé

    def test_mark_completed(self, collaborative_session):
        """Test de la méthode mark_completed"""
        assert collaborative_session.status == 'active'
        assert collaborative_session.completed_at is None
        
        collaborative_session.mark_completed()
        
        assert collaborative_session.status == 'completed'
        assert collaborative_session.completed_at is not None

    def test_archive_session(self, collaborative_session):
        """Test de la méthode archive"""
        assert collaborative_session.is_archived is False
        
        collaborative_session.archive(reason="Test d'archivage")
        
        assert collaborative_session.is_archived is True
        assert collaborative_session.archived_at is not None
        assert "Test d'archivage" in collaborative_session.session_notes

    def test_unarchive_session(self, collaborative_session):
        """Test de la méthode unarchive"""
        collaborative_session.archive()
        assert collaborative_session.is_archived is True
        
        collaborative_session.unarchive()
        
        assert collaborative_session.is_archived is False
        assert collaborative_session.archived_at is None

    def test_can_be_archived_property(self, collaborative_session):
        """Test de la propriété can_be_archived"""
        collaborative_session.status = 'active'
        assert collaborative_session.can_be_archived is False
        
        collaborative_session.status = 'completed'
        assert collaborative_session.can_be_archived is True
        
        collaborative_session.status = 'cancelled'
        assert collaborative_session.can_be_archived is True

    def test_total_orders_count(self, collaborative_session, restaurateur_profile, restaurant, table):
        """Test de la propriété total_orders_count"""
        assert collaborative_session.total_orders_count == 0
        
        # Créer des commandes associées
        Order.objects.create(
            restaurateur=restaurateur_profile,
            restaurant=restaurant,
            table=table,
            collaborative_session=collaborative_session
        )
        Order.objects.create(
            restaurateur=restaurateur_profile,
            restaurant=restaurant,
            table=table,
            collaborative_session=collaborative_session
        )
        
        assert collaborative_session.total_orders_count == 2

    def test_pending_participants(self, collaborative_session, second_user):
        """Test de la propriété pending_participants"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            status='pending'
        )
        
        assert collaborative_session.pending_participants.count() == 1


# =============================================================================
# TESTS - SessionParticipant
# =============================================================================

@pytest.mark.django_db
class TestSessionParticipant:
    """Tests pour le modèle SessionParticipant"""

    def test_participant_creation(self, participant):
        """Test de la création d'un participant"""
        assert participant.id is not None
        assert participant.status == 'active'
        assert participant.role == 'host'
        assert participant.joined_at is not None

    def test_participant_str_method(self, participant):
        """Test de la méthode __str__"""
        result = str(participant)
        assert "Actif" in result

    def test_display_name_with_user(self, participant, user):
        """Test de display_name avec un utilisateur authentifié"""
        user.first_name = "Jean"
        user.save()
        assert participant.display_name == "Jean"

    def test_display_name_with_username(self, participant, user):
        """Test de display_name avec username si pas de first_name"""
        user.first_name = ""
        user.save()
        assert participant.display_name == user.username

    def test_display_name_guest(self, collaborative_session):
        """Test de display_name pour un invité"""
        participant = SessionParticipant.objects.create(
            session=collaborative_session,
            guest_name="Pierre Invité",
            status='active'
        )
        assert participant.display_name == "Pierre Invité"

    def test_display_name_anonymous_guest(self, collaborative_session):
        """Test de display_name pour un invité anonyme"""
        participant = SessionParticipant.objects.create(
            session=collaborative_session,
            status='active'
        )
        assert participant.display_name == "Invité"

    def test_is_host_property(self, participant):
        """Test de la propriété is_host"""
        assert participant.is_host is True
        
        participant.role = 'member'
        assert participant.is_host is False

    def test_leave_session(self, participant):
        """Test de la méthode leave_session"""
        assert participant.status == 'active'
        assert participant.left_at is None
        
        participant.leave_session()
        
        assert participant.status == 'left'
        assert participant.left_at is not None

    def test_unique_user_per_session(self, collaborative_session, user):
        """Test qu'un utilisateur ne peut rejoindre une session qu'une fois"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=user,
            status='active'
        )
        
        with pytest.raises(Exception):  # IntegrityError
            SessionParticipant.objects.create(
                session=collaborative_session,
                user=user,
                status='active'
            )

    def test_orders_count_property(self, participant, collaborative_session, restaurateur_profile, restaurant, table):
        """Test de la propriété orders_count"""
        assert participant.orders_count == 0
        
        # Créer une commande associée au participant
        Order.objects.create(
            restaurateur=restaurateur_profile,
            restaurant=restaurant,
            table=table,
            collaborative_session=collaborative_session,
            participant=participant
        )
        
        assert participant.orders_count == 1


# =============================================================================
# TESTS - ActiveSessionManager
# =============================================================================

@pytest.mark.django_db
class TestActiveSessionManager:
    """Tests pour le manager ActiveSessionManager"""

    def test_manager_excludes_archived(self, restaurant, table):
        """Test que le manager par défaut exclut les sessions archivées"""
        # Créer une session active
        active_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T01"
        )
        
        # Créer une session archivée
        archived_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02",
            is_archived=True
        )
        
        # Le manager par défaut ne doit pas inclure la session archivée
        sessions = CollaborativeTableSession.objects.all()
        assert active_session in sessions
        assert archived_session not in sessions

    def test_all_objects_includes_archived(self, restaurant, table):
        """Test que all_objects inclut les sessions archivées"""
        active_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T01"
        )
        
        archived_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02",
            is_archived=True
        )
        
        # all_objects doit inclure toutes les sessions
        all_sessions = CollaborativeTableSession.all_objects.all()
        assert active_session in all_sessions
        assert archived_session in all_sessions
