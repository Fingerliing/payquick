import importlib.util
import sys
import types
from pathlib import Path
from datetime import timedelta

import pytest
from django.utils import timezone

from api.models import CollaborativeTableSession, Table
from api.tests.factories import RestaurantFactory


dummy_ws_module = types.ModuleType("api.utils.websocket_notifications")
dummy_ws_module.notify_session_archived = lambda *args, **kwargs: None
sys.modules.setdefault("api.utils.websocket_notifications", dummy_ws_module)

dummy_tasks_pkg = types.ModuleType("api.tasks")
dummy_tasks_pkg.__path__ = []
sys.modules.setdefault("api.tasks", dummy_tasks_pkg)

dummy_compta_module = types.ModuleType("api.tasks.comptabilite_tasks")
dummy_compta_module.generate_monthly_recap = lambda *args, **kwargs: None
dummy_compta_module.sync_stripe_daily = lambda *args, **kwargs: None
dummy_compta_module.cleanup_old_exports = lambda *args, **kwargs: None
dummy_compta_module.generate_ecritures_comptables = lambda *args, **kwargs: None
dummy_compta_module.generate_fec_async = lambda *args, **kwargs: None
sys.modules.setdefault("api.tasks.comptabilite_tasks", dummy_compta_module)

tasks_path = Path(__file__).resolve().parents[2] / "tasks.py"
spec = importlib.util.spec_from_file_location("api.tasks_main", tasks_path)
tasks_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tasks_module)


@pytest.mark.django_db
def test_archive_session_delayed_archives(monkeypatch):
    called = {}

    def fake_notify(session_id, reason=None):
        called["session_id"] = session_id
        called["reason"] = reason

    monkeypatch.setattr(tasks_module, "notify_session_archived", fake_notify)

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
    assert called["session_id"] == str(session.id)


@pytest.mark.django_db
def test_auto_archive_eligible_sessions(monkeypatch):
    calls = []

    def fake_notify(session_id, reason=None):
        calls.append((session_id, reason))

    monkeypatch.setattr(tasks_module, "notify_session_archived", fake_notify)

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
    assert calls


@pytest.mark.django_db
def test_cleanup_old_archived_sessions():
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
def test_force_archive_abandoned_sessions(monkeypatch):
    calls = []

    def fake_notify(session_id, reason=None):
        calls.append((session_id, reason))

    monkeypatch.setattr(tasks_module, "notify_session_archived", fake_notify)

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
    assert calls
