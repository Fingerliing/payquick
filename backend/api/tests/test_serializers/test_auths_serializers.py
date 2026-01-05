# ---------------------------------------------------------------------
# Tests for RegisterSerializer
# ---------------------------------------------------------------------

import pytest
from django.contrib.auth.models import User
from api.serializers.auth_serializers import RegisterSerializer
from api.models import ClientProfile, RestaurateurProfile
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.mark.django_db
def test_register_client_creation():
    data = {
        "username": "client@example.com",
        "password": "strongpass",
        "nom": "Client",
        "role": "client",
        "telephone": "0600000000"
    }

    serializer = RegisterSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    user = serializer.save()

    assert User.objects.filter(username="client@example.com").exists()
    assert ClientProfile.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_register_restaurateur_creation():
    cni = SimpleUploadedFile("cni.pdf", b"x", content_type="application/pdf")
    kbis = SimpleUploadedFile("kbis.pdf", b"x", content_type="application/pdf")

    data = {
        "username": "resto@example.com",
        "password": "strongpass",
        "nom": "Chef",
        "role": "restaurateur",
        "siret": "12345678901234",
        "cni": cni,
        "kbis": kbis
    }

    serializer = RegisterSerializer(data=data)
    is_valid = serializer.is_valid()

    assert is_valid, "Le serializer a échoué à valider les données fournies."
    user = serializer.save()

    assert RestaurateurProfile.objects.filter(user=user).exists()

@pytest.mark.django_db
def test_register_invalid_role():
    data = {
        "username": "invalid@example.com",
        "password": "strongpass",
        "nom": "Invalide",
        "role": "admin"  # non autorisé
    }

    serializer = RegisterSerializer(data=data)
    assert not serializer.is_valid()
    assert "role" in serializer.errors
