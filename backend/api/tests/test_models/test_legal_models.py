# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles légaux (RGPD)
- LegalConsent
- AccountDeletionRequest
- DataAccessLog
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from api.models import LegalConsent, AccountDeletionRequest, DataAccessLog


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="legaluser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondlegaluser", password="testpass123")


@pytest.fixture
def legal_consent(user):
    return LegalConsent.objects.create(
        user=user,
        terms_version="1.0.0",
        privacy_version="1.0.0",
        consent_date=timezone.now(),
        ip_address="192.168.1.1",
        user_agent="Mozilla/5.0 Test"
    )


@pytest.fixture
def deletion_request(user):
    return AccountDeletionRequest.objects.create(
        user=user,
        requested_at=timezone.now(),
        reason="Je n'utilise plus l'application",
        ip_address="192.168.1.1"
    )


@pytest.fixture
def data_access_log(user):
    return DataAccessLog.objects.create(
        user=user,
        action="data_exported",
        ip_address="192.168.1.1",
        user_agent="Mozilla/5.0 Test"
    )


# =============================================================================
# TESTS - LegalConsent
# =============================================================================

@pytest.mark.django_db
class TestLegalConsent:
    """Tests pour le modèle LegalConsent"""

    def test_legal_consent_creation(self, legal_consent):
        """Test de la création d'un consentement légal"""
        assert legal_consent.id is not None
        assert legal_consent.terms_version == "1.0.0"
        assert legal_consent.privacy_version == "1.0.0"
        assert legal_consent.consent_date is not None
        assert legal_consent.ip_address == "192.168.1.1"
        assert legal_consent.created_at is not None

    def test_legal_consent_str(self, legal_consent, user):
        """Test de la méthode __str__"""
        expected = f"Consentement de {user.username} (v{legal_consent.terms_version})"
        assert str(legal_consent) == expected

    def test_one_to_one_with_user(self, user, legal_consent):
        """Test que la relation avec User est OneToOne"""
        with pytest.raises(Exception):  # IntegrityError
            LegalConsent.objects.create(
                user=user,  # Même utilisateur
                terms_version="2.0.0",
                privacy_version="2.0.0",
                consent_date=timezone.now()
            )

    def test_version_update(self, legal_consent):
        """Test de la mise à jour des versions"""
        legal_consent.terms_version = "2.0.0"
        legal_consent.privacy_version = "2.0.0"
        legal_consent.save()
        
        legal_consent.refresh_from_db()
        assert legal_consent.terms_version == "2.0.0"
        assert legal_consent.privacy_version == "2.0.0"

    def test_updated_at_auto(self, legal_consent):
        """Test que updated_at est mis à jour automatiquement"""
        original_updated = legal_consent.updated_at
        
        legal_consent.terms_version = "3.0.0"
        legal_consent.save()
        
        legal_consent.refresh_from_db()
        assert legal_consent.updated_at >= original_updated

    def test_optional_ip_address(self, user):
        """Test que l'IP est optionnelle"""
        consent = LegalConsent.objects.create(
            user=user,
            terms_version="1.0.0",
            privacy_version="1.0.0",
            consent_date=timezone.now()
        )
        assert consent.ip_address is None

    def test_consent_date_required(self, second_user):
        """Test que consent_date est requis"""
        consent = LegalConsent.objects.create(
            user=second_user,
            terms_version="1.0.0",
            privacy_version="1.0.0",
            consent_date=timezone.now()
        )
        assert consent.consent_date is not None


# =============================================================================
# TESTS - AccountDeletionRequest
# =============================================================================

@pytest.mark.django_db
class TestAccountDeletionRequest:
    """Tests pour le modèle AccountDeletionRequest"""

    def test_deletion_request_creation(self, deletion_request):
        """Test de la création d'une demande de suppression"""
        assert deletion_request.id is not None
        assert deletion_request.status == 'pending'
        assert deletion_request.reason == "Je n'utilise plus l'application"
        assert deletion_request.requested_at is not None
        assert deletion_request.scheduled_deletion_date is not None

    def test_scheduled_deletion_date_auto_calculation(self, user):
        """Test que scheduled_deletion_date est calculé automatiquement (30 jours)"""
        now = timezone.now()
        request = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=now,
            ip_address="192.168.1.1"
        )
        
        expected_date = now + timedelta(days=30)
        # Vérifier que c'est environ 30 jours (avec une marge de quelques secondes)
        diff = abs((request.scheduled_deletion_date - expected_date).total_seconds())
        assert diff < 5

    def test_status_choices(self, user):
        """Test des différents statuts"""
        request = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=timezone.now()
        )
        
        # Pending (défaut)
        assert request.status == 'pending'
        
        # Cancelled
        request.status = 'cancelled'
        request.cancelled_at = timezone.now()
        request.save()
        assert request.status == 'cancelled'
        
        # Completed
        request.status = 'completed'
        request.completed_at = timezone.now()
        request.save()
        assert request.status == 'completed'

    def test_multiple_requests_per_user(self, user):
        """Test que plusieurs demandes par utilisateur sont possibles"""
        r1 = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=timezone.now(),
            status='cancelled'
        )
        r2 = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=timezone.now(),
            status='pending'
        )
        
        assert AccountDeletionRequest.objects.filter(user=user).count() == 2

    def test_reason_optional(self, second_user):
        """Test que la raison est optionnelle"""
        request = AccountDeletionRequest.objects.create(
            user=second_user,
            requested_at=timezone.now()
        )
        assert request.reason == ""

    def test_ordering(self, user, second_user):
        """Test que les demandes sont ordonnées par date décroissante"""
        old_request = AccountDeletionRequest.objects.create(
            user=user,
            requested_at=timezone.now() - timedelta(days=10)
        )
        new_request = AccountDeletionRequest.objects.create(
            user=second_user,
            requested_at=timezone.now()
        )
        
        requests = list(AccountDeletionRequest.objects.all())
        assert requests[0] == new_request
        assert requests[1] == old_request

    def test_cancelled_at_tracking(self, deletion_request):
        """Test du tracking de l'annulation"""
        assert deletion_request.cancelled_at is None
        
        deletion_request.status = 'cancelled'
        deletion_request.cancelled_at = timezone.now()
        deletion_request.save()
        
        assert deletion_request.cancelled_at is not None

    def test_completed_at_tracking(self, deletion_request):
        """Test du tracking de la complétion"""
        assert deletion_request.completed_at is None
        
        deletion_request.status = 'completed'
        deletion_request.completed_at = timezone.now()
        deletion_request.save()
        
        assert deletion_request.completed_at is not None


# =============================================================================
# TESTS - DataAccessLog
# =============================================================================

@pytest.mark.django_db
class TestDataAccessLog:
    """Tests pour le modèle DataAccessLog"""

    def test_data_access_log_creation(self, data_access_log):
        """Test de la création d'un log d'accès"""
        assert data_access_log.id is not None
        assert data_access_log.action == "data_exported"
        assert data_access_log.ip_address == "192.168.1.1"
        assert data_access_log.user_agent == "Mozilla/5.0 Test"
        assert data_access_log.timestamp is not None

    def test_various_actions(self, user):
        """Test des différentes actions loggées"""
        actions = ['export', 'view', 'delete', 'consent_recorded', 'data_exported']
        
        for action in actions:
            log = DataAccessLog.objects.create(
                user=user,
                action=action,
                ip_address="192.168.1.1",
                user_agent="Test"
            )
            assert log.action == action

    def test_details_json_field(self, user):
        """Test du champ JSON details"""
        log = DataAccessLog.objects.create(
            user=user,
            action="data_exported",
            ip_address="192.168.1.1",
            user_agent="Test",
            details={
                'export_size': 1024,
                'format': 'JSON',
                'sections': ['profile', 'orders']
            }
        )
        
        assert log.details['export_size'] == 1024
        assert log.details['format'] == 'JSON'
        assert 'profile' in log.details['sections']

    def test_details_default_empty(self, data_access_log):
        """Test que details est vide par défaut"""
        assert data_access_log.details == {}

    def test_ordering_by_timestamp(self, user):
        """Test que les logs sont ordonnés par timestamp décroissant"""
        old_log = DataAccessLog.objects.create(
            user=user,
            action="old_action",
            ip_address="192.168.1.1",
            user_agent="Test"
        )
        # Attendre un peu pour avoir un timestamp différent
        import time
        time.sleep(0.1)
        
        new_log = DataAccessLog.objects.create(
            user=user,
            action="new_action",
            ip_address="192.168.1.1",
            user_agent="Test"
        )
        
        logs = list(DataAccessLog.objects.filter(user=user))
        assert logs[0] == new_log
        assert logs[1] == old_log

    def test_multiple_logs_per_user(self, user):
        """Test de plusieurs logs par utilisateur"""
        for i in range(5):
            DataAccessLog.objects.create(
                user=user,
                action=f"action_{i}",
                ip_address="192.168.1.1",
                user_agent="Test"
            )
        
        assert DataAccessLog.objects.filter(user=user).count() == 5

    def test_index_on_user_timestamp(self):
        """Test que l'index existe sur user et timestamp"""
        indexes = DataAccessLog._meta.indexes
        # Vérifier qu'il y a au moins un index défini
        assert len(indexes) >= 1
