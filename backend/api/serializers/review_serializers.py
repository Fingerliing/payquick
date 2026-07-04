# -*- coding: utf-8 -*-
"""
Sérialiseurs — Avis restaurants & enrichissement SIRET.

Règle métier clé : seul un client ayant réellement commandé dans le restaurant
peut déposer un avis (achat vérifié). La commande justificative est rattachée
automatiquement à l'avis.
"""
from django.db.models import Q
from rest_framework import serializers

from api.models import Order, RestaurantReview

# Statuts d'une commande considérée comme "réelle" (transaction aboutie).
# Durcir en Q(status="served") si l'on veut exiger que le repas ait été servi.
QUALIFYING_ORDER_FILTER = Q(status="served") | Q(payment_status="paid")


def latest_qualifying_order(user, restaurant):
    """
    Retourne la commande la plus récente d'un client dans un restaurant qui
    prouve un achat réel (payée ou servie, non annulée), ou None.

    `restaurant` peut être une instance Restaurant ou un identifiant (le filtre
    `restaurant=` accepte les deux).
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return (
        Order.objects.filter(user=user, restaurant=restaurant)
        .filter(QUALIFYING_ORDER_FILTER)
        .exclude(status="cancelled")
        .order_by("-created_at")
        .first()
    )


class RestaurantReviewSerializer(serializers.ModelSerializer):
    """Lecture d'un avis (client partiellement anonymisé)."""

    client_name = serializers.SerializerMethodField()
    is_verified_purchase = serializers.BooleanField(read_only=True)

    class Meta:
        model = RestaurantReview
        fields = [
            "id",
            "restaurant",
            "client_name",
            "rating",
            "comment",
            "is_verified_purchase",
            "created_at",
        ]
        read_only_fields = fields

    def get_client_name(self, obj) -> str:
        """Prénom + initiale (ex. 'Alex B.') pour ne pas exposer l'identité complète."""
        user = obj.client
        first = (getattr(user, "first_name", "") or "").strip()
        last = (getattr(user, "last_name", "") or "").strip()
        if first and last:
            return f"{first} {last[0]}."
        if first:
            return first
        return "Client"


class RestaurantReviewCreateSerializer(serializers.ModelSerializer):
    """
    Création / mise à jour d'un avis par le client authentifié.

    À la création :
      - refuse si le client a déjà noté ce restaurant ;
      - refuse si le client n'a aucune commande qualifiante (achat vérifié) ;
      - rattache automatiquement la commande justificative.
    """

    # `order` accepté mais optionnel : s'il est fourni il est validé, sinon on
    # rattache automatiquement la dernière commande éligible.
    order = serializers.PrimaryKeyRelatedField(
        queryset=Order.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = RestaurantReview
        fields = ["id", "restaurant", "order", "rating", "comment"]
        read_only_fields = ["id"]

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("La note doit être comprise entre 1 et 5.")
        return value

    def validate(self, data):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        # ── Mise à jour : on ne touche qu'à rating/comment. La vérification
        #    d'achat a déjà eu lieu à la création. ──────────────────────────
        if self.instance is not None:
            data.pop("restaurant", None)
            data.pop("order", None)
            return data

        # ── Création ──────────────────────────────────────────────────────
        restaurant = data.get("restaurant")
        if restaurant is None:
            raise serializers.ValidationError({"restaurant": "Restaurant requis."})

        # 1 avis par client / restaurant.
        if user is not None and RestaurantReview.objects.filter(
            restaurant=restaurant, client=user
        ).exists():
            raise serializers.ValidationError(
                "Vous avez déjà laissé un avis pour ce restaurant."
            )

        provided_order = data.get("order")
        if provided_order is not None:
            # La commande fournie doit appartenir au client, viser ce restaurant
            # et être qualifiante.
            if user is not None and provided_order.user_id not in (None, user.id):
                raise serializers.ValidationError({"order": "Cette commande ne vous appartient pas."})
            if provided_order.restaurant_id != restaurant.id:
                raise serializers.ValidationError(
                    {"order": "La commande ne correspond pas à ce restaurant."}
                )
            is_qualifying = (
                Order.objects.filter(pk=provided_order.pk)
                .filter(QUALIFYING_ORDER_FILTER)
                .exclude(status="cancelled")
                .exists()
            )
            if not is_qualifying:
                raise serializers.ValidationError(
                    {"order": "Cette commande ne permet pas encore de laisser un avis."}
                )
            order = provided_order
        else:
            # Rattachement automatique de la dernière commande éligible.
            order = latest_qualifying_order(user, restaurant)

        if order is None:
            raise serializers.ValidationError(
                "Seuls les clients ayant commandé dans ce restaurant peuvent laisser un avis."
            )

        data["order"] = order
        return data


class SiretEnrichmentRequestSerializer(serializers.Serializer):
    """Entrée de l'endpoint d'enrichissement SIRET."""

    siret = serializers.CharField(max_length=14)

    def validate_siret(self, value):
        cleaned = (value or "").strip().replace(" ", "")
        if not cleaned.isdigit() or len(cleaned) != 14:
            raise serializers.ValidationError("Le SIRET doit contenir exactement 14 chiffres.")
        return cleaned