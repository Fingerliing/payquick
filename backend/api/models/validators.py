"""
Fonctions de validation pour les modèles
"""
import re
from django.core.exceptions import ValidationError

def validate_siret(value):
    if not value.isdigit():
        raise ValidationError("Le SIRET doit contenir uniquement des chiffres.")
    if len(value) != 14:
        raise ValidationError("Le SIRET doit contenir exactement 14 chiffres.")

def validate_phone(value):
    # Simple validation pour le téléphone français
    import re
    pattern = r'^(\+33|0)[1-9](\d{8})$'
    if not re.match(pattern, value.replace(' ', '').replace('.', '').replace('-', '')):
        raise ValidationError("Format de téléphone invalide")

