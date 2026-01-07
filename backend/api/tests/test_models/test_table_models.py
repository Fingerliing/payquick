# -*- coding: utf-8 -*-
"""
Tests unitaires pour le modèle Table
"""

import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from api.models import Table, Restaurant, RestaurateurProfile


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="tableowner@example.com",
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
        name="Table Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number="1",
        capacity=4
    )


# =============================================================================
# TESTS - Table
# =============================================================================

@pytest.mark.django_db
class TestTable:
    """Tests pour le modèle Table"""

    def test_table_creation(self, table):
        """Test de la création d'une table"""
        assert table.id is not None
        assert table.number == "1"
        assert table.capacity == 4
        assert table.is_active is True
        assert table.created_at is not None
        assert table.updated_at is not None

    def test_table_str_method(self, table, restaurant):
        """Test de la méthode __str__"""
        expected = f"Table 1 - {restaurant.name}"
        assert str(table) == expected

    def test_qr_code_auto_generation(self, restaurant):
        """Test de la génération automatique du QR code"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="5",
            capacity=2
        )
        
        expected_qr = f"R{restaurant.id}T005"
        assert table.qr_code == expected_qr

    def test_qr_code_unique_constraint(self, restaurant):
        """Test que le QR code est unique"""
        Table.objects.create(
            restaurant=restaurant,
            number="10",
            qr_code="UNIQUE_QR_001"
        )
        
        with pytest.raises(IntegrityError):
            Table.objects.create(
                restaurant=restaurant,
                number="11",
                qr_code="UNIQUE_QR_001"
            )

    def test_unique_together_restaurant_number(self, restaurant):
        """Test de la contrainte unique_together (restaurant, number)"""
        Table.objects.create(
            restaurant=restaurant,
            number="20"
        )
        
        with pytest.raises(IntegrityError):
            Table.objects.create(
                restaurant=restaurant,
                number="20"
            )

    def test_default_capacity(self, restaurant):
        """Test de la capacité par défaut"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="30"
        )
        assert table.capacity == 4

    def test_default_is_active(self, restaurant):
        """Test que is_active est True par défaut"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="31"
        )
        assert table.is_active is True

    def test_capacity_validation_min(self, restaurant):
        """Test de la validation de capacité minimale"""
        with pytest.raises(ValidationError):
            table = Table(
                restaurant=restaurant,
                number="40",
                capacity=0
            )
            table.full_clean()

    def test_capacity_validation_max(self, restaurant):
        """Test de la validation de capacité maximale"""
        with pytest.raises(ValidationError):
            table = Table(
                restaurant=restaurant,
                number="41",
                capacity=51
            )
            table.full_clean()

    def test_capacity_valid_range(self, restaurant):
        """Test des capacités valides"""
        for capacity in [1, 10, 25, 50]:
            table = Table.objects.create(
                restaurant=restaurant,
                number=str(100 + capacity),
                capacity=capacity
            )
            assert table.capacity == capacity

    def test_identifiant_property(self, table):
        """Test de la propriété identifiant (alias de qr_code)"""
        assert table.identifiant == table.qr_code

    def test_manual_code_property(self, table):
        """Test de la propriété manualCode"""
        assert table.manualCode == table.qr_code

    def test_qr_code_url_property(self, table):
        """Test de la propriété qrCodeUrl"""
        url = table.qrCodeUrl
        assert url is not None
        assert table.qr_code in url

    def test_qr_code_url_none_when_no_qr_code(self, restaurant):
        """Test que qrCodeUrl retourne None si pas de QR code"""
        # Créer une table sans déclencher la génération auto
        table = Table(
            restaurant=restaurant,
            number="50"
        )
        table.qr_code = None
        # Ne pas appeler save() pour éviter la génération auto
        assert table.qrCodeUrl is None

    def test_cascade_delete_with_restaurant(self, restaurant):
        """Test que la table est supprimée avec le restaurant"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="60"
        )
        table_id = table.id
        
        restaurant.delete()
        
        assert not Table.objects.filter(id=table_id).exists()

    def test_ordering(self, restaurant):
        """Test de l'ordre par défaut"""
        t1 = Table.objects.create(restaurant=restaurant, number="A")
        t2 = Table.objects.create(restaurant=restaurant, number="B")
        t3 = Table.objects.create(restaurant=restaurant, number="C")
        
        tables = list(Table.objects.filter(restaurant=restaurant).order_by('number'))
        assert tables[0].number == "A"
        assert tables[1].number == "B"
        assert tables[2].number == "C"

    def test_qr_code_format(self, restaurant):
        """Test du format du QR code généré"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="7"
        )
        
        # Format attendu: R{restaurant_id}T{number padded to 3 digits}
        assert table.qr_code.startswith("R")
        assert f"R{restaurant.id}T" in table.qr_code
        assert table.qr_code.endswith("007")

    def test_qr_code_not_overwritten_if_exists(self, restaurant):
        """Test que le QR code n'est pas écrasé s'il existe déjà"""
        custom_qr = "CUSTOM_QR_123"
        table = Table.objects.create(
            restaurant=restaurant,
            number="80",
            qr_code=custom_qr
        )
        
        assert table.qr_code == custom_qr

    def test_related_name_tables(self, restaurant):
        """Test du related_name 'tables' sur Restaurant"""
        Table.objects.create(restaurant=restaurant, number="90")
        Table.objects.create(restaurant=restaurant, number="91")
        
        assert restaurant.tables.count() == 2

    def test_indexes_exist(self):
        """Test que les index sont définis"""
        indexes = Table._meta.indexes
        assert len(indexes) >= 2
        
        # Vérifier les noms des champs indexés
        index_fields = [idx.fields for idx in indexes]
        assert ['restaurant', 'is_active'] in index_fields
        assert ['qr_code'] in index_fields

    def test_number_alphanumeric(self, restaurant):
        """Test que le numéro peut être alphanumérique"""
        table = Table.objects.create(
            restaurant=restaurant,
            number="A1-VIP"
        )
        assert table.number == "A1-VIP"

    def test_update_qr_code(self, table):
        """Test de la mise à jour du QR code"""
        new_qr = "UPDATED_QR_CODE"
        table.qr_code = new_qr
        table.save()
        
        table.refresh_from_db()
        assert table.qr_code == new_qr

    def test_deactivate_table(self, table):
        """Test de la désactivation d'une table"""
        assert table.is_active is True
        
        table.is_active = False
        table.save()
        
        table.refresh_from_db()
        assert table.is_active is False


# =============================================================================
# TESTS - Table avec plusieurs restaurants
# =============================================================================

@pytest.mark.django_db
class TestTableMultiRestaurant:
    """Tests pour Table avec plusieurs restaurants"""

    def test_same_number_different_restaurants(self, restaurateur_profile):
        """Test que le même numéro peut être utilisé dans différents restaurants"""
        r1 = Restaurant.objects.create(
            name="Restaurant 1",
            description="Test",
            owner=restaurateur_profile,
            siret="11111111111111"
        )
        r2 = Restaurant.objects.create(
            name="Restaurant 2",
            description="Test",
            owner=restaurateur_profile,
            siret="22222222222222"
        )
        
        t1 = Table.objects.create(restaurant=r1, number="1")
        t2 = Table.objects.create(restaurant=r2, number="1")
        
        assert t1.number == t2.number
        assert t1.qr_code != t2.qr_code

    def test_tables_filtered_by_restaurant(self, restaurateur_profile):
        """Test du filtrage des tables par restaurant"""
        r1 = Restaurant.objects.create(
            name="Restaurant 1",
            description="Test",
            owner=restaurateur_profile,
            siret="33333333333333"
        )
        r2 = Restaurant.objects.create(
            name="Restaurant 2",
            description="Test",
            owner=restaurateur_profile,
            siret="44444444444444"
        )
        
        Table.objects.create(restaurant=r1, number="1")
        Table.objects.create(restaurant=r1, number="2")
        Table.objects.create(restaurant=r2, number="1")
        
        assert r1.tables.count() == 2
        assert r2.tables.count() == 1

    def test_active_tables_filter(self, restaurant):
        """Test du filtrage des tables actives"""
        Table.objects.create(restaurant=restaurant, number="A1", is_active=True)
        Table.objects.create(restaurant=restaurant, number="A2", is_active=True)
        Table.objects.create(restaurant=restaurant, number="A3", is_active=False)
        
        active_tables = Table.objects.filter(restaurant=restaurant, is_active=True)
        assert active_tables.count() == 2
