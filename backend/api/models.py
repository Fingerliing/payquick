from django.db import models
from django.contrib.auth.models import User

class Restaurant(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    latitude = models.FloatField()
    longitude = models.FloatField()

    def __str__(self):
        return f"{self.name} ({self.owner.username})"

class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=10)

    def __str__(self):
        return self.user.username
    
class RestaurateurProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="restaurateur_profile")
    siret = models.CharField(max_length=14, unique=True)
    id_card = models.FileField(upload_to="documents/id_cards/")
    kbis = models.FileField(upload_to="documents/kbis/")
    is_validated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.siret}"


