from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from typing import Dict, Tuple, Optional, List
from django.utils import timezone
from django.db import transaction
import hashlib
import csv
import io
from api.models import (
    RestaurateurProfile,
    ComptabiliteSettings,
    FactureSequence,
    Order,
    OrderItem
)


class VATCalculator:
    """Calculateur de TVA pour la restauration"""
    
    # Taux de TVA en vigueur (France 2025)
    RATES = {
        'FOOD_ONSITE': Decimal('0.10'),      # Restauration sur place
        'FOOD_TAKEAWAY': Decimal('0.10'),    # À emporter
        'ALCOHOL': Decimal('0.20'),          # Boissons alcoolisées
        'SOFT_DRINK': Decimal('0.10'),       # Boissons non alcoolisées
        'PACKAGED': Decimal('0.055'),        # Produits emballés
    }
    
    @classmethod
    def calculate_from_ttc(cls, amount_ttc: Decimal, vat_rate: Decimal) -> Dict[str, Decimal]:
        """
        Calcule HT et TVA depuis un montant TTC
        
        Args:
            amount_ttc: Montant TTC
            vat_rate: Taux de TVA (ex: 0.10 pour 10%)
            
        Returns:
            Dict avec 'ht', 'tva', 'ttc'
        """
        amount_ttc = Decimal(str(amount_ttc))
        vat_rate = Decimal(str(vat_rate))
        
        # Calcul HT = TTC / (1 + taux)
        amount_ht = amount_ttc / (1 + vat_rate)
        amount_ht = amount_ht.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # TVA = TTC - HT
        vat_amount = amount_ttc - amount_ht
        
        return {
            'ht': amount_ht,
            'tva': vat_amount,
            'ttc': amount_ttc,
            'taux': vat_rate
        }
    
    @classmethod
    def calculate_from_ht(cls, amount_ht: Decimal, vat_rate: Decimal) -> Dict[str, Decimal]:
        """
        Calcule TTC et TVA depuis un montant HT
        
        Args:
            amount_ht: Montant HT
            vat_rate: Taux de TVA
            
        Returns:
            Dict avec 'ht', 'tva', 'ttc'
        """
        amount_ht = Decimal(str(amount_ht))
        vat_rate = Decimal(str(vat_rate))
        
        # TVA = HT * taux
        vat_amount = amount_ht * vat_rate
        vat_amount = vat_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # TTC = HT + TVA
        amount_ttc = amount_ht + vat_amount
        
        return {
            'ht': amount_ht,
            'tva': vat_amount,
            'ttc': amount_ttc,
            'taux': vat_rate
        }
    
    @classmethod
    def get_rate_for_item(cls, item: OrderItem) -> Decimal:
        """
        Détermine le taux de TVA applicable pour un article
        
        Args:
            item: Article de commande
            
        Returns:
            Taux de TVA applicable
        """
        # Si le taux est déjà défini sur l'article
        if hasattr(item.menu_item, 'vat_rate') and item.menu_item.vat_rate:
            return Decimal(str(item.menu_item.vat_rate))
        
        # Sinon, déterminer selon la catégorie
        category = getattr(item.menu_item, 'category', '').lower()
        name = getattr(item.menu_item, 'name', '').lower()
        
        # Boissons alcoolisées
        if any(word in name for word in ['vin', 'bière', 'alcool', 'whisky', 'vodka', 'cocktail']):
            return cls.RATES['ALCOHOL']
        
        # Produits emballés
        if hasattr(item.menu_item, 'is_packaged') and item.menu_item.is_packaged:
            return cls.RATES['PACKAGED']
        
        # Boissons non alcoolisées
        if category in ['boissons', 'drinks', 'beverages']:
            return cls.RATES['SOFT_DRINK']
        
        # Par défaut: restauration sur place
        order_type = getattr(item.order, 'order_type', 'dine_in')
        if order_type == 'takeaway':
            return cls.RATES['FOOD_TAKEAWAY']
        
        return cls.RATES['FOOD_ONSITE']


def generate_invoice_number(
    restaurateur: RestaurateurProfile,
    date: datetime = None
) -> str:
    """
    Génère un numéro de facture séquentiel
    
    Format: PREFIX-YYYYMM-NNNNN
    Exemple: FACT-202511-00042
    
    Args:
        restaurateur: Profil du restaurateur
        date: Date de la facture (par défaut: aujourd'hui)
        
    Returns:
        Numéro de facture unique
    """
    if date is None:
        date = timezone.now()
    
    # Récupérer la configuration
    try:
        settings = ComptabiliteSettings.objects.get(restaurateur=restaurateur)
        prefix = settings.invoice_prefix
        yearly_reset = settings.invoice_year_reset
    except ComptabiliteSettings.DoesNotExist:
        prefix = 'FACT'
        yearly_reset = True
    
    year = date.year
    month = date.month
    
    with transaction.atomic():
        # Obtenir ou créer la séquence
        sequence, created = FactureSequence.objects.select_for_update().get_or_create(
            restaurateur=restaurateur,
            year=year,
            month=month if not yearly_reset else 1,
            defaults={'last_number': 0}
        )
        
        # Incrémenter
        sequence.last_number += 1
        sequence.save()
        
        # Formater le numéro
        if yearly_reset:
            # Format annuel: PREFIX-YYYY-NNNNN
            invoice_number = f"{prefix}-{year}-{sequence.last_number:05d}"
        else:
            # Format mensuel: PREFIX-YYYYMM-NNNNN
            invoice_number = f"{prefix}-{year}{month:02d}-{sequence.last_number:05d}"
    
    return invoice_number


def calculate_order_vat_breakdown(order: Order) -> Dict[str, Dict[str, Decimal]]:
    """
    Calcule la ventilation TVA complète d'une commande
    
    Args:
        order: Commande à analyser
        
    Returns:
        Dict avec ventilation par taux de TVA
        Format: {'5.5': {'base': X, 'tva': Y}, ...}
    """
    calculator = VATCalculator()
    breakdown = {
        '5.5': {'base': Decimal('0'), 'tva': Decimal('0')},
        '10': {'base': Decimal('0'), 'tva': Decimal('0')},
        '20': {'base': Decimal('0'), 'tva': Decimal('0')},
    }
    
    for item in order.items.all():
        # Déterminer le taux
        vat_rate = calculator.get_rate_for_item(item)
        
        # Calculer HT et TVA
        price_ttc = Decimal(str(item.total_price))
        vat_calc = calculator.calculate_from_ttc(price_ttc, vat_rate)
        
        # Mapper au taux standard
        if vat_rate <= Decimal('0.055'):
            rate_key = '5.5'
        elif vat_rate <= Decimal('0.10'):
            rate_key = '10'
        else:
            rate_key = '20'
        
        # Ajouter aux totaux
        breakdown[rate_key]['base'] += vat_calc['ht']
        breakdown[rate_key]['tva'] += vat_calc['tva']
    
    # Arrondir les résultats
    for rate in breakdown:
        breakdown[rate]['base'] = breakdown[rate]['base'].quantize(Decimal('0.01'))
        breakdown[rate]['tva'] = breakdown[rate]['tva'].quantize(Decimal('0.01'))
    
    return breakdown


def format_fec_date(date: datetime) -> str:
    """
    Formate une date pour le FEC
    Format: YYYYMMDD
    """
    return date.strftime('%Y%m%d')


def format_fec_amount(amount: Decimal) -> str:
    """
    Formate un montant pour le FEC
    Format: 1234.56 (point décimal, 2 décimales)
    """
    return str(amount.quantize(Decimal('0.01')))


def validate_siret(siret: str) -> bool:
    """
    Valide un numéro SIRET (14 chiffres, algorithme de Luhn)
    
    Args:
        siret: Numéro SIRET à valider
        
    Returns:
        True si valide, False sinon
    """
    if not siret or len(siret) != 14 or not siret.isdigit():
        return False
    
    # Algorithme de Luhn
    total = 0
    for i, digit in enumerate(siret):
        n = int(digit)
        if i % 2 == 0:  # Position paire (en partant de 0)
            n *= 2
            if n > 9:
                n -= 9
        total += n
    
    return total % 10 == 0


def calculate_checksum(content: str) -> str:
    """
    Calcule le checksum MD5 d'un contenu
    
    Args:
        content: Contenu à hasher
        
    Returns:
        Hash MD5 en hexadécimal
    """
    return hashlib.md5(content.encode('utf-8')).hexdigest()


class CSVExporter:
    """Exportateur CSV pour données comptables"""
    
    @staticmethod
    def export_ventes(orders: List[Order], delimiter: str = ';') -> str:
        """
        Exporte les ventes en CSV
        
        Args:
            orders: Liste des commandes
            delimiter: Séparateur CSV
            
        Returns:
            Contenu CSV
        """
        output = io.StringIO()
        writer = csv.writer(output, delimiter=delimiter)
        
        # En-têtes
        writer.writerow([
            'Date',
            'Numéro',
            'Client',
            'Montant HT',
            'TVA 5.5%',
            'TVA 10%',
            'TVA 20%',
            'Total TTC',
            'Moyen paiement',
            'Statut'
        ])
        
        for order in orders:
            # Calculer la TVA
            vat_breakdown = calculate_order_vat_breakdown(order)
            
            # Ligne de données
            writer.writerow([
                order.created_at.strftime('%Y-%m-%d %H:%M'),
                order.order_number,
                order.client.user.get_full_name() if order.client else 'Client comptoir',
                format_fec_amount(sum(v['base'] for v in vat_breakdown.values())),
                format_fec_amount(vat_breakdown.get('5.5', {}).get('tva', 0)),
                format_fec_amount(vat_breakdown.get('10', {}).get('tva', 0)),
                format_fec_amount(vat_breakdown.get('20', {}).get('tva', 0)),
                format_fec_amount(order.total_amount),
                'Carte bancaire',  # À adapter selon votre modèle
                order.payment_status,
            ])
        
        return output.getvalue()
    
    @staticmethod
    def export_tva_summary(recaps: List, delimiter: str = ';') -> str:
        """
        Exporte le récapitulatif TVA
        
        Args:
            recaps: Liste des récapitulatifs TVA
            delimiter: Séparateur CSV
            
        Returns:
            Contenu CSV
        """
        output = io.StringIO()
        writer = csv.writer(output, delimiter=delimiter)
        
        # En-têtes
        writer.writerow([
            'Période',
            'CA HT',
            'Base 5.5%',
            'TVA 5.5%',
            'Base 10%',
            'TVA 10%',
            'Base 20%',
            'TVA 20%',
            'TVA Totale',
            'CA TTC',
            'Nb Factures',
            'Ticket Moyen'
        ])
        
        for recap in recaps:
            writer.writerow([
                f"{recap.month:02d}/{recap.year}",
                format_fec_amount(recap.ca_ht),
                format_fec_amount(recap.tva_5_5_base),
                format_fec_amount(recap.tva_5_5_montant),
                format_fec_amount(recap.tva_10_base),
                format_fec_amount(recap.tva_10_montant),
                format_fec_amount(recap.tva_20_base),
                format_fec_amount(recap.tva_20_montant),
                format_fec_amount(recap.tva_total),
                format_fec_amount(recap.ca_ttc),
                recap.nombre_factures,
                format_fec_amount(recap.ticket_moyen),
            ])
        
        return output.getvalue()


class AccountingPeriod:
    """Gestion des périodes comptables"""
    
    @staticmethod
    def get_current_period() -> Tuple[datetime, datetime]:
        """Retourne la période du mois en cours"""
        now = timezone.now()
        start = datetime(now.year, now.month, 1).replace(tzinfo=now.tzinfo)
        
        # Dernier jour du mois
        if now.month == 12:
            end = datetime(now.year + 1, 1, 1).replace(tzinfo=now.tzinfo) - timedelta(seconds=1)
        else:
            end = datetime(now.year, now.month + 1, 1).replace(tzinfo=now.tzinfo) - timedelta(seconds=1)
        
        return start, end
    
    @staticmethod
    def get_fiscal_year(date: datetime = None) -> Tuple[datetime, datetime]:
        """
        Retourne l'exercice fiscal
        En France: année civile par défaut
        """
        if date is None:
            date = timezone.now()
        
        start = datetime(date.year, 1, 1).replace(tzinfo=date.tzinfo)
        end = datetime(date.year, 12, 31, 23, 59, 59).replace(tzinfo=date.tzinfo)
        
        return start, end
    
    @staticmethod
    def get_quarter(date: datetime = None) -> Tuple[datetime, datetime]:
        """Retourne le trimestre de la date"""
        if date is None:
            date = timezone.now()
        
        quarter = (date.month - 1) // 3
        start_month = quarter * 3 + 1
        
        start = datetime(date.year, start_month, 1).replace(tzinfo=date.tzinfo)
        
        # Fin du trimestre
        end_month = start_month + 2
        if end_month > 12:
            end = datetime(date.year + 1, 1, 1).replace(tzinfo=date.tzinfo) - timedelta(seconds=1)
        else:
            end = datetime(date.year, end_month + 1, 1).replace(tzinfo=date.tzinfo) - timedelta(seconds=1)
        
        return start, end