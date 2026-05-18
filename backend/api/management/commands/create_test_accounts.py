"""
Management command Django pour créer/recréer les comptes de test
destinés à la review Google Play / App Store.

INSTALLATION
============
Placer ce fichier dans :
    backend/api/management/commands/create_test_accounts.py

Si les dossiers n'existent pas encore, créer la structure complète :
    mkdir -p backend/api/management/commands
    touch backend/api/management/__init__.py
    touch backend/api/management/commands/__init__.py

USAGE
=====
Sur le VPS (ou en local pointé sur la base de prod) :

    # Création initiale (idempotente — peut être relancée)
    python manage.py create_test_accounts

    # Reset complet puis recréation
    python manage.py create_test_accounts --reset

    # Avec credentials custom
    python manage.py create_test_accounts \\
        --client-email custom.client@eatquicker.com \\
        --resto-email custom.resto@eatquicker.com \\
        --password "MyStrongPassword2026!"

CE QUE LE COMMAND FAIT
======================
1. Crée le compte CLIENT (User + ClientProfile + LegalConsent)
2. Crée le compte RESTAURATEUR (User + RestaurateurProfile avec Stripe bypass)
3. Crée un RESTAURANT de démo lié au restaurateur
4. Crée 3 catégories de menu (Entrées / Plats / Desserts)
5. Crée 1 Menu + 7 MenuItems avec descriptions, prix, allergènes, TVA
6. Crée 1 Table de démo (qr_code auto-généré)
7. Affiche un récap avec les credentials et le code de table à coller
   dans Play Console.

SÉCURITÉ
========
- Les credentials par défaut sont volontairement génériques mais robustes.
- Changer le mot de passe APRÈS publication via Django admin.
- Le SIRET 73282932000074 est un SIRET de test (passe la validation Luhn).
  Si conflit avec un restaurant existant, passer un autre SIRET via --siret.
- Le Stripe bypass utilise un ID fictif (`acct_test_demo_for_review`) qui
  ne peut PAS recevoir de paiements réels. Le reviewer Google testera le
  paiement "en caisse" uniquement.
"""

from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import (
    ClientProfile,
    LegalConsent,
    Menu,
    MenuCategory,
    MenuItem,
    Restaurant,
    RestaurateurProfile,
    Table,
)


class Command(BaseCommand):
    help = "Crée (ou recrée) les comptes de test pour la review Google Play / App Store."

    # ── Valeurs par défaut ──────────────────────────────────────────────────
    DEFAULT_CLIENT_EMAIL = "test.client@eatquicker.com"
    DEFAULT_RESTO_EMAIL = "test.resto@eatquicker.com"
    DEFAULT_PASSWORD = "TestEatQR2026!"
    DEFAULT_SIRET = "73282932000074"  # SIRET de test, Luhn valide
    TERMS_VERSION = "1.0.0"
    PRIVACY_VERSION = "1.0.0"

    def add_arguments(self, parser):
        parser.add_argument(
            "--client-email",
            default=self.DEFAULT_CLIENT_EMAIL,
            help=f"Email du compte client de test (défaut: {self.DEFAULT_CLIENT_EMAIL})",
        )
        parser.add_argument(
            "--resto-email",
            default=self.DEFAULT_RESTO_EMAIL,
            help=f"Email du compte restaurateur de test (défaut: {self.DEFAULT_RESTO_EMAIL})",
        )
        parser.add_argument(
            "--password",
            default=self.DEFAULT_PASSWORD,
            help="Mot de passe partagé par les deux comptes de test.",
        )
        parser.add_argument(
            "--siret",
            default=self.DEFAULT_SIRET,
            help="SIRET fictif pour le restaurant de démo (doit passer Luhn).",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Supprime les comptes existants avant recréation (CASCADE).",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        client_email = opts["client_email"]
        resto_email = opts["resto_email"]
        password = opts["password"]
        siret = opts["siret"]
        reset = opts["reset"]

        if reset:
            self._reset_test_accounts(client_email, resto_email, siret)

        # 1. CLIENT
        client_user = self._create_or_update_client(client_email, password)

        # 2. RESTAURATEUR
        resto_user, resto_profile = self._create_or_update_restaurateur(
            resto_email, password, siret
        )

        # 3. RESTAURANT
        restaurant = self._create_or_update_restaurant(resto_profile, siret)

        # 4. CATÉGORIES + MENU + PLATS
        self._create_menu_content(restaurant)

        # 5. TABLE
        table_code = self._create_demo_table(restaurant)

        # 6. RÉCAP
        self._print_summary(client_email, resto_email, password, restaurant, table_code)

    # ────────────────────────────────────────────────────────────────────────
    # Reset
    # ────────────────────────────────────────────────────────────────────────
    def _reset_test_accounts(self, client_email, resto_email, siret):
        self.stdout.write(self.style.WARNING("⚠️  Suppression des comptes existants..."))
        # Supprimer en cascade User → ClientProfile / RestaurateurProfile / Restaurant…
        deleted = User.objects.filter(
            username__in=[client_email, resto_email]
        ).delete()
        # Au cas où un restaurant orphelin traîne sur ce SIRET
        Restaurant.objects.filter(siret=siret).delete()
        self.stdout.write(
            self.style.SUCCESS(f"  ✓ {deleted[0]} objet(s) supprimé(s)")
        )

    # ────────────────────────────────────────────────────────────────────────
    # Client
    # ────────────────────────────────────────────────────────────────────────
    def _create_or_update_client(self, email, password):
        self.stdout.write("📱 Compte client...")
        user, created = User.objects.update_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": "Test",
                "last_name": "Client",
                "is_active": True,
            },
        )
        user.set_password(password)
        user.save(update_fields=["password"])

        ClientProfile.objects.update_or_create(
            user=user,
            defaults={"phone": "+33600000001"},
        )

        self._record_consent(user)
        self.stdout.write(
            self.style.SUCCESS(f"  ✓ {email} ({'créé' if created else 'mis à jour'})")
        )
        return user

    # ────────────────────────────────────────────────────────────────────────
    # Restaurateur
    # ────────────────────────────────────────────────────────────────────────
    def _create_or_update_restaurateur(self, email, password, siret):
        self.stdout.write("👨‍🍳 Compte restaurateur...")
        user, created = User.objects.update_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": "Test",
                "last_name": "Restaurateur",
                "is_active": True,
            },
        )
        user.set_password(password)
        user.save(update_fields=["password"])

        profile, _ = RestaurateurProfile.objects.update_or_create(
            user=user,
            defaults={
                "siret": siret,
                "is_validated": True,
                "is_active": True,
                # ─── Bypass Stripe Connect KYC pour la review ───
                "stripe_verified": True,
                "stripe_account_id": "acct_test_demo_for_review",
                "stripe_onboarding_completed": True,
                "stripe_account_created": timezone.now(),
            },
        )

        self._record_consent(user)
        self.stdout.write(
            self.style.SUCCESS(f"  ✓ {email} ({'créé' if created else 'mis à jour'})")
        )
        return user, profile

    # ────────────────────────────────────────────────────────────────────────
    # Restaurant
    # ────────────────────────────────────────────────────────────────────────
    def _create_or_update_restaurant(self, owner, siret):
        self.stdout.write("🍽️  Restaurant de démo...")
        restaurant, created = Restaurant.objects.update_or_create(
            siret=siret,
            defaults={
                "owner": owner,
                "name": "Restaurant Démo EatQuickeR",
                "description": (
                    "Restaurant de démonstration utilisé exclusivement pour la "
                    "review Google Play et App Store. Ne pas commander réellement."
                ),
                "address": "1 Rue de la Démo, 64240 Hasparren",
                "cuisine": "french",
                "price_range": 2,
                "raison_sociale": "DEMO EATQUICKER (test)",
                "is_active": True,
                "is_stripe_active": True,
            },
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"  ✓ {restaurant.name} (id={restaurant.id}, {'créé' if created else 'mis à jour'})"
            )
        )
        return restaurant

    # ────────────────────────────────────────────────────────────────────────
    # Menu (catégories + plats)
    # ────────────────────────────────────────────────────────────────────────
    def _create_menu_content(self, restaurant):
        self.stdout.write("📋 Catégories de menu...")
        entrees, _ = MenuCategory.objects.update_or_create(
            restaurant=restaurant,
            name="Entrées",
            defaults={"icon": "🥗", "color": "#1E2A78", "order": 1, "is_active": True},
        )
        plats, _ = MenuCategory.objects.update_or_create(
            restaurant=restaurant,
            name="Plats",
            defaults={"icon": "🍽️", "color": "#D4AF37", "order": 2, "is_active": True},
        )
        desserts, _ = MenuCategory.objects.update_or_create(
            restaurant=restaurant,
            name="Desserts",
            defaults={"icon": "🍰", "color": "#0D1629", "order": 3, "is_active": True},
        )
        self.stdout.write(self.style.SUCCESS("  ✓ 3 catégories"))

        self.stdout.write("🍴 Menu et plats...")
        menu, _ = Menu.objects.update_or_create(
            restaurant=restaurant,
            name="Menu Démo",
            defaults={"is_available": True},
        )

        dishes = [
            # (category, name, description, price, allergens, veg, vegan, gf, vat_cat, vat_rate)
            (entrees, "Salade César", "Salade romaine, poulet grillé, parmesan, croûtons, sauce César maison", "9.50",
             ["gluten", "oeufs", "lait"], False, False, False, "FOOD", "0.100"),
            (entrees, "Soupe à l'oignon", "Soupe traditionnelle gratinée au fromage", "7.00",
             ["gluten", "lait"], True, False, False, "FOOD", "0.100"),
            (plats, "Steak frites", "Pavé de bœuf 200g, frites maison, sauce au poivre", "18.50",
             [], False, False, True, "FOOD", "0.100"),
            (plats, "Risotto aux champignons", "Risotto crémeux aux cèpes et parmesan", "15.00",
             ["lait"], True, False, True, "FOOD", "0.100"),
            (plats, "Burger végétarien", "Galette végétale, légumes grillés, fromage, frites maison", "14.00",
             ["gluten", "lait"], True, False, False, "FOOD", "0.100"),
            (desserts, "Tarte au citron", "Tarte au citron meringuée maison", "6.50",
             ["gluten", "oeufs", "lait"], True, False, False, "FOOD", "0.100"),
            (desserts, "Mousse au chocolat", "Mousse au chocolat noir 70%", "5.50",
             ["oeufs", "lait"], True, False, True, "FOOD", "0.100"),
        ]

        for cat, name, desc, price, allergens, veg, vegan, gf, vat_cat, vat_rate in dishes:
            MenuItem.objects.update_or_create(
                menu=menu,
                name=name,
                defaults={
                    "description": desc,
                    "price": Decimal(price),
                    "category": cat,
                    "is_available": True,
                    "allergens": allergens,
                    "is_vegetarian": veg,
                    "is_vegan": vegan,
                    "is_gluten_free": gf,
                    "preparation_time": 15,
                    "vat_category": vat_cat,
                    "vat_rate": Decimal(vat_rate),
                },
            )

        self.stdout.write(self.style.SUCCESS(f"  ✓ {len(dishes)} plats"))

    # ────────────────────────────────────────────────────────────────────────
    # Table
    # ────────────────────────────────────────────────────────────────────────
    def _create_demo_table(self, restaurant):
        self.stdout.write("🪑 Table de démo...")
        table, created = Table.objects.update_or_create(
            restaurant=restaurant,
            number="1",
            defaults={"capacity": 4, "is_active": True},
        )
        # qr_code auto-généré au save() : "R{restaurant.id}T001"
        if not table.qr_code:
            table.save()  # déclenche la génération du qr_code

        self.stdout.write(
            self.style.SUCCESS(
                f"  ✓ Table {table.number} — code = {table.qr_code} ({'créée' if created else 'mise à jour'})"
            )
        )
        return table.qr_code

    # ────────────────────────────────────────────────────────────────────────
    # Consentement RGPD
    # ────────────────────────────────────────────────────────────────────────
    def _record_consent(self, user):
        LegalConsent.objects.update_or_create(
            user=user,
            defaults={
                "terms_version": self.TERMS_VERSION,
                "privacy_version": self.PRIVACY_VERSION,
                "consent_date": timezone.now(),
                "ip_address": "127.0.0.1",
                "user_agent": "create_test_accounts management command",
            },
        )

    # ────────────────────────────────────────────────────────────────────────
    # Récap final
    # ────────────────────────────────────────────────────────────────────────
    def _print_summary(self, client_email, resto_email, password, restaurant, table_code):
        bar = "═" * 78
        self.stdout.write("\n" + self.style.SUCCESS(bar))
        self.stdout.write(self.style.SUCCESS("  ✅  COMPTES DE TEST PRÊTS POUR LA REVIEW"))
        self.stdout.write(self.style.SUCCESS(bar))
        self.stdout.write(
            f"""
  ┌─ CLIENT ──────────────────────────────────────────────────────────────┐
  │  Email     : {client_email:<55} │
  │  Password  : {password:<55} │
  └───────────────────────────────────────────────────────────────────────┘

  ┌─ RESTAURATEUR ────────────────────────────────────────────────────────┐
  │  Email     : {resto_email:<55} │
  │  Password  : {password:<55} │
  │  Restaurant: {restaurant.name:<55} │
  │  SIRET     : {restaurant.siret:<55} │
  └───────────────────────────────────────────────────────────────────────┘

  ┌─ CODE DE TABLE (à fournir au reviewer Google) ────────────────────────┐
  │  Code manuel : {table_code:<53} │
  └───────────────────────────────────────────────────────────────────────┘

  ÉTAPES SUIVANTES :
    1. Tester la connexion avec chaque compte sur l'APK release
    2. Remplacer 'R42T001' par '{table_code}' dans google-play-app-access.md
    3. Coller le texte mis à jour dans :
       Play Console → ton app → Policy → App content → App access
    4. Tester aussi le scan de QR avec le code ci-dessus en saisie manuelle
"""
        )
        self.stdout.write(self.style.SUCCESS(bar) + "\n")
