"""
Package models pour EatQuickeR
Imports de tous les modèles pour faciliter leur utilisation
"""

# Validators
from .validators import validate_siret, validate_phone

# User & Profile
from .user_models import (
    RestaurateurProfile,
    ClientProfile
)

# Restaurant & Configuration
from .restaurant_models import (
    Restaurant,
    OpeningPeriod,
    OpeningHours,
    RestaurantHoursTemplate
)

# Menu & Items
from .menu_models import (
    Menu,
    MenuCategory,
    MenuSubCategory,
    MenuItem,
    TableSession,
    default_expires_at,
    DraftOrder,
    DailyMenu,
    DailyMenuItem,
    DailyMenuTemplate,
    DailyMenuTemplateItem
)

# Tables
from .table_models import Table

# Orders
from .order_models import (
    OrderManager,
    Order,
    OrderItem
)

# Collaborative Sessions
from .collaborative_models import (
    ActiveSessionManager,
    CollaborativeTableSession,
    SessionParticipant
)

# Payment
from .payment_models import (
    SplitPaymentSession,
    SplitPaymentPortion
)

# Authentication
from .authentication_models import (
    PhoneVerification,
    PendingRegistration,
    cleanup_expired_registrations
)

# Legal & RGPD
from .legal_models import (
    LegalConsent,
    AccountDeletionRequest,
    DataAccessLog
)

# Accounting
from .accounting_models import (
    ComptabiliteSettings,
    FactureSequence,
    EcritureComptable,
    RecapitulatifTVA,
    ExportComptable
)

__all__ = [
    # Validators
    'validate_siret',
    'validate_phone',
    
    # User & Profile
    'RestaurateurProfile',
    'ClientProfile',
    
    # Restaurant & Configuration
    'Restaurant',
    'OpeningPeriod',
    'OpeningHours',
    'RestaurantHoursTemplate',
    
    # Menu & Items
    'Menu',
    'MenuCategory',
    'MenuSubCategory',
    'MenuItem',
    'TableSession',
    'default_expires_at',
    'DraftOrder',
    'DailyMenu',
    'DailyMenuItem',
    'DailyMenuTemplate',
    'DailyMenuTemplateItem',
    
    # Tables
    'Table',
    
    # Orders
    'OrderManager',
    'Order',
    'OrderItem',
    
    # Collaborative Sessions
    'ActiveSessionManager',
    'CollaborativeTableSession',
    'SessionParticipant',
    
    # Payment
    'SplitPaymentSession',
    'SplitPaymentPortion',
    
    # Authentication
    'PhoneVerification',
    'PendingRegistration',
    'cleanup_expired_registrations',
    
    # Legal & RGPD
    'LegalConsent',
    'AccountDeletionRequest',
    'DataAccessLog',
    
    # Accounting
    'ComptabiliteSettings',
    'FactureSequence',
    'EcritureComptable',
    'RecapitulatifTVA',
    'ExportComptable',
]
