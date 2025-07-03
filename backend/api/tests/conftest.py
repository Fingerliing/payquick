import pytest
from rest_framework.test import APIClient
from .factories import (
    UserFactory,
    RestaurateurProfileFactory,
    RestaurantFactory,
    MenuFactory,
    MenuItemFactory,
    OrderFactory,
    OrderItemFactory,
    TableFactory,
)

@pytest.fixture(autouse=True)
def disable_throttling(settings):
    settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []
    settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {}

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def authenticated_client():
    user = UserFactory()
    client = APIClient()
    client.force_authenticate(user=user)
    return client

@pytest.fixture
def restaurateur_user_factory():
    def make_user(**kwargs):
        profile = RestaurateurProfileFactory(**kwargs)
        return profile.user
    return make_user

@pytest.fixture
def restaurateur_profile_factory():
    return RestaurateurProfileFactory

@pytest.fixture
def restaurant_factory():
    return RestaurantFactory

@pytest.fixture
def menu_factory():
    return MenuFactory

@pytest.fixture
def menu_item_factory():
    return MenuItemFactory

@pytest.fixture
def table_factory():
    return TableFactory

@pytest.fixture
def order_factory():
    return OrderFactory

@pytest.fixture
def order_item_factory():
    return OrderItemFactory
