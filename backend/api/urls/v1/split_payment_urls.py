from django.urls import path
from api.views.split_payment_views import (
    CreateSplitPaymentSessionView,
    GetSplitPaymentSessionView,
    PayPortionView,
    ConfirmPortionPaymentView,
    PayRemainingPortionsView,
    ConfirmRemainingPaymentsView,
    SplitPaymentStatusView,
    CompleteSplitPaymentView,
    SplitPaymentHistoryView,
    ClaimItemView,
    UnclaimItemView,
)

urlpatterns = [
    # Gestion des sessions
    path('create/<int:order_id>/', CreateSplitPaymentSessionView.as_view(), name='create-split-session'),
    path('session/<int:order_id>/', GetSplitPaymentSessionView.as_view(), name='get-split-session'),
    
    # Mode `items` — claim/unclaim d'articles
    path('claim/<int:order_id>/', ClaimItemView.as_view(), name='claim-item'),
    path('unclaim/<int:order_id>/', UnclaimItemView.as_view(), name='unclaim-item'),

    # Paiement des portions individuelles
    path('pay-portion/<int:order_id>/', PayPortionView.as_view(), name='pay-portion'),
    path('confirm-portion/<int:order_id>/', ConfirmPortionPaymentView.as_view(), name='confirm-portion'),
    
    # Paiement du montant restant
    path('pay-remaining/<int:order_id>/', PayRemainingPortionsView.as_view(), name='pay-remaining'),
    path('confirm-remaining/<int:order_id>/', ConfirmRemainingPaymentsView.as_view(), name='confirm-remaining'),
    
    # Statut et finalisation
    path('status/<int:order_id>/', SplitPaymentStatusView.as_view(), name='split-payment-status'),
    path('complete/<int:order_id>/', CompleteSplitPaymentView.as_view(), name='complete-split-payment'),
    
    # Historique
    path('history/<int:order_id>/', SplitPaymentHistoryView.as_view(), name='split-payment-history'),
]