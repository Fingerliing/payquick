from rest_framework import serializers

class GuestItemSerializer(serializers.ModelSerializer):
    menu_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    options = serializers.JSONField(required=False)

class GuestPrepareSerializer(serializers.ModelSerializer):
    restaurant_id = serializers.IntegerField()
    table_number = serializers.CharField(required=False, allow_blank=True)
    items = GuestItemSerializer(many=True)
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.RegexField(r"^(\+33|0)[1-9]\d{8}$")  # FR, aligné à ton validateur
    email = serializers.EmailField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=["online","cash"])
    consent = serializers.BooleanField()

class GuestPrepareResponse(serializers.ModelSerializer):
    draft_order_id = serializers.UUIDField()
    amount = serializers.IntegerField()     # centimes
    currency = serializers.CharField()
    payment_intent_client_secret = serializers.CharField(
        allow_null=True, required=False
    )

class DraftStatusQuery(serializers.ModelSerializer):
    draft_order_id = serializers.UUIDField()

class DraftStatusResponse(serializers.ModelSerializer):
    status = serializers.CharField()
    order_id = serializers.IntegerField(allow_null=True)