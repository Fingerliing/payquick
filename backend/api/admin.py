from django.contrib import admin
from .models import Restaurant, RestaurateurProfile, MenuCategory, MenuSubCategory, DailyMenu, DailyMenuItem, DailyMenuTemplate

class RestaurantAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'owner_stripe_validated', 'is_stripe_active', 'can_receive_orders')
    list_filter = ('is_stripe_active', 'owner__stripe_verified')
    search_fields = ('name', 'owner__user__username', 'owner__siret')
    
    def owner_stripe_validated(self, obj):
        return obj.owner.stripe_verified
    owner_stripe_validated.boolean = True
    owner_stripe_validated.short_description = 'Propriétaire validé Stripe'
    
    def can_receive_orders(self, obj):
        return obj.can_receive_orders
    can_receive_orders.boolean = True
    can_receive_orders.short_description = 'Peut recevoir des commandes'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('owner', 'owner__user')

@admin.register(RestaurateurProfile)
class RestaurateurProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'siret', 'stripe_verified', 'stripe_onboarding_completed', 'is_active', 'created_at')
    list_filter = ('stripe_verified', 'stripe_onboarding_completed', 'is_validated', 'is_active', 'created_at')
    search_fields = ('user__username', 'user__email', 'user__first_name', 'siret')
    readonly_fields = ('created_at', 'stripe_account_created')
    
    fieldsets = (
        ('Informations utilisateur', {
            'fields': ('user',)
        }),
        ('Informations business', {
            'fields': ('siret',)
        }),
        ('Statuts', {
            'fields': ('is_validated', 'is_active')
        }),
        ('Stripe Connect', {
            'fields': ('stripe_account_id', 'stripe_verified', 'stripe_onboarding_completed', 'stripe_account_created'),
            'classes': ('collapse',)
        }),
        ('Dates', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')
    
@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'restaurant', 'is_active', 'order', 'subcategories_count']
    list_filter = ['is_active', 'restaurant', 'created_at']
    search_fields = ['name', 'restaurant__name']
    ordering = ['restaurant', 'order', 'name']
    list_editable = ['is_active', 'order']
    
    fieldsets = (
        ('Informations de base', {
            'fields': ('restaurant', 'name', 'description')
        }),
        ('Apparence', {
            'fields': ('icon', 'color')
        }),
        ('Gestion', {
            'fields': ('is_active', 'order')
        }),
    )
    
    def subcategories_count(self, obj):
        return obj.subcategories.count()
    subcategories_count.short_description = 'Sous-catégories'


@admin.register(MenuSubCategory)
class MenuSubCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'restaurant_name', 'is_active', 'order']
    list_filter = ['is_active', 'category__restaurant', 'created_at']
    search_fields = ['name', 'category__name', 'category__restaurant__name']
    ordering = ['category', 'order', 'name']
    list_editable = ['is_active', 'order']
    
    def restaurant_name(self, obj):
        return obj.category.restaurant.name
    restaurant_name.short_description = 'Restaurant'

@admin.register(DailyMenu)
class DailyMenuAdmin(admin.ModelAdmin):
    list_display = ['restaurant', 'title', 'date', 'is_active', 'total_items_count', 'created_at']
    list_filter = ['is_active', 'date', 'restaurant']
    search_fields = ['title', 'restaurant__name']
    ordering = ['-date', '-created_at']
    
    fieldsets = [
        ('Informations principales', {
            'fields': ['restaurant', 'date', 'title', 'description']
        }),
        ('Configuration', {
            'fields': ['is_active', 'special_price']
        }),
        ('Métadonnées', {
            'fields': ['created_by'],
            'classes': ['collapse']
        })
    ]

@admin.register(DailyMenuItem)
class DailyMenuItemAdmin(admin.ModelAdmin):
    list_display = ['daily_menu', 'menu_item', 'effective_price', 'is_available', 'display_order']
    list_filter = ['is_available', 'daily_menu__date', 'daily_menu__restaurant']
    search_fields = ['menu_item__name', 'daily_menu__title']

@admin.register(DailyMenuTemplate)
class DailyMenuTemplateAdmin(admin.ModelAdmin):
    list_display = ['restaurant', 'name', 'day_of_week', 'usage_count', 'is_active']
    list_filter = ['is_active', 'day_of_week', 'restaurant']
    search_fields = ['name', 'restaurant__name']