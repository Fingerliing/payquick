# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles d'authentification
- PhoneVerification
- PendingRegistration
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from django.conf import settings
from api.models import PhoneVerification, PendingRegistration


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="authuser", password="testpass123")


@pytest.fixture
def phone_verification(user):
    return PhoneVerification.objects.create(
        user=user,
        phone_number="0612345678",
        code="123456"
    )


@pytest.fixture
def pending_registration():
    return PendingRegistration.objects.create(
        email="test@example.com",
        password_hash="hashed_password_here",
        nom="Test User",
        role="client",
        telephone="0612345678",
        verification_code="654321"
    )


# =============================================================================
# TESTS - PhoneVerification
# =============================================================================

@pytest.mark.django_db
class TestPhoneVerification:
    """Tests pour le modèle PhoneVerification"""

    def test_phone_verification_creation(self, phone_verification):
        """Test de la création d'une vérification téléphone"""
        assert phone_verification.id is not None
        assert phone_verification.phone_number == "0612345678"
        assert phone_verification.code == "123456"
        assert phone_verification.is_verified is False
        assert phone_verification.attempts == 0
        assert phone_verification.created_at is not None

    def test_is_expired_not_expired(self, phone_verification, settings):
        """Test is_expired quand le code n'est pas expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        assert phone_verification.is_expired() is False

    def test_is_expired_expired(self, phone_verification, settings):
        """Test is_expired quand le code est expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        # Simuler une création dans le passé
        phone_verification.created_at = timezone.now() - timedelta(minutes=15)
        phone_verification.save()
        assert phone_verification.is_expired() is True

    def test_can_resend_first_time(self, phone_verification):
        """Test can_resend pour le premier envoi"""
        assert phone_verification.can_resend() is True

    def test_can_resend_after_cooldown(self, phone_verification, settings):
        """Test can_resend après le cooldown"""
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60
        phone_verification.last_resend_at = timezone.now() - timedelta(seconds=120)
        phone_verification.save()
        assert phone_verification.can_resend() is True

    def test_can_resend_during_cooldown(self, phone_verification, settings):
        """Test can_resend pendant le cooldown"""
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60
        phone_verification.last_resend_at = timezone.now() - timedelta(seconds=30)
        phone_verification.save()
        assert phone_verification.can_resend() is False

    def test_generate_code(self, phone_verification):
        """Test de la génération de code"""
        code = phone_verification.generate_code()
        assert len(code) == 6
        assert code.isdigit()
        assert phone_verification.code == code

    def test_generate_code_is_random(self, user):
        """Test que les codes générés sont aléatoires"""
        codes = set()
        for _ in range(10):
            verification = PhoneVerification.objects.create(
                user=user,
                phone_number="0612345678"
            )
            verification.generate_code()
            codes.add(verification.code)
        # Au moins quelques codes devraient être différents
        assert len(codes) > 5

    def test_increment_attempts(self, phone_verification):
        """Test de l'incrémentation des tentatives"""
        assert phone_verification.attempts == 0
        
        phone_verification.increment_attempts()
        assert phone_verification.attempts == 1
        
        phone_verification.increment_attempts()
        assert phone_verification.attempts == 2

    def test_mark_verified(self, phone_verification):
        """Test du marquage comme vérifié"""
        assert phone_verification.is_verified is False
        assert phone_verification.verified_at is None
        
        phone_verification.mark_verified()
        
        assert phone_verification.is_verified is True
        assert phone_verification.verified_at is not None

    def test_multiple_verifications_per_user(self, user):
        """Test de plusieurs vérifications par utilisateur"""
        v1 = PhoneVerification.objects.create(
            user=user,
            phone_number="0612345678",
            code="111111"
        )
        v2 = PhoneVerification.objects.create(
            user=user,
            phone_number="0698765432",
            code="222222"
        )
        
        assert PhoneVerification.objects.filter(user=user).count() == 2


# =============================================================================
# TESTS - PendingRegistration
# =============================================================================

@pytest.mark.django_db
class TestPendingRegistration:
    """Tests pour le modèle PendingRegistration"""

    def test_pending_registration_creation(self, pending_registration):
        """Test de la création d'une inscription en attente"""
        assert pending_registration.id is not None
        assert pending_registration.email == "test@example.com"
        assert pending_registration.nom == "Test User"
        assert pending_registration.role == "client"
        assert pending_registration.telephone == "0612345678"
        assert pending_registration.verification_code == "654321"
        assert pending_registration.is_verified is False
        assert pending_registration.attempts == 0

    def test_pending_registration_restaurateur(self):
        """Test d'une inscription restaurateur en attente"""
        registration = PendingRegistration.objects.create(
            email="resto@example.com",
            password_hash="hash",
            nom="Chef",
            role="restaurateur",
            telephone="0600000000",
            siret="12345678901234",
            verification_code="999999"
        )
        assert registration.role == "restaurateur"
        assert registration.siret == "12345678901234"

    def test_email_unique(self, pending_registration):
        """Test que l'email est unique"""
        with pytest.raises(Exception):  # IntegrityError
            PendingRegistration.objects.create(
                email="test@example.com",  # Même email
                password_hash="hash",
                nom="Another User",
                role="client",
                telephone="0699999999",
                verification_code="111111"
            )

    def test_is_expired_not_expired(self, pending_registration, settings):
        """Test is_expired quand pas expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        assert pending_registration.is_expired() is False

    def test_is_expired_expired(self, pending_registration, settings):
        """Test is_expired quand expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        pending_registration.code_sent_at = timezone.now() - timedelta(minutes=15)
        pending_registration.save()
        assert pending_registration.is_expired() is True

    def test_created_at_auto(self, pending_registration):
        """Test que created_at est automatique"""
        assert pending_registration.created_at is not None
        assert pending_registration.created_at <= timezone.now()

    def test_optional_fields(self):
        """Test des champs optionnels"""
        registration = PendingRegistration.objects.create(
            email="minimal@example.com",
            password_hash="hash",
            nom="Minimal User",
            role="client",
            telephone="0600000000",
            verification_code="000000"
        )
        assert registration.siret is None
        assert registration.ip_address is None
        assert registration.user_agent == ""

    def test_ip_address_tracking(self):
        """Test du tracking d'IP"""
        registration = PendingRegistration.objects.create(
            email="tracked@example.com",
            password_hash="hash",
            nom="Tracked User",
            role="client",
            telephone="0600000001",
            verification_code="123456",
            ip_address="192.168.1.1"
        )
        assert registration.ip_address == "192.168.1.1"

    def test_user_agent_tracking(self):
        """Test du tracking user agent"""
        registration = PendingRegistration.objects.create(
            email="ua@example.com",
            password_hash="hash",
            nom="UA User",
            role="client",
            telephone="0600000002",
            verification_code="123456",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
        )
        assert "iPhone" in registration.user_agent

    def test_role_choices(self):
        """Test des choix de rôle valides"""
        client = PendingRegistration.objects.create(
            email="client@example.com",
            password_hash="hash",
            nom="Client",
            role="client",
            telephone="0600000003",
            verification_code="111111"
        )
        assert client.role == "client"
        
        restaurateur = PendingRegistration.objects.create(
            email="resto@test.com",
            password_hash="hash",
            nom="Resto",
            role="restaurateur",
            telephone="0600000004",
            verification_code="222222"
        )
        assert restaurateur.role == "restaurateur"

    def test_attempts_default(self, pending_registration):
        """Test de la valeur par défaut des tentatives"""
        assert pending_registration.attempts == 0

    def test_last_resend_at_null_by_default(self, pending_registration):
        """Test que last_resend_at est null par défaut"""
        assert pending_registration.last_resend_at is None

    def test_indexes_exist(self):
        """Test que les index sont créés correctement"""
        # Vérifier que le modèle a des indexes définis
        indexes = PendingRegistration._meta.indexes
        assert len(indexes) >= 1  # Au moins un index défini
