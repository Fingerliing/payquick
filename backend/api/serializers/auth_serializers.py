from rest_framework import serializers
from django.contrib.auth.models import User
from api.models import ClientProfile, RestaurateurProfile

class RegisterSerializer(serializers.Serializer):
    username = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    nom = serializers.CharField()
    role = serializers.ChoiceField(choices=["client", "restaurateur"])
    telephone = serializers.CharField(required=False, allow_blank=True)
    siret = serializers.CharField(required=False, allow_blank=True)

    def create(self, validated_data):
        role = validated_data["role"]
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            first_name=validated_data.get("nom", "")
        )

        if role == "client":
            ClientProfile.objects.create(
                user=user,
                phone=validated_data.get("telephone", "")
            )
        elif role == "restaurateur":
            RestaurateurProfile.objects.create(
                user=user,
                siret=validated_data.get("siret", ""),
            )
        return user
