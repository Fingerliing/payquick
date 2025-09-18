from rest_framework import serializers
from api.models import SplitPaymentSession, SplitPaymentPortion, Order
from decimal import Decimal

class SplitPaymentPortionSerializer(serializers.ModelSerializer):
    """Serializer pour les portions de paiement divisé"""
    class Meta:
        model = SplitPaymentPortion
        fields = [
            'id', 'name', 'amount', 'is_paid', 'payment_intent_id', 
            'payment_method', 'paid_at', 'created_at'
        ]
        read_only_fields = ['id', 'is_paid', 'payment_intent_id', 'paid_at', 'created_at']

    def validate_amount(self, value):
        """Valider que le montant est positif"""
        if value <= 0:
            raise serializers.ValidationError("Le montant doit être positif")
        if value > 9999.99:
            raise serializers.ValidationError("Le montant ne peut pas dépasser 9999.99€")
        return value


class CreateSplitPaymentPortionSerializer(serializers.Serializer):
    """Serializer pour créer une portion"""
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le montant doit être positif")
        return value


class SplitPaymentSessionSerializer(serializers.ModelSerializer):
    """Serializer pour les sessions de paiement divisé"""
    
    portions = SplitPaymentPortionSerializer(many=True, read_only=True)
    is_completed = serializers.ReadOnlyField()
    total_paid = serializers.ReadOnlyField()
    remaining_amount = serializers.ReadOnlyField()
    remaining_portions_count = serializers.ReadOnlyField()

    class Meta:
        model = SplitPaymentSession
        fields = [
            'id', 'order', 'split_type', 'total_amount', 'tip_amount', 
            'status', 'created_at', 'completed_at', 'portions',
            'is_completed', 'total_paid', 'remaining_amount', 'remaining_portions_count'
        ]
        read_only_fields = [
            'id', 'created_at', 'completed_at', 'portions',
            'is_completed', 'total_paid', 'remaining_amount', 'remaining_portions_count'
        ]


class CreateSplitPaymentSessionSerializer(serializers.Serializer):
    """Serializer pour créer une session de paiement divisé"""
    
    SPLIT_TYPE_CHOICES = [('equal', 'Équitable'), ('custom', 'Personnalisé')]
    
    split_type = serializers.ChoiceField(choices=SPLIT_TYPE_CHOICES)
    tip_amount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0, required=False)
    portions = CreateSplitPaymentPortionSerializer(many=True)

    def validate_portions(self, value):
        """Valider les portions"""
        if len(value) < 2:
            raise serializers.ValidationError("Il faut au moins 2 portions")
        if len(value) > 20:
            raise serializers.ValidationError("Maximum 20 portions autorisées")
        return value

    def validate(self, data):
        """Validation croisée"""
        # Récupérer la commande depuis le contexte
        order = self.context.get('order')
        if not order:
            raise serializers.ValidationError("Commande non trouvée")

        # Vérifier que la commande n'est pas déjà payée
        if order.payment_status in ['paid', 'partial_paid']:
            raise serializers.ValidationError("Cette commande a déjà un paiement en cours")

        # Vérifier que le total des portions correspond au montant de la commande + pourboire
        total_portions = sum(Decimal(str(p['amount'])) for p in data['portions'])
        order_total = Decimal(str(order.total_amount))
        tip_amount = data.get('tip_amount', Decimal('0'))
        expected_total = order_total + tip_amount

        # Tolérance de 0.01€ pour les erreurs d'arrondi
        if abs(total_portions - expected_total) > Decimal('0.01'):
            raise serializers.ValidationError(
                f"Le total des portions ({total_portions}€) ne correspond pas au montant "
                f"de la commande + pourboire ({expected_total}€)"
            )

        return data


class PayPortionSerializer(serializers.Serializer):
    """Serializer pour payer une portion"""
    portion_id = serializers.UUIDField()

    def validate_portion_id(self, value):
        # Vérifier que la portion existe et n'est pas déjà payée
        try:
            portion = SplitPaymentPortion.objects.get(id=value)
        except SplitPaymentPortion.DoesNotExist:
            raise serializers.ValidationError("Portion non trouvée")
        
        if portion.is_paid:
            raise serializers.ValidationError("Cette portion est déjà payée")
            
        return value


class ConfirmPortionPaymentSerializer(serializers.Serializer):
    """Serializer pour confirmer le paiement d'une portion"""
    portion_id = serializers.UUIDField()
    payment_intent_id = serializers.CharField(max_length=255)
    payment_method = serializers.CharField(max_length=50, default='online')


class SplitPaymentStatusSerializer(serializers.Serializer):
    """Serializer pour le statut du paiement divisé"""
    is_completed = serializers.BooleanField()
    remaining_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    remaining_portions = serializers.IntegerField()
    total_paid = serializers.DecimalField(max_digits=10, decimal_places=2)
    progress_percentage = serializers.FloatField()


class PaymentHistorySerializer(serializers.Serializer):
    """Serializer pour l'historique des paiements"""
    portions = SplitPaymentPortionSerializer(many=True)
    total_paid = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_remaining = serializers.DecimalField(max_digits=10, decimal_places=2)