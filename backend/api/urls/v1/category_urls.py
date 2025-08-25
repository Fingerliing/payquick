from django.urls import path
from rest_framework.routers import DefaultRouter
from api.views.category_views import MenuCategoryViewSet, MenuSubCategoryViewSet

# Router pour les APIs catégories (privées - restaurateurs authentifiés)
router = DefaultRouter()
router.register(r'categories', MenuCategoryViewSet, basename='categories')
router.register(r'subcategories', MenuSubCategoryViewSet, basename='subcategories')

# Vues spécifiques basées sur les actions des ViewSets
categories_by_restaurant_view = MenuCategoryViewSet.as_view({'get': 'by_restaurant'})
category_statistics_view = MenuCategoryViewSet.as_view({'get': 'statistics'})
category_reorder_view = MenuCategoryViewSet.as_view({'post': 'reorder'})
subcategory_reorder_view = MenuSubCategoryViewSet.as_view({'post': 'reorder'})

urlpatterns = [
    # URLs spécifiques pour des actions personnalisées
    path('categories/restaurant/<uuid:restaurant_id>/', categories_by_restaurant_view, name='categories-by-restaurant'),
    path('categories/statistics/', category_statistics_view, name='categories-statistics'),
    path('categories/reorder/', category_reorder_view, name='categories-reorder'),
    path('subcategories/reorder/', subcategory_reorder_view, name='subcategories-reorder'),
]

# Ajouter les routes du router (CRUD standard)
urlpatterns += router.urls