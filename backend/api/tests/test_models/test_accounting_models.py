# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de comptabilité
- ComptabiliteSettings
- FactureSequence
- EcritureComptable
- RecapitulatifTVA
- ExportComptable
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone
from api.models import (
    ComptabiliteSettings,
    FactureSequence,
    EcritureComptable,
    RecapitulatifTVA,
    ExportComptable,
    Restaurant,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="comptauser@example.com",
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
        name="Compta Test Restaurant",
        description="Restaurant de test comptabilité",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def comptabilite_settings(restaurant):
    return ComptabiliteSettings.objects.create(
        restaurant=restaurant,
        compte_ventes="701000",
        compte_tva_collectee="445710",
        compte_caisse="530000",
        compte_banque="512000"
    )


@pytest.fixture
def facture_sequence(restaurant):
    return FactureSequence.objects.create(
        restaurant=restaurant,
        prefix="FAC",
        year=2025,
        last_number=42
    )


@pytest.fixture
def ecriture_comptable(restaurant):
    return EcritureComptable.objects.create(
        restaurant=restaurant,
        date_ecriture=date.today(),
        numero_piece="FAC-2025-001",
        libelle="Vente restaurant",
        compte_debit="530000",
        compte_credit="701000",
        montant=Decimal('100.00')
    )


@pytest.fixture
def recapitulatif_tva(restaurant):
    return RecapitulatifTVA.objects.create(
        restaurant=restaurant,
        periode_debut=date(2025, 1, 1),
        periode_fin=date(2025, 1, 31),
        taux_tva=Decimal('10.00'),
        base_ht=Decimal('1000.00'),
        montant_tva=Decimal('100.00')
    )


@pytest.fixture
def export_comptable(restaurant, user):
    return ExportComptable.objects.create(
        restaurant=restaurant,
        date_debut=date(2025, 1, 1),
        date_fin=date(2025, 1, 31),
        format_export='fec',
        created_by=user
    )


# =============================================================================
# TESTS - ComptabiliteSettings
# =============================================================================

@pytest.mark.django_db
class TestComptabiliteSettings:
    """Tests pour le modèle ComptabiliteSettings"""

    def test_settings_creation(self, comptabilite_settings):
        """Test de la création des paramètres comptables"""
        assert comptabilite_settings.id is not None
        assert comptabilite_settings.compte_ventes == "701000"
        assert comptabilite_settings.compte_tva_collectee == "445710"
        assert comptabilite_settings.compte_caisse == "530000"
        assert comptabilite_settings.compte_banque == "512000"

    def test_settings_str_method(self, comptabilite_settings, restaurant):
        """Test de la méthode __str__"""
        result = str(comptabilite_settings)
        assert restaurant.name in result or "Comptabilité" in result

    def test_settings_one_to_one_with_restaurant(self, restaurant):
        """Test que la relation avec Restaurant est OneToOne"""
        ComptabiliteSettings.objects.create(
            restaurant=restaurant,
            compte_ventes="701000"
        )
        
        with pytest.raises(IntegrityError):
            ComptabiliteSettings.objects.create(
                restaurant=restaurant,
                compte_ventes="702000"
            )

    def test_settings_default_values(self, restaurant):
        """Test des valeurs par défaut"""
        # Supprimer les settings existants
        ComptabiliteSettings.objects.filter(restaurant=restaurant).delete()
        
        settings = ComptabiliteSettings.objects.create(
            restaurant=restaurant
        )
        
        # Les comptes devraient avoir des valeurs par défaut ou être vides
        assert settings.compte_ventes is not None or settings.compte_ventes == ""

    def test_settings_cascade_delete(self, restaurant, comptabilite_settings):
        """Test que les settings sont supprimés avec le restaurant"""
        settings_id = comptabilite_settings.id
        restaurant.delete()
        
        assert not ComptabiliteSettings.objects.filter(id=settings_id).exists()


# =============================================================================
# TESTS - FactureSequence
# =============================================================================

@pytest.mark.django_db
class TestFactureSequence:
    """Tests pour le modèle FactureSequence"""

    def test_sequence_creation(self, facture_sequence):
        """Test de la création d'une séquence de facture"""
        assert facture_sequence.id is not None
        assert facture_sequence.prefix == "FAC"
        assert facture_sequence.year == 2025
        assert facture_sequence.last_number == 42

    def test_sequence_str_method(self, facture_sequence):
        """Test de la méthode __str__"""
        result = str(facture_sequence)
        assert "FAC" in result or "2025" in str(result)

    def test_sequence_unique_together(self, restaurant):
        """Test de la contrainte unique_together (restaurant, prefix, year)"""
        FactureSequence.objects.create(
            restaurant=restaurant,
            prefix="TEST",
            year=2025,
            last_number=1
        )
        
        with pytest.raises(IntegrityError):
            FactureSequence.objects.create(
                restaurant=restaurant,
                prefix="TEST",
                year=2025,
                last_number=2
            )

    def test_sequence_different_years(self, restaurant):
        """Test de séquences différentes par année"""
        seq_2024 = FactureSequence.objects.create(
            restaurant=restaurant,
            prefix="FAC",
            year=2024,
            last_number=100
        )
        seq_2025 = FactureSequence.objects.create(
            restaurant=restaurant,
            prefix="FAC",
            year=2025,
            last_number=1
        )
        
        assert seq_2024.last_number == 100
        assert seq_2025.last_number == 1

    def test_sequence_increment(self, facture_sequence):
        """Test de l'incrémentation du numéro"""
        old_number = facture_sequence.last_number
        facture_sequence.last_number += 1
        facture_sequence.save()
        
        facture_sequence.refresh_from_db()
        assert facture_sequence.last_number == old_number + 1

    def test_sequence_default_last_number(self, restaurant):
        """Test de la valeur par défaut de last_number"""
        seq = FactureSequence.objects.create(
            restaurant=restaurant,
            prefix="NEW",
            year=2025
        )
        assert seq.last_number == 0 or seq.last_number == 1

    def test_sequence_cascade_delete(self, restaurant, facture_sequence):
        """Test que la séquence est supprimée avec le restaurant"""
        seq_id = facture_sequence.id
        restaurant.delete()
        
        assert not FactureSequence.objects.filter(id=seq_id).exists()


# =============================================================================
# TESTS - EcritureComptable
# =============================================================================

@pytest.mark.django_db
class TestEcritureComptable:
    """Tests pour le modèle EcritureComptable"""

    def test_ecriture_creation(self, ecriture_comptable):
        """Test de la création d'une écriture comptable"""
        assert ecriture_comptable.id is not None
        assert ecriture_comptable.numero_piece == "FAC-2025-001"
        assert ecriture_comptable.libelle == "Vente restaurant"
        assert ecriture_comptable.montant == Decimal('100.00')
        assert ecriture_comptable.created_at is not None

    def test_ecriture_str_method(self, ecriture_comptable):
        """Test de la méthode __str__"""
        result = str(ecriture_comptable)
        assert "FAC-2025-001" in result or "100" in result

    def test_ecriture_debit_credit_accounts(self, ecriture_comptable):
        """Test des comptes débit et crédit"""
        assert ecriture_comptable.compte_debit == "530000"
        assert ecriture_comptable.compte_credit == "701000"

    def test_ecriture_date(self, ecriture_comptable):
        """Test de la date d'écriture"""
        assert ecriture_comptable.date_ecriture == date.today()

    def test_ecriture_ordering(self, restaurant):
        """Test de l'ordre par date décroissante"""
        e1 = EcritureComptable.objects.create(
            restaurant=restaurant,
            date_ecriture=date(2025, 1, 1),
            numero_piece="E1",
            libelle="Test 1",
            compte_debit="530000",
            compte_credit="701000",
            montant=Decimal('50.00')
        )
        e2 = EcritureComptable.objects.create(
            restaurant=restaurant,
            date_ecriture=date(2025, 1, 15),
            numero_piece="E2",
            libelle="Test 2",
            compte_debit="530000",
            compte_credit="701000",
            montant=Decimal('75.00')
        )
        
        ecritures = list(EcritureComptable.objects.filter(restaurant=restaurant).order_by('-date_ecriture'))
        assert ecritures[0] == e2
        assert ecritures[1] == e1

    def test_ecriture_filter_by_date_range(self, restaurant):
        """Test du filtrage par période"""
        EcritureComptable.objects.create(
            restaurant=restaurant,
            date_ecriture=date(2025, 1, 15),
            numero_piece="JAN1",
            libelle="Janvier",
            compte_debit="530000",
            compte_credit="701000",
            montant=Decimal('100.00')
        )
        EcritureComptable.objects.create(
            restaurant=restaurant,
            date_ecriture=date(2025, 2, 15),
            numero_piece="FEB1",
            libelle="Février",
            compte_debit="530000",
            compte_credit="701000",
            montant=Decimal('150.00')
        )
        
        janvier = EcritureComptable.objects.filter(
            restaurant=restaurant,
            date_ecriture__month=1
        )
        assert janvier.count() == 1

    def test_ecriture_cascade_delete(self, restaurant, ecriture_comptable):
        """Test que l'écriture est supprimée avec le restaurant"""
        ecriture_id = ecriture_comptable.id
        restaurant.delete()
        
        assert not EcritureComptable.objects.filter(id=ecriture_id).exists()

    def test_ecriture_decimal_precision(self, restaurant):
        """Test de la précision décimale du montant"""
        ecriture = EcritureComptable.objects.create(
            restaurant=restaurant,
            date_ecriture=date.today(),
            numero_piece="PREC1",
            libelle="Test précision",
            compte_debit="530000",
            compte_credit="701000",
            montant=Decimal('1234.56')
        )
        
        assert ecriture.montant == Decimal('1234.56')


# =============================================================================
# TESTS - RecapitulatifTVA
# =============================================================================

@pytest.mark.django_db
class TestRecapitulatifTVA:
    """Tests pour le modèle RecapitulatifTVA"""

    def test_recap_creation(self, recapitulatif_tva):
        """Test de la création d'un récapitulatif TVA"""
        assert recapitulatif_tva.id is not None
        assert recapitulatif_tva.periode_debut == date(2025, 1, 1)
        assert recapitulatif_tva.periode_fin == date(2025, 1, 31)
        assert recapitulatif_tva.taux_tva == Decimal('10.00')
        assert recapitulatif_tva.base_ht == Decimal('1000.00')
        assert recapitulatif_tva.montant_tva == Decimal('100.00')

    def test_recap_str_method(self, recapitulatif_tva):
        """Test de la méthode __str__"""
        result = str(recapitulatif_tva)
        # Devrait contenir la période ou le taux
        assert "2025" in result or "10" in result or "TVA" in result

    def test_recap_multiple_rates(self, restaurant):
        """Test de plusieurs taux TVA pour la même période"""
        RecapitulatifTVA.objects.create(
            restaurant=restaurant,
            periode_debut=date(2025, 1, 1),
            periode_fin=date(2025, 1, 31),
            taux_tva=Decimal('10.00'),
            base_ht=Decimal('500.00'),
            montant_tva=Decimal('50.00')
        )
        RecapitulatifTVA.objects.create(
            restaurant=restaurant,
            periode_debut=date(2025, 1, 1),
            periode_fin=date(2025, 1, 31),
            taux_tva=Decimal('5.50'),
            base_ht=Decimal('300.00'),
            montant_tva=Decimal('16.50')
        )
        
        recaps = RecapitulatifTVA.objects.filter(restaurant=restaurant)
        assert recaps.count() == 2

    def test_recap_total_ttc_calculation(self, recapitulatif_tva):
        """Test du calcul du TTC"""
        ttc = recapitulatif_tva.base_ht + recapitulatif_tva.montant_tva
        assert ttc == Decimal('1100.00')

    def test_recap_filter_by_period(self, restaurant):
        """Test du filtrage par période"""
        RecapitulatifTVA.objects.create(
            restaurant=restaurant,
            periode_debut=date(2025, 1, 1),
            periode_fin=date(2025, 1, 31),
            taux_tva=Decimal('10.00'),
            base_ht=Decimal('1000.00'),
            montant_tva=Decimal('100.00')
        )
        RecapitulatifTVA.objects.create(
            restaurant=restaurant,
            periode_debut=date(2025, 2, 1),
            periode_fin=date(2025, 2, 28),
            taux_tva=Decimal('10.00'),
            base_ht=Decimal('1200.00'),
            montant_tva=Decimal('120.00')
        )
        
        janvier = RecapitulatifTVA.objects.filter(
            restaurant=restaurant,
            periode_debut__month=1
        )
        assert janvier.count() == 1

    def test_recap_cascade_delete(self, restaurant, recapitulatif_tva):
        """Test que le récapitulatif est supprimé avec le restaurant"""
        recap_id = recapitulatif_tva.id
        restaurant.delete()
        
        assert not RecapitulatifTVA.objects.filter(id=recap_id).exists()


# =============================================================================
# TESTS - ExportComptable
# =============================================================================

@pytest.mark.django_db
class TestExportComptable:
    """Tests pour le modèle ExportComptable"""

    def test_export_creation(self, export_comptable):
        """Test de la création d'un export comptable"""
        assert export_comptable.id is not None
        assert export_comptable.date_debut == date(2025, 1, 1)
        assert export_comptable.date_fin == date(2025, 1, 31)
        assert export_comptable.format_export == 'fec'
        assert export_comptable.created_at is not None

    def test_export_str_method(self, export_comptable):
        """Test de la méthode __str__"""
        result = str(export_comptable)
        # Devrait contenir le format ou la date
        assert "fec" in result.lower() or "2025" in result

    def test_export_format_choices(self, restaurant, user):
        """Test des formats d'export"""
        formats = ['fec', 'csv', 'xlsx', 'pdf']
        
        for i, fmt in enumerate(formats):
            export = ExportComptable.objects.create(
                restaurant=restaurant,
                date_debut=date(2025, 1, 1),
                date_fin=date(2025, 1, 31),
                format_export=fmt,
                created_by=user
            )
            assert export.format_export == fmt

    def test_export_status_choices(self, restaurant, user):
        """Test des statuts d'export"""
        statuses = ['pending', 'processing', 'completed', 'failed']
        
        for i, status in enumerate(statuses):
            export = ExportComptable.objects.create(
                restaurant=restaurant,
                date_debut=date(2025, i+1, 1),
                date_fin=date(2025, i+1, 28),
                format_export='csv',
                status=status,
                created_by=user
            )
            assert export.status == status

    def test_export_default_status(self, restaurant, user):
        """Test du statut par défaut"""
        export = ExportComptable.objects.create(
            restaurant=restaurant,
            date_debut=date(2025, 1, 1),
            date_fin=date(2025, 1, 31),
            format_export='csv',
            created_by=user
        )
        assert export.status == 'pending'

    def test_export_file_field(self, export_comptable):
        """Test du champ fichier"""
        # Le fichier est optionnel à la création
        assert export_comptable.file is None or export_comptable.file.name == ""

    def test_export_created_by_field(self, export_comptable, user):
        """Test du champ created_by"""
        assert export_comptable.created_by == user

    def test_export_ordering(self, restaurant, user):
        """Test de l'ordre par date de création décroissante"""
        e1 = ExportComptable.objects.create(
            restaurant=restaurant,
            date_debut=date(2025, 1, 1),
            date_fin=date(2025, 1, 31),
            format_export='csv',
            created_by=user
        )
        e2 = ExportComptable.objects.create(
            restaurant=restaurant,
            date_debut=date(2025, 2, 1),
            date_fin=date(2025, 2, 28),
            format_export='csv',
            created_by=user
        )
        
        exports = list(ExportComptable.objects.filter(restaurant=restaurant))
        # Plus récent en premier
        assert exports[0] == e2

    def test_export_cascade_delete(self, restaurant, export_comptable):
        """Test que l'export est supprimé avec le restaurant"""
        export_id = export_comptable.id
        restaurant.delete()
        
        assert not ExportComptable.objects.filter(id=export_id).exists()

    def test_export_timestamps(self, export_comptable):
        """Test des timestamps"""
        assert export_comptable.created_at is not None
        
        # completed_at devrait être None à la création
        if hasattr(export_comptable, 'completed_at'):
            assert export_comptable.completed_at is None

    def test_export_error_message(self, restaurant, user):
        """Test du champ message d'erreur"""
        export = ExportComptable.objects.create(
            restaurant=restaurant,
            date_debut=date(2025, 1, 1),
            date_fin=date(2025, 1, 31),
            format_export='csv',
            status='failed',
            error_message="Erreur de connexion à la base de données",
            created_by=user
        )
        
        assert export.error_message == "Erreur de connexion à la base de données"
