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

WSGI_APPLICATION = "backend.wsgi.application"

# PostgreSQL Docker Ready
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'eatandgo',
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

    # "DEFAULT_THROTTLE_CLASSES": [
    #     "rest_framework.throttling.UserRateThrottle",
    #     "rest_framework.throttling.AnonRateThrottle",
    #     "api.throttles.QRCodeThrottle",
    #     "api.throttles.RegisterThrottle",
    #     "api.throttles.StripeCheckoutThrottle"
    # ],
    # "DEFAULT_THROTTLE_RATES": {
    #     "user": "1000/day",
    #     "anon": "50/hour",#TODO: remettre la limitation
    # },
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

#SWAGGER
SWAGGER_USE_COMPAT_RENDERERS = False

# LOGS
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': 'stripe_logs.log',
        },
        'console': {  # ← tout vers la console Docker
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',  # Tu peux mettre DEBUG pour plus de détails
    },
    'loggers': {
        'api.views.stripe_connect': {
            'handlers': ['file', 'console'],
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
            'level': 'ERROR',  # Affiche les erreurs 500, etc.
            'propagate': False,
        },
    },
}

import mimetypes

# Configurer le type MIME pour WebP
mimetypes.add_type("image/webp", ".webp")