import os
from pathlib import Path
from decouple import config, Csv
import dj_database_url
from datetime import timedelta
import socket

BASE_DIR = Path(__file__).resolve().parent.parent

# Fonction pour obtenir l'IP locale
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return '127.0.0.1'

LOCAL_IP = get_local_ip()

# ✅ CONFIGURATION REDIS ADAPTATIVE
def get_redis_config():
    """Configuration Redis adaptative selon l'environnement"""
    # Si on est dans Docker (variable d'environnement ou nom d'hôte détecté)
    if os.environ.get('DOCKER_ENV') or os.path.exists('/.dockerenv'):
        return {
            'default': {
                'BACKEND': 'channels_redis.core.RedisChannelLayer',
                'CONFIG': {
                    "hosts": [('redis', 6379)],  # ✅ Nom du service Docker
                },
            },
        }
    else:
        # Développement local
        return {
            'default': {
                'BACKEND': 'channels_redis.core.RedisChannelLayer',
                'CONFIG': {
                    "hosts": [('127.0.0.1', 6379)],  # ✅ Local
                },
            },
        }

# CORS Configuration pour l'app mobile
CORS_ALLOWED_ORIGINS = [
    "http://localhost:19006",  # Expo web
    f"http://{LOCAL_IP}:19006",
    "http://localhost:8081",   # Metro bundler
    f"http://{LOCAL_IP}:8081",
    # Ajoutez d'autres origines si nécessaire
]

# Sécurité
SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", cast=bool, default=False)
ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    LOCAL_IP,
    '0.0.0.0',
    '192.168.1.163',
    '192.168.1.129',
    '192.168.1.26',
    # Ajoutez votre domaine en production
]

# Apps Django
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "api",
    "rest_framework",
    "rest_framework_simplejwt",
    'rest_framework.authtoken',
    "drf_spectacular",
    "corsheaders",
    "storages",
    "channels",  # ✅ Pour WebSocket support
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ✅ CONFIGURATION ASGI POUR WEBSOCKETS
WSGI_APPLICATION = "backend.wsgi.application"
ASGI_APPLICATION = 'backend.asgi.application'

# PostgreSQL Docker Ready
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'eatquicker',
        'USER': 'eatuser',
        'PASSWORD': 'eatpass',
        'HOST': 'db',
        'PORT': '5432',
    }
}

# Internationalisation
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

# Static & Media
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'static'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# S3 Storage pour fichiers sensibles (Kbis, QR, etc)
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="eu-west-3")

if AWS_STORAGE_BUCKET_NAME:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_QUERYSTRING_AUTH = False

# Auth REST
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
}

import sys
if 'test' in sys.argv:
    REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []
    REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=7),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
}

# Documentation auto DRF Spectacular
SPECTACULAR_SETTINGS = {
    'TITLE': 'Eat & Go API',
    'DESCRIPTION': 'SaaS Restaurant Backend',
    'VERSION': '1.0.0',
}

ACCOUNTING_SETTINGS = {
    'TVA_RATES': {...},
    'FEC_EXPORT_PATH': 'exports/fec/',
}

# Stripe
STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET")
DOMAIN = config("DOMAIN")

# Sirene API + Recaptcha
SIRENE_API_TOKEN = config("SIRENE_API_TOKEN")
RECAPTCHA_SECRET_KEY = config("RECAPTCHA_SECRET_KEY")
RECAPTCHA_SCORE_THRESHOLD = config("RECAPTCHA_SCORE_THRESHOLD", default=0.5, cast=float)

# CORS (en prod => restreindre)
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# SWAGGER
SWAGGER_USE_COMPAT_RENDERERS = False

# ✅ LOGS AMÉLIORÉS POUR WEBSOCKETS
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': 'stripe_logs.log',
        },
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'api.views.stripe_connect': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': True,
        },
        'api.consumers': {  # ✅ Logs pour WebSocket consumers
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'api.signals': {  # ✅ Logs pour les signaux
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'channels': {  # ✅ Logs pour Django Channels
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
    },
}

CHANNEL_LAYERS = get_redis_config()

import mimetypes
# Configurer le type MIME pour WebP
mimetypes.add_type("image/webp", ".webp")

# Email
if DEBUG:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
else:
    # For production - configure with your email provider
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
    EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
    EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
    EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
    EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')

DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@eatquicker.com')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Twilio Configuration
TWILIO_ACCOUNT_SID = config("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = config("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = config("TWILIO_PHONE_NUMBER")
TWILIO_VERIFY_SERVICE_SID = config('TWILIO_VERIFY_SERVICE_SID')

# SMS Verification
SMS_CODE_EXPIRY_MINUTES = 10
SMS_MAX_ATTEMPTS = 3
SMS_RESEND_COOLDOWN_SECONDS = 60
REGISTRATION_TEMP_DATA_EXPIRY_MINUTES = 30