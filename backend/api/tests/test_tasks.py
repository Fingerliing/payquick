# -*- coding: utf-8 -*-
"""
Tests pour api/tasks.py

Couvre:
- archive_session_delayed: Archivage différé d'une session
- auto_archive_eligible_sessions: Archivage automatique des sessions éligibles
- cleanup_old_archived_sessions: Nettoyage des vieilles sessions
- force_archive_abandoned_sessions: Archivage forcé des sessions abandonnées
"""

import pytest
import sys
import types
import importlib
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import User

from api.models import (
    Restaurant,
    RestaurateurProfile,
    CollaborativeTableSession,
    Table,
)

# =============================================================================
# SETUP: Créer les modules fictifs pour contourner les imports manquants
# =============================================================================

TASKS_PATH = Path(__file__).resolve().parents[1] / "tasks.py"
if not TASKS_PATH.exists():
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

    # Patch aussi dans le module websocket pour intercepter les signaux Django
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
    """Accès au mock notify_session_archived pour les assertions"""
    return patch_notify_session_archived


@pytest.fixture
def restaurateur_user(db):
    """Utilisateur restaurateur"""
    return User.objects.create_user(
        username="resto_tasks@example.com",
        email="resto_tasks@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    """Profil restaurateur"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def restaurant(db, restaurateur_profile):
    """Restaurant de test"""
    return Restaurant.objects.create(
        name="Tasks Test Restaurant",
        description="Restaurant pour tests des tâches",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(db, restaurant):
    """Table de test"""
    return Table.objects.create(
        restaurant=restaurant,
        number="TASK01",
        qr_code="TASKTEST01",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def active_session(db, restaurant, table):
    """Session collaborative active"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="TASK01",
        status="active",
        is_archived=False
    )


@pytest.fixture
def completed_session(db, restaurant, table):
    """Session collaborative complétée (bypass signaux d'archivage automatique)"""
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="TASK02",
        status="active",
        is_archived=False,
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        status="completed",
        completed_at=timezone.now() - timedelta(minutes=10),
        is_archived=False,
    )
    session.refresh_from_db()
    return session


@pytest.fixture
def archived_session(db, restaurant, table):
    """Session déjà archivée"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="TASK03",
        status="completed",
        is_archived=True,
        archived_at=timezone.now() - timedelta(days=31)
    )


@pytest.fixture
def old_archived_session(db, restaurant):
    """Vieille session archivée (pour cleanup)"""
    t = Table.objects.create(
        restaurant=restaurant,
        number="TASK04",
        qr_code="TASKTEST04",
        capacity=4,
        is_active=True
    )
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=t,
        table_number="TASK04",
        status="completed",
        is_archived=True
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        archived_at=timezone.now() - timedelta(days=35)
    )
    return session


@pytest.fixture
def abandoned_session(db, restaurant):
    """Session abandonnée (créée il y a longtemps)"""
    t = Table.objects.create(
        restaurant=restaurant,
        number="TASK05",
        qr_code="TASKTEST05",
        capacity=4,
        is_active=True
    )
    session = CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=t,
        table_number="TASK05",
        status="active",
        is_archived=False
    )
    CollaborativeTableSession.all_objects.filter(id=session.id).update(
        created_at=timezone.now() - timedelta(hours=15)
    )
    return session


# =============================================================================
# TESTS - archive_session_delayed
# =============================================================================

@pytest.mark.django_db
class TestArchiveSessionDelayed:
    """Tests pour archive_session_delayed"""

    def test_archives_completed_session(self, completed_session, notify_mock):
        """Test l'archivage d'une session complétée"""
        result = tasks_module.archive_session_delayed(str(completed_session.id))

        completed_session.refresh_from_db()
        assert completed_session.is_archived is True
        assert "archivée" in result
        notify_mock.assert_called_once()

    def test_with_custom_reason(self, completed_session, notify_mock):
        """Test avec une raison personnalisée"""
        custom_reason = "Test raison personnalisée"
        result = tasks_module.archive_session_delayed(
            str(completed_session.id),
            reason=custom_reason
        )

        completed_session.refresh_from_db()
        assert completed_session.is_archived is True
        notify_mock.assert_called_once_with(
            session_id=str(completed_session.id),
            reason=custom_reason
        )

    def test_already_archived_session(self, archived_session, notify_mock):
        """Test avec une session déjà archivée"""
        result = tasks_module.archive_session_delayed(str(archived_session.id))

        assert "déjà archivée" in result
        notify_mock.assert_not_called()

    def test_non_archivable_session(self, active_session, notify_mock):
        """Test avec une session non archivable (active)"""
        result = tasks_module.archive_session_delayed(str(active_session.id))

        active_session.refresh_from_db()
        assert "non éligible" in result or active_session.is_archived is False
        notify_mock.assert_not_called()

    def test_nonexistent_session(self, notify_mock):
        """Test avec une session inexistante"""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        result = tasks_module.archive_session_delayed(fake_uuid)

        assert "introuvable" in result
        notify_mock.assert_not_called()

    def test_websocket_notification_failure(self, completed_session, notify_mock):
        """Test que l'échec WebSocket n'empêche pas l'archivage"""
        notify_mock.side_effect = Exception("WebSocket error")

        result = tasks_module.archive_session_delayed(str(completed_session.id))

        completed_session.refresh_from_db()
        assert completed_session.is_archived is True
        assert "archivée" in result


# =============================================================================
# TESTS - auto_archive_eligible_sessions
# =============================================================================

@pytest.mark.django_db
class TestAutoArchiveEligibleSessions:
    """Tests pour auto_archive_eligible_sessions"""

    def test_archives_eligible_sessions(self, restaurant, notify_mock):
        """Test l'archivage des sessions éligibles"""
        table1 = Table.objects.create(
            restaurant=restaurant, number="AUTO01", qr_code="AUTO01"
        )
        table2 = Table.objects.create(
            restaurant=restaurant, number="AUTO02", qr_code="AUTO02"
        )

        session1 = CollaborativeTableSession.objects.create(
            restaurant=restaurant, table=table1, table_number="AUTO01",
            status="active", is_archived=False
        )
        session2 = CollaborativeTableSession.objects.create(
            restaurant=restaurant, table=table2, table_number="AUTO02",
            status="active", is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id__in=[session1.id, session2.id]).update(
            status="completed",
            is_archived=False,
            completed_at=timezone.now() - timedelta(minutes=10),
        )

        result = tasks_module.auto_archive_eligible_sessions()

        session1.refresh_from_db()
        session2.refresh_from_db()
        assert session1.is_archived is True
        assert session2.is_archived is True
        assert notify_mock.call_count == 2

    def test_skips_recent_sessions(self, restaurant, notify_mock):
        """Test que les sessions récentes ne sont pas archivées"""
        table = Table.objects.create(
            restaurant=restaurant, number="RECENT01", qr_code="RECENT01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant, table=table, table_number="RECENT01",
            status="active", is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            status="completed",
            is_archived=False,
            completed_at=timezone.now() - timedelta(minutes=2),
        )

        result = tasks_module.auto_archive_eligible_sessions()

        session.refresh_from_db()
        assert session.is_archived is False
        notify_mock.assert_not_called()

    def test_skips_active_sessions(self, active_session, notify_mock):
        """Test que les sessions actives ne sont pas archivées"""
        result = tasks_module.auto_archive_eligible_sessions()

        active_session.refresh_from_db()
        assert active_session.is_archived is False
        notify_mock.assert_not_called()

    def test_archives_cancelled_sessions(self, restaurant, notify_mock):
        """Test l'archivage des sessions annulées"""
        table = Table.objects.create(
            restaurant=restaurant, number="CANCEL01", qr_code="CANCEL01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant, table=table, table_number="CANCEL01",
            status="active", is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            status="cancelled",
            is_archived=False,
            completed_at=timezone.now() - timedelta(minutes=10),
        )

        result = tasks_module.auto_archive_eligible_sessions()

        session.refresh_from_db()
        assert session.is_archived is True
        notify_mock.assert_called_once()

    def test_handles_empty_eligible_list(self, notify_mock):
        """Test quand il n'y a pas de sessions éligibles"""
        result = tasks_module.auto_archive_eligible_sessions()

        assert "0" in result
        notify_mock.assert_not_called()

    def test_handles_websocket_failure(self, completed_session, notify_mock):
        """Test que l'échec WebSocket n'empêche pas l'archivage"""
        notify_mock.side_effect = Exception("WebSocket error")

        result = tasks_module.auto_archive_eligible_sessions()

        completed_session.refresh_from_db()
        assert completed_session.is_archived is True


# =============================================================================
# TESTS - cleanup_old_archived_sessions
# =============================================================================

@pytest.mark.django_db
class TestCleanupOldArchivedSessions:
    """Tests pour cleanup_old_archived_sessions"""

    def test_deletes_old_sessions(self, old_archived_session):
        """Test la suppression des vieilles sessions"""
        session_id = old_archived_session.id

        result = tasks_module.cleanup_old_archived_sessions(days=30)

        assert not CollaborativeTableSession.all_objects.filter(id=session_id).exists()
        assert "supprimée" in result

    def test_keeps_recent_archived_sessions(self, archived_session):
        """Test que les sessions archivées récentes sont gardées"""
        CollaborativeTableSession.all_objects.filter(id=archived_session.id).update(
            archived_at=timezone.now() - timedelta(days=10)
        )

        session_id = archived_session.id

        result = tasks_module.cleanup_old_archived_sessions(days=30)

        assert CollaborativeTableSession.all_objects.filter(id=session_id).exists()

    def test_with_custom_days_parameter(self, archived_session):
        """Test avec un paramètre days personnalisé"""
        session_id = archived_session.id

        result = tasks_module.cleanup_old_archived_sessions(days=40)

        assert CollaborativeTableSession.all_objects.filter(id=session_id).exists()

        result = tasks_module.cleanup_old_archived_sessions(days=20)

        assert not CollaborativeTableSession.all_objects.filter(id=session_id).exists()

    def test_handles_no_old_sessions(self):
        """Test quand il n'y a pas de vieilles sessions"""
        result = tasks_module.cleanup_old_archived_sessions(days=30)

        assert "0" in result

    def test_keeps_non_archived_sessions(self, completed_session):
        """Test que les sessions non archivées sont gardées"""
        session_id = completed_session.id

        result = tasks_module.cleanup_old_archived_sessions(days=0)

        assert CollaborativeTableSession.all_objects.filter(id=session_id).exists()


# =============================================================================
# TESTS - force_archive_abandoned_sessions
# =============================================================================

@pytest.mark.django_db
class TestForceArchiveAbandonedSessions:
    """Tests pour force_archive_abandoned_sessions"""

    def test_archives_abandoned_sessions(self, abandoned_session, notify_mock):
        """Test l'archivage des sessions abandonnées"""
        abandoned_session.refresh_from_db()

        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        abandoned_session.refresh_from_db()

        assert abandoned_session.status == "cancelled"
        assert abandoned_session.is_archived is True
        assert "archivée" in result
        notify_mock.assert_called_once()

    def test_skips_recent_active_sessions(self, active_session, notify_mock):
        """Test que les sessions actives récentes ne sont pas archivées"""
        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        active_session.refresh_from_db()

        assert active_session.status == "active"
        assert active_session.is_archived is False
        notify_mock.assert_not_called()

    def test_archives_locked_sessions(self, restaurant, notify_mock):
        """Test l'archivage des sessions verrouillées abandonnées"""
        table = Table.objects.create(
            restaurant=restaurant, number="LOCK01", qr_code="LOCK01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="LOCK01",
            status="locked",
            is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            created_at=timezone.now() - timedelta(hours=15)
        )

        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        session.refresh_from_db()

        assert session.status == "cancelled"
        assert session.is_archived is True

    def test_with_custom_hours_parameter(self, restaurant, notify_mock):
        """Test avec un paramètre hours personnalisé"""
        table = Table.objects.create(
            restaurant=restaurant, number="HRS01", qr_code="HRS01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="HRS01",
            status="active",
            is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            created_at=timezone.now() - timedelta(hours=5)
        )

        result = tasks_module.force_archive_abandoned_sessions(hours=4)

        session.refresh_from_db()

        assert session.is_archived is True

    def test_skips_already_archived_sessions(self, archived_session, notify_mock):
        """Test que les sessions déjà archivées sont ignorées"""
        CollaborativeTableSession.all_objects.filter(id=archived_session.id).update(
            created_at=timezone.now() - timedelta(hours=15)
        )

        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        notify_mock.assert_not_called()

    def test_handles_websocket_notification_failure(self, abandoned_session, notify_mock):
        """Test que l'échec WebSocket n'empêche pas l'archivage"""
        notify_mock.side_effect = Exception("WebSocket error")

        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        abandoned_session.refresh_from_db()

        assert abandoned_session.is_archived is True

    def test_handles_no_abandoned_sessions(self, notify_mock):
        """Test quand il n'y a pas de sessions abandonnées"""
        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        assert "0" in result
        notify_mock.assert_not_called()


# =============================================================================
# TESTS - Attributs Celery et exports
# =============================================================================

@pytest.mark.django_db
class TestTaskAttributes:
    """Tests des attributs des tâches Celery"""

    def test_archive_session_delayed_name(self):
        """Test que archive_session_delayed a le bon nom"""
        assert tasks_module.archive_session_delayed.name == 'api.tasks.archive_session_delayed'

    def test_auto_archive_eligible_sessions_name(self):
        """Test que auto_archive_eligible_sessions a le bon nom"""
        assert tasks_module.auto_archive_eligible_sessions.name == 'api.tasks.auto_archive_eligible_sessions'

    def test_cleanup_old_archived_sessions_name(self):
        """Test que cleanup_old_archived_sessions a le bon nom"""
        assert tasks_module.cleanup_old_archived_sessions.name == 'api.tasks.cleanup_old_archived_sessions'

    def test_force_archive_abandoned_sessions_name(self):
        """Test que force_archive_abandoned_sessions a le bon nom"""
        assert tasks_module.force_archive_abandoned_sessions.name == 'api.tasks.force_archive_abandoned_sessions'

    def test_module_exports(self):
        """Test que __all__ contient les bonnes fonctions"""
        expected_exports = [
            'archive_session_delayed',
            'auto_archive_eligible_sessions',
            'cleanup_old_archived_sessions',
            'force_archive_abandoned_sessions',
            'generate_monthly_recap',
            'sync_stripe_daily',
            'cleanup_old_exports',
            'generate_ecritures_comptables',
            'generate_fec_async',
        ]
        for export in expected_exports:
            assert export in tasks_module.__all__, f"{export} not in __all__"


# =============================================================================
# TESTS - Intégration
# =============================================================================

@pytest.mark.django_db
class TestTasksIntegration:
    """Tests d'intégration des tâches"""

    def test_full_lifecycle(self, restaurant, notify_mock):
        """Test du cycle de vie complet d'une session"""
        table = Table.objects.create(
            restaurant=restaurant, number="LIFE01", qr_code="LIFE01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="LIFE01",
            status="active",
            is_archived=False
        )

        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            status="completed",
            completed_at=timezone.now() - timedelta(minutes=10),
            is_archived=False,
        )

        result = tasks_module.auto_archive_eligible_sessions()

        session.refresh_from_db()
        assert session.is_archived is True

        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            archived_at=timezone.now() - timedelta(days=35)
        )

        session_id = session.id
        result = tasks_module.cleanup_old_archived_sessions(days=30)

        assert not CollaborativeTableSession.all_objects.filter(id=session_id).exists()

    def test_abandoned_then_cleanup(self, restaurant, notify_mock):
        """Test d'une session abandonnée puis nettoyée"""
        table = Table.objects.create(
            restaurant=restaurant, number="ABAND01", qr_code="ABAND01"
        )
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="ABAND01",
            status="active",
            is_archived=False
        )
        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            created_at=timezone.now() - timedelta(hours=15)
        )

        result = tasks_module.force_archive_abandoned_sessions(hours=12)

        session.refresh_from_db()
        assert session.is_archived is True
        assert session.status == "cancelled"

        CollaborativeTableSession.all_objects.filter(id=session.id).update(
            archived_at=timezone.now() - timedelta(days=35)
        )

        session_id = session.id
        result = tasks_module.cleanup_old_archived_sessions(days=30)

        assert not CollaborativeTableSession.all_objects.filter(id=session_id).exists()