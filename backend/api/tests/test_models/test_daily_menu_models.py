# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de menu du jour
- DailyMenu
- DailyMenuItem
- DailyMenuTemplate
- DailyMenuTemplateItem
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from api.models import (
    DailyMenu,
    DailyMenuItem,
    DailyMenuTemplate,
    DailyMenuTemplateItem,
    Restaurant,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="dailymenuowner@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Daily Menu Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def daily_menu(restaurant, user):
    return DailyMenu.objects.create(
        restaurant=restaurant,
        date=date.today(),
        title="Menu du Jour",
        description="Nos suggestions du jour",
        special_price=Decimal('15.90'),
        is_active=True,
        created_by=user
    )


@pytest.fixture
def daily_menu_item(daily_menu):
    return DailyMenuItem.objects.create(
        daily_menu=daily_menu,
        name="Poulet rôti",
        description="Poulet fermier avec légumes de saison",
        price=Decimal('12.50'),
        category="plat",
        is_available=True,
        order=1
    )


@pytest.fixture
def daily_menu_template(restaurant):
    return DailyMenuTemplate.objects.create(
        restaurant=restaurant,
        name="Template Semaine",
        description="Menu type de la semaine",
        is_active=True
    )


@pytest.fixture
def daily_menu_template_item(daily_menu_template):
    return DailyMenuTemplateItem.objects.create(
        template=daily_menu_template,
        name="Plat du jour type",
        description="Description type",
        default_price=Decimal('11.00'),
        category="plat",
        order=1
    )


# =============================================================================
# TESTS - DailyMenu
# =============================================================================

@pytest.mark.django_db
class TestDailyMenu:
    """Tests pour le modèle DailyMenu"""

    def test_daily_menu_creation(self, daily_menu):
        """Test de la création d'un menu du jour"""
        assert daily_menu.id is not None
        assert daily_menu.date == date.today()
        assert daily_menu.title == "Menu du Jour"
        assert daily_menu.special_price == Decimal('15.90')
        assert daily_menu.is_active is True
        assert daily_menu.created_at is not None

    def test_daily_menu_str_method(self, daily_menu, restaurant):
        """Test de la méthode __str__"""
        result = str(daily_menu)
        assert restaurant.name in result or "Menu du Jour" in result

    def test_daily_menu_unique_together(self, restaurant, user):
        """Test de la contrainte unique_together (restaurant, date)"""
        DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 6, 15),
            title="Menu 1",
            created_by=user
        )
        
        with pytest.raises(IntegrityError):
            DailyMenu.objects.create(
                restaurant=restaurant,
                date=date(2025, 6, 15),
                title="Menu 2",
                created_by=user
            )

    def test_daily_menu_different_dates(self, restaurant, user):
        """Test de menus sur différentes dates"""
        menu1 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 6, 1),
            title="Menu 1er juin",
            created_by=user
        )
        menu2 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 6, 2),
            title="Menu 2 juin",
            created_by=user
        )
        
        assert menu1.date != menu2.date

    def test_daily_menu_default_is_active(self, restaurant, user):
        """Test de la valeur par défaut is_active"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 7, 1),
            title="Test Default",
            created_by=user
        )
        assert menu.is_active is True

    def test_daily_menu_optional_special_price(self, restaurant, user):
        """Test que special_price est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 7, 2),
            title="Sans prix spécial",
            created_by=user
        )
        assert menu.special_price is None

    def test_daily_menu_optional_description(self, restaurant, user):
        """Test que description est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 7, 3),
            title="Sans description",
            created_by=user
        )
        assert menu.description is None or menu.description == ""

    def test_daily_menu_validation_old_date(self, restaurant, user):
        """Test de validation pour une date trop ancienne"""
        old_date = timezone.now().date() - timedelta(days=10)
        
        menu = DailyMenu(
            restaurant=restaurant,
            date=old_date,
            title="Menu ancien",
            created_by=user
        )
        
        # La validation devrait rejeter les dates trop anciennes
        with pytest.raises(ValidationError):
            menu.full_clean()

    def test_daily_menu_uuid_primary_key(self, daily_menu):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu.id, uuid.UUID)

    def test_daily_menu_ordering(self, restaurant, user):
        """Test de l'ordre par défaut (date desc, created_at desc)"""
        m1 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 6, 1),
            title="Menu 1",
            created_by=user
        )
        m2 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 6, 15),
            title="Menu 15",
            created_by=user
        )
        
        menus = list(DailyMenu.objects.filter(restaurant=restaurant))
        # Plus récent en premier
        assert menus[0] == m2

    def test_daily_menu_cascade_delete(self, restaurant, daily_menu):
        """Test que le menu est supprimé avec le restaurant"""
        menu_id = daily_menu.id
        restaurant.delete()
        
        assert not DailyMenu.objects.filter(id=menu_id).exists()

    def test_daily_menu_created_by_optional(self, restaurant):
        """Test que created_by est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date(2025, 8, 1),
            title="Sans créateur",
            created_by=None
        )
        assert menu.created_by is None

    def test_daily_menu_timestamps(self, daily_menu):
        """Test des timestamps"""
        assert daily_menu.created_at is not None
        assert daily_menu.updated_at is not None
        
        old_updated = daily_menu.updated_at
        daily_menu.title = "Titre modifié"
        daily_menu.save()
        
        assert daily_menu.updated_at > old_updated

    def test_daily_menu_indexes(self):
        """Test que les index sont définis"""
        indexes = DailyMenu._meta.indexes
        assert len(indexes) >= 2


# =============================================================================
# TESTS - DailyMenuItem
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuItem:
    """Tests pour le modèle DailyMenuItem"""

    def test_item_creation(self, daily_menu_item):
        """Test de la création d'un item de menu du jour"""
        assert daily_menu_item.id is not None
        assert daily_menu_item.name == "Poulet rôti"
        assert daily_menu_item.price == Decimal('12.50')
        assert daily_menu_item.category == "plat"
        assert daily_menu_item.is_available is True
        assert daily_menu_item.order == 1

    def test_item_str_method(self, daily_menu_item):
        """Test de la méthode __str__"""
        result = str(daily_menu_item)
        assert "Poulet rôti" in result or "12.50" in result

    def test_item_category_choices(self, daily_menu):
        """Test des choix de catégorie"""
        categories = ['entree', 'plat', 'dessert', 'boisson', 'formule']
        
        for i, cat in enumerate(categories):
            item = DailyMenuItem.objects.create(
                daily_menu=daily_menu,
                name=f"Item {cat}",
                price=Decimal('10.00'),
                category=cat,
                order=i + 10
            )
            assert item.category == cat

    def test_item_default_is_available(self, daily_menu):
        """Test de la valeur par défaut is_available"""
        item = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Default Item",
            price=Decimal('8.00'),
            category="plat",
            order=2
        )
        assert item.is_available is True

    def test_item_ordering_field(self, daily_menu):
        """Test de l'ordre des items"""
        item1 = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Item 3",
            price=Decimal('10.00'),
            category="plat",
            order=3
        )
        item2 = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Item 1",
            price=Decimal('10.00'),
            category="plat",
            order=1
        )
        
        items = list(daily_menu.items.all().order_by('order'))
        assert items[0].name == "Item 1"

    def test_item_optional_description(self, daily_menu):
        """Test que description est optionnel"""
        item = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Sans description",
            price=Decimal('9.00'),
            category="plat",
            order=5
        )
        assert item.description is None or item.description == ""

    def test_item_cascade_delete_with_menu(self, daily_menu, daily_menu_item):
        """Test que l'item est supprimé avec le menu"""
        item_id = daily_menu_item.id
        daily_menu.delete()
        
        assert not DailyMenuItem.objects.filter(id=item_id).exists()

    def test_item_related_name(self, daily_menu, daily_menu_item):
        """Test du related_name 'items'"""
        assert daily_menu_item in daily_menu.items.all()

    def test_multiple_items_per_menu(self, daily_menu):
        """Test de plusieurs items par menu"""
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Entrée",
            price=Decimal('6.00'),
            category="entree",
            order=1
        )
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Plat",
            price=Decimal('12.00'),
            category="plat",
            order=2
        )
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            name="Dessert",
            price=Decimal('5.00'),
            category="dessert",
            order=3
        )
        
        assert daily_menu.items.count() == 3

    def test_item_uuid_primary_key(self, daily_menu_item):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_item.id, uuid.UUID)


# =============================================================================
# TESTS - DailyMenuTemplate
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplate:
    """Tests pour le modèle DailyMenuTemplate"""

    def test_template_creation(self, daily_menu_template):
        """Test de la création d'un template"""
        assert daily_menu_template.id is not None
        assert daily_menu_template.name == "Template Semaine"
        assert daily_menu_template.description == "Menu type de la semaine"
        assert daily_menu_template.is_active is True

    def test_template_str_method(self, daily_menu_template):
        """Test de la méthode __str__"""
        result = str(daily_menu_template)
        assert "Template Semaine" in result

    def test_template_default_is_active(self, restaurant):
        """Test de la valeur par défaut is_active"""
        template = DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Default Active"
        )
        assert template.is_active is True

    def test_template_multiple_per_restaurant(self, restaurant):
        """Test de plusieurs templates par restaurant"""
        DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Template Midi"
        )
        DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Template Soir"
        )
        
        templates = DailyMenuTemplate.objects.filter(restaurant=restaurant)
        assert templates.count() == 2

    def test_template_cascade_delete(self, restaurant, daily_menu_template):
        """Test que le template est supprimé avec le restaurant"""
        template_id = daily_menu_template.id
        restaurant.delete()
        
        assert not DailyMenuTemplate.objects.filter(id=template_id).exists()

    def test_template_optional_description(self, restaurant):
        """Test que description est optionnel"""
        template = DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Sans Description"
        )
        assert template.description is None or template.description == ""

    def test_template_timestamps(self, daily_menu_template):
        """Test des timestamps"""
        assert daily_menu_template.created_at is not None
        assert daily_menu_template.updated_at is not None

    def test_template_uuid_primary_key(self, daily_menu_template):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_template.id, uuid.UUID)


# =============================================================================
# TESTS - DailyMenuTemplateItem
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplateItem:
    """Tests pour le modèle DailyMenuTemplateItem"""

    def test_template_item_creation(self, daily_menu_template_item):
        """Test de la création d'un item de template"""
        assert daily_menu_template_item.id is not None
        assert daily_menu_template_item.name == "Plat du jour type"
        assert daily_menu_template_item.default_price == Decimal('11.00')
        assert daily_menu_template_item.category == "plat"
        assert daily_menu_template_item.order == 1

    def test_template_item_str_method(self, daily_menu_template_item):
        """Test de la méthode __str__"""
        result = str(daily_menu_template_item)
        assert "Plat du jour type" in result or "template" in result.lower()

    def test_template_item_category_choices(self, daily_menu_template):
        """Test des choix de catégorie"""
        categories = ['entree', 'plat', 'dessert', 'boisson', 'formule']
        
        for i, cat in enumerate(categories):
            item = DailyMenuTemplateItem.objects.create(
                template=daily_menu_template,
                name=f"Item {cat}",
                default_price=Decimal('10.00'),
                category=cat,
                order=i + 10
            )
            assert item.category == cat

    def test_template_item_ordering(self, daily_menu_template):
        """Test de l'ordre des items"""
        item1 = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Item C",
            default_price=Decimal('10.00'),
            category="plat",
            order=3
        )
        item2 = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Item A",
            default_price=Decimal('10.00'),
            category="plat",
            order=1
        )
        
        items = list(daily_menu_template.items.all().order_by('order'))
        assert items[0].name == "Item A"

    def test_template_item_cascade_delete(self, daily_menu_template, daily_menu_template_item):
        """Test que l'item est supprimé avec le template"""
        item_id = daily_menu_template_item.id
        daily_menu_template.delete()
        
        assert not DailyMenuTemplateItem.objects.filter(id=item_id).exists()

    def test_template_item_related_name(self, daily_menu_template, daily_menu_template_item):
        """Test du related_name 'items'"""
        assert daily_menu_template_item in daily_menu_template.items.all()

    def test_multiple_template_items(self, daily_menu_template):
        """Test de plusieurs items par template"""
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Entrée type",
            default_price=Decimal('6.00'),
            category="entree",
            order=1
        )
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Plat type",
            default_price=Decimal('12.00'),
            category="plat",
            order=2
        )
        
        assert daily_menu_template.items.count() == 2

    def test_template_item_optional_description(self, daily_menu_template):
        """Test que description est optionnel"""
        item = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Sans Desc",
            default_price=Decimal('8.00'),
            category="plat",
            order=5
        )
        assert item.description is None or item.description == ""

    def test_template_item_uuid_primary_key(self, daily_menu_template_item):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_template_item.id, uuid.UUID)


# =============================================================================
# TESTS - Intégration Template -> DailyMenu
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplateIntegration:
    """Tests d'intégration entre templates et menus du jour"""

    def test_create_menu_from_template(self, restaurant, user, daily_menu_template):
        """Test de création d'un menu à partir d'un template"""
        # Ajouter des items au template
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Entrée Template",
            default_price=Decimal('6.00'),
            category="entree",
            order=1
        )
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Plat Template",
            default_price=Decimal('12.00'),
            category="plat",
            order=2
        )
        
        # Créer un menu du jour basé sur le template
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today(),
            title="Menu créé depuis template",
            created_by=user
        )
        
        # Copier les items du template
        for template_item in daily_menu_template.items.all():
            DailyMenuItem.objects.create(
                daily_menu=menu,
                name=template_item.name,
                description=template_item.description,
                price=template_item.default_price,
                category=template_item.category,
                order=template_item.order
            )
        
        assert menu.items.count() == 2
        assert menu.items.filter(category='entree').exists()
        assert menu.items.filter(category='plat').exists()

    def test_template_items_not_affected_by_menu_changes(self, restaurant, user, daily_menu_template):
        """Test que les modifications du menu n'affectent pas le template"""
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            name="Item Original",
            default_price=Decimal('10.00'),
            category="plat",
            order=1
        )
        
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today(),
            title="Menu Test",
            created_by=user
        )
        
        menu_item = DailyMenuItem.objects.create(
            daily_menu=menu,
            name="Item Original",
            price=Decimal('10.00'),
            category="plat",
            order=1
        )
        
        # Modifier l'item du menu
        menu_item.price = Decimal('15.00')
        menu_item.save()
        
        # Vérifier que le template n'est pas affecté
        template_item = daily_menu_template.items.first()
        assert template_item.default_price == Decimal('10.00')
