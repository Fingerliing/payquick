from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Avg, F, Q
from django.utils import timezone
from datetime import timedelta
from ..models import Order, OrderItem, MenuItem
from collections import defaultdict


class OrderTrackingViewSet(viewsets.ViewSet):
    """
    API pour le suivi gamifié des commandes avec système de récompenses premium
    """
    
    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def progress(self, request, pk=None):
        """
        Retourne la progression gamifiée d'une commande avec temps estimés par catégorie
        
        GET /api/orders/{id}/progress/
        """
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande introuvable'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Récupérer les items avec leurs catégories
        order_items = order.items.select_related('menu_item').all()
        
        if not order_items:
            return Response(
                {'error': 'Aucun article dans cette commande'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Grouper les items par catégorie
        items_by_category = defaultdict(list)
        for item in order_items:
            category = item.menu_item.category
            items_by_category[category].append({
                'id': item.id,
                'name': item.menu_item.name,
                'quantity': item.quantity,
                'preparation_time': item.menu_item.preparation_time or 0
            })
        
        # Calculer les statistiques par catégorie
        restaurant = order.restaurant
        categories_progress = []
        
        for category_obj, items in items_by_category.items():
            category_name = str(category_obj)
            
            # Calculer le temps moyen de cette catégorie basé sur l'historique
            avg_time = self._calculate_category_average_time(
                restaurant, 
                category_obj
            )
            
            # Trouver le temps de préparation maximum parmi les items de cette catégorie
            max_prep_time = max(
                item['preparation_time'] for item in items
            ) if items else 0
            
            # Utiliser le max entre temps moyen historique et temps de prep max
            estimated_time = max(avg_time, max_prep_time)
            
            # Calculer la progression
            progress_data = self._calculate_category_progress(
                order, 
                estimated_time
            )
            
            categories_progress.append({
                'category': category_name,
                'category_icon': self._get_category_icon(category_name),
                'items_count': len(items),
                'items': items,
                'estimated_time_minutes': estimated_time,
                'progress_percentage': progress_data['percentage'],
                'time_elapsed_minutes': progress_data['elapsed'],
                'time_remaining_minutes': progress_data['remaining'],
                'status': progress_data['status'],
                'status_label': progress_data['label'],
                'achievement_unlocked': progress_data['achievement']
            })
        
        # Calculer la progression globale
        total_progress = sum(cat['progress_percentage'] for cat in categories_progress)
        global_progress = total_progress / len(categories_progress) if categories_progress else 0
        
        # Déterminer le niveau gamifié avec système premium
        gamification_data = self._get_gamification_level(global_progress, order)
        
        return Response({
            'order_id': order.id,
            'order_status': order.status,
            'table_number': order.table_number,
            'created_at': order.created_at,
            'global_progress': round(global_progress, 1),
            'categories': categories_progress,
            'gamification': gamification_data,
            'estimated_total_time': sum(
                cat['estimated_time_minutes'] for cat in categories_progress
            )
        })
    
    def _calculate_category_average_time(self, restaurant, category):
        """
        Calcule le temps moyen de préparation pour une catégorie
        basé sur les commandes servies dans ce restaurant
        """
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        # Filtrer les commandes qui ont été servies
        completed_orders = Order.objects.filter(
            restaurant=restaurant,
            status='served',
            served_at__isnull=False,
            created_at__gte=thirty_days_ago
        )
        
        # Calculer les temps pour cette catégorie
        category_times = []
        
        for order in completed_orders:
            # Vérifier si la commande contient des items de cette catégorie
            has_category = order.items.filter(
                menu_item__category=category
            ).exists()
            
            if has_category:
                # Calculer le temps écoulé (en minutes)
                time_diff = (order.served_at - order.created_at).total_seconds() / 60
                category_times.append(time_diff)
        
        # Retourner la moyenne ou un temps par défaut
        if category_times:
            avg_time = sum(category_times) / len(category_times)
            return round(avg_time)
        
        category_str = str(category)
        
        # Temps par défaut selon la catégorie
        default_times = {
            'Entrée': 15,
            'Plat': 25,
            'Dessert': 10,
            'Boisson': 5
        }
        return default_times.get(category_str, 20)
    
    def _calculate_category_progress(self, order, estimated_time_minutes):
        """
        Calcule la progression d'une catégorie
        """
        # Temps écoulé depuis la création de la commande
        time_elapsed = timezone.now() - order.created_at
        elapsed_minutes = time_elapsed.total_seconds() / 60
        
        # Calculer le pourcentage de progression
        if estimated_time_minutes > 0:
            percentage = min((elapsed_minutes / estimated_time_minutes) * 100, 100)
        else:
            percentage = 0
        
        # Temps restant
        remaining = max(estimated_time_minutes - elapsed_minutes, 0)
        
        # Déterminer le statut basé sur l'état de la commande
        status_map = {
            'pending': ('pending', 'En attente de confirmation', False),
            'confirmed': ('preparing', 'En préparation', False),
            'preparing': ('preparing', 'En cours de préparation', False),
            'ready': ('ready', 'Prêt à être servi', True),
            'served': ('completed', 'Servi', True)
        }
        
        status_info = status_map.get(order.status, ('pending', 'En attente', False))
        
        return {
            'percentage': round(percentage, 1),
            'elapsed': round(elapsed_minutes, 1),
            'remaining': round(remaining, 1),
            'status': status_info[0],
            'label': status_info[1],
            'achievement': status_info[2]
        }
    
    def _get_category_icon(self, category):
        """
        Retourne l'icône appropriée pour chaque catégorie
        """
        icons = {
            'Entrée': '🥗',
            'Plat': '🍽️',
            'Dessert': '🍰',
            'Boisson': '🥤'
        }
        return icons.get(category, '🍴')
    
    def _get_gamification_level(self, progress, order):
        """
        Système de récompenses premium avec calcul sophistiqué des points
        """
        # === CALCUL DES POINTS STRATIFIÉ ===
        time_elapsed = timezone.now() - order.created_at
        minutes_waited = time_elapsed.total_seconds() / 60
        
        # Points de progression (0-1500 pts)
        progression_points = int(progress * 15)
        
        # Multiplicateur de statut (1x à 5x)
        status_multipliers = {
            'pending': 1.0,
            'confirmed': 1.5,
            'preparing': 2.0,
            'ready': 3.5,
            'served': 5.0
        }
        multiplier = status_multipliers.get(order.status, 1.0)
        
        # Bonus d'excellence temporelle
        time_bonus = 0
        if order.status == 'served':
            if minutes_waited < 10:
                time_bonus = 500  # Service éclair
            elif minutes_waited < 20:
                time_bonus = 300  # Service rapide
            elif minutes_waited < 30:
                time_bonus = 150  # Service optimal
        
        # Bonus de complexité (basé sur le nombre d'items)
        items_count = order.items.count()
        complexity_bonus = min(items_count * 25, 200)
        
        total_points = int((progression_points * multiplier) + time_bonus + complexity_bonus)
        
        # === SYSTÈME DE BADGES PREMIUM ===
        badges = []
        
        # Tier Bronze : Initiation (15%)
        if progress >= 15:
            badges.append({
                'id': 'bronze_initiation',
                'name': 'Initié',
                'icon': '🥉',
                'description': 'Première étape franchie avec succès',
                'tier': 'bronze'
            })
        
        # Tier Argent : Progression (35%)
        if progress >= 35:
            badges.append({
                'id': 'silver_progress',
                'name': 'Connaisseur',
                'icon': '🥈',
                'description': 'Progression constante et maîtrisée',
                'tier': 'silver'
            })
        
        # Tier Or : Excellence (60%)
        if progress >= 60:
            badges.append({
                'id': 'gold_excellence',
                'name': 'Expert',
                'icon': '🥇',
                'description': 'Excellence culinaire en préparation',
                'tier': 'gold'
            })
        
        # Tier Platine : Maîtrise (85%)
        if progress >= 85:
            badges.append({
                'id': 'platinum_mastery',
                'name': 'Maître',
                'icon': '💎',
                'description': 'Maîtrise absolue du processus',
                'tier': 'platinum'
            })
        
        # Badge de finalisation
        if progress >= 100 or order.status == 'served':
            badges.append({
                'id': 'completion_virtuoso',
                'name': 'Virtuose',
                'icon': '👑',
                'description': 'Expérience culinaire accomplie',
                'tier': 'royal'
            })
        
        # Badges spéciaux basés sur la performance
        if order.status == 'served':
            # Excellence temporelle
            if minutes_waited < 10:
                badges.append({
                    'id': 'velocity_master',
                    'name': 'Maître de la Vélocité',
                    'icon': '⚡',
                    'description': 'Service express d\'exception',
                    'tier': 'special'
                })
            elif minutes_waited < 20:
                badges.append({
                    'id': 'swift_service',
                    'name': 'Service Rapide',
                    'icon': '🚀',
                    'description': 'Efficacité remarquable',
                    'tier': 'special'
                })
            
            # Patience distinguée
            if minutes_waited > 40:
                badges.append({
                    'id': 'distinguished_patience',
                    'name': 'Patience Distinguée',
                    'icon': '⭐',
                    'description': 'Élégance dans l\'attente',
                    'tier': 'special'
                })
        
        # Commande complexe
        if items_count >= 5:
            badges.append({
                'id': 'gastronome',
                'name': 'Gastronome',
                'icon': '🍷',
                'description': 'Amateur de gastronomie raffinée',
                'tier': 'special'
            })
        
        # === TITRES PRESTIGIEUX PAR NIVEAU ===
        level_titles = [
            (0, 'Découverte', '🌱'),      # 0-20%
            (20, 'Initiation', '🎓'),     # 20-40%
            (40, 'Progression', '📈'),    # 40-60%
            (60, 'Excellence', '⭐'),     # 60-80%
            (80, 'Maîtrise', '👑'),       # 80-100%
        ]
        
        current_title = 'Découverte'
        current_emoji = '🌱'
        current_level = 1
        
        for threshold, title, emoji in level_titles:
            if progress >= threshold:
                current_title = title
                current_emoji = emoji
                current_level = (threshold // 20) + 1
        
        # === MESSAGES PROFESSIONNELS ET ÉLÉGANTS ===
        if progress < 15:
            message = "Validation de votre commande en cours"
            status_emoji = "📋"
        elif progress < 35:
            message = "Nos équipes orchestrent votre expérience"
            status_emoji = "🎭"
        elif progress < 60:
            message = "Préparation minutieuse de vos mets"
            status_emoji = "👨‍🍳"
        elif progress < 85:
            message = "Finitions d'excellence en cours"
            status_emoji = "✨"
        elif progress < 100:
            message = "Présentation finale de votre commande"
            status_emoji = "🎯"
        else:
            message = "Votre expérience culinaire vous attend"
            status_emoji = "🌟"
        
        return {
            'level': current_level,
            'level_title': current_title,
            'points': total_points,
            'badges': badges,
            'message': message,
            'emoji': status_emoji,
            'progress_tier': self._get_progress_tier(progress),
            'performance_metrics': {
                'time_efficiency': self._calculate_time_efficiency(minutes_waited, order.status),
                'completion_rate': round(progress, 1),
                'experience_quality': self._calculate_experience_quality(progress, minutes_waited, items_count)
            },
            'next_milestone': self._get_next_milestone(progress)
        }
    
    def _get_progress_tier(self, progress):
        """Détermine le tier actuel de progression"""
        if progress < 20:
            return {'name': 'Bronze', 'color': '#CD7F32'}
        elif progress < 40:
            return {'name': 'Argent', 'color': '#C0C0C0'}
        elif progress < 60:
            return {'name': 'Or', 'color': '#FFD700'}
        elif progress < 80:
            return {'name': 'Platine', 'color': '#E5E4E2'}
        else:
            return {'name': 'Diamant', 'color': '#B9F2FF'}
    
    def _calculate_time_efficiency(self, minutes_waited, status):
        """Calcule l'efficacité temporelle (0-100)"""
        if status != 'served':
            return None
        
        # Référence: 25 minutes = service optimal
        optimal_time = 25
        if minutes_waited <= optimal_time:
            efficiency = 100 - ((optimal_time - minutes_waited) * 2)
            return max(min(efficiency, 100), 80)
        else:
            penalty = (minutes_waited - optimal_time) * 2
            return max(100 - penalty, 40)
    
    def _calculate_experience_quality(self, progress, minutes_waited, items_count):
        """Score de qualité d'expérience global (0-100)"""
        # Facteurs pondérés
        progress_score = progress * 0.5  # 50%
        
        # Score temporel
        if minutes_waited < 15:
            time_score = 50
        elif minutes_waited < 30:
            time_score = 40
        elif minutes_waited < 45:
            time_score = 30
        else:
            time_score = 20
        
        # Score de complexité (commandes plus complexes = meilleure expérience)
        complexity_score = min(items_count * 2, 10)
        
        total_score = progress_score + time_score + complexity_score
        return round(min(total_score, 100), 1)
    
    def _get_next_milestone(self, progress):
        """
        Retourne le prochain objectif avec système de tiers premium
        """
        milestones = [
            (15, 'Initié', '🥉', 'Bronze'),
            (35, 'Connaisseur', '🥈', 'Argent'),
            (60, 'Expert', '🥇', 'Or'),
            (85, 'Maître', '💎', 'Platine'),
            (100, 'Virtuose', '👑', 'Diamant')
        ]
        
        for milestone_progress, title, icon, tier in milestones:
            if progress < milestone_progress:
                return {
                    'progress': milestone_progress,
                    'title': title,
                    'label': f'{icon} {title} - Tier {tier}',
                    'tier': tier,
                    'remaining': round(milestone_progress - progress, 1)
                }
        
        return None