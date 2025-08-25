"""
Commande Django pour créer des catégories par défaut
Usage: python manage.py create_default_categories --restaurant-id=<uuid>
"""

from django.core.management.base import BaseCommand
from django.core.exceptions import ObjectDoesNotExist
from api.models import Restaurant, MenuCategory, MenuSubCategory


class Command(BaseCommand):
    help = 'Crée des catégories et sous-catégories par défaut pour un restaurant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--restaurant-id',
            type=str,
            required=True,
            help='ID du restaurant pour lequel créer les catégories'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Forcer la création même si des catégories existent déjà'
        )

    def handle(self, *args, **options):
        restaurant_id = options['restaurant_id']
        force = options['force']

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except ObjectDoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'Restaurant avec l\'ID {restaurant_id} non trouvé')
            )
            return

        # Vérifier si des catégories existent déjà
        if not force and restaurant.menu_categories.exists():
            self.stdout.write(
                self.style.WARNING(
                    f'Le restaurant {restaurant.name} a déjà des catégories. '
                    'Utilisez --force pour les recréer.'
                )
            )
            return

        # Supprimer les catégories existantes si --force
        if force:
            restaurant.menu_categories.all().delete()
            self.stdout.write(
                self.style.WARNING('Catégories existantes supprimées')
            )

        # Définition des catégories par défaut
        default_categories = [
            {
                'name': 'Entrées',
                'description': 'Hors d\'œuvres et amuse-bouches',
                'icon': '🥗',
                'color': '#1E2A78',
                'order': 1,
                'subcategories': [
                    {'name': 'Salades', 'description': 'Salades fraîches et variées'},
                    {'name': 'Soupes', 'description': 'Soupes chaudes et veloutés'},
                    {'name': 'Charcuterie', 'description': 'Charcuteries et terrines'},
                ]
            },
            {
                'name': 'Plats principaux',
                'description': 'Nos spécialités culinaires',
                'icon': '🍽️',
                'color': '#D4AF37',
                'order': 2,
                'subcategories': [
                    {'name': 'Terre', 'description': 'Viandes et spécialités terrestres'},
                    {'name': 'Mer', 'description': 'Poissons et fruits de mer'},
                    {'name': 'Végétarien', 'description': 'Plats végétariens'},
                ]
            },
            {
                'name': 'Desserts',
                'description': 'Douceurs et gourmandises',
                'icon': '🍰',
                'color': '#10B981',
                'order': 3,
                'subcategories': [
                    {'name': 'Pâtisseries', 'description': 'Gâteaux et pâtisseries'},
                    {'name': 'Glaces', 'description': 'Glaces et sorbets'},
                    {'name': 'Fruits', 'description': 'Desserts aux fruits'},
                ]
            },
            {
                'name': 'Boissons',
                'description': 'Rafraîchissements et boissons',
                'icon': '🥤',
                'color': '#F59E0B',
                'order': 4,
                'subcategories': [
                    {'name': 'Chaudes', 'description': 'Café, thé, chocolat chaud'},
                    {'name': 'Froides', 'description': 'Sodas, jus, eaux'},
                    {'name': 'Alcoolisées', 'description': 'Vins, bières, cocktails'},
                ]
            }
        ]

        created_count = 0
        subcategory_count = 0

        # Créer les catégories et sous-catégories
        for cat_data in default_categories:
            subcategories_data = cat_data.pop('subcategories', [])
            
            category = MenuCategory.objects.create(
                restaurant=restaurant,
                **cat_data
            )
            created_count += 1
            
            # Créer les sous-catégories
            for i, subcat_data in enumerate(subcategories_data):
                MenuSubCategory.objects.create(
                    category=category,
                    order=i + 1,
                    **subcat_data
                )
                subcategory_count += 1
            
            self.stdout.write(
                f'✅ Catégorie "{category.name}" créée avec '
                f'{len(subcategories_data)} sous-catégories'
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n🎉 Création terminée !\n'
                f'   Restaurant: {restaurant.name}\n'
                f'   Catégories créées: {created_count}\n'
                f'   Sous-catégories créées: {subcategory_count}'
            )
        )