"""
Modèles Accounting pour EatQuickeR
"""
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from celery import shared_task
import uuid
import random
import string


class ComptabiliteSettings(models.Model):
    """Configuration comptable du restaurateur"""
    
    restaurateur = models.OneToOneField(
        'RestaurateurProfile', 
        on_delete=models.CASCADE,
        related_name='comptabilite_settings'
    )
    
    # Numérotation des factures
    invoice_prefix = models.CharField(
        max_length=10, 
        default='FACT',
        help_text="Préfixe des numéros de facture"
    )
    last_invoice_number = models.PositiveIntegerField(default=0)
    invoice_year_reset = models.BooleanField(
        default=True,
        help_text="Réinitialiser la numérotation chaque année"
    )
    
    # Configuration TVA
    tva_regime = models.CharField(
        max_length=20,
        choices=[
            ('normal', 'Régime normal'),
            ('simplifie', 'Régime simplifié'),
            ('franchise', 'Franchise TVA'),
        ],
        default='normal'
    )
    
    # Configuration exports
    export_format_default = models.CharField(
        max_length=10,
        choices=[
            ('FEC', 'Format FEC'),
            ('CSV', 'Format CSV'),
            ('PDF', 'Format PDF'),
        ],
        default='FEC'
    )
    
    # Informations légales
    siret = models.CharField(max_length=14, blank=True)
    tva_intracommunautaire = models.CharField(max_length=20, blank=True)
    code_naf = models.CharField(max_length=10, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'comptabilite_settings'
        verbose_name = 'Configuration comptable'



class FactureSequence(models.Model):
    """Gestion de la séquence des numéros de facture"""
    
    restaurateur = models.ForeignKey(
        'RestaurateurProfile',
        on_delete=models.CASCADE,
        related_name='facture_sequences'
    )
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)
    
    class Meta:
        db_table = 'facture_sequences'
        unique_together = ['restaurateur', 'year', 'month']
        indexes = [
            models.Index(fields=['restaurateur', 'year', 'month']),
        ]
    
    def get_next_number(self):
        """Génère le prochain numéro de facture"""
        self.last_number += 1
        self.save()
        return self.last_number



class EcritureComptable(models.Model):
    """Écriture comptable pour le FEC"""
    
    restaurateur = models.ForeignKey(
        'RestaurateurProfile',
        on_delete=models.CASCADE,
        related_name='ecritures_comptables'
    )
    
    # Champs obligatoires FEC
    journal_code = models.CharField(max_length=10, default='VE')  # VE = Ventes
    ecriture_num = models.CharField(max_length=20, unique=True)
    ecriture_date = models.DateField()
    compte_num = models.CharField(max_length=20)  # Ex: 70100 pour ventes
    compte_lib = models.CharField(max_length=255)  # Libellé du compte
    
    piece_ref = models.CharField(max_length=50)  # Référence facture
    piece_date = models.DateField()
    
    debit = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=Decimal('0.00')
    )
    credit = models.DecimalField(
        max_digits=10,
        decimal_places=2, 
        default=Decimal('0.00')
    )
    
    ecriture_lib = models.CharField(max_length=255)  # Libellé écriture
    
    # Champs additionnels
    order = models.ForeignKey(
        'Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    stripe_payment_id = models.CharField(max_length=100, blank=True)
    tva_taux = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ecritures_comptables'
        indexes = [
            models.Index(fields=['restaurateur', 'ecriture_date']),
            models.Index(fields=['piece_ref']),
        ]
        ordering = ['ecriture_date', 'ecriture_num']



class RecapitulatifTVA(models.Model):
    """Récapitulatif TVA mensuel"""
    
    restaurateur = models.ForeignKey(
        'RestaurateurProfile',
        on_delete=models.CASCADE,
        related_name='recapitulatifs_tva'
    )
    
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    
    # Chiffre d'affaires
    ca_ht = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    ca_ttc = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # TVA par taux
    tva_5_5_base = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    tva_5_5_montant = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    tva_10_base = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    tva_10_montant = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    tva_20_base = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    tva_20_montant = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Total TVA
    tva_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Statistiques
    nombre_factures = models.PositiveIntegerField(default=0)
    ticket_moyen = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Stripe
    commissions_stripe = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    virements_stripe = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'recapitulatifs_tva'
        unique_together = ['restaurateur', 'year', 'month']
        indexes = [
            models.Index(fields=['restaurateur', 'year', 'month']),
        ]



class ExportComptable(models.Model):
    """Historique des exports comptables"""
    
    restaurateur = models.ForeignKey(
        'RestaurateurProfile',
        on_delete=models.CASCADE,
        related_name='exports_comptables'
    )
    
    type_export = models.CharField(
        max_length=20,
        choices=[
            ('FEC', 'Fichier FEC'),
            ('CSV', 'Export CSV'),
            ('PDF', 'Rapport PDF'),
            ('TVA', 'Déclaration TVA'),
            ('RECETTES', 'Livre de recettes'),
        ]
    )
    
    periode_debut = models.DateField()
    periode_fin = models.DateField()
    
    fichier_url = models.URLField(max_length=500, blank=True)
    fichier_nom = models.CharField(max_length=255)
    fichier_taille = models.PositiveIntegerField(default=0)  # En bytes
    
    statut = models.CharField(
        max_length=20,
        choices=[
            ('en_cours', 'En cours'),
            ('complete', 'Complété'),
            ('erreur', 'Erreur'),
        ],
        default='en_cours'
    )
    
    message_erreur = models.TextField(blank=True)
    
    # Métadonnées
    nombre_lignes = models.PositiveIntegerField(default=0)
    checksum_md5 = models.CharField(max_length=32, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        null=True,
        help_text="Date d'expiration du lien de téléchargement"
    )
    
    class Meta:
        db_table = 'exports_comptables'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurateur', 'created_at']),
            models.Index(fields=['type_export', 'statut']),
        ]
