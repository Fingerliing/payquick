"""
Module de calcul des commissions et revenus pour EatQuickeR

Ce module centralise les constantes et fonctions de calcul liées aux
commissions de la plateforme et aux revenus des restaurateurs.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta


# ============================================================================
# CONSTANTES - COMMISSION PLATEFORME
# ============================================================================

# Commission EatQuickeR sur les paiements par carte (2%)
PLATFORM_COMMISSION_RATE = Decimal('0.02')
PLATFORM_COMMISSION_PERCENT = 2

# Estimation des frais Stripe (pour affichage informatif uniquement)
# Les vrais frais sont déduits directement par Stripe
STRIPE_FEE_PERCENT = Decimal('1.4')
STRIPE_FEE_FIXED = Decimal('0.25')


# ============================================================================
# FONCTIONS DE CALCUL
# ============================================================================

def calculate_platform_fee(amount: Decimal) -> Decimal:
    """
    Calcule la commission EatQuickeR pour un montant donné.
    
    Args:
        amount: Montant brut de la commande en euros
        
    Returns:
        Montant de la commission en euros
    """
    fee = amount * PLATFORM_COMMISSION_RATE
    return fee.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_platform_fee_cents(amount_cents: int) -> int:
    """
    Calcule la commission EatQuickeR pour un montant en centimes.
    Utilisé pour les appels Stripe API.
    
    Args:
        amount_cents: Montant brut en centimes
        
    Returns:
        Commission en centimes
    """
    return int(amount_cents * PLATFORM_COMMISSION_PERCENT // 100)


def calculate_estimated_stripe_fee(amount: Decimal) -> Decimal:
    """
    Estime les frais Stripe pour un montant donné.
    Note: Les vrais frais peuvent varier selon le type de carte.
    
    Args:
        amount: Montant de la transaction en euros
        
    Returns:
        Estimation des frais Stripe en euros
    """
    fee = (amount * STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED
    return fee.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_net_revenue(gross_amount: Decimal, payment_method: str = 'online') -> Dict[str, Decimal]:
    """
    Calcule le revenu net pour un restaurateur.
    
    Args:
        gross_amount: Montant brut de la commande
        payment_method: 'online' (carte) ou 'cash' (espèces)
        
    Returns:
        Dict avec gross, platform_fee, stripe_fee (estimé), net
    """
    gross = Decimal(str(gross_amount))
    
    if payment_method in ('online', 'card', 'stripe'):
        platform_fee = calculate_platform_fee(gross)
        stripe_fee = calculate_estimated_stripe_fee(gross)
    else:
        # Pas de commission sur les paiements espèces
        platform_fee = Decimal('0')
        stripe_fee = Decimal('0')
    
    net = gross - platform_fee - stripe_fee
    
    return {
        'gross_amount': gross,
        'platform_fee': platform_fee,
        'stripe_fee_estimated': stripe_fee,
        'net_amount': net.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
    }


# ============================================================================
# STATISTIQUES DE REVENUS POUR UN RESTAURANT
# ============================================================================

def get_revenue_statistics(restaurant, period_days: int = 30) -> Dict[str, Any]:
    """
    Calcule les statistiques de revenus détaillées pour un restaurant,
    incluant la répartition par méthode de paiement et les commissions.
    
    Args:
        restaurant: Instance du modèle Restaurant
        period_days: Nombre de jours à analyser
        
    Returns:
        Dict avec les statistiques de revenus
    """
    from api.models import Order
    
    start_date = timezone.now() - timedelta(days=period_days)
    
    # Filtrer les commandes payées
    paid_orders = Order.objects.filter(
        restaurant=restaurant,
        payment_status='paid',
        created_at__gte=start_date
    )
    
    # Revenus par méthode de paiement
    card_revenue = paid_orders.filter(
        payment_method__in=['online', 'card', 'stripe']
    ).aggregate(
        total=Sum('total_amount'),
        count=Count('id')
    )
    
    cash_revenue = paid_orders.filter(
        payment_method__in=['cash', 'cash_pending']
    ).aggregate(
        total=Sum('total_amount'),
        count=Count('id')
    )
    
    # Valeurs par défaut
    card_total = Decimal(str(card_revenue['total'] or 0))
    card_count = card_revenue['count'] or 0
    cash_total = Decimal(str(cash_revenue['total'] or 0))
    cash_count = cash_revenue['count'] or 0
    
    # Calcul des commissions (uniquement sur les paiements carte)
    platform_fee = calculate_platform_fee(card_total)
    stripe_fee_estimated = calculate_estimated_stripe_fee(card_total)
    
    # Totaux
    gross_total = card_total + cash_total
    total_fees = platform_fee + stripe_fee_estimated
    net_revenue = gross_total - total_fees
    
    return {
        'period_days': period_days,
        'start_date': start_date.isoformat(),
        'end_date': timezone.now().isoformat(),
        
        # Revenus bruts
        'gross_revenue': {
            'total': float(gross_total),
            'card': float(card_total),
            'cash': float(cash_total),
        },
        
        # Nombre de commandes
        'orders_count': {
            'total': card_count + cash_count,
            'card': card_count,
            'cash': cash_count,
        },
        
        # Commissions et frais
        'fees': {
            'platform_fee': float(platform_fee),
            'platform_fee_rate': float(PLATFORM_COMMISSION_RATE * 100),
            'stripe_fee_estimated': float(stripe_fee_estimated),
            'total_fees': float(total_fees),
        },
        
        # Revenu net
        'net_revenue': {
            'total': float(net_revenue),
            'breakdown': {
                'gross': float(gross_total),
                'minus_platform_fee': float(platform_fee),
                'minus_stripe_fee': float(stripe_fee_estimated),
                'net': float(net_revenue),
            }
        },
        
        # Ticket moyen
        'averages': {
            'order_value': float(gross_total / max(card_count + cash_count, 1)),
            'card_order_value': float(card_total / max(card_count, 1)),
            'cash_order_value': float(cash_total / max(cash_count, 1)),
        },
    }


def get_revenue_summary_periods(restaurant) -> Dict[str, Any]:
    """
    Retourne un résumé des revenus pour différentes périodes.
    
    Args:
        restaurant: Instance du modèle Restaurant
        
    Returns:
        Dict avec les revenus pour aujourd'hui, semaine, mois
    """
    from api.models import Order
    
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)
    
    def get_period_stats(start_date):
        orders = Order.objects.filter(
            restaurant=restaurant,
            payment_status='paid',
            created_at__gte=start_date
        )
        
        card_total = orders.filter(
            payment_method__in=['online', 'card', 'stripe']
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        
        cash_total = orders.filter(
            payment_method__in=['cash', 'cash_pending']
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        
        platform_fee = calculate_platform_fee(Decimal(str(card_total)))
        gross = Decimal(str(card_total)) + Decimal(str(cash_total))
        
        return {
            'gross': float(gross),
            'card': float(card_total),
            'cash': float(cash_total),
            'platform_fee': float(platform_fee),
            'net': float(gross - platform_fee),
        }
    
    return {
        'today': get_period_stats(today_start),
        'week': get_period_stats(week_start),
        'month': get_period_stats(month_start),
    }
