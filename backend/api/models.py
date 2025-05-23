from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError

def validate_siret(value):
    if not value.isdigit():
        raise ValidationError("Le SIRET doit contenir uniquement des chiffres.")
    if len(value) != 14:
        raise ValidationError("Le SIRET doit contenir exactement 14 chiffres.")

class Restaurant(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    address = models.CharField(max_length=255, default='Adresse temporaire')
    siret = models.CharField(
        max_length=14,
        validators=[validate_siret],
        unique=True,
        help_text="Numéro SIRET à 14 chiffres",
    )

    def __str__(self):
        return f"{self.name} ({self.owner.username})"

class Menu(models.Model):
    name = models.CharField(max_length=100)
    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name='menu')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Menu de {self.restaurant.name}"

class MenuItem(models.Model):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=6, decimal_places=2)
    category = models.CharField(max_length=50)  # Entrée, Plat, Dessert, etc.
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.price}€"

class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.user.username} - {self.phone}"
    
class RestaurateurProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="restaurateur_profile")
    siret = models.CharField(max_length=14, unique=True)
    id_card = models.FileField(upload_to="documents/id_cards/")
    kbis = models.FileField(upload_to="documents/kbis/")
    is_validated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.siret}"

class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('in_progress', 'En cours'),
        ('served', 'Servie'),
    ]

    restaurateur = models.ForeignKey(
        RestaurateurProfile,
        on_delete=models.CASCADE,
        related_name='orders'
    )
    table_number = models.PositiveIntegerField()
    items = models.JSONField()  # exemple : [{"name": "Pizza", "quantity": 2}]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    is_paid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Table {self.table_number} - {self.get_status_display()} - {'Payée' if self.is_paid else 'Non payée'}"