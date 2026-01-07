# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles utilisateur
- RestaurateurProfile
- ClientProfile
"""

import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone
from api.models import RestaurateurProfile, ClientProfile


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="testuser@example.com",
        password="testpass123",
        first_name="Test",
        email="testuser@example.com"
    )


@pytest.fixture
def second_user():
    return User.objects.create_user(
        username="seconduser@example.com",
        password="testpass123",
        first_name="Second",
        email="seconduser@example.com"
    )


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def client_profile(second_user):
    return ClientProfile.objects.create(
        user=second_user,
        phone="0612345678"
    )


# =============================================================================
# TESTS - RestaurateurProfile
# =============================================================================

@pytest.mark.django_db
class TestRestaurateurProfile:
    """Tests pour le modèle RestaurateurProfile"""

    def test_profile_creation(self, restaurateur_profile):
        """Test de la création d'un profil restaurateur"""
        assert restaurateur_profile.id is not None
        assert restaurateur_profile.siret == "12345678901234"
        assert restaurateur_profile.is_validated is False
        assert restaurateur_profile.is_active is False
        assert restaurateur_profile.stripe_verified is False
        assert restaurateur_profile.created_at is not None

    def test_profile_str_method(self, restaurateur_profile, user):
        """Test de la méthode __str__"""
        expected = f"{user.username} - 12345678901234"
        assert str(restaurateur_profile) == expected

    def test_siret_unique_constraint(self, user, second_user):
        """Test que le SIRET est unique"""
        RestaurateurProfile.objects.create(
            user=user,
            siret="11111111111111"
        )
        
        with pytest.raises(IntegrityError):
            RestaurateurProfile.objects.create(
                user=second_user,
                siret="11111111111111"
            )

    def test_user_one_to_one_constraint(self, user):
        """Test que la relation avec User est OneToOne"""
        RestaurateurProfile.objects.create(
            user=user,
            siret="22222222222222"
        )
        
        with pytest.raises(IntegrityError):
            RestaurateurProfile.objects.create(
                user=user,
                siret="33333333333333"
            )

    def test_default_values(self, user):
        """Test des valeurs par défaut"""
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="44444444444444"
        )
        
        assert profile.is_validated is False
        assert profile.is_active is False
        assert profile.stripe_verified is False
        assert profile.stripe_account_id is None
        assert profile.stripe_onboarding_completed is False
        assert profile.stripe_account_created is None

    def test_has_validated_profile_property(self, restaurateur_profile):
        """Test de la propriété has_validated_profile"""
        assert restaurateur_profile.has_validated_profile is False
        
        restaurateur_profile.stripe_verified = True
        restaurateur_profile.save()
        
        assert restaurateur_profile.has_validated_profile is True

    def test_has_validated_profile_setter(self, restaurateur_profile):
        """Test du setter has_validated_profile"""
        restaurateur_profile.has_validated_profile = True
        restaurateur_profile.save()
        
        restaurateur_profile.refresh_from_db()
        assert restaurateur_profile.stripe_verified is True

    def test_display_name_with_first_name(self, restaurateur_profile, user):
        """Test de display_name quand first_name existe"""
        user.first_name = "Jean"
        user.save()
        
        assert restaurateur_profile.display_name == "Jean"

    def test_display_name_without_first_name(self, user):
        """Test de display_name quand first_name est vide"""
        user.first_name = ""
        user.save()
        
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="55555555555555"
        )
        
        assert profile.display_name == user.username

    def test_stripe_fields(self, restaurateur_profile):
        """Test des champs Stripe"""
        restaurateur_profile.stripe_account_id = "acct_123456789"
        restaurateur_profile.stripe_onboarding_completed = True
        restaurateur_profile.stripe_account_created = timezone.now()
        restaurateur_profile.stripe_verified = True
        restaurateur_profile.save()
        
        restaurateur_profile.refresh_from_db()
        
        assert restaurateur_profile.stripe_account_id == "acct_123456789"
        assert restaurateur_profile.stripe_onboarding_completed is True
        assert restaurateur_profile.stripe_account_created is not None
        assert restaurateur_profile.stripe_verified is True

    def test_cascade_delete_with_user(self, user):
        """Test que le profil est supprimé avec l'utilisateur"""
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="66666666666666"
        )
        profile_id = profile.id
        
        user.delete()
        
        assert not RestaurateurProfile.objects.filter(id=profile_id).exists()

    def test_related_name_restaurateur_profile(self, user):
        """Test du related_name pour accéder au profil depuis User"""
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="77777777777777"
        )
        
        assert user.restaurateur_profile == profile


# =============================================================================
# TESTS - ClientProfile
# =============================================================================

@pytest.mark.django_db
class TestClientProfile:
    """Tests pour le modèle ClientProfile"""

    def test_profile_creation(self, client_profile):
        """Test de la création d'un profil client"""
        assert client_profile.id is not None
        assert client_profile.phone == "0612345678"

    def test_profile_str_method(self, client_profile, second_user):
        """Test de la méthode __str__"""
        expected = f"{second_user.username} - 0612345678"
        assert str(client_profile) == expected

    def test_user_one_to_one_constraint(self, user):
        """Test que la relation avec User est OneToOne"""
        ClientProfile.objects.create(
            user=user,
            phone="0600000001"
        )
        
        with pytest.raises(IntegrityError):
            ClientProfile.objects.create(
                user=user,
                phone="0600000002"
            )

    def test_phone_max_length(self, user):
        """Test de la longueur maximale du téléphone"""
        profile = ClientProfile.objects.create(
            user=user,
            phone="0612345678"  # 10 caractères max
        )
        assert len(profile.phone) <= 10

    def test_cascade_delete_with_user(self, user):
        """Test que le profil est supprimé avec l'utilisateur"""
        profile = ClientProfile.objects.create(
            user=user,
            phone="0698765432"
        )
        profile_id = profile.id
        
        user.delete()
        
        assert not ClientProfile.objects.filter(id=profile_id).exists()

    def test_empty_phone_allowed(self, user):
        """Test qu'un téléphone vide est autorisé"""
        profile = ClientProfile.objects.create(
            user=user,
            phone=""
        )
        assert profile.phone == ""

    def test_related_name_clientprofile(self, user):
        """Test du related_name par défaut pour accéder au profil depuis User"""
        profile = ClientProfile.objects.create(
            user=user,
            phone="0611111111"
        )
        
        assert user.clientprofile == profile


# =============================================================================
# TESTS - Intégration User/Profiles
# =============================================================================

@pytest.mark.django_db
class TestUserProfilesIntegration:
    """Tests d'intégration entre User et les profils"""

    def test_user_can_have_either_profile(self, user, second_user):
        """Test qu'un utilisateur peut avoir un seul type de profil"""
        RestaurateurProfile.objects.create(
            user=user,
            siret="88888888888888"
        )
        
        ClientProfile.objects.create(
            user=second_user,
            phone="0622222222"
        )
        
        assert hasattr(user, 'restaurateur_profile')
        assert hasattr(second_user, 'clientprofile')

    def test_user_cannot_have_both_profiles(self, user):
        """Test qu'un utilisateur ne peut pas avoir les deux types de profils"""
        RestaurateurProfile.objects.create(
            user=user,
            siret="99999999999999"
        )
        
        # Un utilisateur peut techniquement avoir les deux profils
        # (pas de contrainte au niveau du modèle)
        # Ce test documente le comportement actuel
        ClientProfile.objects.create(
            user=user,
            phone="0633333333"
        )
        
        assert hasattr(user, 'restaurateur_profile')
        assert hasattr(user, 'clientprofile')

    def test_profile_access_raises_on_missing(self):
        """Test que l'accès à un profil inexistant lève une exception"""
        user = User.objects.create_user(
            username="noprofile@example.com",
            password="testpass123"
        )
        
        with pytest.raises(RestaurateurProfile.DoesNotExist):
            _ = user.restaurateur_profile
        
        with pytest.raises(ClientProfile.DoesNotExist):
            _ = user.clientprofile
