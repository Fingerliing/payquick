from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Avg, F, Q, Count
from django.utils import timezone
from datetime import timedelta
from ..models import Order, OrderItem, MenuItem
from collections import defaultdict
import math


class OrderTrackingViewSet(viewsets.ViewSet):
    """
    API améliorée pour le suivi gamifié avec progression réelle
    """
    
    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def progress(self, request, pk=None):
        """
        Retourne la progression gamifiée basée sur l'état réel de la commande
        
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
        
        # Calculer la progression réelle basée sur le statut
        real_progress = self._calculate_real_order_progress(order)
        
        # Grouper les items par catégorie avec progression réelle
        categories_progress = self._calculate_categories_progress(
            order, order_items, real_progress
        )
        
        # Progression globale pondérée
        global_progress = self._calculate_global_progress(
            categories_progress, order
        )
        
        # Système de gamification amélioré
        gamification_data = self._get_enhanced_gamification(
            global_progress, order, categories_progress
        )
        
        # Prédictions et insights en temps réel
        insights = self._generate_real_time_insights(
            order, categories_progress, global_progress
        )
        
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
            ),
            'real_time_insights': insights,
            'completion_prediction': self._predict_completion_time(order, categories_progress)
        })
    
    def _calculate_real_order_progress(self, order):
        """
        Calcule la progression réelle basée sur le statut de la commande
        avec des étapes intermédiaires plus précises
        """
        status_progress = {
            'pending': 5,      # Commande créée
            'confirmed': 15,   # Confirmée par le restaurant
            'preparing': 60,   # En préparation active
            'ready': 95,       # Prête à servir
            'served': 100      # Servie au client
        }
        
        base_progress = status_progress.get(order.status, 0)
        
        # Bonus de progression basé sur le temps écoulé (dans la limite du statut)
        if order.status == 'preparing':
            time_elapsed = timezone.now() - order.created_at
            elapsed_minutes = time_elapsed.total_seconds() / 60
            
            # Calcul du temps moyen pour ce restaurant
            avg_prep_time = self._get_restaurant_avg_prep_time(order.restaurant)
            
            if avg_prep_time > 0:
                time_factor = min(elapsed_minutes / avg_prep_time, 1.0)
                # Progression de 15% à 60% pendant la préparation
                base_progress = 15 + (45 * time_factor)
        
        return base_progress
    
    def _calculate_categories_progress(self, order, order_items, real_progress):
        """
        Calcule la progression par catégorie avec étapes de préparation
        """
        items_by_category = defaultdict(list)
        for item in order_items:
            category = item.menu_item.category
            items_by_category[category].append({
                'id': item.id,
                'name': item.menu_item.name,
                'quantity': item.quantity,
                'preparation_time': item.menu_item.preparation_time or 0,
                'complexity': self._calculate_item_complexity(item)
            })
        
        categories_progress = []
        restaurant = order.restaurant
        
        for category_obj, items in items_by_category.items():
            category_name = str(category_obj)
            
            # Temps estimé pour cette catégorie
            avg_time = self._calculate_category_average_time(
                restaurant, category_obj
            )
            
            max_prep_time = max(
                item['preparation_time'] for item in items
            ) if items else 0
            
            estimated_time = max(avg_time, max_prep_time)
            
            # Progression spécifique à la catégorie basée sur le statut
            category_progress = self._calculate_category_specific_progress(
                order, estimated_time, items, real_progress
            )
            
            # Étapes de préparation détaillées
            preparation_stages = self._get_preparation_stages(
                order.status, category_progress['percentage']
            )
            
            categories_progress.append({
                'category': category_name,
                'category_icon': self._get_category_icon(category_name),
                'items_count': len(items),
                'items': items,
                'estimated_time_minutes': estimated_time,
                'progress_percentage': category_progress['percentage'],
                'time_elapsed_minutes': category_progress['elapsed'],
                'time_remaining_minutes': category_progress['remaining'],
                'status': category_progress['status'],
                'status_label': category_progress['label'],
                'achievement_unlocked': category_progress['achievement'],
                'preparation_stages': preparation_stages,
                'complexity_score': sum(item['complexity'] for item in items) / len(items)
            })
        
        return categories_progress
    
    def _calculate_category_specific_progress(self, order, estimated_time, items, real_progress):
        """
        Calcule la progression spécifique d'une catégorie
        """
        time_elapsed = timezone.now() - order.created_at
        elapsed_minutes = time_elapsed.total_seconds() / 60
        
        # Ajuster la progression en fonction de la complexité
        complexity_factor = sum(item['complexity'] for item in items) / len(items)
        adjusted_time = estimated_time * complexity_factor
        
        # Progression temporelle
        if adjusted_time > 0:
            time_percentage = min((elapsed_minutes / adjusted_time) * 100, 100)
        else:
            time_percentage = 0
        
        # Combiner progression réelle et temporelle
        combined_percentage = (real_progress * 0.7) + (time_percentage * 0.3)
        combined_percentage = min(combined_percentage, 100)
        
        # Temps restant ajusté
        if combined_percentage < 100:
            remaining = max(adjusted_time - elapsed_minutes, 0)
        else:
            remaining = 0
        
        # Déterminer le statut
        status_map = {
            'pending': ('pending', 'En attente de confirmation', False),
            'confirmed': ('preparing', 'Préparation commencée', False),
            'preparing': ('preparing', 'En cours de préparation', False),
            'ready': ('ready', 'Prêt à être servi', True),
            'served': ('completed', 'Servi', True)
        }
        
        status_info = status_map.get(order.status, ('pending', 'En attente', False))
        
        return {
            'percentage': round(combined_percentage, 1),
            'elapsed': round(elapsed_minutes, 1),
            'remaining': round(remaining, 1),
            'status': status_info[0],
            'label': status_info[1],
            'achievement': status_info[2]
        }
    
    def _calculate_item_complexity(self, item):
        """
        Calcule la complexité d'un item (1.0 = normal, > 1.0 = complexe)
        """
        complexity = 1.0
        
        # Facteur de quantité
        if item.quantity > 3:
            complexity += 0.2
        
        # Facteur de personnalisation
        if item.customizations:
            complexity += len(item.customizations) * 0.1
        
        # Instructions spéciales
        if item.special_instructions:
            complexity += 0.15
        
        return min(complexity, 2.0)
    
    def _get_preparation_stages(self, order_status, progress_percentage):
        """
        Retourne les étapes de préparation détaillées
        """
        stages = [
            {
                'id': 'validation',
                'label': 'Validation',
                'icon': '✓',
                'completed': progress_percentage >= 15,
                'in_progress': 5 <= progress_percentage < 15,
                'threshold': 15
            },
            {
                'id': 'preparation',
                'label': 'Préparation',
                'icon': '👨‍🍳',
                'completed': progress_percentage >= 45,
                'in_progress': 15 <= progress_percentage < 45,
                'threshold': 45
            },
            {
                'id': 'cooking',
                'label': 'Cuisson',
                'icon': '🔥',
                'completed': progress_percentage >= 75,
                'in_progress': 45 <= progress_percentage < 75,
                'threshold': 75
            },
            {
                'id': 'plating',
                'label': 'Dressage',
                'icon': '🎨',
                'completed': progress_percentage >= 95,
                'in_progress': 75 <= progress_percentage < 95,
                'threshold': 95
            },
            {
                'id': 'service',
                'label': 'Service',
                'icon': '🍽️',
                'completed': progress_percentage >= 100,
                'in_progress': progress_percentage >= 95,
                'threshold': 100
            }
        ]
        
        return stages
    
    def _calculate_global_progress(self, categories_progress, order):
        """
        Calcule la progression globale pondérée
        """
        if not categories_progress:
            return 0
        
        # Pondération par complexité
        total_weighted = 0
        total_weight = 0
        
        for cat in categories_progress:
            weight = cat['complexity_score']
            total_weighted += cat['progress_percentage'] * weight
            total_weight += weight
        
        if total_weight > 0:
            weighted_progress = total_weighted / total_weight
        else:
            weighted_progress = sum(
                cat['progress_percentage'] for cat in categories_progress
            ) / len(categories_progress)
        
        return weighted_progress
    
    def _get_enhanced_gamification(self, progress, order, categories):
        """
        Système de gamification amélioré avec progression réelle
        """
        time_elapsed = timezone.now() - order.created_at
        minutes_waited = time_elapsed.total_seconds() / 60
        
        # === CALCUL DES POINTS AMÉLIORÉ ===
        # Points de base (0-2000)
        base_points = int(progress * 20)
        
        # Multiplicateur de statut amélioré
        status_multipliers = {
            'pending': 1.0,
            'confirmed': 1.8,
            'preparing': 2.5,
            'ready': 4.0,
            'served': 6.0
        }
        multiplier = status_multipliers.get(order.status, 1.0)
        
        # Bonus de vitesse (service rapide)
        speed_bonus = 0
        if order.status == 'served':
            expected_time = sum(cat['estimated_time_minutes'] for cat in categories)
            if expected_time > 0:
                efficiency = expected_time / max(minutes_waited, 1)
                if efficiency > 1.2:
                    speed_bonus = 800  # Service ultra-rapide
                elif efficiency > 1.0:
                    speed_bonus = 500  # Service rapide
                elif efficiency > 0.8:
                    speed_bonus = 300  # Service optimal
        
        # Bonus de complexité
        avg_complexity = sum(cat['complexity_score'] for cat in categories) / len(categories)
        complexity_bonus = int(avg_complexity * 200)
        
        # Bonus de progression fluide (sans stagnation)
        smoothness_bonus = self._calculate_smoothness_bonus(order, progress)
        
        total_points = int(
            (base_points * multiplier) + 
            speed_bonus + 
            complexity_bonus + 
            smoothness_bonus
        )
        
        # === BADGES DYNAMIQUES ===
        badges = self._generate_dynamic_badges(
            progress, order, minutes_waited, categories, total_points
        )
        
        # === NIVEAU ET TITRE ===
        level_data = self._calculate_level_and_title(progress, total_points)
        
        # === MESSAGES CONTEXTUELS ===
        message_data = self._generate_contextual_message(
            progress, order.status, categories
        )
        
        # === PROCHAINE ÉTAPE ===
        next_milestone = self._get_next_milestone(progress, categories)
        
        # === MÉTRIQUES AMÉLIORÉES ===
        performance_metrics = {
            'time_efficiency': self._calculate_time_efficiency(
                minutes_waited, order.status, categories
            ),
            'completion_rate': round(progress, 1),
            'experience_quality': self._calculate_experience_quality(
                progress, minutes_waited, len(categories), avg_complexity
            ),
            'service_speed_score': self._calculate_speed_score(
                minutes_waited, order.status, categories
            ),
            'preparation_quality': self._calculate_preparation_quality(categories)
        }
        
        return {
            'level': level_data['level'],
            'level_title': level_data['title'],
            'points': total_points,
            'badges': badges,
            'message': message_data['message'],
            'emoji': message_data['emoji'],
            'progress_tier': self._get_progress_tier(progress),
            'performance_metrics': performance_metrics,
            'next_milestone': next_milestone,
            'streak_data': self._calculate_streak_data(order),
            'achievements_summary': self._generate_achievements_summary(badges, total_points)
        }
    
    def _calculate_smoothness_bonus(self, order, current_progress):
        """
        Bonus pour une progression fluide sans stagnation
        """
        # Vérifier la cohérence entre statut et progression
        expected_progress = {
            'pending': 10,
            'confirmed': 20,
            'preparing': 60,
            'ready': 95,
            'served': 100
        }
        
        expected = expected_progress.get(order.status, 0)
        difference = abs(current_progress - expected)
        
        if difference < 10:
            return 300  # Très fluide
        elif difference < 20:
            return 150  # Fluide
        else:
            return 0
    
    def _generate_dynamic_badges(self, progress, order, minutes_waited, categories, points):
        """
        Génère des badges dynamiques basés sur la progression réelle
        """
        badges = []
        
        # Badges de progression
        if progress >= 25:
            badges.append({
                'id': 'quarter_way',
                'name': 'Premier Quart',
                'icon': '🎯',
                'description': '25% accomplis',
                'tier': 'bronze',
                'unlocked_at': timezone.now().isoformat()
            })
        
        if progress >= 50:
            badges.append({
                'id': 'halfway',
                'name': 'Mi-Parcours',
                'icon': '⭐',
                'description': 'À mi-chemin de l\'excellence',
                'tier': 'silver',
                'unlocked_at': timezone.now().isoformat()
            })
        
        if progress >= 75:
            badges.append({
                'id': 'almost_there',
                'name': 'Presque Prêt',
                'icon': '🚀',
                'description': 'Plus que quelques instants',
                'tier': 'gold',
                'unlocked_at': timezone.now().isoformat()
            })
        
        if progress >= 100:
            badges.append({
                'id': 'completion_master',
                'name': 'Expérience Complete',
                'icon': '👑',
                'description': 'Parcours accompli avec brio',
                'tier': 'royal',
                'unlocked_at': timezone.now().isoformat()
            })
        
        # Badges de vitesse
        if order.status == 'served':
            avg_time = sum(cat['estimated_time_minutes'] for cat in categories)
            if minutes_waited < avg_time * 0.7:
                badges.append({
                    'id': 'lightning_service',
                    'name': 'Service Éclair',
                    'icon': '⚡',
                    'description': 'Service ultra-rapide',
                    'tier': 'special',
                    'unlocked_at': timezone.now().isoformat()
                })
        
        # Badge de complexité
        avg_complexity = sum(cat['complexity_score'] for cat in categories) / len(categories)
        if avg_complexity > 1.5:
            badges.append({
                'id': 'complexity_master',
                'name': 'Maître de Complexité',
                'icon': '🎓',
                'description': 'Commande sophistiquée',
                'tier': 'platinum',
                'unlocked_at': timezone.now().isoformat()
            })
        
        # Badge de points élevés
        if points > 5000:
            badges.append({
                'id': 'high_scorer',
                'name': 'Champion des Points',
                'icon': '💎',
                'description': f'{points} points atteints',
                'tier': 'platinum',
                'unlocked_at': timezone.now().isoformat()
            })
        
        return badges
    
    def _calculate_level_and_title(self, progress, points):
        """
        Calcule le niveau et le titre basé sur les points et la progression
        """
        # Système de niveau basé sur les points
        if points < 1000:
            level = 1
            title = 'Découverte'
            emoji = '🌱'
        elif points < 2500:
            level = 2
            title = 'Initiation'
            emoji = '📚'
        elif points < 5000:
            level = 3
            title = 'Progression'
            emoji = '📈'
        elif points < 8000:
            level = 4
            title = 'Excellence'
            emoji = '⭐'
        elif points < 12000:
            level = 5
            title = 'Maîtrise'
            emoji = '👑'
        else:
            level = 6
            title = 'Légende'
            emoji = '💎'
        
        return {
            'level': level,
            'title': title,
            'emoji': emoji
        }
    
    def _generate_contextual_message(self, progress, status, categories):
        """
        Génère un message contextuel basé sur l'état réel
        """
        # Messages par étape de progression
        if status == 'pending':
            return {
                'message': 'Votre commande est en cours de validation',
                'emoji': '📋'
            }
        elif status == 'confirmed':
            return {
                'message': 'Nos équipes préparent votre expérience',
                'emoji': '👨‍🍳'
            }
        elif status == 'preparing':
            if progress < 30:
                return {
                    'message': 'Préparation en cours, tout se passe bien',
                    'emoji': '🔥'
                }
            elif progress < 60:
                return {
                    'message': 'Vos plats prennent forme avec soin',
                    'emoji': '✨'
                }
            else:
                return {
                    'message': 'Dernières touches d\'excellence',
                    'emoji': '🎨'
                }
        elif status == 'ready':
            return {
                'message': 'Votre commande est prête et vous attend',
                'emoji': '🎉'
            }
        elif status == 'served':
            return {
                'message': 'Bon appétit ! Profitez de votre repas',
                'emoji': '🍽️'
            }
        
        return {
            'message': 'Suivi en temps réel de votre commande',
            'emoji': '📡'
        }
    
    def _generate_real_time_insights(self, order, categories, global_progress):
        """
        Génère des insights en temps réel sur la commande
        """
        insights = []
        
        # Catégorie la plus rapide
        if len(categories) > 1:
            fastest = max(categories, key=lambda x: x['progress_percentage'])
            if fastest['progress_percentage'] > global_progress + 10:
                insights.append({
                    'type': 'fastest_category',
                    'icon': '🏃',
                    'message': f"{fastest['category']} progresse rapidement",
                    'category': fastest['category']
                })
        
        # Temps restant estimé
        total_remaining = sum(cat['time_remaining_minutes'] for cat in categories)
        if total_remaining > 0:
            insights.append({
                'type': 'estimated_time',
                'icon': '⏱️',
                'message': f"Environ {math.ceil(total_remaining)} min restantes",
                'minutes': math.ceil(total_remaining)
            })
        
        # Prochaine étape
        if order.status == 'preparing':
            insights.append({
                'type': 'next_step',
                'icon': '🎯',
                'message': 'Prochaine étape: Dressage et présentation',
                'step': 'plating'
            })
        elif order.status == 'ready':
            insights.append({
                'type': 'ready_notification',
                'icon': '✅',
                'message': 'Votre table va être servie',
                'priority': 'high'
            })
        
        return insights
    
    def _predict_completion_time(self, order, categories):
        """
        Prédit le temps de complétion basé sur les données réelles
        """
        if order.status == 'served':
            return {
                'completed': True,
                'completion_time': order.served_at.isoformat() if order.served_at else None
            }
        
        # Calculer le temps restant moyen pondéré
        total_remaining = sum(
            cat['time_remaining_minutes'] * cat['complexity_score'] 
            for cat in categories
        )
        total_weight = sum(cat['complexity_score'] for cat in categories)
        
        if total_weight > 0:
            avg_remaining = total_remaining / total_weight
        else:
            avg_remaining = 0
        
        predicted_completion = timezone.now() + timedelta(minutes=avg_remaining)
        
        return {
            'completed': False,
            'estimated_remaining_minutes': round(avg_remaining, 1),
            'predicted_completion_time': predicted_completion.isoformat(),
            'confidence': self._calculate_prediction_confidence(order, categories)
        }
    
    def _calculate_prediction_confidence(self, order, categories):
        """
        Calcule le niveau de confiance de la prédiction (0-100)
        """
        # Facteurs influençant la confiance
        factors = []
        
        # Facteur 1: Historique du restaurant
        historical_data = self._get_restaurant_historical_accuracy(order.restaurant)
        factors.append(historical_data)
        
        # Facteur 2: Cohérence de la progression actuelle
        coherence = self._calculate_progression_coherence(categories)
        factors.append(coherence)
        
        # Facteur 3: Temps écoulé vs estimé
        time_factor = self._calculate_time_factor(order, categories)
        factors.append(time_factor)
        
        # Moyenne pondérée
        confidence = sum(factors) / len(factors)
        return round(confidence, 1)
    
    def _get_restaurant_historical_accuracy(self, restaurant):
        """
        Récupère la précision historique du restaurant (0-100)
        """
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        completed = Order.objects.filter(
            restaurant=restaurant,
            status='served',
            served_at__isnull=False,
            created_at__gte=thirty_days_ago
        ).count()
        
        if completed > 20:
            return 85  # Haute confiance
        elif completed > 10:
            return 70  # Confiance moyenne
        else:
            return 50  # Confiance faible
    
    def _calculate_progression_coherence(self, categories):
        """
        Calcule la cohérence de progression (0-100)
        """
        if len(categories) < 2:
            return 75
        
        # Vérifier que les catégories progressent de manière similaire
        percentages = [cat['progress_percentage'] for cat in categories]
        avg = sum(percentages) / len(percentages)
        variance = sum((p - avg) ** 2 for p in percentages) / len(percentages)
        
        # Faible variance = haute cohérence
        if variance < 100:
            return 90
        elif variance < 300:
            return 70
        else:
            return 50
    
    def _calculate_time_factor(self, order, categories):
        """
        Facteur basé sur le temps écoulé vs estimé (0-100)
        """
        time_elapsed = timezone.now() - order.created_at
        elapsed_minutes = time_elapsed.total_seconds() / 60
        
        estimated_total = sum(cat['estimated_time_minutes'] for cat in categories)
        
        if estimated_total == 0:
            return 50
        
        ratio = elapsed_minutes / estimated_total
        
        if 0.8 <= ratio <= 1.2:
            return 90  # Dans les temps
        elif 0.5 <= ratio <= 1.5:
            return 70  # Acceptable
        else:
            return 50  # Déviation importante
    
    def _calculate_speed_score(self, minutes_waited, status, categories):
        """
        Score de vitesse de service (0-100)
        """
        if status != 'served':
            return None
        
        expected_time = sum(cat['estimated_time_minutes'] for cat in categories)
        if expected_time == 0:
            return None
        
        ratio = expected_time / minutes_waited
        
        if ratio > 1.2:
            return 100  # Exceptionnel
        elif ratio > 1.0:
            return 90   # Excellent
        elif ratio > 0.9:
            return 80   # Très bon
        elif ratio > 0.8:
            return 70   # Bon
        else:
            return max(50 - int((0.8 - ratio) * 100), 30)
    
    def _calculate_preparation_quality(self, categories):
        """
        Score de qualité de préparation basé sur la progression (0-100)
        """
        # Vérifier que toutes les étapes sont complétées proprement
        quality_scores = []
        
        for cat in categories:
            stages = cat.get('preparation_stages', [])
            completed_stages = sum(1 for s in stages if s['completed'])
            total_stages = len(stages)
            
            if total_stages > 0:
                stage_score = (completed_stages / total_stages) * 100
                quality_scores.append(stage_score)
        
        if quality_scores:
            return round(sum(quality_scores) / len(quality_scores), 1)
        return 0
    
    def _calculate_streak_data(self, order):
        """
        Données de série/streak pour gamification avancée
        """
        # Compter les commandes récentes du client
        if hasattr(order, 'customer') and order.customer:
            recent_orders = Order.objects.filter(
                customer=order.customer,
                created_at__gte=timezone.now() - timedelta(days=30),
                status='served'
            ).count()
            
            return {
                'current_streak': recent_orders,
                'next_milestone': self._get_streak_milestone(recent_orders),
                'bonus_active': recent_orders >= 5
            }
        
        return {
            'current_streak': 0,
            'next_milestone': 5,
            'bonus_active': False
        }
    
    def _get_streak_milestone(self, current):
        """
        Retourne le prochain jalon de série
        """
        milestones = [5, 10, 25, 50, 100]
        for milestone in milestones:
            if current < milestone:
                return milestone
        return current + 50
    
    def _generate_achievements_summary(self, badges, points):
        """
        Génère un résumé des accomplissements
        """
        return {
            'total_badges': len(badges),
            'total_points': points,
            'badges_by_tier': {
                tier: len([b for b in badges if b['tier'] == tier])
                for tier in ['bronze', 'silver', 'gold', 'platinum', 'royal', 'special']
            },
            'rarity_score': self._calculate_rarity_score(badges)
        }
    
    def _calculate_rarity_score(self, badges):
        """
        Calcule un score de rareté des badges (0-100)
        """
        tier_scores = {
            'bronze': 10,
            'silver': 20,
            'gold': 35,
            'platinum': 50,
            'royal': 75,
            'special': 100
        }
        
        if not badges:
            return 0
        
        total_score = sum(tier_scores.get(b['tier'], 0) for b in badges)
        return min(total_score, 100)
    
    # Méthodes utilitaires existantes améliorées
    def _get_restaurant_avg_prep_time(self, restaurant):
        """
        Obtient le temps moyen de préparation pour ce restaurant
        """
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        completed_orders = Order.objects.filter(
            restaurant=restaurant,
            status='served',
            served_at__isnull=False,
            created_at__gte=thirty_days_ago
        )
        
        times = []
        for order in completed_orders:
            time_diff = (order.served_at - order.created_at).total_seconds() / 60
            times.append(time_diff)
        
        if times:
            return sum(times) / len(times)
        return 25  # Défaut
    
    def _calculate_category_average_time(self, restaurant, category):
        """
        Temps moyen pour une catégorie spécifique
        """
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        completed_orders = Order.objects.filter(
            restaurant=restaurant,
            status='served',
            served_at__isnull=False,
            created_at__gte=thirty_days_ago
        )
        
        category_times = []
        for order in completed_orders:
            has_category = order.items.filter(
                menu_item__category=category
            ).exists()
            
            if has_category:
                time_diff = (order.served_at - order.created_at).total_seconds() / 60
                category_times.append(time_diff)
        
        if category_times:
            return round(sum(category_times) / len(category_times))
        
        # Temps par défaut
        default_times = {
            'Entrée': 15,
            'Plat': 25,
            'Dessert': 10,
            'Boisson': 5
        }
        return default_times.get(str(category), 20)
    
    def _get_category_icon(self, category):
        """
        Icône pour chaque catégorie
        """
        icons = {
            'Entrée': '🥗',
            'Plat': '🍽️',
            'Dessert': '🍰',
            'Boisson': '🥤'
        }
        return icons.get(category, '🍴')
    
    def _get_progress_tier(self, progress):
        """
        Tier actuel de progression
        """
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
    
    def _calculate_time_efficiency(self, minutes_waited, status, categories):
        """
        Efficacité temporelle
        """
        if status != 'served':
            return None
        
        expected = sum(cat['estimated_time_minutes'] for cat in categories)
        if expected == 0:
            return None
        
        efficiency = (expected / minutes_waited) * 100
        return round(min(efficiency, 100), 1)
    
    def _calculate_experience_quality(self, progress, minutes_waited, category_count, complexity):
        """
        Qualité d'expérience globale
        """
        # Facteurs pondérés
        progress_score = progress * 0.4
        
        # Score temporel
        if minutes_waited < 15:
            time_score = 30
        elif minutes_waited < 25:
            time_score = 25
        elif minutes_waited < 35:
            time_score = 20
        else:
            time_score = 15
        
        # Score de complexité
        complexity_score = min(complexity * 15, 20)
        
        # Score de variété
        variety_score = min(category_count * 5, 10)
        
        total = progress_score + time_score + complexity_score + variety_score
        return round(min(total, 100), 1)
    
    def _get_next_milestone(self, progress, categories):
        """
        Prochain objectif à atteindre
        """
        milestones = [
            (25, 'Premier Quart', '🎯', 'Bronze'),
            (50, 'Mi-Parcours', '⭐', 'Argent'),
            (75, 'Dernière Ligne Droite', '🚀', 'Or'),
            (95, 'Presque Prêt', '🏆', 'Platine'),
            (100, 'Expérience Complète', '👑', 'Diamant')
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