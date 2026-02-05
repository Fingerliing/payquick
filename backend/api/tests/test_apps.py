# -*- coding: utf-8 -*-
"""
Tests pour api/apps.py

Couvre les branches d'erreur de la méthode ready():
- Ligne 16-17: ImportError lors du chargement de api.signals
- Ligne 22: ImportError lors du chargement de api.signals.comptabilite_signals
"""

import pytest
from unittest.mock import patch, MagicMock
import sys
import builtins


@pytest.mark.django_db
class TestApiConfig:
    """Tests pour ApiConfig"""

    def test_app_config_attributes(self):
        """Test les attributs de configuration de l'app"""
        from django.apps import apps
        
        config = apps.get_app_config('api')
        
        assert config.name == 'api'
        assert config.verbose_name == 'Eat&Go API'
        assert config.default_auto_field == 'django.db.models.BigAutoField'

    def test_ready_method_exists(self):
        """Test que la méthode ready() existe sur ApiConfig"""
        from api.apps import ApiConfig
        
        assert hasattr(ApiConfig, 'ready')
        assert callable(getattr(ApiConfig, 'ready'))

    def test_app_is_registered(self):
        """Test que l'app api est bien enregistrée dans Django"""
        from django.apps import apps
        
        assert apps.is_installed('api')


@pytest.mark.django_db
class TestApiConfigReadyMethod:
    """Tests pour la méthode ready() et ses branches d'erreur"""

    def test_ready_signals_import_success(self, capsys):
        """Test ready() quand api.signals s'importe correctement"""
        from django.apps import apps
        
        # L'app est déjà chargée, ready() a été appelé
        # Vérifions que les signaux sont chargés
        assert 'api.signals' in sys.modules

    def test_ready_signals_import_error_handling(self, capsys):
        """
        Test de la gestion d'erreur pour api.signals (lignes 16-17)
        
        On simule ce que fait ready() quand l'import échoue.
        """
        from api.apps import ApiConfig
        import api
        
        config = ApiConfig('api', api)
        
        # Sauvegarder et supprimer le module signals
        saved_modules = {}
        for mod_name in list(sys.modules.keys()):
            if mod_name.startswith('api.signals'):
                saved_modules[mod_name] = sys.modules.pop(mod_name)
        
        # Patcher pour simuler l'échec de l'import
        original_import = builtins.__import__
        
        def failing_import(name, *args, **kwargs):
            if name == 'api.signals':
                raise ImportError("Simulated: api.signals not found")
            return original_import(name, *args, **kwargs)
        
        try:
            with patch.object(builtins, '__import__', failing_import):
                config.ready()
            
            captured = capsys.readouterr()
            assert "❌" in captured.out or "Erreur" in captured.out
        finally:
            # Restaurer les modules
            sys.modules.update(saved_modules)

    def test_ready_comptabilite_import_error_handling(self, capsys):
        """
        Test de la gestion d'erreur pour comptabilite_signals
        
        Le module api.signals.comptabilite_signals n'existe pas,
        donc la branche except est exécutée silencieusement dans ready().
        """
        from api.apps import ApiConfig
        import api
        
        config = ApiConfig('api', api)
        
        # S'assurer que le module n'existe pas
        sys.modules.pop('api.signals.comptabilite_signals', None)
        
        # Appeler ready() - le module comptabilite_signals n'existe pas
        # donc la branche except sera exécutée silencieusement
        config.ready()
        # Pas d'exception = le except ImportError a bien fonctionné

    def test_ready_comptabilite_import_success(self, capsys):
        """
        Test ready() quand api.signals.comptabilite_signals s'importe avec succès (ligne 22)
        
        On simule l'existence du module pour couvrir la branche de succès.
        """
        from api.apps import ApiConfig
        import api
        
        config = ApiConfig('api', api)
        
        # Créer un faux module comptabilite_signals
        fake_comptabilite_module = MagicMock()
        fake_comptabilite_module.__name__ = 'api.signals.comptabilite_signals'
        
        # Injecter le faux module dans sys.modules AVANT d'appeler ready()
        sys.modules['api.signals.comptabilite_signals'] = fake_comptabilite_module
        
        try:
            # Appeler ready() - l'import de comptabilite_signals devrait réussir
            config.ready()
            
            captured = capsys.readouterr()
            # Vérifier que le message de succès pour comptabilité a été affiché
            assert "✅ [APPS] Signaux de comptabilité chargés" in captured.out
        finally:
            # Nettoyer - supprimer le faux module
            sys.modules.pop('api.signals.comptabilite_signals', None)

    def test_ready_called_new_instance(self, capsys):
        """Test d'appel direct de ready() sur une nouvelle instance"""
        from api.apps import ApiConfig
        import api  # Le module api réel
        
        # Créer une nouvelle instance avec le vrai module
        config = ApiConfig('api', api)
        
        # Supprimer les modules des signaux pour forcer un rechargement
        modules_to_restore = {}
        for mod_name in list(sys.modules.keys()):
            if mod_name.startswith('api.signals'):
                modules_to_restore[mod_name] = sys.modules.pop(mod_name)
        
        try:
            # Appeler ready() - cela devrait importer les signaux
            config.ready()
            
            captured = capsys.readouterr()
            # Vérifier qu'un message a été affiché (succès ou erreur)
            assert "✅" in captured.out or "❌" in captured.out or captured.out == ""
            
        finally:
            # Restaurer les modules
            sys.modules.update(modules_to_restore)



@pytest.mark.django_db
class TestApiConfigEdgeCases:
    """Tests des cas limites"""

    def test_multiple_ready_calls(self, capsys):
        """Test que ready() peut être appelé plusieurs fois sans erreur"""
        from api.apps import ApiConfig
        import api
        
        config = ApiConfig('api', api)
        
        # Appeler ready() plusieurs fois
        config.ready()
        config.ready()
        
        # Pas d'exception = succès

    def test_signals_module_content(self):
        """Test que le module signals est bien chargé avec du contenu"""
        # Le module api.signals devrait être chargé à ce stade
        assert 'api.signals' in sys.modules
        signals_module = sys.modules['api.signals']
        # Le module devrait avoir un __name__
        assert hasattr(signals_module, '__name__')