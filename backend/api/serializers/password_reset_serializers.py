"""
Serializers pour la réinitialisation de mot de passe.
"""
import re
from rest_framework import serializers


# Règles de validation du mot de passe — alignées sur l'inscription
# (au moins 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial).
PASSWORD_REGEX_UPPERCASE = re.compile(r'[A-Z]')
PASSWORD_REGEX_DIGIT = re.compile(r'\d')
PASSWORD_REGEX_SPECIAL = re.compile(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;\']')


def _validate_strong_password(value: str) -> str:
    """Validation forte du mot de passe — réutilisable."""
    if len(value) < 8:
        raise serializers.ValidationError(
            "Le mot de passe doit contenir au moins 8 caractères."
        )
    if not PASSWORD_REGEX_UPPERCASE.search(value):
        raise serializers.ValidationError(
            "Le mot de passe doit contenir au moins une majuscule."
        )
    if not PASSWORD_REGEX_DIGIT.search(value):
        raise serializers.ValidationError(
            "Le mot de passe doit contenir au moins un chiffre."
        )
    if not PASSWORD_REGEX_SPECIAL.search(value):
        raise serializers.ValidationError(
            "Le mot de passe doit contenir au moins un caractère spécial."
        )
    return value


class InitiatePasswordResetSerializer(serializers.Serializer):
    """Étape 1 : demande d'envoi du code par email."""
    email = serializers.EmailField(required=True)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class ConfirmPasswordResetSerializer(serializers.Serializer):
    """
    Étape 2 : confirmation du nouveau mot de passe avec le code reçu.
    """
    reset_id = serializers.UUIDField(required=True)
    code = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_code(self, value: str) -> str:
        if not value.isdigit():
            raise serializers.ValidationError(
                "Le code doit contenir uniquement des chiffres."
            )
        return value

    def validate_new_password(self, value: str) -> str:
        return _validate_strong_password(value)


class ResendPasswordResetSerializer(serializers.Serializer):
    """Renvoi du code de réinitialisation."""
    reset_id = serializers.UUIDField(required=True)
