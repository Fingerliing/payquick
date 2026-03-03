import pytest
from django.utils import timezone
from datetime import timedelta
from api.tests.factories import (
    UserFactory,
    RestaurateurProfileFactory,
    RestaurantFactory,
    TableFactory,
)


def make_collaborative_session(restaurant, table, host_user):
    """Helper pour créer une session collaborative active."""
    from api.models import CollaborativeTableSession, SessionParticipant

    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        status='active',
        is_archived=False,
    )
    SessionParticipant.objects.create(
        session=session,
        user=host_user,
        role='host',
        status='approved',
    )
    return session


@pytest.fixture
def host_user():
    return UserFactory()


@pytest.fixture
def restaurateur_profile(host_user):
    return RestaurateurProfileFactory(user=host_user)


@pytest.fixture
def restaurant(restaurateur_profile):
    return RestaurantFactory(owner=restaurateur_profile)


@pytest.fixture
def table(restaurant):
    return TableFactory(restaurant=restaurant)


@pytest.fixture
def collaborative_session(restaurant, table, host_user):
    from api.models import CollaborativeTableSession
    """Session collaborative active, mise à jour il y a 20 minutes (inactive)."""
    session = make_collaborative_session(restaurant, table, host_user)
    # Simuler inactivité de 20 minutes
    CollaborativeTableSession = session.__class__
    CollaborativeTableSession.objects.filter(pk=session.pk).update(
        updated_at=timezone.now() - timedelta(minutes=20)
    )
    session.refresh_from_db()
    return session


@pytest.fixture
def another_collaborative_session(restaurant, table, host_user):
    """Deuxième session sur une autre table, aussi inactive."""
    from api.models import CollaborativeTableSession

    table2 = TableFactory(restaurant=restaurant)
    session = make_collaborative_session(restaurant, table2, host_user)
    CollaborativeTableSession.objects.filter(pk=session.pk).update(
        updated_at=timezone.now() - timedelta(minutes=20)
    )
    session.refresh_from_db()
    return session