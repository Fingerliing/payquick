from rest_framework import serializers


class SendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        """Normalise l'email en minuscules"""
        return value.strip().lower()


class VerifyCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)
    verification_id = serializers.IntegerField(required=False)
    email = serializers.EmailField(required=False)

    def validate_code(self, value):
        """Vérifie que le code ne contient que des chiffres"""
        if not value.isdigit():
            raise serializers.ValidationError("Le code doit contenir uniquement des chiffres.")
        return value

    def validate(self, data):
        """Vérifie qu'on a au moins une façon d'identifier la vérification"""
        if not data.get('verification_id') and not data.get('email'):
            raise serializers.ValidationError(
                "Vous devez fournir soit verification_id soit email."
            )
        return data