from django.urls import path
from api.views.guest_views import GuestPrepare, GuestConfirmCash, GuestDraftStatus

urlpatterns = [
    path("prepare/", GuestPrepare.as_view()),
    path("confirm-cash/", GuestConfirmCash.as_view()),
    path("status/", GuestDraftStatus.as_view()),
]
