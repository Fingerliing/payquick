import factory
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from api.models import (
    RestaurateurProfile,
    Restaurant,
    Menu,
    MenuItem,
    Table,
    Order,
    OrderItem,
)

User = get_user_model()

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    password = factory.PostGenerationMethodCall("set_password", "testpass")

class RestaurateurProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = RestaurateurProfile

    user = factory.SubFactory(UserFactory)
    siret = factory.Sequence(lambda n: f"1234567890{n:04}")

    @factory.post_generation
    def add_to_restaurateur_group(self, create, extracted, **kwargs):
        if not create:
            return
        group, _ = Group.objects.get_or_create(name="restaurateur")
        self.user.groups.add(group)

class RestaurantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Restaurant

    name = factory.Sequence(lambda n: f"Restaurant {n}")
    siret = factory.Sequence(lambda n: f"1234567890{n:04}")
    owner = factory.SubFactory(RestaurateurProfileFactory)

class MenuFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Menu

    name = factory.Sequence(lambda n: f"Menu {n}")
    restaurant = factory.SubFactory(RestaurantFactory)

class MenuItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MenuItem

    name = factory.Sequence(lambda n: f"Item {n}")
    price = 9.99
    menu = factory.SubFactory(MenuFactory)
    is_available = True

class TableFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Table

    identifiant = factory.Sequence(lambda n: f"TBL{n:03}")
    restaurant = factory.SubFactory(RestaurantFactory)

class OrderFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Order

    restaurant = factory.SubFactory(RestaurantFactory)
    table = factory.SubFactory(TableFactory)
    restaurateur = factory.LazyAttribute(lambda o: o.restaurant.owner)
    status = "pending"
    is_paid = False

class OrderItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = OrderItem

    order = factory.SubFactory(OrderFactory)
    menu_item = factory.SubFactory(MenuItemFactory)
    quantity = 1