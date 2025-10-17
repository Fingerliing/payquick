from django.urls import path
from api.views.legal_views import (
    record_legal_consent,
    get_legal_consent,
    export_user_data,
    request_data_export,
    request_account_deletion,
    cancel_account_deletion,
    get_legal_documents,
)

urlpatterns = [
    # Consentement
    path('consent/', record_legal_consent, name='record-legal-consent'),
    path('consent/status/', get_legal_consent, name='get-legal-consent'),
    
    # Export de données (RGPD Article 20)
    path('data/export/', export_user_data, name='export-user-data'),
    path('data/request-export/', request_data_export, name='request-data-export'),
    
    # Suppression de compte (RGPD Article 17)
    path('account/delete/', request_account_deletion, name='request-account-deletion'),
    path('account/cancel-deletion/', cancel_account_deletion, name='cancel-account-deletion'),
    
    # Récupération des documents légaux (optionnel)
    path('documents/', get_legal_documents, name='get-legal-documents'),
]