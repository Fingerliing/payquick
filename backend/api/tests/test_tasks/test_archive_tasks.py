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


setup_dummy_modules()

spec = importlib.util.spec_from_file_location("api.tasks_main", TASKS_PATH)
tasks_module = importlib.util.module_from_spec(spec)
sys.modules["api.tasks_main"] = tasks_module
spec.loader.exec_module(tasks_module)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture(autouse=True)
def patch_notify_session_archived():
    """
    Patch notify_session_archived dans les __globals__ réels des fonctions de tâche.
    Utilise func_globals pour garantir que le patch atteint la closure Celery.
    """
    notify_mock = MagicMock()

    try:
        func_globals = tasks_module.archive_session_delayed.run.__globals__
    except AttributeError:
        try:
            func_globals = tasks_module.archive_session_delayed.__wrapped__.__globals__
        except AttributeError:
            func_globals = tasks_module.__dict__

    original = func_globals.get('notify_session_archived')
    func_globals['notify_session_archived'] = notify_mock

    ws_mod = sys.modules.get('api.utils.websocket_notifications')
    original_ws = None
    if ws_mod:
        original_ws = getattr(ws_mod, 'notify_session_archived', None)
        ws_mod.notify_session_archived = notify_mock

    yield notify_mock

    if original is not None:
        func_globals['notify_session_archived'] = original
    else:
        func_globals.pop('notify_session_archived', None)

    if ws_mod and original_ws is not None:
        ws_mod.notify_session_archived = original_ws


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
        status="active",
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        status="completed",
        is_archived=False,
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
        status="active",
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        status="completed",
        completed_at=timezone.now() - timedelta(minutes=6),
        is_archived=False,
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