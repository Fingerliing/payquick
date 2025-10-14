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
    API pour le suivi gamifié des commandes avec calcul des temps moyens
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
        
        # FIXED: Renamed variable to clarify it's a MenuCategory object
        for category_obj, items in items_by_category.items():
            # FIXED: Convert category object to string for JSON serialization
            category_name = str(category_obj)
            
            # Calculer le temps moyen de cette catégorie basé sur l'historique
            avg_time = self._calculate_category_average_time(
                restaurant, 
                category_obj  # FIXED: Pass the object to the method
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
                'category': category_name,  # FIXED: Now a string
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
        
        # Déterminer le niveau gamifié
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
        # Récupérer les commandes servies des 30 derniers jours
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
        
        # FIXED: Get string representation for comparison
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
            'Dessert': '🰰',
            'Boisson': '🥤'
        }
        return icons.get(category, '🴴')
    
    def _get_gamification_level(self, progress, order):
        """
        Retourne les données de gamification selon la progression
        """
        # Points basés sur la progression
        points = int(progress * 10)
        
        # Badges débloqués
        badges = []
        if progress >= 25:
            badges.append({
                'id': 'patience_1',
                'name': 'Patient Débutant',
                'icon': 'ⱱ️',
                'description': 'La préparation a débuté'
            })
        if progress >= 50:
            badges.append({
                'id': 'halfway',
                'name': 'Mi-chemin',
                'icon': '🃏',
                'description': 'Plus qu\'à moitié !'
            })
        if progress >= 75:
            badges.append({
                'id': 'almost_there',
                'name': 'Presque prêt',
                'icon': '🯯',
                'description': 'Bientôt à table !'
            })
        if progress >= 100 or order.status == 'served':
            badges.append({
                'id': 'bon_appetit',
                'name': 'Bon Appétit !',
                'icon': '🉉',
                'description': 'Commande servie !'
            })
        
        # Message motivationnel
        if progress < 25:
            message = "Votre commande est en cours de validation..."
            emoji = "⳿"
        elif progress < 50:
            message = "Nos chefs préparent vos plats avec soin !"
            emoji = "👨‍🍳"
        elif progress < 75:
            message = "C'est bientôt prêt, encore un peu de patience !"
            emoji = "⚡"
        elif progress < 100:
            message = "Dernière touche, votre plat arrive !"
            emoji = "✨"
        else:
            message = "Bon appétit ! 🎉"
            emoji = "🎊"
        
        return {
            'level': min(int(progress / 25) + 1, 4),
            'points': points,
            'badges': badges,
            'message': message,
            'emoji': emoji,
            'next_milestone': self._get_next_milestone(progress)
        }
    
    def _get_next_milestone(self, progress):
        """
        Retourne le prochain objectif à atteindre
        """
        milestones = [
            (25, 'Commande validée'),
            (50, 'Mi-parcours'),
            (75, 'Presque prêt'),
            (100, 'Servi')
        ]
        
        for milestone_progress, label in milestones:
            if progress < milestone_progress:
                return {
                    'progress': milestone_progress,
                    'label': label,
                    'remaining': milestone_progress - progress
                }
        
        return None