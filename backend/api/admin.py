from django.contrib import admin
from .models import Restaurant, RestaurateurProfile

@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ("name", "owner")
    search_fields = ("name", "owner__username")

@admin.register(RestaurateurProfile)
class RestaurateurProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "siret", "created_at")
    search_fields = ("user__username", "siret")
    readonly_fields = ("created_at",)
    list_filter = ("created_at",)
    ordering = ("-created_at",)