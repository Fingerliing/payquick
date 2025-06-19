# ---------------------------------------------------------------------
# Tests for custom permission classes
# ---------------------------------------------------------------------

import pytest
from django.contrib.auth.models import User, Group
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from api.permissions import IsInGroup, IsRestaurateur, IsAdmin, IsClient


@pytest.fixture
def user_with_groups():
    user = User.objects.create_user(username="testuser", password="12345")
    group_resto = Group.objects.create(name="restaurateur")
    group_admin = Group.objects.create(name="admin")
    group_client = Group.objects.create(name="client")
    user.groups.add(group_resto, group_admin, group_client)
    return user


@pytest.mark.django_db
def test_is_in_group_permission(user_with_groups):
    factory = APIRequestFactory()
    request = factory.get("/")
    request.user = user_with_groups

    permission = IsInGroup(groups=["client", "admin"])
    assert permission.has_permission(request, None) is True

    permission = IsInGroup(groups=["unknown"])
    assert permission.has_permission(request, None) is False


@pytest.mark.django_db
def test_is_restaurateur_permission(user_with_groups):
    factory = APIRequestFactory()
    request = factory.get("/")
    request.user = user_with_groups

    permission = IsRestaurateur()
    assert permission.has_permission(request, None) is True


@pytest.mark.django_db
def test_is_admin_permission(user_with_groups):
    factory = APIRequestFactory()
    request = factory.get("/")
    request.user = user_with_groups

    permission = IsInGroup(groups=["admin"])
    assert permission.has_permission(request, None) is True


@pytest.mark.django_db
def test_is_client_permission(user_with_groups):
    factory = APIRequestFactory()
    request = factory.get("/")
    request.user = user_with_groups

    permission = IsInGroup(groups=["client"])
    assert permission.has_permission(request, None) is True
