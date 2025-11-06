from django.apps import AppConfig

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    verbose_name = 'Eat&Go API'
    
    def ready(self):
        """
        Méthode appelée quand l'app est prête
        🎯 IMPORTANT : C'est ici qu'on importe les signaux !
        """
        try:
            import api.signals  # Importer les signaux pour les activer
            print("✅ [APPS] Signaux d'assignation des groupes chargés")
        except ImportError as e:
            print(f"❌ [APPS] Erreur lors du chargement des signaux: {e}")
        
        # Importer les signaux de comptabilité
        try:
            import api.signals.comptabilite_signals
            print("✅ [APPS] Signaux de comptabilité chargés")
        except ImportError:
            # Le module comptabilité n'est pas encore installé
            pass
        
        # # Créer les groupes de base si ils n'existent pas
        # self.create_default_groups()
    
    # def create_default_groups(self):
    #     """Crée les groupes par défaut au démarrage de l'application"""
    #     from django.contrib.auth.models import Group
        
    #     default_groups = [
    #         'restaurateur',
    #         'client', 
    #         'admin'
    #     ]
        
    #     for group_name in default_groups:
    #         group, created = Group.objects.get_or_create(name=group_name)
    #         if created:
    #             print(f"✅ [APPS] Groupe '{group_name}' créé automatiquement")