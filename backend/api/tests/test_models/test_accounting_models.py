# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de comptabilité
- ComptabiliteSettings
- FactureSequence
- EcritureComptable
- RecapitulatifTVA
- ExportComptable

FULLY CORRECTED VERSION - All field names match actual model definitions
All models use 'restaurateur' (RestaurateurProfile), not 'restaurant'
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
def comptabilite_settings(restaurateur_profile):
    """
    Actual fields: invoice_prefix, last_invoice_number, invoice_year_reset,
                   tva_regime, export_format_default, siret, etc.
    """
    return ComptabiliteSettings.objects.create(
        restaurateur=restaurateur_profile,
        invoice_prefix="FACT",
        last_invoice_number=0,
        invoice_year_reset=True,
        tva_regime='normal',
        export_format_default='FEC',
        siret="12345678901234"
    )


@pytest.fixture
def facture_sequence(restaurateur_profile):
    """
    Fields: restaurateur, year, month, last_number (no 'prefix' field!)
    """
    return FactureSequence.objects.create(
        restaurateur=restaurateur_profile,
        year=2025,
        month=1,
        last_number=42
    )


@pytest.fixture
def ecriture_comptable(restaurateur_profile):
    """
    Actual FEC fields: journal_code, ecriture_num, ecriture_date,
                       compte_num, compte_lib, piece_ref, piece_date,
                       debit, credit, ecriture_lib
    """
    return EcritureComptable.objects.create(
        restaurateur=restaurateur_profile,
        journal_code='VE',
        ecriture_num="FAC-2025-001",
        ecriture_date=date.today(),
        compte_num="701000",
        compte_lib="Ventes de produits",
        piece_ref="FAC-2025-001",
        piece_date=date.today(),
        debit=Decimal('0.00'),
        credit=Decimal('100.00'),
        ecriture_lib="Vente restaurant"
    )


@pytest.fixture
def recapitulatif_tva(restaurateur_profile):
    """
    Fields: year, month (not periode_debut, periode_fin)
    TVA fields: tva_5_5_base, tva_5_5_montant, tva_10_base, tva_10_montant, etc.
    """
    return RecapitulatifTVA.objects.create(
        restaurateur=restaurateur_profile,
        year=2025,
        month=1,
        ca_ht=Decimal('1000.00'),
        ca_ttc=Decimal('1100.00'),
        tva_10_base=Decimal('1000.00'),
        tva_10_montant=Decimal('100.00'),
        tva_total=Decimal('100.00'),
        nombre_factures=10,
        ticket_moyen=Decimal('100.00')
    )


@pytest.fixture
def export_comptable(restaurateur_profile):
    """
    Fields: type_export (not format_export), periode_debut/periode_fin,
            fichier_nom, statut (not status), message_erreur (not error_message)
    """
    return ExportComptable.objects.create(
        restaurateur=restaurateur_profile,
        type_export='FEC',
        periode_debut=date(2025, 1, 1),
        periode_fin=date(2025, 1, 31),
        fichier_nom="export_fec_2025_01.txt",
        statut='en_cours'
    )


# =============================================================================
# TESTS - ComptabiliteSettings
# =============================================================================

@pytest.mark.django_db
class TestComptabiliteSettings:
    """
    Tests pour le modèle ComptabiliteSettings
    
    Actual fields: invoice_prefix, last_invoice_number, invoice_year_reset,
                   tva_regime, export_format_default, siret, tva_intracommunautaire, code_naf
    """

    def test_settings_creation(self, comptabilite_settings):
        """Test de la création des paramètres comptables"""
        assert comptabilite_settings.id is not None
        assert comptabilite_settings.invoice_prefix == "FACT"
        assert comptabilite_settings.last_invoice_number == 0
        assert comptabilite_settings.invoice_year_reset is True
        assert comptabilite_settings.tva_regime == 'normal'
        assert comptabilite_settings.export_format_default == 'FEC'

    def test_settings_str_method(self, comptabilite_settings):
        """Test de la méthode __str__"""
        result = str(comptabilite_settings)
        assert result is not None

    def test_settings_one_to_one_with_restaurateur(self, restaurateur_profile, comptabilite_settings):
        """Test que la relation avec RestaurateurProfile est OneToOne"""
        with pytest.raises(IntegrityError):
            ComptabiliteSettings.objects.create(
                restaurateur=restaurateur_profile,
                invoice_prefix="DUP"
            )

    def test_settings_default_values(self, user):
        """Test des valeurs par défaut"""
        # Create a new restaurateur for this test
        new_restaurateur = RestaurateurProfile.objects.create(
            user=User.objects.create_user(
                username="newuser@example.com",
                password="testpass123"
            ),
            siret="99999999999999"
        )
        
        settings = ComptabiliteSettings.objects.create(
            restaurateur=new_restaurateur
        )
        
        # Check default values
        assert settings.invoice_prefix == 'FACT'
        assert settings.invoice_year_reset is True
        assert settings.tva_regime == 'normal'

    def test_settings_cascade_delete(self, restaurateur_profile, comptabilite_settings):
        """Test que les settings sont supprimés avec le restaurateur"""
        settings_id = comptabilite_settings.id
        user = restaurateur_profile.user
        restaurateur_profile.delete()
        
        assert not ComptabiliteSettings.objects.filter(id=settings_id).exists()

    def test_settings_tva_regime_choices(self, user):
        """Test des choix de régime TVA"""
        regimes = ['normal', 'simplifie', 'franchise']
        
        for i, regime in enumerate(regimes):
            new_user = User.objects.create_user(
                username=f"tvatest{i}@example.com",
                password="testpass123"
            )
            new_restaurateur = RestaurateurProfile.objects.create(
                user=new_user,
                siret=f"1234567890123{i}"
            )
            settings = ComptabiliteSettings.objects.create(
                restaurateur=new_restaurateur,
                tva_regime=regime
            )
            assert settings.tva_regime == regime


# =============================================================================
# TESTS - FactureSequence
# =============================================================================

@pytest.mark.django_db
class TestFactureSequence:
    """
    Tests pour le modèle FactureSequence
    
    Actual fields: restaurateur, year, month, last_number
    NOTE: There is NO 'prefix' field - prefix is in ComptabiliteSettings
    """

    def test_sequence_creation(self, facture_sequence):
        """Test de la création d'une séquence de facture"""
        assert facture_sequence.id is not None
        assert facture_sequence.year == 2025
        assert facture_sequence.month == 1
        assert facture_sequence.last_number == 42

    def test_sequence_str_method(self, facture_sequence):
        """Test de la méthode __str__"""
        result = str(facture_sequence)
        assert result is not None

    def test_sequence_unique_per_restaurateur_year_month(self, restaurateur_profile, facture_sequence):
        """Test qu'une seule séquence existe par restaurateur/année/mois"""
        with pytest.raises(IntegrityError):
            FactureSequence.objects.create(
                restaurateur=restaurateur_profile,
                year=2025,
                month=1,  # Same year/month as fixture
                last_number=0
            )

    def test_sequence_different_months_allowed(self, restaurateur_profile):
        """Test que différents mois sont permis"""
        s1 = FactureSequence.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=2,
            last_number=100
        )
        s2 = FactureSequence.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=3,
            last_number=0
        )
        
        assert s1.month != s2.month

    def test_sequence_different_years_allowed(self, restaurateur_profile):
        """Test que différentes années sont permises"""
        s1 = FactureSequence.objects.create(
            restaurateur=restaurateur_profile,
            year=2024,
            month=1,
            last_number=100
        )
        s2 = FactureSequence.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=1,
            last_number=0
        )
        
        assert s1.year != s2.year

    def test_sequence_increment(self, facture_sequence):
        """Test de l'incrémentation du numéro"""
        initial = facture_sequence.last_number
        facture_sequence.last_number += 1
        facture_sequence.save()
        facture_sequence.refresh_from_db()
        
        assert facture_sequence.last_number == initial + 1

    def test_sequence_get_next_number(self, facture_sequence):
        """Test de la méthode get_next_number"""
        initial = facture_sequence.last_number
        next_num = facture_sequence.get_next_number()
        
        assert next_num == initial + 1
        assert facture_sequence.last_number == initial + 1

    def test_sequence_cascade_delete(self, restaurateur_profile, facture_sequence):
        """Test que la séquence est supprimée avec le restaurateur"""
        seq_id = facture_sequence.id
        restaurateur_profile.delete()
        
        assert not FactureSequence.objects.filter(id=seq_id).exists()


# =============================================================================
# TESTS - EcritureComptable
# =============================================================================

@pytest.mark.django_db
class TestEcritureComptable:
    """
    Tests pour le modèle EcritureComptable (format FEC)
    
    Actual FEC fields:
    - journal_code: Code journal (VE=Ventes, AC=Achats, etc.)
    - ecriture_num: Numéro d'écriture (unique)
    - ecriture_date: Date de l'écriture
    - compte_num: Numéro de compte
    - compte_lib: Libellé du compte
    - piece_ref: Référence de la pièce
    - piece_date: Date de la pièce
    - debit: Montant au débit
    - credit: Montant au crédit
    - ecriture_lib: Libellé de l'écriture
    """

    def test_ecriture_creation(self, ecriture_comptable):
        """Test de la création d'une écriture comptable"""
        assert ecriture_comptable.id is not None
        assert ecriture_comptable.journal_code == 'VE'
        assert ecriture_comptable.ecriture_num == "FAC-2025-001"
        assert ecriture_comptable.compte_num == "701000"
        assert ecriture_comptable.credit == Decimal('100.00')
        assert ecriture_comptable.created_at is not None

    def test_ecriture_str_method(self, ecriture_comptable):
        """Test de la méthode __str__"""
        result = str(ecriture_comptable)
        assert result is not None

    def test_ecriture_unique_number(self, restaurateur_profile, ecriture_comptable):
        """Test que ecriture_num est unique"""
        with pytest.raises(IntegrityError):
            EcritureComptable.objects.create(
                restaurateur=restaurateur_profile,
                journal_code='VE',
                ecriture_num="FAC-2025-001",  # Same as fixture
                ecriture_date=date.today(),
                compte_num="701000",
                compte_lib="Ventes",
                piece_ref="FAC-2025-001",
                piece_date=date.today(),
                credit=Decimal('50.00'),
                ecriture_lib="Test"
            )

    def test_ecriture_debit_credit(self, restaurateur_profile):
        """Test des montants débit/crédit"""
        # Écriture au débit
        ecriture_debit = EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="DEB-2025-001",
            ecriture_date=date.today(),
            compte_num="411000",
            compte_lib="Clients",
            piece_ref="FAC-2025-002",
            piece_date=date.today(),
            debit=Decimal('110.00'),
            credit=Decimal('0.00'),
            ecriture_lib="Client - Vente"
        )
        
        assert ecriture_debit.debit == Decimal('110.00')
        assert ecriture_debit.credit == Decimal('0.00')

    def test_ecriture_decimal_precision(self, restaurateur_profile):
        """Test de la précision décimale"""
        ecriture = EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="PREC-2025-001",
            ecriture_date=date.today(),
            compte_num="701000",
            compte_lib="Ventes",
            piece_ref="PREC-001",
            piece_date=date.today(),
            credit=Decimal('1234.56'),
            ecriture_lib="Test précision"
        )
        
        assert ecriture.credit == Decimal('1234.56')

    def test_ecriture_ordering(self, restaurateur_profile):
        """Test de l'ordre par date et numéro d'écriture"""
        e1 = EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="ORD-2025-001",
            ecriture_date=date(2025, 1, 1),
            compte_num="701000",
            compte_lib="Ventes",
            piece_ref="ORD-001",
            piece_date=date(2025, 1, 1),
            credit=Decimal('100.00'),
            ecriture_lib="Janvier"
        )
        e2 = EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="ORD-2025-002",
            ecriture_date=date(2025, 2, 1),
            compte_num="701000",
            compte_lib="Ventes",
            piece_ref="ORD-002",
            piece_date=date(2025, 2, 1),
            credit=Decimal('150.00'),
            ecriture_lib="Février"
        )
        
        # Verify ordering by ecriture_date
        ecritures = list(EcritureComptable.objects.filter(
            restaurateur=restaurateur_profile,
            ecriture_num__startswith='ORD'
        ).order_by('ecriture_date', 'ecriture_num'))
        
        assert ecritures[0].ecriture_num == "ORD-2025-001"
        assert ecritures[1].ecriture_num == "ORD-2025-002"

    def test_ecriture_filter_by_date_range(self, restaurateur_profile):
        """Test du filtrage par période"""
        EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="JAN-2025-001",
            ecriture_date=date(2025, 1, 15),
            compte_num="701000",
            compte_lib="Ventes",
            piece_ref="JAN-001",
            piece_date=date(2025, 1, 15),
            credit=Decimal('100.00'),
            ecriture_lib="Janvier"
        )
        EcritureComptable.objects.create(
            restaurateur=restaurateur_profile,
            journal_code='VE',
            ecriture_num="FEB-2025-001",
            ecriture_date=date(2025, 2, 15),
            compte_num="701000",
            compte_lib="Ventes",
            piece_ref="FEB-001",
            piece_date=date(2025, 2, 15),
            credit=Decimal('150.00'),
            ecriture_lib="Février"
        )
        
        janvier = EcritureComptable.objects.filter(
            restaurateur=restaurateur_profile,
            ecriture_date__month=1
        )
        assert janvier.count() >= 1

    def test_ecriture_cascade_delete(self, restaurateur_profile, ecriture_comptable):
        """Test que l'écriture est supprimée avec le restaurateur"""
        ecriture_id = ecriture_comptable.id
        restaurateur_profile.delete()
        
        assert not EcritureComptable.objects.filter(id=ecriture_id).exists()

    def test_ecriture_journal_codes(self, restaurateur_profile):
        """Test des différents codes journaux"""
        journals = ['VE', 'AC', 'BQ', 'CA', 'OD']
        
        for i, code in enumerate(journals):
            ecriture = EcritureComptable.objects.create(
                restaurateur=restaurateur_profile,
                journal_code=code,
                ecriture_num=f"JRN-{code}-{i}",
                ecriture_date=date.today(),
                compte_num="701000",
                compte_lib="Test",
                piece_ref=f"REF-{i}",
                piece_date=date.today(),
                credit=Decimal('10.00'),
                ecriture_lib=f"Test journal {code}"
            )
            assert ecriture.journal_code == code


# =============================================================================
# TESTS - RecapitulatifTVA
# =============================================================================

@pytest.mark.django_db
class TestRecapitulatifTVA:
    """
    Tests pour le modèle RecapitulatifTVA
    
    Actual fields:
    - year, month (integers, not periode_debut/periode_fin)
    - ca_ht, ca_ttc
    - tva_5_5_base, tva_5_5_montant
    - tva_10_base, tva_10_montant
    - tva_20_base, tva_20_montant
    - tva_total
    - nombre_factures, ticket_moyen
    - commissions_stripe, virements_stripe
    """

    def test_recap_creation(self, recapitulatif_tva):
        """Test de la création d'un récapitulatif TVA"""
        assert recapitulatif_tva.id is not None
        assert recapitulatif_tva.year == 2025
        assert recapitulatif_tva.month == 1
        assert recapitulatif_tva.ca_ht == Decimal('1000.00')
        assert recapitulatif_tva.ca_ttc == Decimal('1100.00')
        assert recapitulatif_tva.tva_10_base == Decimal('1000.00')
        assert recapitulatif_tva.tva_10_montant == Decimal('100.00')
        assert recapitulatif_tva.tva_total == Decimal('100.00')

    def test_recap_str_method(self, recapitulatif_tva):
        """Test de la méthode __str__"""
        result = str(recapitulatif_tva)
        assert result is not None

    def test_recap_unique_per_restaurateur_year_month(self, restaurateur_profile, recapitulatif_tva):
        """Test qu'un seul récap existe par restaurateur/année/mois"""
        with pytest.raises(IntegrityError):
            RecapitulatifTVA.objects.create(
                restaurateur=restaurateur_profile,
                year=2025,
                month=1,  # Same year/month as fixture
                ca_ht=Decimal('200.00'),
                ca_ttc=Decimal('220.00'),
                tva_total=Decimal('20.00')
            )

    def test_recap_multiple_months(self, restaurateur_profile):
        """Test de plusieurs mois pour le même restaurateur"""
        RecapitulatifTVA.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=2,
            ca_ht=Decimal('500.00'),
            ca_ttc=Decimal('550.00'),
            tva_total=Decimal('50.00')
        )
        RecapitulatifTVA.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=3,
            ca_ht=Decimal('600.00'),
            ca_ttc=Decimal('660.00'),
            tva_total=Decimal('60.00')
        )
        
        recaps = RecapitulatifTVA.objects.filter(
            restaurateur=restaurateur_profile,
            year=2025
        )
        assert recaps.count() >= 2

    def test_recap_multiple_tva_rates(self, restaurateur_profile):
        """Test avec plusieurs taux de TVA"""
        recap = RecapitulatifTVA.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=4,
            ca_ht=Decimal('1000.00'),
            ca_ttc=Decimal('1121.00'),
            # TVA 5.5%
            tva_5_5_base=Decimal('200.00'),
            tva_5_5_montant=Decimal('11.00'),
            # TVA 10%
            tva_10_base=Decimal('500.00'),
            tva_10_montant=Decimal('50.00'),
            # TVA 20%
            tva_20_base=Decimal('300.00'),
            tva_20_montant=Decimal('60.00'),
            # Total
            tva_total=Decimal('121.00')
        )
        
        assert recap.tva_5_5_montant == Decimal('11.00')
        assert recap.tva_10_montant == Decimal('50.00')
        assert recap.tva_20_montant == Decimal('60.00')
        
        # Verify total
        total = recap.tva_5_5_montant + recap.tva_10_montant + recap.tva_20_montant
        assert total == Decimal('121.00')

    def test_recap_filter_by_year(self, restaurateur_profile):
        """Test du filtrage par année"""
        RecapitulatifTVA.objects.create(
            restaurateur=restaurateur_profile,
            year=2024,
            month=12,
            ca_ht=Decimal('1000.00'),
            ca_ttc=Decimal('1100.00'),
            tva_total=Decimal('100.00')
        )
        
        recaps_2024 = RecapitulatifTVA.objects.filter(
            restaurateur=restaurateur_profile,
            year=2024
        )
        assert recaps_2024.count() == 1
        assert recaps_2024.first().month == 12

    def test_recap_stripe_fields(self, restaurateur_profile):
        """Test des champs Stripe"""
        recap = RecapitulatifTVA.objects.create(
            restaurateur=restaurateur_profile,
            year=2025,
            month=5,
            ca_ht=Decimal('1000.00'),
            ca_ttc=Decimal('1100.00'),
            tva_total=Decimal('100.00'),
            commissions_stripe=Decimal('29.00'),
            virements_stripe=Decimal('1071.00')
        )
        
        assert recap.commissions_stripe == Decimal('29.00')
        assert recap.virements_stripe == Decimal('1071.00')

    def test_recap_cascade_delete(self, restaurateur_profile, recapitulatif_tva):
        """Test que le récapitulatif est supprimé avec le restaurateur"""
        recap_id = recapitulatif_tva.id
        restaurateur_profile.delete()
        
        assert not RecapitulatifTVA.objects.filter(id=recap_id).exists()


# =============================================================================
# TESTS - ExportComptable
# =============================================================================

@pytest.mark.django_db
class TestExportComptable:
    """
    Tests pour le modèle ExportComptable
    
    Actual fields:
    - type_export (not format_export)
    - periode_debut, periode_fin (not date_debut, date_fin)
    - fichier_url, fichier_nom, fichier_taille
    - statut (not status)
    - message_erreur (not error_message)
    - nombre_lignes, checksum_md5
    - created_at, expires_at
    """

    def test_export_creation(self, export_comptable):
        """Test de la création d'un export comptable"""
        assert export_comptable.id is not None
        assert export_comptable.periode_debut == date(2025, 1, 1)
        assert export_comptable.periode_fin == date(2025, 1, 31)
        assert export_comptable.type_export == 'FEC'
        assert export_comptable.created_at is not None

    def test_export_str_method(self, export_comptable):
        """Test de la méthode __str__"""
        result = str(export_comptable)
        assert result is not None

    def test_export_type_choices(self, restaurateur_profile):
        """Test des types d'export"""
        export_types = ['FEC', 'CSV', 'PDF', 'TVA', 'RECETTES']
        
        for i, type_exp in enumerate(export_types):
            export = ExportComptable.objects.create(
                restaurateur=restaurateur_profile,
                type_export=type_exp,
                periode_debut=date(2025, i+1, 1),
                periode_fin=date(2025, i+1, 28),
                fichier_nom=f"export_{type_exp.lower()}.txt",
                statut='en_cours'
            )
            assert export.type_export == type_exp

    def test_export_statut_choices(self, restaurateur_profile):
        """Test des statuts d'export"""
        statuts = ['en_cours', 'complete', 'erreur']
        
        for i, statut in enumerate(statuts):
            export = ExportComptable.objects.create(
                restaurateur=restaurateur_profile,
                type_export='CSV',
                periode_debut=date(2025, i+1, 1),
                periode_fin=date(2025, i+1, 28),
                fichier_nom=f"export_{i}.csv",
                statut=statut
            )
            assert export.statut == statut

    def test_export_default_statut(self, restaurateur_profile):
        """Test du statut par défaut"""
        export = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='CSV',
            periode_debut=date(2025, 6, 1),
            periode_fin=date(2025, 6, 30),
            fichier_nom="export_test.csv"
            # statut not specified - should default to 'en_cours'
        )
        assert export.statut == 'en_cours'

    def test_export_fichier_fields(self, restaurateur_profile):
        """Test des champs fichier"""
        export = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='FEC',
            periode_debut=date(2025, 7, 1),
            periode_fin=date(2025, 7, 31),
            fichier_nom="export_fec_2025.txt",
            fichier_url="https://storage.example.com/exports/fec_2025.txt",
            fichier_taille=1024000
        )
        
        assert export.fichier_nom == "export_fec_2025.txt"
        assert export.fichier_url == "https://storage.example.com/exports/fec_2025.txt"
        assert export.fichier_taille == 1024000

    def test_export_ordering(self, restaurateur_profile):
        """Test de l'ordre par date de création décroissante"""
        e1 = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='CSV',
            periode_debut=date(2025, 8, 1),
            periode_fin=date(2025, 8, 31),
            fichier_nom="export_jan.csv"
        )
        e2 = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='CSV',
            periode_debut=date(2025, 9, 1),
            periode_fin=date(2025, 9, 30),
            fichier_nom="export_feb.csv"
        )
        
        exports = list(ExportComptable.objects.filter(restaurateur=restaurateur_profile).order_by('-created_at'))
        # Most recent first (ordering is -created_at)
        assert exports[0] == e2

    def test_export_cascade_delete(self, restaurateur_profile, export_comptable):
        """Test que l'export est supprimé avec le restaurateur"""
        export_id = export_comptable.id
        restaurateur_profile.delete()
        
        assert not ExportComptable.objects.filter(id=export_id).exists()

    def test_export_timestamps(self, export_comptable):
        """Test des timestamps"""
        assert export_comptable.created_at is not None

    def test_export_message_erreur(self, restaurateur_profile):
        """Test du champ message d'erreur"""
        export = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='CSV',
            periode_debut=date(2025, 10, 1),
            periode_fin=date(2025, 10, 31),
            fichier_nom="export_failed.csv",
            statut='erreur',
            message_erreur="Erreur de connexion à la base de données"
        )
        
        assert export.message_erreur == "Erreur de connexion à la base de données"

    def test_export_metadata_fields(self, restaurateur_profile):
        """Test des champs métadonnées"""
        export = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='FEC',
            periode_debut=date(2025, 11, 1),
            periode_fin=date(2025, 11, 30),
            fichier_nom="fec_2025.txt",
            statut='complete',
            nombre_lignes=5000,
            checksum_md5="d41d8cd98f00b204e9800998ecf8427e"
        )
        
        assert export.nombre_lignes == 5000
        assert export.checksum_md5 == "d41d8cd98f00b204e9800998ecf8427e"

    def test_export_expires_at(self, restaurateur_profile):
        """Test du champ d'expiration"""
        expires = timezone.now() + timedelta(days=7)
        export = ExportComptable.objects.create(
            restaurateur=restaurateur_profile,
            type_export='PDF',
            periode_debut=date(2025, 12, 1),
            periode_fin=date(2025, 12, 31),
            fichier_nom="rapport.pdf",
            expires_at=expires
        )
        
        assert export.expires_at is not None
        assert export.expires_at > timezone.now()