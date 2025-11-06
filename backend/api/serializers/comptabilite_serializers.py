from rest_framework import serializers
from api.models import (
    ComptabiliteSettings,
    EcritureComptable,
    RecapitulatifTVA,
    ExportComptable,
    FactureSequence,
)

# --- ComptabiliteSettings ---

class ComptabiliteSettingsSerializer(serializers.ModelSerializer):
    """Configuration comptable liée au restaurateur"""

    restaurateur_id = serializers.CharField(source="restaurateur.id", read_only=True)

    class Meta:
        model = ComptabiliteSettings
        fields = [
            "restaurateur_id",
            "invoice_prefix",
            "last_invoice_number",
            "invoice_year_reset",
            "tva_regime",
            "export_format_default",
            "siret",
            "tva_intracommunautaire",
            "code_naf",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_invoice_prefix(self, value: str):
        if not value:
            raise serializers.ValidationError("Le préfixe de facture est requis.")
        if len(value) > 10:
            raise serializers.ValidationError("Max 10 caractères.")
        return value


# --- EcritureComptable ---

class EcritureComptableSerializer(serializers.ModelSerializer):
    """Écriture FEC / grand-livre"""

    restaurateur_id = serializers.CharField(source="restaurateur.id", read_only=True)
    order_id = serializers.IntegerField(source="order.id", read_only=True)

    class Meta:
        model = EcritureComptable
        fields = [
            "id",
            "restaurateur_id",
            "journal_code",
            "ecriture_num",
            "ecriture_date",
            "compte_num",
            "compte_lib",
            "piece_ref",
            "piece_date",
            "debit",
            "credit",
            "ecriture_lib",
            "order_id",
            "stripe_payment_id",
            "tva_taux",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        debit = attrs.get("debit")
        credit = attrs.get("credit")
        if (debit is None or debit == 0) and (credit is None or credit == 0):
            raise serializers.ValidationError("Débit ou crédit doit être non nul.")
        return attrs


# --- RecapitulatifTVA ---

class RecapitulatifTVASerializer(serializers.ModelSerializer):
    """Récap TVA mensuel (lecture principalement)"""

    restaurateur_id = serializers.CharField(source="restaurateur.id", read_only=True)

    class Meta:
        model = RecapitulatifTVA
        fields = [
            "id",
            "restaurateur_id",
            "year",
            "month",
            # Chiffres d'affaires
            "ca_ht",
            "ca_ttc",
            # TVA 5.5
            "tva_5_5_base",
            "tva_5_5_montant",
            # TVA 10
            "tva_10_base",
            "tva_10_montant",
            # TVA 20
            "tva_20_base",
            "tva_20_montant",
            # Total
            "tva_total",
            # Stats
            "nombre_factures",
            "ticket_moyen",
            # Stripe
            "commissions_stripe",
            "virements_stripe",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # Cohérence: tva_total = somme des montants TVA
        tva_total_calc = (
            (attrs.get("tva_5_5_montant") or 0)
            + (attrs.get("tva_10_montant") or 0)
            + (attrs.get("tva_20_montant") or 0)
        )
        if "tva_total" in attrs and attrs["tva_total"] is not None:
            # Tolérance aux arrondis (centimes)
            if round(attrs["tva_total"] - tva_total_calc, 2) != 0:
                raise serializers.ValidationError(
                    "tva_total doit correspondre à la somme des montants de TVA par taux."
                )
        return attrs


# --- ExportComptable (utile pour afficher les exports dans le dashboard) ---

class ExportComptableSerializer(serializers.ModelSerializer):
    restaurateur_id = serializers.CharField(source="restaurateur.id", read_only=True)

    class Meta:
        model = ExportComptable
        fields = [
            "id",
            "restaurateur_id",
            "type_export",
            "periode_debut",
            "periode_fin",
            "fichier_url",
            "fichier_nom",
            "fichier_taille",
            "statut",
            "message_erreur",
            "nombre_lignes",
            "checksum_md5",
            "created_at",
            "expires_at",
        ]
        read_only_fields = ["id", "created_at"]


# --- FactureSequence (optionnel mais pratique côté admin/API) ---

class FactureSequenceSerializer(serializers.ModelSerializer):
    restaurateur_id = serializers.CharField(source="restaurateur.id", read_only=True)

    class Meta:
        model = FactureSequence
        fields = [
            "id",
            "restaurateur_id",
            "year",
            "month",
            "last_number",
        ]
        read_only_fields = ["id"]
