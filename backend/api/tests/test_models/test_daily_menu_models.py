# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de menu du jour
- DailyMenu
- DailyMenuItem
- DailyMenuTemplate
- DailyMenuTemplateItem

CORRECTED VERSION - Fixed field names to match actual model definitions:
- DailyMenuItem references MenuItem via ForeignKey (not standalone name/price/category)
- DailyMenuTemplateItem references MenuItem via ForeignKey
- Related names: daily_menu_items, template_items (not 'items')
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
    Menu,
    MenuCategory,
    MenuItem,
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
def menu(restaurant):
    """Menu principal du restaurant"""
    return Menu.objects.create(
        restaurant=restaurant,
        name="Menu Principal",
        is_available=True  # FIXED: Menu uses is_available, not is_active
    )


@pytest.fixture
def menu_category(restaurant, menu):
    """Catégorie de menu"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        description="Nos plats",
        order=1
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Item de menu pour les tests"""
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Poulet rôti",
        description="Poulet fermier avec légumes de saison",
        price=Decimal('12.50'),
        is_available=True
    )


@pytest.fixture
def menu_item_entree(menu, menu_category):
    """Item entrée pour les tests"""
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Salade César",
        description="Salade fraîche avec parmesan",
        price=Decimal('8.50'),
        is_available=True
    )


@pytest.fixture
def menu_item_dessert(menu, menu_category):
    """Item dessert pour les tests"""
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Tarte aux pommes",
        description="Tarte maison",
        price=Decimal('6.00'),
        is_available=True
    )


@pytest.fixture
def daily_menu(restaurant, user):
    """Menu du jour - using future date to avoid validation issues"""
    return DailyMenu.objects.create(
        restaurant=restaurant,
        date=date.today() + timedelta(days=1),  # Tomorrow to avoid "date in past" validation
        title="Menu du Jour",
        description="Nos suggestions du jour",
        special_price=Decimal('14.50'),
        is_active=True,
        created_by=user
    )


@pytest.fixture
def daily_menu_item(daily_menu, menu_item):
    """
    Item du menu du jour
    
    CORRECTED: DailyMenuItem requires a menu_item ForeignKey, not standalone name/price/category
    Actual fields: daily_menu, menu_item, special_price, is_available, display_order, special_note
    """
    return DailyMenuItem.objects.create(
        daily_menu=daily_menu,
        menu_item=menu_item,
        special_price=Decimal('10.00'),
        is_available=True,
        display_order=1,
        special_note="Fait maison"
    )


@pytest.fixture
def daily_menu_template(restaurant):
    """Template de menu du jour"""
    return DailyMenuTemplate.objects.create(
        restaurant=restaurant,
        name="Template Semaine",
        description="Menu type de la semaine",
        is_active=True,
        day_of_week=1,
        default_special_price=Decimal('13.90')
    )


@pytest.fixture
def daily_menu_template_item(daily_menu_template, menu_item):
    """
    Item de template de menu du jour
    
    CORRECTED: DailyMenuTemplateItem requires a menu_item ForeignKey
    Actual fields: template, menu_item, default_special_price, display_order, default_note
    """
    return DailyMenuTemplateItem.objects.create(
        template=daily_menu_template,
        menu_item=menu_item,
        default_special_price=Decimal('9.50'),
        display_order=1,
        default_note="Suggestion du chef"
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
        assert daily_menu.title == "Menu du Jour"
        assert daily_menu.special_price == Decimal('14.50')
        assert daily_menu.is_active is True
        assert daily_menu.created_at is not None

    def test_daily_menu_str_method(self, daily_menu, restaurant):
        """Test de la méthode __str__"""
        result = str(daily_menu)
        assert restaurant.name in result or "Menu du Jour" in result or daily_menu.title in result

    def test_daily_menu_unique_together(self, restaurant, user):
        """Test de la contrainte unique_together (restaurant, date)"""
        # Use future dates to avoid validation issues
        test_date = date.today() + timedelta(days=30)
        
        DailyMenu.objects.create(
            restaurant=restaurant,
            date=test_date,
            title="Menu 1",
            created_by=user
        )
        
        with pytest.raises((IntegrityError, ValidationError)):
            DailyMenu.objects.create(
                restaurant=restaurant,
                date=test_date,
                title="Menu 2",
                created_by=user
            )

    def test_daily_menu_different_dates(self, restaurant, user):
        """Test de menus sur différentes dates"""
        # Use future dates to avoid validation issues
        menu1 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=10),
            title="Menu 1er",
            created_by=user
        )
        menu2 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=11),
            title="Menu 2ème",
            created_by=user
        )
        
        assert menu1.date != menu2.date

    def test_daily_menu_default_is_active(self, restaurant, user):
        """Test de la valeur par défaut is_active"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=20),
            title="Test Default",
            created_by=user
        )
        assert menu.is_active is True

    def test_daily_menu_optional_special_price(self, restaurant, user):
        """Test que special_price est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=21),
            title="Sans prix spécial",
            created_by=user
        )
        assert menu.special_price is None

    def test_daily_menu_optional_description(self, restaurant, user):
        """Test que description est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=22),
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
            date=date.today() + timedelta(days=40),
            title="Menu Earlier",
            created_by=user
        )
        m2 = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=50),
            title="Menu Later",
            created_by=user
        )
        
        menus = list(DailyMenu.objects.filter(restaurant=restaurant).order_by('-date'))
        # Plus récent en premier
        assert menus[0].date > menus[1].date

    def test_daily_menu_is_today_property(self, restaurant, user):
        """Test de la propriété is_today"""
        today_menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today(),
            title="Menu Today",
            created_by=user
        )
        assert today_menu.is_today is True
        
        future_menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=5),
            title="Menu Future",
            created_by=user
        )
        assert future_menu.is_today is False

    def test_daily_menu_is_future_property(self, restaurant, user):
        """Test de la propriété is_future"""
        future_menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=60),
            title="Menu Future",
            created_by=user
        )
        assert future_menu.is_future is True

    def test_daily_menu_created_by_optional(self, restaurant):
        """Test que created_by est optionnel"""
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=70),
            title="Sans créateur"
        )
        assert menu.created_by is None

    def test_daily_menu_cascade_delete(self, daily_menu, restaurant):
        """Test que le menu est supprimé avec le restaurant"""
        menu_id = daily_menu.id
        restaurant.delete()
        
        assert not DailyMenu.objects.filter(id=menu_id).exists()


# =============================================================================
# TESTS - DailyMenuItem
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuItem:
    """
    Tests pour le modèle DailyMenuItem
    
    IMPORTANT: DailyMenuItem uses a ForeignKey to MenuItem, not standalone fields.
    Actual fields: daily_menu, menu_item, special_price, is_available, display_order, special_note
    Related name on DailyMenu: daily_menu_items (not 'items')
    """

    def test_item_creation(self, daily_menu_item, menu_item):
        """Test de la création d'un item de menu du jour"""
        assert daily_menu_item.id is not None
        assert daily_menu_item.menu_item == menu_item
        assert daily_menu_item.special_price == Decimal('10.00')
        assert daily_menu_item.is_available is True
        assert daily_menu_item.display_order == 1
        assert daily_menu_item.special_note == "Fait maison"

    def test_item_str_method(self, daily_menu_item):
        """Test de la méthode __str__"""
        result = str(daily_menu_item)
        # Should contain menu item name or daily menu info
        assert len(result) > 0

    def test_item_effective_price_with_special(self, daily_menu_item):
        """Test du prix effectif avec prix spécial"""
        # When special_price is set, effective_price should use it
        assert daily_menu_item.effective_price == Decimal('10.00')

    def test_item_effective_price_without_special(self, daily_menu, menu_item):
        """Test du prix effectif sans prix spécial (uses menu_item.price)"""
        item = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            is_available=True,
            display_order=2
            # No special_price set
        )
        assert item.effective_price == menu_item.price

    def test_item_has_discount_property(self, daily_menu_item, menu_item):
        """Test de la propriété has_discount"""
        # special_price (10.00) < menu_item.price (12.50)
        assert daily_menu_item.has_discount is True

    def test_item_default_is_available(self, daily_menu, menu_item):
        """Test de la valeur par défaut is_available"""
        item = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            display_order=3
        )
        assert item.is_available is True

    def test_item_ordering_field(self, daily_menu, menu_item, menu_item_entree):
        """Test de l'ordre des items"""
        item1 = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            display_order=3
        )
        item2 = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item_entree,
            display_order=1
        )
        
        items = list(daily_menu.daily_menu_items.all().order_by('display_order'))
        assert items[0].display_order == 1
        assert items[1].display_order == 3

    def test_item_optional_special_note(self, daily_menu, menu_item):
        """Test que special_note est optionnel"""
        item = DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            display_order=4
        )
        assert item.special_note == "" or item.special_note is None

    def test_item_cascade_delete_with_menu(self, daily_menu, daily_menu_item):
        """Test que l'item est supprimé avec le menu"""
        item_id = daily_menu_item.id
        daily_menu.delete()
        
        assert not DailyMenuItem.objects.filter(id=item_id).exists()

    def test_item_related_name(self, daily_menu, daily_menu_item):
        """Test du related_name 'daily_menu_items'"""
        assert daily_menu_item in daily_menu.daily_menu_items.all()

    def test_multiple_items_per_menu(self, daily_menu, menu_item, menu_item_entree, menu_item_dessert):
        """Test de plusieurs items par menu"""
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            display_order=1
        )
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item_entree,
            display_order=2
        )
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item_dessert,
            display_order=3
        )
        
        assert daily_menu.daily_menu_items.count() == 3

    def test_item_uuid_primary_key(self, daily_menu_item):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_item.id, uuid.UUID)

    def test_item_unique_together_menu_item(self, daily_menu, menu_item):
        """Test qu'un menu_item ne peut apparaître qu'une fois par daily_menu"""
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            display_order=1
        )
        
        # Trying to add the same menu_item again should fail
        with pytest.raises((IntegrityError, ValidationError)):
            DailyMenuItem.objects.create(
                daily_menu=daily_menu,
                menu_item=menu_item,
                display_order=2
            )

    def test_total_items_count_property(self, daily_menu, menu_item, menu_item_entree):
        """Test de la propriété total_items_count sur DailyMenu"""
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item,
            is_available=True,
            display_order=1
        )
        DailyMenuItem.objects.create(
            daily_menu=daily_menu,
            menu_item=menu_item_entree,
            is_available=False,  # Not available
            display_order=2
        )
        
        # total_items_count should only count available items
        assert daily_menu.total_items_count == 1


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
        assert daily_menu_template.is_active is True
        assert daily_menu_template.day_of_week == 1
        assert daily_menu_template.default_special_price == Decimal('13.90')

    def test_template_str_method(self, daily_menu_template):
        """Test de la méthode __str__"""
        result = str(daily_menu_template)
        assert "Template Semaine" in result or daily_menu_template.name in result

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

    def test_template_optional_day_of_week(self, restaurant):
        """Test que day_of_week est optionnel"""
        template = DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Any Day Template"
        )
        assert template.day_of_week is None

    def test_template_day_of_week_choices(self, restaurant):
        """Test des choix de jour de la semaine"""
        for day in range(1, 8):  # 1-7 for Monday-Sunday
            template = DailyMenuTemplate.objects.create(
                restaurant=restaurant,
                name=f"Template Day {day}",
                day_of_week=day
            )
            assert template.day_of_week == day

    def test_template_timestamps(self, daily_menu_template):
        """Test des timestamps"""
        assert daily_menu_template.created_at is not None
        assert daily_menu_template.updated_at is not None

    def test_template_uuid_primary_key(self, daily_menu_template):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_template.id, uuid.UUID)

    def test_template_unique_together_name(self, restaurant):
        """Test de la contrainte unique_together (restaurant, name)"""
        DailyMenuTemplate.objects.create(
            restaurant=restaurant,
            name="Unique Template"
        )
        
        with pytest.raises(IntegrityError):
            DailyMenuTemplate.objects.create(
                restaurant=restaurant,
                name="Unique Template"
            )

    def test_template_usage_count(self, daily_menu_template):
        """Test du compteur d'utilisation"""
        assert daily_menu_template.usage_count == 0

    def test_template_last_used(self, daily_menu_template):
        """Test de la date de dernière utilisation"""
        assert daily_menu_template.last_used is None


# =============================================================================
# TESTS - DailyMenuTemplateItem
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplateItem:
    """
    Tests pour le modèle DailyMenuTemplateItem
    
    IMPORTANT: DailyMenuTemplateItem uses a ForeignKey to MenuItem, not standalone fields.
    Actual fields: template, menu_item, default_special_price, display_order, default_note
    Related name on DailyMenuTemplate: template_items (not 'items')
    """

    def test_template_item_creation(self, daily_menu_template_item, menu_item):
        """Test de la création d'un item de template"""
        assert daily_menu_template_item.id is not None
        assert daily_menu_template_item.menu_item == menu_item
        assert daily_menu_template_item.default_special_price == Decimal('9.50')
        assert daily_menu_template_item.display_order == 1
        assert daily_menu_template_item.default_note == "Suggestion du chef"

    def test_template_item_str_method(self, daily_menu_template_item):
        """Test de la méthode __str__"""
        result = str(daily_menu_template_item)
        # Should contain template name and/or menu item name
        assert len(result) > 0

    def test_template_item_ordering(self, daily_menu_template, menu_item, menu_item_entree):
        """Test de l'ordre des items"""
        item1 = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=3
        )
        item2 = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item_entree,
            display_order=1
        )
        
        items = list(daily_menu_template.template_items.all().order_by('display_order'))
        assert items[0].display_order == 1
        assert items[1].display_order == 3

    def test_template_item_cascade_delete(self, daily_menu_template, daily_menu_template_item):
        """Test que l'item est supprimé avec le template"""
        item_id = daily_menu_template_item.id
        daily_menu_template.delete()
        
        assert not DailyMenuTemplateItem.objects.filter(id=item_id).exists()

    def test_template_item_related_name(self, daily_menu_template, daily_menu_template_item):
        """Test du related_name 'template_items'"""
        assert daily_menu_template_item in daily_menu_template.template_items.all()

    def test_multiple_template_items(self, daily_menu_template, menu_item, menu_item_entree, menu_item_dessert):
        """Test de plusieurs items par template"""
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=1
        )
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item_entree,
            display_order=2
        )
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item_dessert,
            display_order=3
        )
        
        assert daily_menu_template.template_items.count() == 3

    def test_template_item_optional_default_note(self, daily_menu_template, menu_item):
        """Test que default_note est optionnel"""
        item = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=5
        )
        assert item.default_note == "" or item.default_note is None

    def test_template_item_optional_default_special_price(self, daily_menu_template, menu_item):
        """Test que default_special_price est optionnel"""
        item = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=6
        )
        assert item.default_special_price is None

    def test_template_item_uuid_primary_key(self, daily_menu_template_item):
        """Test que l'ID est un UUID"""
        import uuid
        assert isinstance(daily_menu_template_item.id, uuid.UUID)

    def test_template_item_unique_together(self, daily_menu_template, menu_item):
        """Test de la contrainte unique_together (template, menu_item)"""
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=1
        )
        
        # Trying to add the same menu_item again should fail
        with pytest.raises(IntegrityError):
            DailyMenuTemplateItem.objects.create(
                template=daily_menu_template,
                menu_item=menu_item,
                display_order=2
            )


# =============================================================================
# TESTS - Intégration Template -> DailyMenu
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplateIntegration:
    """Tests d'intégration entre templates et menus du jour"""

    def test_create_menu_from_template(self, restaurant, user, daily_menu_template, menu_item, menu_item_entree):
        """Test de création d'un menu à partir d'un template"""
        # Ajouter des items au template
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item_entree,
            default_special_price=Decimal('6.00'),
            display_order=1
        )
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            default_special_price=Decimal('10.00'),
            display_order=2
        )
        
        # Créer un menu du jour basé sur le template
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=100),
            title="Menu créé depuis template",
            created_by=user
        )
        
        # Copier les items du template vers le menu du jour
        for template_item in daily_menu_template.template_items.all():
            DailyMenuItem.objects.create(
                daily_menu=menu,
                menu_item=template_item.menu_item,
                special_price=template_item.default_special_price,
                display_order=template_item.display_order,
                special_note=template_item.default_note or ""
            )
        
        assert menu.daily_menu_items.count() == 2

    def test_template_apply_to_date_method(self, restaurant, user, daily_menu_template, menu_item):
        """Test de la méthode apply_to_date du template"""
        # Add an item to the template
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            default_special_price=Decimal('10.00'),
            display_order=1
        )
        
        # Apply template to a specific date
        target_date = date.today() + timedelta(days=110)
        
        daily_menu = daily_menu_template.apply_to_date(target_date, user=user)
        
        assert daily_menu is not None
        assert daily_menu.date == target_date
        assert daily_menu.daily_menu_items.count() == 1
        
        # Verify usage count was incremented
        daily_menu_template.refresh_from_db()
        assert daily_menu_template.usage_count == 1
        assert daily_menu_template.last_used is not None

    def test_template_items_not_affected_by_menu_changes(self, restaurant, user, daily_menu_template, menu_item):
        """Test que les modifications du menu n'affectent pas le template"""
        # Add item to template
        template_item = DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            default_special_price=Decimal('10.00'),
            display_order=1
        )
        
        # Create menu and add item
        menu = DailyMenu.objects.create(
            restaurant=restaurant,
            date=date.today() + timedelta(days=120),
            title="Menu Test",
            created_by=user
        )
        
        menu_daily_item = DailyMenuItem.objects.create(
            daily_menu=menu,
            menu_item=menu_item,
            special_price=Decimal('10.00'),
            display_order=1
        )
        
        # Modify the menu item's special price
        menu_daily_item.special_price = Decimal('15.00')
        menu_daily_item.save()
        
        # Verify that the template item is not affected
        template_item.refresh_from_db()
        assert template_item.default_special_price == Decimal('10.00')

    def test_template_apply_to_date_prevents_duplicate(self, restaurant, user, daily_menu_template, menu_item):
        """Test que apply_to_date échoue si un menu existe déjà pour cette date"""
        # Add item to template
        DailyMenuTemplateItem.objects.create(
            template=daily_menu_template,
            menu_item=menu_item,
            display_order=1
        )
        
        target_date = date.today() + timedelta(days=130)
        
        # Create a menu for this date first
        DailyMenu.objects.create(
            restaurant=restaurant,
            date=target_date,
            title="Existing Menu",
            created_by=user
        )
        
        # Trying to apply template to same date should fail
        with pytest.raises(ValidationError):
            daily_menu_template.apply_to_date(target_date, user=user)