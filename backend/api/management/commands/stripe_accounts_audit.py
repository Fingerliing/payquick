"""
Inventaire des comptes Connect de la plateforme, croisé avec les profils en base.

Pourquoi pas de recherche par SIRET : Stripe ne restitue jamais un identifiant
fiscal en clair. `company.tax_id` et `individual.id_number` ne reviennent que
sous forme de drapeaux `*_provided`. L'identification passe donc par le nom
commercial, la raison sociale, l'email et la date de création.

    python manage.py stripe_accounts_audit
    python manage.py stripe_accounts_audit --search=fingerliing
    python manage.py stripe_accounts_audit --details=acct_XXXX

`--details` affiche tout ce que Stripe accepte de rendre sur un compte, y compris
les drapeaux d'identifiant fiscal — c'est le plus proche d'une confirmation
« ce compte porte bien un SIRET » que l'API permette.
"""
import stripe
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.models import RestaurateurProfile


def _label(account):
    """Meilleur libellé lisible : raison sociale, nom commercial, ou état civil."""
    company = account.get("company") or {}
    individual = account.get("individual") or {}
    profile = account.get("business_profile") or {}
    parts = [
        company.get("name"),
        profile.get("name"),
        " ".join(
            p for p in [individual.get("first_name"), individual.get("last_name")] if p
        ).strip(),
    ]
    return next((p for p in parts if p), "(sans nom)")


def _tax_flags(account):
    company = account.get("company") or {}
    individual = account.get("individual") or {}
    flags = []
    if company.get("tax_id_provided"):
        flags.append("company.tax_id")
    if individual.get("id_number_provided"):
        flags.append("individual.id_number")
    return ", ".join(flags) or "aucun"


class Command(BaseCommand):
    help = "Liste les comptes Connect de la plateforme et leur rattachement en base."

    def add_arguments(self, parser):
        parser.add_argument(
            "--search",
            help="Filtre insensible à la casse sur le nom, l'email ou l'identifiant.",
        )
        parser.add_argument(
            "--details",
            help="Affiche le détail complet d'un compte (acct_...).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Nombre maximum de comptes à parcourir (défaut : 100).",
        )

    def handle(self, *args, **options):
        stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "") or ""
        if not stripe.api_key:
            raise CommandError("STRIPE_SECRET_KEY absent des settings.")

        mode = "LIVE" if stripe.api_key.startswith("sk_live_") else "test"
        self.stdout.write(f"Mode Stripe : {mode}\n")

        if options["details"]:
            return self._details(options["details"])

        linked = {
            p.stripe_account_id: p
            for p in RestaurateurProfile.objects.select_related("user").exclude(
                stripe_account_id=""
            ).exclude(stripe_account_id__isnull=True)
        }

        needle = (options["search"] or "").lower()
        seen = set()
        rows = 0

        for account in stripe.Account.list(limit=100).auto_paging_iter():
            if rows >= options["limit"]:
                self.stdout.write(self.style.WARNING("Limite atteinte — affinez avec --search."))
                break

            label = _label(account)
            email = account.get("email") or ""
            haystack = f"{account.id} {label} {email}".lower()
            if needle and needle not in haystack:
                continue

            seen.add(account.id)
            rows += 1
            profile = linked.get(account.id)
            owner = f"{profile.user.email} (profil {profile.id})" if profile else "NON RATTACHÉ"
            state = "actif" if account.get("charges_enabled") else "inactif"

            self.stdout.write(f"{account.id}  [{account.get('type')}]  {state}")
            self.stdout.write(f"   nom       : {label}")
            self.stdout.write(f"   email     : {email or '(aucun)'}")
            self.stdout.write(f"   identité  : {_tax_flags(account)}")
            self.stdout.write(f"   en base   : {owner}")
            self.stdout.write("")

        self.stdout.write(f"{rows} compte(s) affiché(s).")

        # Un `stripe_account_id` en base absent de la liste vient presque toujours
        # de l'autre mode Stripe : c'est la cause classique du 400
        # « Card payment is not available » après une bascule test/live.
        orphans = [aid for aid in linked if aid not in seen]
        if orphans and not needle:
            self.stdout.write(
                self.style.WARNING(
                    f"\n{len(orphans)} compte(s) référencé(s) en base mais absent(s) "
                    f"de ce mode Stripe :"
                )
            )
            for aid in orphans:
                self.stdout.write(f"   {aid} → {linked[aid].user.email}")

    # ------------------------------------------------------------------
    def _details(self, account_id):
        try:
            account = stripe.Account.retrieve(account_id)
        except stripe.StripeError as exc:
            raise CommandError(f"Compte introuvable : {exc}") from exc

        company = account.get("company") or {}
        individual = account.get("individual") or {}
        profile = account.get("business_profile") or {}

        self.stdout.write(f"{account.id}  [{account.get('type')}]")
        self.stdout.write(f"  pays              : {account.get('country')}")
        self.stdout.write(f"  email             : {account.get('email')}")
        self.stdout.write(f"  business_type     : {account.get('business_type')}")
        self.stdout.write(f"  raison sociale    : {company.get('name')}")
        self.stdout.write(f"  nom commercial    : {profile.get('name')}")
        self.stdout.write(f"  URL               : {profile.get('url')}")
        self.stdout.write(f"  MCC               : {profile.get('mcc')}")
        self.stdout.write(
            f"  personne physique : "
            f"{individual.get('first_name')} {individual.get('last_name')}"
        )
        self.stdout.write(f"  identifiants      : {_tax_flags(account)}")
        self.stdout.write(f"  charges_enabled   : {account.get('charges_enabled')}")
        self.stdout.write(f"  payouts_enabled   : {account.get('payouts_enabled')}")
        self.stdout.write(f"  details_submitted : {account.get('details_submitted')}")
        self.stdout.write(f"  capacités         : {dict(account.get('capabilities') or {})}")
        self.stdout.write(f"  métadonnées       : {dict(account.get('metadata') or {})}")

        matches = RestaurateurProfile.objects.select_related("user").filter(
            stripe_account_id=account.id
        )
        if matches:
            for p in matches:
                self.stdout.write(f"  en base           : {p.user.email} (profil {p.id})")
        else:
            self.stdout.write("  en base           : NON RATTACHÉ")