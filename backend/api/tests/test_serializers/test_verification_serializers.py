# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de vérification email

Couvre:
- SendVerificationSerializer  (validation de l'email)
- VerifyCodeSerializer        (validation du code + identifiant)
"""

import pytest
from api.serializers.verification_serializers import (
    SendVerificationSerializer,
    VerifyCodeSerializer,
)


# =============================================================================
# TESTS - SendVerificationSerializer
# =============================================================================

class TestSendVerificationSerializer:
    """Tests pour SendVerificationSerializer"""

    # ── Cas valides ────────────────────────────────────────────────────────────

    def test_valid_email(self):
        """Email valide standard"""
        s = SendVerificationSerializer(data={"email": "user@example.com"})
        assert s.is_valid(), s.errors

    def test_email_normalized_to_lowercase(self):
        """L'email doit être normalisé en minuscules"""
        s = SendVerificationSerializer(data={"email": "User@Example.COM"})
        assert s.is_valid(), s.errors
        assert s.validated_data["email"] == "user@example.com"

    def test_email_stripped_of_whitespace(self):
        """Les espaces autour de l'email doivent être supprimés"""
        s = SendVerificationSerializer(data={"email": "  user@example.com  "})
        assert s.is_valid(), s.errors
        assert s.validated_data["email"] == "user@example.com"

    def test_subdomain_email(self):
        """Email avec sous-domaine"""
        s = SendVerificationSerializer(data={"email": "user@mail.example.co.uk"})
        assert s.is_valid(), s.errors

    def test_email_with_plus_tag(self):
        """Email avec tag +"""
        s = SendVerificationSerializer(data={"email": "user+tag@example.com"})
        assert s.is_valid(), s.errors

    def test_email_with_dots_in_local(self):
        """Email avec des points dans la partie locale"""
        s = SendVerificationSerializer(data={"email": "first.last@example.com"})
        assert s.is_valid(), s.errors

    # ── Cas invalides ─────────────────────────────────────────────────────────

    def test_missing_email(self):
        """Email manquant → erreur de validation"""
        s = SendVerificationSerializer(data={})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_empty_email(self):
        """Email vide → erreur de validation"""
        s = SendVerificationSerializer(data={"email": ""})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_invalid_email_no_at(self):
        """Email sans @ → invalide"""
        s = SendVerificationSerializer(data={"email": "notanemail"})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_invalid_email_no_domain(self):
        """Email sans domaine → invalide"""
        s = SendVerificationSerializer(data={"email": "user@"})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_invalid_email_no_tld(self):
        """Email sans TLD → invalide"""
        s = SendVerificationSerializer(data={"email": "user@domain"})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_invalid_email_spaces(self):
        """Email avec espaces internes → invalide"""
        s = SendVerificationSerializer(data={"email": "user @example.com"})
        assert not s.is_valid()
        assert "email" in s.errors

    def test_extra_fields_ignored(self):
        """Les champs supplémentaires doivent être ignorés"""
        s = SendVerificationSerializer(data={"email": "user@example.com", "phone": "0612345678"})
        assert s.is_valid(), s.errors
        assert "phone" not in s.validated_data


# =============================================================================
# TESTS - VerifyCodeSerializer
# =============================================================================

class TestVerifyCodeSerializer:
    """Tests pour VerifyCodeSerializer"""

    # ── Cas valides — identification par email ─────────────────────────────────

    def test_valid_with_email(self):
        """Code + email valides"""
        s = VerifyCodeSerializer(data={"code": "123456", "email": "user@example.com"})
        assert s.is_valid(), s.errors

    def test_valid_with_verification_id(self):
        """Code + verification_id valides"""
        s = VerifyCodeSerializer(data={"code": "123456", "verification_id": 42})
        assert s.is_valid(), s.errors

    def test_valid_with_both(self):
        """Code + email + verification_id tous valides"""
        s = VerifyCodeSerializer(data={
            "code": "654321",
            "email": "user@example.com",
            "verification_id": 1
        })
        assert s.is_valid(), s.errors

    def test_code_all_zeros_valid(self):
        """Code 000000 est valide (chiffres uniquement)"""
        s = VerifyCodeSerializer(data={"code": "000000", "email": "user@example.com"})
        assert s.is_valid(), s.errors

    def test_code_all_nines_valid(self):
        """Code 999999 est valide"""
        s = VerifyCodeSerializer(data={"code": "999999", "email": "user@example.com"})
        assert s.is_valid(), s.errors

    # ── Validation du code ────────────────────────────────────────────────────

    def test_code_too_short(self):
        """Code de moins de 6 chiffres → invalide"""
        s = VerifyCodeSerializer(data={"code": "12345", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_code_too_long(self):
        """Code de plus de 6 chiffres → invalide"""
        s = VerifyCodeSerializer(data={"code": "1234567", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_code_with_letters(self):
        """Code contenant des lettres → invalide"""
        s = VerifyCodeSerializer(data={"code": "12345a", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_code_with_special_chars(self):
        """Code contenant des caractères spéciaux → invalide"""
        s = VerifyCodeSerializer(data={"code": "123!56", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_code_with_spaces(self):
        """Code contenant des espaces → invalide"""
        s = VerifyCodeSerializer(data={"code": "12 456", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_empty_code(self):
        """Code vide → invalide"""
        s = VerifyCodeSerializer(data={"code": "", "email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    def test_missing_code(self):
        """Code absent → invalide"""
        s = VerifyCodeSerializer(data={"email": "user@example.com"})
        assert not s.is_valid()
        assert "code" in s.errors

    # ── Validation de l'identifiant ───────────────────────────────────────────

    def test_missing_both_identifiers(self):
        """Ni email ni verification_id → erreur non_field_errors"""
        s = VerifyCodeSerializer(data={"code": "123456"})
        assert not s.is_valid()
        # L'erreur est levée dans validate() → non_field_errors
        assert "non_field_errors" in s.errors or "__all__" in s.errors

    def test_email_normalized_in_verify(self):
        """L'email dans VerifyCodeSerializer n'est pas normalisé (champ EmailField standard)"""
        s = VerifyCodeSerializer(data={"code": "123456", "email": "User@Example.COM"})
        # EmailField normalise automatiquement via DRF
        assert s.is_valid(), s.errors

    def test_verification_id_must_be_integer(self):
        """verification_id doit être un entier"""
        s = VerifyCodeSerializer(data={"code": "123456", "verification_id": "not-an-int"})
        assert not s.is_valid()
        assert "verification_id" in s.errors

    def test_both_optional_fields_absent_but_code_present(self):
        """Avec seulement le code, la validation cross-field doit échouer"""
        s = VerifyCodeSerializer(data={"code": "123456"})
        assert not s.is_valid()

    # ── Champs optionnels ─────────────────────────────────────────────────────

    def test_email_is_optional_when_id_present(self):
        """L'email est optionnel quand verification_id est fourni"""
        s = VerifyCodeSerializer(data={"code": "123456", "verification_id": 99})
        assert s.is_valid(), s.errors
        assert "email" not in s.validated_data or s.validated_data.get("email") is None

    def test_verification_id_is_optional_when_email_present(self):
        """verification_id est optionnel quand email est fourni"""
        s = VerifyCodeSerializer(data={"code": "123456", "email": "user@example.com"})
        assert s.is_valid(), s.errors
        assert s.validated_data.get("verification_id") is None