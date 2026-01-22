# -*- coding: utf-8 -*-
"""
Fixtures partagées pour les tests des serializers EatQuickeR.

Ce fichier centralise toutes les fixtures utilisées dans les tests de serializers
pour éviter la duplication et assurer la cohérence.

Organisation:
- Utilisateurs (clients, restaurateurs, admins)
- Restaurants et dépendances (tables, menus)
- Commandes et items
- Sessions collaboratives
- Paiements
- Notifications

IMPORTANT - Modèle Order:
Le modèle Order n'a PAS les champs suivants:
- restaurateur (ForeignKey) - N'EXISTE PAS
- table (ForeignKey) - N'EXISTE PAS

Le modèle Order a:
- restaurant (ForeignKey vers Restaurant)
- table_number (CharField) - PAS une ForeignKey
- order_number (CharField, unique, requis)
- user (ForeignKey vers User, optionnel)
- subtotal, tax_amount, total_amount (DecimalField)
"""

import pytest
from decimal import Decimal
from datetime import date, time, timedelta
from django.contrib.auth.models import User, Group
from django.utils import timezone
from rest_framework.test import APIRequestFactory


# =============================================================================
# FIXTURES - Utilitaires
# =============================================================================

@pytest.fixture
def factory():
    """Factory pour créer des requêtes de test"""
    return APIRequestFactory()


@pytest.fixture
def mock_request(factory, user):
    """Requête mockée avec utilisateur authentifié"""
    request = factory.get('/')
    request.user = user
    return request


@pytest.fixture
def mock_restaurateur_request(factory, restaurateur_user):
    """Requête mockée avec restaurateur authentifié"""
    request = factory.get('/')
    request.user = restaurateur_user
    return request


# =============================================================================
# FIXTURES - Groupes
# =============================================================================

@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def client_group(db):
    """Groupe client"""
    group, _ = Group.objects.get_or_create(name="client")
    return group


# =============================================================================
# FIXTURES - Utilisateurs
# =============================================================================

@pytest.fixture
def user(db):
    """Utilisateur client standard"""
    return User.objects.create_user(
        username="testclient@example.com",
        email="testclient@example.com",
        password="testpass123",
        first_name="Jean",
        last_name="Client"
    )


@pytest.fixture
def second_user(db):
    """Deuxième utilisateur pour tests multi-users"""
    return User.objects.create_user(
        username="seconduser@example.com",
        email="seconduser@example.com",
        password="testpass123",
        first_name="Marie",
        last_name="Dupont"
    )


@pytest.fixture
def restaurateur_user(db, restaurateur_group):
    """Utilisateur restaurateur"""
    user = User.objects.create_user(
        username="restaurateur@example.com",
        email="restaurateur@example.com",
        password="testpass123",
        first_name="Pierre",
        last_name="Restaurateur"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def second_restaurateur_user(db, restaurateur_group):
    """Deuxième restaurateur pour tests d'isolation"""
    user = User.objects.create_user(
        username="restaurateur2@example.com",
        email="restaurateur2@example.com",
        password="testpass123",
        first_name="Paul",
        last_name="Bistrot"
    )
    user.groups.add(restaurateur_group)
    return user


@pytest.fixture
def admin_user(db):
    """Utilisateur administrateur"""
    return User.objects.create_superuser(
        username="admin@example.com",
        email="admin@example.com",
        password="adminpass123"
    )


# =============================================================================
# FIXTURES - Profils
# =============================================================================

@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    """Profil restaurateur complet et validé"""
    from api.models import RestaurateurProfile
    return RestaurateurProfile.objects.create(
        user=restaurateur_user,
        siret="12345678901234",
        stripe_account_id="acct_test_123",
        stripe_verified=True,
        is_validated=True,
        is_active=True
    )


@pytest.fixture
def unvalidated_restaurateur_profile(db, second_restaurateur_user):
    """Profil restaurateur non validé"""
    from api.models import RestaurateurProfile
    return RestaurateurProfile.objects.create(
        user=second_restaurateur_user,
        siret="98765432109876",
        stripe_account_id=None,
        stripe_verified=False,
        is_validated=False,
        is_active=False
    )


@pytest.fixture
def client_profile(db, user):
    """Profil client"""
    from api.models import ClientProfile
    return ClientProfile.objects.create(
        user=user,
        phone="0612345678"
    )


# =============================================================================
# FIXTURES - Restaurant
# =============================================================================

@pytest.fixture
def restaurant(db, restaurateur_profile):
    """Restaurant de test complet"""
    from api.models import Restaurant
    return Restaurant.objects.create(
        name="Le Petit Bistrot",
        description="Cuisine française traditionnelle",
        owner=restaurateur_profile,
        siret="11111111111111",
        address="123 Rue de la Paix",
        city="Paris",
        zip_code="75001",
        country="France",
        phone="0140000001",
        email="contact@petitbistrot.fr",
        website="https://petitbistrot.fr",
        latitude=48.8566,
        longitude=2.3522,
        cuisine="Français",
        price_range=2,
        is_active=True,
        accepts_meal_vouchers=True
    )


@pytest.fixture
def inactive_restaurant(db, restaurateur_profile):
    """Restaurant inactif"""
    from api.models import Restaurant
    return Restaurant.objects.create(
        name="Restaurant Fermé",
        description="Temporairement fermé",
        owner=restaurateur_profile,
        siret="22222222222222",
        is_active=False
    )


@pytest.fixture
def second_restaurant(db, restaurateur_profile):
    """Deuxième restaurant du même propriétaire"""
    from api.models import Restaurant
    return Restaurant.objects.create(
        name="La Grande Brasserie",
        description="Brasserie traditionnelle",
        owner=restaurateur_profile,
        siret="33333333333333",
        address="456 Avenue des Champs",
        city="Paris",
        zip_code="75008",
        is_active=True
    )


@pytest.fixture
def other_owner_restaurant(db, unvalidated_restaurateur_profile):
    """Restaurant d'un autre propriétaire"""
    from api.models import Restaurant
    return Restaurant.objects.create(
        name="Chez l'Autre",
        description="Restaurant concurrent",
        owner=unvalidated_restaurateur_profile,
        siret="44444444444444",
        is_active=True
    )


# =============================================================================
# FIXTURES - Horaires d'ouverture
# =============================================================================

@pytest.fixture
def opening_hours(db, restaurant):
    """Horaires d'ouverture pour une semaine complète"""
    from api.models import OpeningHours, OpeningPeriod
    
    hours_list = []
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    
    for day in days:
        is_closed = day == 'sunday'
        oh = OpeningHours.objects.create(
            restaurant=restaurant,
            day_of_week=day,
            is_closed=is_closed
        )
        
        if not is_closed:
            # Service midi
            OpeningPeriod.objects.create(
                opening_hours=oh,
                open_time=time(12, 0),
                close_time=time(14, 30)
            )
            # Service soir
            OpeningPeriod.objects.create(
                opening_hours=oh,
                open_time=time(19, 0),
                close_time=time(22, 30)
            )
        
        hours_list.append(oh)
    
    return hours_list


# =============================================================================
# FIXTURES - Tables
# FIX: Suppression du paramètre 'identifiant' qui est une propriété en lecture seule
#      La propriété 'identifiant' retourne 'qr_code', donc on utilise qr_code directement
# =============================================================================

@pytest.fixture
def table(db, restaurant):
    """Table de test"""
    from api.models import Table
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        # FIX: Supprimé 'identifiant="T001"' - c'est une propriété read-only
        qr_code="R1T001",  # identifiant retourne qr_code
        capacity=4,
        is_active=True
    )


@pytest.fixture
def inactive_table(db, restaurant):
    """Table inactive"""
    from api.models import Table
    return Table.objects.create(
        restaurant=restaurant,
        number=99,
        # FIX: Supprimé 'identifiant="T099"'
        qr_code="R1T099",
        capacity=2,
        is_active=False
    )


@pytest.fixture
def multiple_tables(db, restaurant):
    """Ensemble de tables pour un restaurant"""
    from api.models import Table
    tables = []
    for i in range(1, 6):
        t = Table.objects.create(
            restaurant=restaurant,
            number=i,
            # FIX: Supprimé 'identifiant=f"T{str(i).zfill(3)}"'
            qr_code=f"R{restaurant.id}T{str(i).zfill(3)}",
            capacity=4 if i <= 3 else 6,
            is_active=True
        )
        tables.append(t)
    return tables


# =============================================================================
# FIXTURES - Menu et Catégories
# =============================================================================

@pytest.fixture
def menu(db, restaurant):
    """Menu principal"""
    from api.models import Menu
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def inactive_menu(db, restaurant):
    """Menu non disponible"""
    from api.models import Menu
    return Menu.objects.create(
        name="Menu Saisonnier",
        restaurant=restaurant,
        is_available=False
    )


@pytest.fixture
def menu_category(db, restaurant):
    """Catégorie de menu - Entrées"""
    from api.models import MenuCategory
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Entrées",
        description="Nos entrées fraîches",
        icon="🥗",
        color="#4CAF50",
        is_active=True,
        order=1
    )


@pytest.fixture
def second_menu_category(db, restaurant):
    """Catégorie de menu - Plats"""
    from api.models import MenuCategory
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats Principaux",
        description="Nos plats signatures",
        icon="🍽️",
        color="#FF5722",
        is_active=True,
        order=2
    )


@pytest.fixture
def dessert_category(db, restaurant):
    """Catégorie de menu - Desserts"""
    from api.models import MenuCategory
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Desserts",
        description="Nos desserts maison",
        icon="🍰",
        color="#E91E63",
        is_active=True,
        order=3
    )


@pytest.fixture
def menu_subcategory(db, menu_category):
    """Sous-catégorie - Salades"""
    from api.models import MenuSubCategory
    return MenuSubCategory.objects.create(
        category=menu_category,
        name="Salades",
        description="Salades fraîches de saison",
        is_active=True,
        order=1
    )


# =============================================================================
# FIXTURES - Items de menu
# =============================================================================

@pytest.fixture
def menu_item(db, menu, menu_category):
    """Item de menu basique"""
    from api.models import MenuItem
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Salade César",
        description="Salade romaine, parmesan, croûtons, sauce César maison",
        price=Decimal('12.50'),
        vat_rate=Decimal('0.10'),
        is_available=True,
        is_vegetarian=True,
        preparation_time=10
    )


@pytest.fixture
def second_menu_item(db, menu, second_menu_category):
    """Deuxième item - Plat principal"""
    from api.models import MenuItem
    return MenuItem.objects.create(
        menu=menu,
        category=second_menu_category,
        name="Steak Frites",
        description="Entrecôte grillée, frites maison, sauce au poivre",
        price=Decimal('22.00'),
        vat_rate=Decimal('0.10'),
        is_available=True,
        is_vegetarian=False,
        preparation_time=20
    )


@pytest.fixture
def unavailable_menu_item(db, menu, menu_category):
    """Item non disponible"""
    from api.models import MenuItem
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Foie Gras",
        description="Foie gras mi-cuit",
        price=Decimal('18.00'),
        vat_rate=Decimal('0.055'),
        is_available=False,
        preparation_time=5
    )


@pytest.fixture
def multiple_menu_items(db, menu, menu_category, second_menu_category, dessert_category):
    """Ensemble complet d'items de menu"""
    from api.models import MenuItem
    items = []
    
    items_data = [
        ("Soupe à l'oignon", menu_category, Decimal('8.00'), 5, True),
        ("Salade Niçoise", menu_category, Decimal('14.00'), 10, True),
        ("Burger Gourmet", second_menu_category, Decimal('16.50'), 15, False),
        ("Filet de Daurade", second_menu_category, Decimal('24.00'), 18, False),
        ("Tiramisu", dessert_category, Decimal('8.50'), 5, True),
        ("Crème Brûlée", dessert_category, Decimal('7.50'), 5, True),
    ]
    
    for name, category, price, prep_time, vegetarian in items_data:
        item = MenuItem.objects.create(
            menu=menu,
            category=category,
            name=name,
            price=price,
            vat_rate=Decimal('0.10'),
            is_available=True,
            is_vegetarian=vegetarian,
            preparation_time=prep_time
        )
        items.append(item)
    
    return items


# =============================================================================
# FIXTURES - Commandes
# FIX: Le modèle Order n'a PAS de champ 'restaurateur' ni 'table' (ForeignKey)
#      Il a: restaurant, table_number (CharField), order_number, user, subtotal, total_amount
# =============================================================================

@pytest.fixture
def order(db, restaurant, table, user):
    """
    Commande de test basique
    
    FIX: Supprimé 'restaurateur' et 'table' qui n'existent pas dans le modèle Order
    Le modèle Order utilise:
    - restaurant (ForeignKey vers Restaurant)
    - table_number (CharField, PAS une ForeignKey vers Table)
    - order_number (requis, unique)
    """
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        # FIX: Supprimé restaurateur=restaurateur_profile (n'existe pas)
        # FIX: Supprimé table=table (n'existe pas, utiliser table_number)
        table_number=table.identifiant,  # CharField, pas ForeignKey
        user=user,
        order_number="ORD-TEST-001",
        customer_name="Jean Client",
        phone="0612345678",
        order_type='dine_in',
        status='pending',
        payment_status='pending',
        subtotal=Decimal('34.50'),
        tax_amount=Decimal('3.45'),
        total_amount=Decimal('37.95')
    )


@pytest.fixture
def confirmed_order(db, restaurant, table, user):
    """Commande confirmée"""
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-TEST-002",
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('50.00'),
        tax_amount=Decimal('5.00'),
        total_amount=Decimal('55.00')
    )


@pytest.fixture
def preparing_order(db, restaurant, table, user):
    """Commande en préparation"""
    from api.models import Order
    order = Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-TEST-003",
        status='preparing',
        payment_status='pending',
        subtotal=Decimal('45.00'),
        tax_amount=Decimal('4.50'),
        total_amount=Decimal('49.50')
    )
    # Simuler du temps écoulé
    order.created_at = timezone.now() - timedelta(minutes=10)
    order.save(update_fields=['created_at'])
    return order


@pytest.fixture
def ready_order(db, restaurant, table, user):
    """Commande prête"""
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-TEST-004",
        status='ready',
        payment_status='pending',
        subtotal=Decimal('30.00'),
        tax_amount=Decimal('3.00'),
        total_amount=Decimal('33.00'),
        ready_at=timezone.now()
    )


@pytest.fixture
def served_order(db, restaurant, table, user):
    """Commande servie"""
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-TEST-005",
        status='served',
        payment_status='paid',
        subtotal=Decimal('60.00'),
        tax_amount=Decimal('6.00'),
        total_amount=Decimal('66.00'),
        ready_at=timezone.now() - timedelta(minutes=5),
        served_at=timezone.now()
    )


@pytest.fixture
def cancelled_order(db, restaurant, table, user):
    """Commande annulée"""
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-TEST-006",
        status='cancelled',
        payment_status='refunded',
        subtotal=Decimal('25.00'),
        tax_amount=Decimal('2.50'),
        total_amount=Decimal('27.50')
    )


@pytest.fixture
def order_for_restaurant(db, restaurant, table, user):
    """
    Commande liée à un restaurant spécifique pour les tests de RestaurantBasicSerializer.
    Alias de 'order' mais avec un nom explicite pour les tests de comptage.
    """
    from api.models import Order
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,
        user=user,
        order_number="ORD-REST-001",
        customer_name="Client Restaurant",
        phone="0612345678",
        order_type='dine_in',
        status='pending',
        payment_status='pending',
        subtotal=Decimal('40.00'),
        tax_amount=Decimal('4.00'),
        total_amount=Decimal('44.00')
    )


@pytest.fixture
def order_item(db, order, menu_item):
    """Item de commande"""
    from api.models import OrderItem
    return OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=2,
        unit_price=menu_item.price,
        total_price=menu_item.price * 2,
        vat_rate=menu_item.vat_rate
    )


@pytest.fixture
def order_with_items(db, order, menu_item, second_menu_item):
    """Commande avec plusieurs items"""
    from api.models import OrderItem
    
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=2,
        unit_price=menu_item.price,
        total_price=menu_item.price * 2,
        vat_rate=menu_item.vat_rate
    )
    
    OrderItem.objects.create(
        order=order,
        menu_item=second_menu_item,
        quantity=1,
        unit_price=second_menu_item.price,
        total_price=second_menu_item.price,
        vat_rate=second_menu_item.vat_rate
    )
    
    # Recalculer les totaux
    order.subtotal = menu_item.price * 2 + second_menu_item.price
    order.tax_amount = order.subtotal * Decimal('0.10')
    order.total_amount = order.subtotal + order.tax_amount
    order.save()
    
    return order


# =============================================================================
# FIXTURES - Sessions collaboratives
# =============================================================================

@pytest.fixture
def collaborative_session(db, restaurant, table, user):
    """Session collaborative de test"""
    from api.models import CollaborativeTableSession
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number=table.identifiant,  # Utilise la propriété
        host=user,
        host_name="Jean Client",
        max_participants=6,
        status='active'
    )


@pytest.fixture
def participant(db, collaborative_session, user):
    """Participant à une session (hôte)"""
    from api.models import SessionParticipant
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        display_name="Jean Client",
        role='host',
        is_approved=True
    )


@pytest.fixture
def guest_participant(db, collaborative_session, second_user):
    """Participant invité à une session"""
    from api.models import SessionParticipant
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=second_user,
        display_name="Marie Dupont",
        role='guest',
        is_approved=True
    )


# =============================================================================
# FIXTURES - Paiements divisés
# =============================================================================

@pytest.fixture
def split_session(db, order, user):
    """Session de paiement divisé"""
    from api.models import SplitPaymentSession
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=order.total_amount,
        tip_amount=Decimal('5.00'),
        created_by=user,
        status='pending'
    )


@pytest.fixture
def payment_portion(db, split_session):
    """Portion de paiement"""
    from api.models import SplitPaymentPortion
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Part 1",
        amount=Decimal('21.48'),
        is_paid=False
    )


@pytest.fixture
def paid_portion(db, split_session):
    """Portion de paiement payée"""
    from api.models import SplitPaymentPortion
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Part 2",
        amount=Decimal('21.47'),
        is_paid=True,
        payment_intent_id="pi_test_123",
        payment_method="card",
        paid_at=timezone.now()
    )


# =============================================================================
# FIXTURES - Notifications
# =============================================================================

@pytest.fixture
def push_token(db, user):
    """Token de notification push"""
    from api.models import PushNotificationToken
    return PushNotificationToken.objects.create(
        user=user,
        expo_token="ExponentPushToken[test_token_123]",
        device_id="device_test_123",
        device_name="iPhone Test",
        device_platform="ios"
    )


@pytest.fixture
def notification_preferences(db, user):
    """Préférences de notification"""
    from api.models import NotificationPreferences
    return NotificationPreferences.objects.create(
        user=user,
        order_updates=True,
        promotions=False,
        quiet_hours_enabled=True,
        quiet_hours_start=time(22, 0),
        quiet_hours_end=time(8, 0)
    )


@pytest.fixture
def notification(db, user):
    """Notification de test"""
    from api.models import Notification
    return Notification.objects.create(
        user=user,
        notification_type='order_ready',
        title="Commande prête",
        body="Votre commande ORD-TEST-001 est prête !",
        data={'order_id': 1, 'action': 'view_order'},
        priority='high',
        is_read=False
    )


@pytest.fixture
def read_notification(db, user):
    """Notification lue"""
    from api.models import Notification
    return Notification.objects.create(
        user=user,
        notification_type='system',
        title="Bienvenue !",
        body="Merci de rejoindre EatQuickeR",
        data={},
        priority='low',
        is_read=True,
        read_at=timezone.now()
    )


# =============================================================================
# FIXTURES - Menu du jour
# =============================================================================

@pytest.fixture
def daily_menu_type(db, restaurant):
    """Type de menu du jour"""
    from api.models import DailyMenuType
    return DailyMenuType.objects.create(
        restaurant=restaurant,
        name="Menu Ouvrier",
        price=Decimal('14.50'),
        description="Entrée + Plat + Dessert"
    )


@pytest.fixture
def daily_menu(db, restaurant, daily_menu_type):
    """Menu du jour"""
    from api.models import DailyMenu
    return DailyMenu.objects.create(
        restaurant=restaurant,
        date=date.today(),
        menu_type=daily_menu_type,
        is_active=True
    )


@pytest.fixture
def daily_menu_item(db, daily_menu, menu_item):
    """Item du menu du jour"""
    from api.models import DailyMenuItem
    return DailyMenuItem.objects.create(
        daily_menu=daily_menu,
        menu_item=menu_item,
        special_price=Decimal('10.00'),
        is_available=True,
        display_order=1
    )


# =============================================================================
# FIXTURES - Brouillons de commande
# =============================================================================

@pytest.fixture
def draft_order(db, restaurant, table, user):
    """Brouillon de commande"""
    from api.models import DraftOrder
    return DraftOrder.objects.create(
        restaurant=restaurant,
        table=table,
        created_by=user,
        status='draft',
        guest_name="Invité Test",
        guest_phone="0600000000"
    )


@pytest.fixture
def draft_order_item(db, draft_order, menu_item):
    """Item de brouillon"""
    from api.models import DraftOrderItem
    return DraftOrderItem.objects.create(
        draft_order=draft_order,
        menu_item=menu_item,
        quantity=2,
        unit_price=menu_item.price
    )


# =============================================================================
# FIXTURES - Sessions de table
# =============================================================================

@pytest.fixture
def table_session(db, restaurant, table):
    """Session de table active"""
    from api.models import TableSession
    return TableSession.objects.create(
        restaurant=restaurant,
        table_number=table.identifiant,  # Utilise la propriété
        is_active=True,
        primary_customer_name="Client Test",
        primary_phone="0612345678",
        guest_count=2
    )


# =============================================================================
# HELPERS - Données de test
# =============================================================================

@pytest.fixture
def valid_order_data(restaurant, menu_item, second_menu_item):
    """Données valides pour création de commande"""
    return {
        'restaurant': restaurant.id,
        'order_type': 'dine_in',
        'table_number': 'T001',
        'customer_name': 'Test Customer',
        'phone': '0612345678',
        'payment_method': 'card',
        'notes': 'Sans sel SVP',
        'items': [
            {'menu_item': menu_item.id, 'quantity': 2},
            {'menu_item': second_menu_item.id, 'quantity': 1}
        ]
    }


@pytest.fixture
def valid_restaurant_data():
    """Données valides pour création de restaurant"""
    return {
        'name': 'Nouveau Restaurant',
        'description': 'Un super restaurant',
        'address': '1 Rue de Test',
        'city': 'Paris',
        'zipCode': '75001',
        'phone': '0140000000',
        'email': 'contact@nouveau.fr',
        'cuisine': 'Français',
        'priceRange': 2
    }


@pytest.fixture
def valid_table_data(restaurant):
    """Données valides pour création de table"""
    return {
        'restaurant': restaurant.id,
        'number': 10,
        # FIX: Supprimé 'identifiant' car c'est une propriété read-only
        # Utiliser 'qr_code' à la place si nécessaire
        'qr_code': 'NEW_T010',
        'capacity': 4
    }


@pytest.fixture
def valid_registration_client_data():
    """Données valides pour inscription client"""
    return {
        'username': 'newclient@example.com',
        'password': 'SecurePass123!',
        'nom': 'Nouveau Client',
        'role': 'client',
        'telephone': '0698765432'
    }