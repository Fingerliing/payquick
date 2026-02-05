import importlib.util
import sys
import types
from pathlib import Path
from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from django.utils import timezone

from api.models import CollaborativeTableSession, Table
from api.tests.factories import RestaurantFactory


# =============================================================================
# SETUP: Créer les modules fictifs et charger tasks.py
# =============================================================================

# Chemin vers tasks.py
TASKS_PATH = Path(__file__).resolve().parents[2] / "tasks.py"


def setup_dummy_modules():
    """Configure les modules fictifs pour permettre l'import initial."""
    if "api.utils.websocket_notifications" not in sys.modules:
        dummy_ws = types.ModuleType("api.utils.websocket_notifications")
        dummy_ws.notify_session_archived = lambda *args, **kwargs: None
        sys.modules["api.utils.websocket_notifications"] = dummy_ws
    
    if "api.tasks" not in sys.modules:
        dummy_pkg = types.ModuleType("api.tasks")
        dummy_pkg.__path__ = []
        sys.modules["api.tasks"] = dummy_pkg
    
    if "api.tasks.comptabilite_tasks" not in sys.modules:
        dummy_compta = types.ModuleType("api.tasks.comptabilite_tasks")
        dummy_compta.generate_monthly_recap = lambda *args, **kwargs: None
        dummy_compta.sync_stripe_daily = lambda *args, **kwargs: None
        dummy_compta.cleanup_old_exports = lambda *args, **kwargs: None
        dummy_compta.generate_ecritures_comptables = lambda *args, **kwargs: None
        dummy_compta.generate_fec_async = lambda *args, **kwargs: None
        sys.modules["api.tasks.comptabilite_tasks"] = dummy_compta


# Configurer une fois au chargement
setup_dummy_modules()

# Charger le module tasks une seule fois
spec = importlib.util.spec_from_file_location("api.tasks_main", TASKS_PATH)
tasks_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tasks_module)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture(autouse=True)
def patch_notify_session_archived():
    """Patch notify_session_archived dans le namespace du module tasks."""
    notify_mock = MagicMock()
    original = tasks_module.notify_session_archived
    tasks_module.notify_session_archived = notify_mock
    yield notify_mock
    tasks_module.notify_session_archived = original


@pytest.fixture
def notify_mock(patch_notify_session_archived):
    """Accès au mock notify_session_archived"""
    return patch_notify_session_archived

@pytest.fixture
def fresh_tasks_module(patch_notify_session_archived):
    """Compat: certains tests configurent un side_effect sur le mock WebSocket."""
    return patch_notify_session_archived

# =============================================================================
# TESTS
# =============================================================================

@pytest.mark.django_db
def test_archive_session_delayed_archives(notify_mock):
    """Test l'archivage différé d'une session"""
    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="10")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="10",
        status="completed",
    )

    result = tasks_module.archive_session_delayed(session.id, reason="test")

    session.refresh_from_db()
    assert session.is_archived is True
    assert "archivée" in result
    notify_mock.assert_called_once()
    assert notify_mock.call_args[1]["session_id"] == str(session.id)


@pytest.mark.django_db
def test_auto_archive_eligible_sessions(notify_mock):
    """Test l'archivage automatique des sessions éligibles"""
    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="11")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="11",
        status="completed",
        completed_at=timezone.now() - timedelta(minutes=6),
    )

    tasks_module.auto_archive_eligible_sessions()

    session.refresh_from_db()
    assert session.is_archived is True
    assert notify_mock.call_count >= 1


@pytest.mark.django_db
def test_cleanup_old_archived_sessions():
    """Test le nettoyage des vieilles sessions archivées"""
    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="12")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="12",
        status="completed",
        is_archived=True,
        archived_at=timezone.now() - timedelta(days=31),
    )

    result = tasks_module.cleanup_old_archived_sessions(days=30)

    assert "supprimée" in result
    assert not CollaborativeTableSession.all_objects.filter(id=session.id).exists()


@pytest.mark.django_db
def test_force_archive_abandoned_sessions(notify_mock):
    """Test l'archivage forcé des sessions abandonnées"""
    restaurant = RestaurantFactory()
    table = Table.objects.create(restaurant=restaurant, number="13")
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="13",
        status="active",
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        created_at=timezone.now() - timedelta(hours=13)
    )

    result = tasks_module.force_archive_abandoned_sessions(hours=12)

    session.refresh_from_db()
    assert session.status == "cancelled"
    assert session.is_archived is True
    assert "archivée" in result
    assert notify_mock.call_count >= 1