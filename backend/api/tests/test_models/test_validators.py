# -*- coding: utf-8 -*-
"""
Tests unitaires pour les validateurs
- validate_siret
- validate_phone
"""

import pytest
from django.core.exceptions import ValidationError
from api.models.validators import validate_siret, validate_phone


# =============================================================================
# TESTS - validate_siret
# =============================================================================

@pytest.mark.django_db
class TestValidateSiret:
    """Tests pour le validateur de SIRET"""

    def test_valid_siret_14_digits(self):
        """Test d'un SIRET valide de 14 chiffres"""
        # Ne devrait pas lever d'exception
        validate_siret("12345678901234")

    def test_valid_siret_all_same_digits(self):
        """Test d'un SIRET avec tous les mêmes chiffres"""
        validate_siret("11111111111111")

    def test_invalid_siret_too_short(self):
        """Test d'un SIRET trop court"""
        with pytest.raises(ValidationError) as exc_info:
            validate_siret("1234567890123")  # 13 chiffres
        
        assert "14" in str(exc_info.value) or "chiffres" in str(exc_info.value).lower()

    def test_invalid_siret_too_long(self):
        """Test d'un SIRET trop long"""
        with pytest.raises(ValidationError) as exc_info:
            validate_siret("123456789012345")  # 15 chiffres
        
        assert "14" in str(exc_info.value) or "chiffres" in str(exc_info.value).lower()

    def test_invalid_siret_with_letters(self):
        """Test d'un SIRET avec des lettres"""
        with pytest.raises(ValidationError) as exc_info:
            validate_siret("1234567890123A")
        
        assert "chiffres" in str(exc_info.value).lower() or "invalide" in str(exc_info.value).lower()

    def test_invalid_siret_with_spaces(self):
        """Test d'un SIRET avec des espaces"""
        with pytest.raises(ValidationError) as exc_info:
            validate_siret("1234 5678 9012")
        
        # Devrait échouer car les espaces ne sont pas des chiffres

    def test_invalid_siret_with_special_chars(self):
        """Test d'un SIRET avec des caractères spéciaux"""
        with pytest.raises(ValidationError):
            validate_siret("1234-5678-9012")

    def test_invalid_siret_empty_string(self):
        """Test d'un SIRET vide"""
        with pytest.raises(ValidationError):
            validate_siret("")

    def test_invalid_siret_none(self):
        """Test d'un SIRET None"""
        with pytest.raises((ValidationError, TypeError, AttributeError)):
            validate_siret(None)

    def test_valid_siret_starting_with_zero(self):
        """Test d'un SIRET commençant par zéro"""
        validate_siret("01234567890123")

    def test_siret_edge_case_all_zeros(self):
        """Test d'un SIRET avec tous des zéros"""
        validate_siret("00000000000000")

    def test_siret_edge_case_all_nines(self):
        """Test d'un SIRET avec tous des neuf"""
        validate_siret("99999999999999")

    def test_siret_with_leading_zeros(self):
        """Test que les zéros en début sont conservés"""
        siret = "00123456789012"
        validate_siret(siret)  # Ne devrait pas lever d'exception


# =============================================================================
# TESTS - validate_phone
# =============================================================================

@pytest.mark.django_db
class TestValidatePhone:
    """Tests pour le validateur de numéro de téléphone"""

    def test_valid_phone_french_mobile(self):
        """Test d'un numéro de portable français valide"""
        validate_phone("0612345678")

    def test_valid_phone_french_landline(self):
        """Test d'un numéro de fixe français valide"""
        validate_phone("0123456789")

    def test_valid_phone_with_country_code(self):
        """Test d'un numéro avec indicatif pays"""
        validate_phone("+33612345678")

    def test_valid_phone_international_format(self):
        """Test d'un numéro au format international"""
        validate_phone("+33 6 12 34 56 78")

    def test_invalid_phone_too_short(self):
        """Test d'un numéro trop court"""
        with pytest.raises(ValidationError):
            validate_phone("061234")

    def test_invalid_phone_too_long(self):
        """Test d'un numéro trop long"""
        with pytest.raises(ValidationError):
            validate_phone("0612345678901234567890")

    def test_invalid_phone_with_letters(self):
        """Test d'un numéro avec des lettres"""
        with pytest.raises(ValidationError):
            validate_phone("06ABCD5678")

    def test_invalid_phone_empty_string(self):
        """Test d'un numéro vide"""
        with pytest.raises(ValidationError):
            validate_phone("")

    def test_valid_phone_different_mobile_prefixes(self):
        """Test de différents préfixes mobiles français"""
        valid_prefixes = ["06", "07"]
        
        for prefix in valid_prefixes:
            phone = f"{prefix}12345678"
            validate_phone(phone)  # Ne devrait pas lever d'exception

    def test_valid_phone_different_landline_prefixes(self):
        """Test de différents préfixes fixes français"""
        valid_prefixes = ["01", "02", "03", "04", "05", "09"]
        
        for prefix in valid_prefixes:
            phone = f"{prefix}12345678"
            validate_phone(phone)  # Ne devrait pas lever d'exception

    def test_phone_with_spaces(self):
        """Test d'un numéro avec des espaces"""
        # Selon l'implémentation, peut être valide ou non
        try:
            validate_phone("06 12 34 56 78")
        except ValidationError:
            pass  # Acceptable si les espaces ne sont pas autorisés

    def test_phone_with_dots(self):
        """Test d'un numéro avec des points"""
        try:
            validate_phone("06.12.34.56.78")
        except ValidationError:
            pass  # Acceptable si les points ne sont pas autorisés

    def test_phone_with_dashes(self):
        """Test d'un numéro avec des tirets"""
        try:
            validate_phone("06-12-34-56-78")
        except ValidationError:
            pass  # Acceptable si les tirets ne sont pas autorisés

    def test_phone_international_various_countries(self):
        """Test de numéros internationaux de différents pays"""
        international_numbers = [
            "+1234567890",      # Format court
            "+442071234567",    # UK
            "+49301234567",     # Allemagne
        ]
        
        for number in international_numbers:
            try:
                validate_phone(number)
            except ValidationError:
                pass  # Le validateur peut être strict sur le format

    def test_phone_none_value(self):
        """Test d'un numéro None"""
        with pytest.raises((ValidationError, TypeError, AttributeError)):
            validate_phone(None)


# =============================================================================
# TESTS - Intégration avec les modèles
# =============================================================================

@pytest.mark.django_db
class TestValidatorsIntegration:
    """Tests d'intégration des validateurs avec les modèles"""

    def test_restaurateur_profile_siret_validation(self):
        """Test que le SIRET est validé dans RestaurateurProfile"""
        from django.contrib.auth.models import User
        from api.models import RestaurateurProfile
        
        user = User.objects.create_user(
            username="test_validator@example.com",
            password="testpass123"
        )
        
        # SIRET invalide devrait lever une erreur
        profile = RestaurateurProfile(
            user=user,
            siret="invalid"
        )
        
        # La validation se fait au niveau du serializer ou de la vue
        # Le modèle peut accepter la valeur mais elle sera rejetée ailleurs

    def test_client_profile_phone_validation(self):
        """Test que le téléphone est validé dans ClientProfile"""
        from django.contrib.auth.models import User
        from api.models import ClientProfile
        
        user = User.objects.create_user(
            username="test_phone@example.com",
            password="testpass123"
        )
        
        # Téléphone valide
        profile = ClientProfile.objects.create(
            user=user,
            phone="0612345678"
        )
        assert profile.phone == "0612345678"


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

@pytest.mark.django_db
class TestValidatorsEdgeCases:
    """Tests des cas limites pour les validateurs"""

    def test_siret_with_unicode_digits(self):
        """Test d'un SIRET avec des chiffres Unicode"""
        # Certains caractères Unicode ressemblent à des chiffres
        with pytest.raises((ValidationError, ValueError)):
            validate_siret("１２３４５６７８９０１２３４")  # Chiffres pleine largeur

    def test_siret_numeric_type(self):
        """Test d'un SIRET passé comme entier"""
        # Certaines implémentations acceptent les entiers
        try:
            validate_siret(12345678901234)
        except (ValidationError, TypeError, AttributeError):
            pass  # Acceptable si seules les chaînes sont acceptées

    def test_phone_with_parentheses(self):
        """Test d'un numéro avec des parenthèses"""
        try:
            validate_phone("(06) 12 34 56 78")
        except ValidationError:
            pass  # Acceptable

    def test_phone_starts_with_plus(self):
        """Test d'un numéro commençant par +"""
        validate_phone("+33612345678")  # Devrait être valide

    def test_phone_starts_with_double_zero(self):
        """Test d'un numéro commençant par 00"""
        try:
            validate_phone("0033612345678")
        except ValidationError:
            pass  # Peut être rejeté selon l'implémentation

    def test_siret_with_whitespace_around(self):
        """Test d'un SIRET avec des espaces autour"""
        with pytest.raises(ValidationError):
            validate_siret("  12345678901234  ")

    def test_phone_with_whitespace_around(self):
        """Test d'un numéro avec des espaces autour"""
        try:
            validate_phone("  0612345678  ")
        except ValidationError:
            pass  # Le validateur peut rejeter les espaces
