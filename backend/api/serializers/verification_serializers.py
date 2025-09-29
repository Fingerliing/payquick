from rest_framework import serializers
import phonenumbers
from phonenumbers import carrier

class SendVerificationSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=20)
    
    def validate_phone_number(self, value):
        """Valide et formate le numéro de téléphone"""
        try:
            # Parser le numéro (défaut France)
            parsed = phonenumbers.parse(value, "FR")
            
            # Vérifier la validité
            if not phonenumbers.is_valid_number(parsed):
                raise serializers.ValidationError("Numéro de téléphone invalide.")
            
            # Retourner au format international
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            
        except phonenumbers.NumberParseException:
            raise serializers.ValidationError("Format de numéro invalide.")

class VerifyCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)
    verification_id = serializers.IntegerField(required=False)
    phone_number = serializers.CharField(max_length=20, required=False)
    
    def validate_code(self, value):
        """Vérifie que le code ne contient que des chiffres"""
        if not value.isdigit():
            raise serializers.ValidationError("Le code doit contenir uniquement des chiffres.")
        return value
    
    def validate(self, data):
        """Vérifie qu'on a au moins une façon d'identifier la vérification"""
        if not data.get('verification_id') and not data.get('phone_number'):
            raise serializers.ValidationError(
                "Vous devez fournir soit verification_id soit phone_number."
            )
        return data