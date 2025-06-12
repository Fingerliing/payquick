from rest_framework import serializers
from api.models import RestaurateurProfile

class RestaurateurProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurateurProfile
        fields = "__all__"
