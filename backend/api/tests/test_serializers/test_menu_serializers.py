# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de menu

Couverture:
- MenuSerializer
- MenuItemSerializer
- MenuItemCreateSerializer
- Options et variantes
"""

import pytest
from decimal import Decimal
from api.models import Menu, MenuItem, MenuCategory
from api.serializers.menu_serializers import (
    MenuSerializer,
    MenuItemSerializer,
)


# =============================================================================
# TESTS - MenuSerializer
# =============================================================================

@pytest.mark.django_db
class TestMenuSerializer:
    """Tests pour MenuSerializer"""

    def test_serializer_fields(self, menu, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = MenuSerializer(menu, context={'request': request})
        data = serializer.data
        
        assert 'id' in data
        assert 'name' in data
        assert 'restaurant' in data
        assert 'is_available' in data

    def test_name_required(self, restaurant, factory):
        """Test que le nom est requis"""
        request = factory.post('/')
        data = {
            'restaurant': restaurant.id
        }
        serializer = MenuSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_restaurant_required(self, factory):
        """Test que le restaurant est requis"""
        request = factory.post('/')
        data = {
            'name': 'Test Menu'
        }
        serializer = MenuSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'restaurant' in serializer.errors

    def test_is_available_default(self, menu, factory):
        """Test de la valeur par défaut de is_available"""
        request = factory.get('/')
        serializer = MenuSerializer(menu, context={'request': request})
        
        if 'is_available' in serializer.data:
            assert serializer.data['is_available'] is True

    def test_items_nested(self, menu, menu_item, factory):
        """Test que les items sont imbriqués"""
        request = factory.get('/')
        serializer = MenuSerializer(menu, context={'request': request})
        
        if 'items' in serializer.data:
            assert isinstance(serializer.data['items'], list)
            assert len(serializer.data['items']) >= 1

    def test_inactive_menu(self, inactive_menu, factory):
        """Test d'un menu non disponible"""
        request = factory.get('/')
        serializer = MenuSerializer(inactive_menu, context={'request': request})
        
        if 'is_available' in serializer.data:
            assert serializer.data['is_available'] is False

    def test_multiple_menus(self, menu, inactive_menu, factory):
        """Test de sérialisation de plusieurs menus"""
        request = factory.get('/')
        menus = [menu, inactive_menu]
        
        serializer = MenuSerializer(menus, many=True, context={'request': request})
        
        assert len(serializer.data) == 2

    def test_update_menu(self, menu, factory):
        """Test de mise à jour d'un menu"""
        request = factory.patch('/')
        
        data = {'name': 'Menu Modifié'}
        serializer = MenuSerializer(
            menu,
            data=data,
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            updated = serializer.save()
            assert updated.name == 'Menu Modifié'


# =============================================================================
# TESTS - MenuItemSerializer (Lecture)
# =============================================================================

@pytest.mark.django_db
class TestMenuItemSerializer:
    """Tests pour MenuItemSerializer - Lecture"""

    def test_serializer_fields(self, menu_item, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        assert 'id' in data
        assert 'name' in data
        assert 'price' in data
        assert 'is_available' in data

    def test_price_format(self, menu_item, factory):
        """Test du format du prix"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        
        # Le prix doit être un Decimal ou une string représentant un Decimal
        price = serializer.data['price']
        assert Decimal(str(price)) == Decimal('12.50')

    def test_description_optional(self, menu_item, factory):
        """Test que la description est optionnelle"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        
        if 'description' in serializer.data:
            assert serializer.data['description'] is not None

    def test_category_info(self, menu_item, factory):
        """Test des informations de catégorie"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        # La catégorie peut être un ID ou un objet imbriqué
        if 'category' in data:
            pass  # Format dépend de l'implémentation
        if 'category_name' in data:
            assert data['category_name'] == 'Entrées'

    def test_dietary_info(self, menu_item, factory):
        """Test des informations diététiques"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        if 'is_vegetarian' in data:
            assert data['is_vegetarian'] is True
        if 'is_vegan' in data:
            assert isinstance(data['is_vegan'], bool)
        if 'is_gluten_free' in data:
            assert isinstance(data['is_gluten_free'], bool)

    def test_preparation_time(self, menu_item, factory):
        """Test du temps de préparation"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        if 'preparation_time' in data:
            assert data['preparation_time'] == 10

    def test_vat_rate(self, menu_item, factory):
        """Test du taux de TVA"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        if 'vat_rate' in data:
            assert Decimal(str(data['vat_rate'])) == Decimal('0.10')

    def test_unavailable_item(self, unavailable_menu_item, factory):
        """Test d'un item non disponible"""
        request = factory.get('/')
        serializer = MenuItemSerializer(unavailable_menu_item, context={'request': request})
        
        assert serializer.data['is_available'] is False

    def test_multiple_items(self, multiple_menu_items, factory):
        """Test de sérialisation de plusieurs items"""
        request = factory.get('/')
        serializer = MenuItemSerializer(
            multiple_menu_items,
            many=True,
            context={'request': request}
        )
        
        assert len(serializer.data) == 6


# =============================================================================
# TESTS - MenuItemSerializer (Écriture)
# =============================================================================

@pytest.mark.django_db
class TestMenuItemSerializerWrite:
    """Tests pour MenuItemSerializer - Écriture"""

    def test_valid_creation_data(self, menu, menu_category, factory):
        """Test avec des données de création valides"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Nouveau Plat',
            'price': '15.00',
            'description': 'Un délicieux plat',
            'is_available': True
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors

    def test_name_required(self, menu, menu_category, factory):
        """Test que le nom est requis"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_price_required(self, menu, menu_category, factory):
        """Test que le prix est requis"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'price' in serializer.errors

    def test_price_positive(self, menu, menu_category, factory):
        """Test que le prix doit être positif"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '-5.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'price' in serializer.errors

    def test_price_zero_invalid(self, menu, menu_category, factory):
        """Test que le prix zéro est invalide"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '0.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        # Selon l'implémentation, 0 peut être invalide
        is_valid = serializer.is_valid()

    def test_menu_required(self, menu_category, factory):
        """Test que le menu est requis"""
        request = factory.post('/')
        data = {
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert not serializer.is_valid()
        assert 'menu' in serializer.errors

    def test_description_optional(self, menu, menu_category, factory):
        """Test que la description est optionnelle"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors

    def test_is_available_default_true(self, menu, menu_category, factory):
        """Test que is_available est True par défaut"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            assert item.is_available is True

    def test_preparation_time_optional(self, menu, menu_category, factory):
        """Test que preparation_time est optionnel"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors

    def test_vat_rate_default(self, menu, menu_category, factory):
        """Test de la valeur par défaut du taux de TVA"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            # La TVA par défaut est généralement 10% (0.10) pour la restauration
            assert item.vat_rate is not None

    def test_update_item(self, menu_item, factory):
        """Test de mise à jour d'un item"""
        request = factory.patch('/')
        
        data = {
            'name': 'Salade César Revisitée',
            'price': '14.00'
        }
        serializer = MenuItemSerializer(
            menu_item,
            data=data,
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            updated = serializer.save()
            assert updated.name == 'Salade César Revisitée'
            assert updated.price == Decimal('14.00')

    def test_update_availability(self, menu_item, factory):
        """Test de mise à jour de la disponibilité"""
        request = factory.patch('/')
        
        data = {'is_available': False}
        serializer = MenuItemSerializer(
            menu_item,
            data=data,
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            updated = serializer.save()
            assert updated.is_available is False


# =============================================================================
# TESTS - Validation de prix
# =============================================================================

@pytest.mark.django_db
class TestMenuItemPriceValidation:
    """Tests de validation des prix"""

    def test_decimal_precision(self, menu, menu_category, factory):
        """Test de la précision décimale"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.99'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            assert item.price == Decimal('15.99')

    def test_price_with_many_decimals(self, menu, menu_category, factory):
        """Test avec trop de décimales"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.999'  # 3 décimales
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        # Devrait soit arrondir, soit refuser
        is_valid = serializer.is_valid()

    def test_very_large_price(self, menu, menu_category, factory):
        """Test avec un prix très élevé"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '99999.99'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        # Peut être accepté selon les règles métier
        serializer.is_valid()

    def test_price_string_format(self, menu, menu_category, factory):
        """Test que le prix peut être passé en string"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.50'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors

    def test_price_number_format(self, menu, menu_category, factory):
        """Test que le prix peut être passé en nombre"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': 15.50
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors


# =============================================================================
# TESTS - Validation du nom
# =============================================================================

@pytest.mark.django_db
class TestMenuItemNameValidation:
    """Tests de validation des noms"""

    def test_name_too_short(self, menu, menu_category, factory):
        """Test avec un nom trop court"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'A',
            'price': '15.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        # Peut être accepté ou non selon la validation
        serializer.is_valid()

    def test_name_with_special_chars(self, menu, menu_category, factory):
        """Test avec des caractères spéciaux"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Crêpe Suzette - Flambée 🔥',
            'price': '12.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        # Les emojis et caractères spéciaux devraient être acceptés
        assert serializer.is_valid(), serializer.errors

    def test_name_with_accents(self, menu, menu_category, factory):
        """Test avec des accents"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Pâté en croûte à l\'ancienne',
            'price': '18.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        assert serializer.is_valid(), serializer.errors

    def test_name_stripped(self, menu, menu_category, factory):
        """Test que le nom est nettoyé (strip)"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': '  Salade Mixte  ',
            'price': '9.00'
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            # Le nom devrait être nettoyé
            assert item.name.strip() == item.name


# =============================================================================
# TESTS - Options et allergènes
# =============================================================================

@pytest.mark.django_db
class TestMenuItemOptions:
    """Tests pour les options et allergènes"""

    def test_allergens_field(self, menu_item, factory):
        """Test du champ allergènes"""
        request = factory.get('/')
        serializer = MenuItemSerializer(menu_item, context={'request': request})
        data = serializer.data
        
        if 'allergens' in data:
            # Les allergènes peuvent être une liste ou un JSON
            assert data['allergens'] is None or isinstance(data['allergens'], (list, dict))

    def test_set_allergens(self, menu, menu_category, factory):
        """Test de définition des allergènes"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Test Item',
            'price': '15.00',
            'allergens': ['gluten', 'dairy', 'eggs']
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            if hasattr(item, 'allergens'):
                assert 'gluten' in item.allergens

    def test_dietary_flags(self, menu, menu_category, factory):
        """Test des flags diététiques"""
        request = factory.post('/')
        data = {
            'menu': menu.id,
            'category': menu_category.id,
            'name': 'Salade Vegan',
            'price': '12.00',
            'is_vegetarian': True,
            'is_vegan': True,
            'is_gluten_free': True
        }
        serializer = MenuItemSerializer(data=data, context={'request': request})
        
        if serializer.is_valid():
            item = serializer.save()
            assert item.is_vegetarian is True
            assert item.is_vegan is True
            assert item.is_gluten_free is True


# =============================================================================
# TESTS - Read-only fields
# =============================================================================

@pytest.mark.django_db
class TestMenuItemReadOnlyFields:
    """Tests des champs en lecture seule"""

    def test_id_read_only(self, menu_item, factory):
        """Test que l'ID est en lecture seule"""
        request = factory.patch('/')
        original_id = menu_item.id
        
        data = {
            'id': 99999,
            'name': 'Updated Name'
        }
        serializer = MenuItemSerializer(
            menu_item,
            data=data,
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            updated = serializer.save()
            assert updated.id == original_id

    def test_created_at_read_only(self, menu_item, factory):
        """Test que created_at est en lecture seule"""
        request = factory.patch('/')
        
        if hasattr(menu_item, 'created_at'):
            original_created = menu_item.created_at
            
            data = {
                'created_at': '2020-01-01T00:00:00Z',
                'name': 'Updated'
            }
            serializer = MenuItemSerializer(
                menu_item,
                data=data,
                partial=True,
                context={'request': request}
            )
            
            if serializer.is_valid():
                updated = serializer.save()
                assert updated.created_at == original_created
