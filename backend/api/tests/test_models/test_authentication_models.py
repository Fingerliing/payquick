# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles d'authentification
- EmailVerification
- PhoneVerification (legacy)
- PendingRegistration
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from django.conf import settings
from api.models import EmailVerification, PhoneVerification, PendingRegistration


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="authuser", password="testpass123")


@pytest.fixture
def email_verification(user):
    return EmailVerification.objects.create(
        user=user,
        email="authuser@example.com",
        code="123456"
    )


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
# TESTS - EmailVerification
# =============================================================================

@pytest.mark.django_db
class TestEmailVerification:
    """Tests pour le modèle EmailVerification"""

    def test_email_verification_creation(self, email_verification):
        """Test de la création d'une vérification email"""
        assert email_verification.id is not None
        assert email_verification.email == "authuser@example.com"
        assert email_verification.code == "123456"
        assert email_verification.is_verified is False
        assert email_verification.attempts == 0
        assert email_verification.created_at is not None

    def test_is_expired_not_expired(self, email_verification, settings):
        """Test is_expired quand le code n'est pas expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        assert email_verification.is_expired() is False

    def test_is_expired_expired(self, email_verification, settings):
        """Test is_expired quand le code est expiré"""
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        email_verification.created_at = timezone.now() - timedelta(minutes=15)
        email_verification.save()
        assert email_verification.is_expired() is True

    def test_can_resend_first_time(self, email_verification):
        """Test can_resend pour le premier envoi"""
        assert email_verification.can_resend() is True

    def test_can_resend_after_cooldown(self, email_verification, settings):
        """Test can_resend après le cooldown"""
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60
        email_verification.last_resend_at = timezone.now() - timedelta(seconds=120)
        email_verification.save()
        assert email_verification.can_resend() is True

    def test_can_resend_during_cooldown(self, email_verification, settings):
        """Test can_resend pendant le cooldown"""
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60
        email_verification.last_resend_at = timezone.now() - timedelta(seconds=30)
        email_verification.save()
        assert email_verification.can_resend() is False

    def test_generate_code(self, email_verification):
        """Test de la génération de code"""
        code = email_verification.generate_code()
        assert len(code) == 6
        assert code.isdigit()
        assert email_verification.code == code

    def test_generate_code_is_random(self, user):
        """Test que les codes générés sont aléatoires"""
        codes = set()
        for _ in range(10):
            v = EmailVerification.objects.create(
                user=user,
                email="authuser@example.com"
            )
            v.generate_code()
            codes.add(v.code)
        assert len(codes) > 5

    def test_increment_attempts(self, email_verification):
        """Test de l'incrémentation des tentatives"""
        assert email_verification.attempts == 0
        email_verification.increment_attempts()
        assert email_verification.attempts == 1
        email_verification.increment_attempts()
        assert email_verification.attempts == 2

    def test_mark_verified(self, email_verification):
        """Test du marquage comme vérifié"""
        assert email_verification.is_verified is False
        assert email_verification.verified_at is None

        email_verification.mark_verified()

        assert email_verification.is_verified is True
        assert email_verification.verified_at is not None

    def test_anonymous_verification(self):
        """Test vérification sans utilisateur associé"""
        v = EmailVerification.objects.create(
            user=None,
            email="anon@example.com",
            code="000000"
        )
        assert v.user is None
        assert v.email == "anon@example.com"

    def test_multiple_verifications_per_user(self, user):
        """Test de plusieurs vérifications par utilisateur"""
        EmailVerification.objects.create(user=user, email="a@example.com", code="111111")
        EmailVerification.objects.create(user=user, email="b@example.com", code="222222")
        assert EmailVerification.objects.filter(user=user).count() == 2

    def test_str_representation(self, email_verification, user):
        """Test de la représentation string"""
        expected = f"EmailVerification({user.username}, authuser@example.com)"
        assert str(email_verification) == expected

    def test_str_anonymous(self):
        """Test de la représentation string pour vérification anonyme"""
        v = EmailVerification.objects.create(
            user=None,
            email="ghost@example.com",
            code="999999"
        )
        assert str(v) == "EmailVerification(Anonymous, ghost@example.com)"


# =============================================================================
# TESTS - PhoneVerification (legacy)
# =============================================================================

@pytest.mark.django_db
class TestPhoneVerification:
    """Tests de non-régression pour le modèle PhoneVerification (legacy)"""

    def test_phone_verification_creation(self, phone_verification):
        assert phone_verification.id is not None
        assert phone_verification.phone_number == "0612345678"
        assert phone_verification.code == "123456"
        assert phone_verification.is_verified is False
        assert phone_verification.attempts == 0

    def test_is_expired_not_expired(self, phone_verification, settings):
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        assert phone_verification.is_expired() is False

    def test_is_expired_expired(self, phone_verification, settings):
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        phone_verification.created_at = timezone.now() - timedelta(minutes=15)
        phone_verification.save()
        assert phone_verification.is_expired() is True

    def test_generate_code(self, phone_verification):
        code = phone_verification.generate_code()
        assert len(code) == 6
        assert code.isdigit()

    def test_mark_verified(self, phone_verification):
        phone_verification.mark_verified()
        assert phone_verification.is_verified is True
        assert phone_verification.verified_at is not None


# =============================================================================
# TESTS - PendingRegistration
# =============================================================================

@pytest.mark.django_db
class TestPendingRegistration:
    """Tests pour le modèle PendingRegistration"""

    def test_pending_registration_creation(self, pending_registration):
        assert pending_registration.id is not None
        assert pending_registration.email == "test@example.com"
        assert pending_registration.nom == "Test User"
        assert pending_registration.role == "client"
        assert pending_registration.telephone == "0612345678"
        assert pending_registration.verification_code == "654321"
        assert pending_registration.is_verified is False
        assert pending_registration.attempts == 0

    def test_pending_registration_without_telephone(self):
        """Test inscription sans téléphone (champ optionnel)"""
        registration = PendingRegistration.objects.create(
            email="nophone@example.com",
            password_hash="hash",
            nom="No Phone",
            role="client",
            verification_code="000000"
        )
        assert registration.telephone == ""

    def test_pending_registration_restaurateur(self):
        """Test d'une inscription restaurateur en attente"""
        registration = PendingRegistration.objects.create(
            email="resto@example.com",
            password_hash="hash",
            nom="Chef",
            role="restaurateur",
            siret="12345678901234",
            verification_code="999999"
        )
        assert registration.role == "restaurateur"
        assert registration.siret == "12345678901234"

    def test_email_unique(self, pending_registration):
        """Test que l'email est unique"""
        with pytest.raises(Exception):
            PendingRegistration.objects.create(
                email="test@example.com",
                password_hash="hash",
                nom="Another User",
                role="client",
                verification_code="111111"
            )

    def test_is_expired_not_expired(self, pending_registration, settings):
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        assert pending_registration.is_expired() is False

    def test_is_expired_expired(self, pending_registration, settings):
        settings.SMS_CODE_EXPIRY_MINUTES = 10
        pending_registration.code_sent_at = timezone.now() - timedelta(minutes=15)
        pending_registration.save()
        assert pending_registration.is_expired() is True

    def test_can_resend_first_time(self, pending_registration):
        assert pending_registration.can_resend() is True

    def test_can_resend_during_cooldown(self, pending_registration, settings):
        settings.SMS_RESEND_COOLDOWN_SECONDS = 60
        pending_registration.last_resend_at = timezone.now() - timedelta(seconds=30)
        pending_registration.save()
        assert pending_registration.can_resend() is False

    def test_generate_code(self, pending_registration):
        code = pending_registration.generate_code()
        assert len(code) == 6
        assert code.isdigit()
        assert pending_registration.verification_code == code

    def test_increment_attempts(self, pending_registration):
        pending_registration.increment_attempts()
        assert pending_registration.attempts == 1

    def test_mark_verified(self, pending_registration):
        pending_registration.mark_verified()
        assert pending_registration.is_verified is True

    def test_optional_fields(self):
        registration = PendingRegistration.objects.create(
            email="minimal@example.com",
            password_hash="hash",
            nom="Minimal User",
            role="client",
            verification_code="000000"
        )
        assert registration.siret is None
        assert registration.ip_address is None
        assert registration.user_agent == ""

    def test_ip_address_tracking(self):
        registration = PendingRegistration.objects.create(
            email="tracked@example.com",
            password_hash="hash",
            nom="Tracked User",
            role="client",
            verification_code="123456",
            ip_address="192.168.1.1"
        )
        assert registration.ip_address == "192.168.1.1"

    def test_indexes_exist(self):
        indexes = PendingRegistration._meta.indexes
        assert len(indexes) >= 1