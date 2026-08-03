"""
Rattache un compte Connect EXISTANT à un profil restaurateur et met à jour les
drapeaux d'activation à partir de l'état réel du compte chez Stripe.

Contrairement à `stripe_test_account`, cette commande ne crée rien : elle lit
`charges_enabled`, `payouts_enabled` et les capacités, puis recopie ce que Stripe
dit. Elle fonctionne donc aussi bien en test qu'en live — en live, elle exige
`--yes` pour éviter une exécution par inadvertance.

Usage typique, après un onboarding Express mené jusqu'au bout depuis l'app :

    python manage.py link_stripe_account \
        --email=test.resto@eatquicker.com --account=acct_XXXX --yes

`--reset-location` vide `stripe_terminal_location_id` : indispensable si le champ
porte une Location créée dans l'autre mode (une Location test est introuvable
avec une clé live, et `connectReader` échoue alors sans message exploitable).
"""
import stripe
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from api.models import Restaurant, RestaurateurProfile


class Command(BaseCommand):
    help = "Rattache un compte Connect existant à un restaurateur et synchronise son état."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Email du restaurateur.")
        parser.add_argument(
            "--account",
            help="Identifiant du compte Connect (acct_...). Par défaut, celui déjà en base.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirme l'exécution en mode live.",
        )
        parser.add_argument(
            "--reset-location",
            action="store_true",
            help="Vide stripe_terminal_location_id (Location d'un autre mode Stripe).",
        )

    def handle(self, *args, **options):
        stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "") or ""
        if not stripe.api_key:
            raise CommandError("STRIPE_SECRET_KEY absent des settings.")

        live = stripe.api_key.startswith("sk_live_")
        mode = "LIVE" if live else "test"
        if live and not options["yes"]:
            raise CommandError(
                "Clé live détectée. Relancez avec --yes si c'est intentionnel : "
                "cette commande activera l'encaissement par carte réel pour ce compte."
            )

        self.stdout.write(f"Mode Stripe : {mode}")

        try:
            profile = RestaurateurProfile.objects.select_related("user").get(
                user__email__iexact=options["email"]
            )
        except RestaurateurProfile.DoesNotExist:
            raise CommandError(f"Aucun profil restaurateur pour {options['email']}.")

        account_id = options["account"] or profile.stripe_account_id
        if not account_id:
            raise CommandError(
                "Aucun compte à rattacher : passez --account=acct_..., ou terminez "
                "d'abord l'onboarding Express depuis l'application."
            )

        try:
            account = stripe.Account.retrieve(account_id)
        except stripe.StripeError as exc:
            raise CommandError(
                f"Compte {account_id} introuvable en mode {mode} : {exc}. "
                "Un compte créé dans l'autre mode n'existe pas ici."
            ) from exc

        charges = bool(account.charges_enabled)
        payouts = bool(account.payouts_enabled)
        card = account.capabilities.get("card_payments")
        transfers = account.capabilities.get("transfers")

        self.stdout.write(f"Compte  : {account.id} ({account.type})")
        self.stdout.write(f"  charges_enabled : {charges}")
        self.stdout.write(f"  payouts_enabled : {payouts}")
        self.stdout.write(f"  card_payments   : {card}")
        self.stdout.write(f"  transfers       : {transfers}")

        if not charges:
            req = account.requirements
            self.stdout.write(self.style.WARNING("Compte non actif :"))
            self.stdout.write(f"  currently_due   : {list(req.currently_due)}")
            self.stdout.write(f"  past_due        : {list(req.past_due)}")
            self.stdout.write(f"  disabled_reason : {req.disabled_reason}")

        # `card_payments` conditionne Tap to Pay ; `transfers` conditionne le
        # destination charge et donc `application_fee_amount`. Les deux sont
        # nécessaires, `charges_enabled` seul ne suffit pas à le garantir.
        usable = charges and card == "active" and transfers == "active"
        if charges and not usable:
            self.stdout.write(
                self.style.WARNING(
                    "charges_enabled est vrai mais une capacité manque — "
                    "les paiements par carte échoueront."
                )
            )

        profile.stripe_account_id = account.id
        profile.stripe_verified = usable
        profile.stripe_onboarding_completed = bool(account.details_submitted)
        profile.is_validated = usable
        profile.is_active = usable
        if not profile.stripe_account_created:
            profile.stripe_account_created = timezone.now()
        profile.save()

        restaurants = Restaurant.objects.filter(owner=profile)
        restaurants.update(is_stripe_active=usable)

        if options["reset_location"]:
            updated = restaurants.update(stripe_terminal_location_id="")
            self.stdout.write(f"Location Terminal réinitialisée sur {updated} restaurant(s).")

        if not restaurants.exists():
            self.stdout.write(self.style.WARNING("Aucun restaurant rattaché à ce profil."))
        for restaurant in restaurants:
            self.stdout.write(
                f"  Restaurant {restaurant.id} · {restaurant.name} "
                f"— is_stripe_active : {restaurant.is_stripe_active}"
            )

        if usable:
            self.stdout.write(
                self.style.SUCCESS(f"Encaissement par carte activé (mode {mode}).")
            )
        else:
            self.stdout.write(
                self.style.ERROR("Encaissement par carte INACTIF — voir les manques ci-dessus.")
            )
