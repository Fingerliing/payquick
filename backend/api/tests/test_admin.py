# -*- coding: utf-8 -*-
"""
Tests pour api/admin.py

Couvre les méthodes personnalisées des classes ModelAdmin:
- RestaurantAdmin: owner_stripe_validated, can_receive_orders, get_queryset
- RestaurateurProfileAdmin: get_queryset
- MenuCategoryAdmin: subcategories_count
- MenuSubCategoryAdmin: restaurant_name
"""

import pytest
from django.contrib import admin
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from django.test import RequestFactory
from api.admin import (
    RestaurantAdmin,
    RestaurateurProfileAdmin,
    MenuCategoryAdmin,
    MenuSubCategoryAdmin,
    DailyMenuAdmin,
    DailyMenuItemAdmin,
    DailyMenuTemplateAdmin,
)
from api.models import (
    Restaurant,
    RestaurateurProfile,
    MenuCategory,
    MenuSubCategory,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def site():
    """Instance AdminSite pour les tests"""
    return AdminSite()


@pytest.fixture
def request_factory():
    """Factory pour créer des requêtes"""
    return RequestFactory()


@pytest.fixture
def admin_user(db):
    """Utilisateur admin pour les requêtes"""
    return User.objects.create_superuser(
        username="admin@test.com",
        email="admin@test.com",
        password="adminpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    """Utilisateur restaurateur"""
    return User.objects.create_user(
        username="resto@test.com",
        email="resto@test.com",
        password="testpass123",
        first_name="Jean",
        last_name="Restaurateur"
    )


@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    """Profil restaurateur avec Stripe vérifié"""
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_123",
        stripe_verified=True,
        stripe_onboarding_completed=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def unverified_restaurateur_profile(db):
    """Profil restaurateur sans Stripe vérifié"""
    user = User.objects.create_user(
        username="unverified@test.com",
        email="unverified@test.com",
        password="testpass123"
    )
    return RestaurateurProfile.objects.create(
        user=user,
        siret="98765432109876",
        stripe_verified=False,
        is_validated=False,
        is_active=False
    )


@pytest.fixture
def restaurant(db, restaurateur_profile):
    """Restaurant actif pouvant recevoir des commandes"""
    return Restaurant.objects.create(
        name="Restaurant Test Admin",
        description="Restaurant pour tests admin",
        address="123 Rue Test",
        owner=restaurateur_profile,
        siret="11111111111111",
        is_active=True,
        is_stripe_active=True
    )


@pytest.fixture
def inactive_restaurant(db, unverified_restaurateur_profile):
    """Restaurant inactif"""
    return Restaurant.objects.create(
        name="Restaurant Inactif",
        description="Restaurant inactif",
        address="456 Rue Test",
        owner=unverified_restaurateur_profile,
        siret="22222222222222",
        is_active=False,
        is_stripe_active=False
    )


@pytest.fixture
def menu_category(db, restaurant):
    """Catégorie de menu"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        description="Nos entrées",
        icon="🥗",
        is_active=True,
        order=1
    )


@pytest.fixture
def menu_category_with_subcategories(db, restaurant):
    """Catégorie avec sous-catégories"""
    category = MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        description="Nos plats",
        icon="🍽️",
        is_active=True,
        order=2
    )
    # Créer des sous-catégories
    MenuSubCategory.objects.create(
        category=category,
        name="Viandes",
        is_active=True,
        order=1
    )
    MenuSubCategory.objects.create(
        category=category,
        name="Poissons",
        is_active=True,
        order=2
    )
    MenuSubCategory.objects.create(
        category=category,
        name="Végétarien",
        is_active=True,
        order=3
    )
    return category


@pytest.fixture
def menu_subcategory(db, menu_category):
    """Sous-catégorie de menu"""
    return MenuSubCategory.objects.create(
        category=menu_category,
        name="Salades",
        description="Salades fraîches",
        is_active=True,
        order=1
    )


# =============================================================================
# TESTS - RestaurantAdmin
# =============================================================================

@pytest.mark.django_db
class TestRestaurantAdmin:
    """Tests pour RestaurantAdmin"""

    def test_owner_stripe_validated_true(self, site, restaurant):
        """Test owner_stripe_validated retourne True quand Stripe vérifié"""
        model_admin = RestaurantAdmin(Restaurant, site)
        result = model_admin.owner_stripe_validated(restaurant)
        
        assert result is True

    def test_owner_stripe_validated_false(self, site, inactive_restaurant):
        """Test owner_stripe_validated retourne False quand Stripe non vérifié"""
        model_admin = RestaurantAdmin(Restaurant, site)
        result = model_admin.owner_stripe_validated(inactive_restaurant)
        
        assert result is False

    def test_can_receive_orders_true(self, site, restaurant, restaurateur_profile):
        """Test can_receive_orders retourne True quand conditions remplies"""
        # S'assurer que toutes les conditions sont remplies
        restaurateur_profile.stripe_verified = True
        restaurateur_profile.is_active = True
        restaurateur_profile.save()
        
        restaurant.is_stripe_active = True
        restaurant.is_active = True
        restaurant.is_manually_overridden = False
        restaurant.save()
        
        model_admin = RestaurantAdmin(Restaurant, site)
        result = model_admin.can_receive_orders(restaurant)
        
        assert result is True

    def test_can_receive_orders_false(self, site, inactive_restaurant):
        """Test can_receive_orders retourne False quand conditions non remplies"""
        model_admin = RestaurantAdmin(Restaurant, site)
        result = model_admin.can_receive_orders(inactive_restaurant)
        
        assert result is False

    def test_get_queryset_uses_select_related(self, site, request_factory, admin_user, restaurant):
        """Test que get_queryset utilise select_related pour optimisation"""
        model_admin = RestaurantAdmin(Restaurant, site)
        
        request = request_factory.get('/admin/api/restaurant/')
        request.user = admin_user
        
        queryset = model_admin.get_queryset(request)
        
        # Vérifier que le queryset contient nos restaurants
        assert restaurant in queryset
        
        # Vérifier que select_related est utilisé (pas de requêtes supplémentaires)
        # En accédant à owner et owner.user sans déclencher de nouvelles requêtes
        for r in queryset:
            # Ces accès ne devraient pas générer de requêtes supplémentaires
            _ = r.owner
            _ = r.owner.user

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        model_admin = RestaurantAdmin(Restaurant, site)
        
        assert 'name' in model_admin.list_display
        assert 'owner' in model_admin.list_display
        assert 'owner_stripe_validated' in model_admin.list_display
        assert 'is_stripe_active' in model_admin.list_display
        assert 'can_receive_orders' in model_admin.list_display

    def test_owner_stripe_validated_attributes(self, site):
        """Test les attributs de la méthode owner_stripe_validated"""
        model_admin = RestaurantAdmin(Restaurant, site)
        
        assert model_admin.owner_stripe_validated.boolean is True
        assert model_admin.owner_stripe_validated.short_description == 'Propriétaire validé Stripe'

    def test_can_receive_orders_attributes(self, site):
        """Test les attributs de la méthode can_receive_orders"""
        model_admin = RestaurantAdmin(Restaurant, site)
        
        assert model_admin.can_receive_orders.boolean is True
        assert model_admin.can_receive_orders.short_description == 'Peut recevoir des commandes'


# =============================================================================
# TESTS - RestaurateurProfileAdmin
# =============================================================================

@pytest.mark.django_db
class TestRestaurateurProfileAdmin:
    """Tests pour RestaurateurProfileAdmin"""

    def test_get_queryset_uses_select_related(
        self, site, request_factory, admin_user, restaurateur_profile
    ):
        """Test que get_queryset utilise select_related pour optimisation"""
        model_admin = RestaurateurProfileAdmin(RestaurateurProfile, site)
        
        request = request_factory.get('/admin/api/restaurateurprofile/')
        request.user = admin_user
        
        queryset = model_admin.get_queryset(request)
        
        # Vérifier que le queryset contient notre profil
        assert restaurateur_profile in queryset
        
        # Vérifier que select_related est utilisé
        for profile in queryset:
            # Cet accès ne devrait pas générer de requête supplémentaire
            _ = profile.user

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        model_admin = RestaurateurProfileAdmin(RestaurateurProfile, site)
        
        expected = ('user', 'siret', 'stripe_verified', 'stripe_onboarding_completed', 'is_active', 'created_at')
        assert model_admin.list_display == expected

    def test_admin_fieldsets_configuration(self, site):
        """Test que fieldsets est correctement configuré"""
        model_admin = RestaurateurProfileAdmin(RestaurateurProfile, site)
        
        # Vérifier qu'on a les bonnes sections
        fieldset_names = [fs[0] for fs in model_admin.fieldsets]
        assert 'Informations utilisateur' in fieldset_names
        assert 'Informations business' in fieldset_names
        assert 'Statuts' in fieldset_names
        assert 'Stripe Connect' in fieldset_names
        assert 'Dates' in fieldset_names

    def test_admin_readonly_fields(self, site):
        """Test que readonly_fields est correctement configuré"""
        model_admin = RestaurateurProfileAdmin(RestaurateurProfile, site)
        
        assert 'created_at' in model_admin.readonly_fields
        assert 'stripe_account_created' in model_admin.readonly_fields


# =============================================================================
# TESTS - MenuCategoryAdmin
# =============================================================================

@pytest.mark.django_db
class TestMenuCategoryAdmin:
    """Tests pour MenuCategoryAdmin"""

    def test_subcategories_count_zero(self, site, menu_category):
        """Test subcategories_count avec zéro sous-catégories"""
        model_admin = MenuCategoryAdmin(MenuCategory, site)
        result = model_admin.subcategories_count(menu_category)
        
        assert result == 0

    def test_subcategories_count_multiple(self, site, menu_category_with_subcategories):
        """Test subcategories_count avec plusieurs sous-catégories"""
        model_admin = MenuCategoryAdmin(MenuCategory, site)
        result = model_admin.subcategories_count(menu_category_with_subcategories)
        
        assert result == 3

    def test_subcategories_count_attributes(self, site):
        """Test les attributs de la méthode subcategories_count"""
        model_admin = MenuCategoryAdmin(MenuCategory, site)
        
        assert model_admin.subcategories_count.short_description == 'Sous-catégories'

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        model_admin = MenuCategoryAdmin(MenuCategory, site)
        
        assert 'name' in model_admin.list_display
        assert 'restaurant' in model_admin.list_display
        assert 'is_active' in model_admin.list_display
        assert 'order' in model_admin.list_display
        assert 'subcategories_count' in model_admin.list_display

    def test_admin_list_editable_configuration(self, site):
        """Test que list_editable est correctement configuré"""
        model_admin = MenuCategoryAdmin(MenuCategory, site)
        
        assert 'is_active' in model_admin.list_editable
        assert 'order' in model_admin.list_editable


# =============================================================================
# TESTS - MenuSubCategoryAdmin
# =============================================================================

@pytest.mark.django_db
class TestMenuSubCategoryAdmin:
    """Tests pour MenuSubCategoryAdmin"""

    def test_restaurant_name(self, site, menu_subcategory):
        """Test restaurant_name retourne le nom du restaurant"""
        model_admin = MenuSubCategoryAdmin(MenuSubCategory, site)
        result = model_admin.restaurant_name(menu_subcategory)
        
        assert result == "Restaurant Test Admin"

    def test_restaurant_name_attributes(self, site):
        """Test les attributs de la méthode restaurant_name"""
        model_admin = MenuSubCategoryAdmin(MenuSubCategory, site)
        
        assert model_admin.restaurant_name.short_description == 'Restaurant'

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        model_admin = MenuSubCategoryAdmin(MenuSubCategory, site)
        
        assert 'name' in model_admin.list_display
        assert 'category' in model_admin.list_display
        assert 'restaurant_name' in model_admin.list_display
        assert 'is_active' in model_admin.list_display
        assert 'order' in model_admin.list_display


# =============================================================================
# TESTS - DailyMenuAdmin
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuAdmin:
    """Tests pour DailyMenuAdmin"""

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        from api.admin import DailyMenuAdmin
        from api.models import DailyMenu
        
        model_admin = DailyMenuAdmin(DailyMenu, site)
        
        assert 'restaurant' in model_admin.list_display
        assert 'title' in model_admin.list_display
        assert 'date' in model_admin.list_display
        assert 'is_active' in model_admin.list_display


# =============================================================================
# TESTS - DailyMenuItemAdmin
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuItemAdmin:
    """Tests pour DailyMenuItemAdmin"""

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        from api.admin import DailyMenuItemAdmin
        from api.models import DailyMenuItem
        
        model_admin = DailyMenuItemAdmin(DailyMenuItem, site)
        
        assert 'daily_menu' in model_admin.list_display
        assert 'menu_item' in model_admin.list_display
        assert 'is_available' in model_admin.list_display


# =============================================================================
# TESTS - DailyMenuTemplateAdmin
# =============================================================================

@pytest.mark.django_db
class TestDailyMenuTemplateAdmin:
    """Tests pour DailyMenuTemplateAdmin"""

    def test_admin_list_display_configuration(self, site):
        """Test que list_display est correctement configuré"""
        from api.admin import DailyMenuTemplateAdmin
        from api.models import DailyMenuTemplate
        
        model_admin = DailyMenuTemplateAdmin(DailyMenuTemplate, site)
        
        assert 'restaurant' in model_admin.list_display
        assert 'name' in model_admin.list_display
        assert 'day_of_week' in model_admin.list_display
        assert 'is_active' in model_admin.list_display


# =============================================================================
# TESTS - Enregistrement Admin
# =============================================================================

@pytest.mark.django_db
class TestAdminRegistration:
    """Tests pour vérifier l'enregistrement des modèles dans l'admin"""

    def test_restaurateur_profile_registered(self):
        """Test que RestaurateurProfile est enregistré dans l'admin"""
        assert admin.site.is_registered(RestaurateurProfile)

    def test_menu_category_registered(self):
        """Test que MenuCategory est enregistré dans l'admin"""
        assert admin.site.is_registered(MenuCategory)

    def test_menu_subcategory_registered(self):
        """Test que MenuSubCategory est enregistré dans l'admin"""
        assert admin.site.is_registered(MenuSubCategory)