from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
import stripe
import csv
import io
import hashlib
from drf_spectacular.utils import extend_schema, OpenApiParameter
from django.http import HttpResponse
from api.models import (
    ComptabiliteSettings, 
    EcritureComptable,
    RecapitulatifTVA,
    ExportComptable,
    FactureSequence
)
from api.serializers.comptabilite_serializers import (
    ComptabiliteSettingsSerializer,
    EcritureComptableSerializer,
    RecapitulatifTVASerializer,
    ExportComptableSerializer,
    FactureSequenceSerializer
)
from api.utils.fec_generator import FECGenerator, PDFReportGenerator


class ComptabiliteViewSet(viewsets.ViewSet):
    """
    ViewSet pour la gestion comptable
    """
    permission_classes = [IsAuthenticated]
    
    def get_restaurateur(self):
        """Récupère le profil restaurateur de l'utilisateur connecté"""
        return self.request.user.restaurateur_profile
    
    @extend_schema(
        summary="Dashboard comptabilité",
        description="Vue d'ensemble de la comptabilité avec indicateurs clés",
        parameters=[
            OpenApiParameter(
                name='month',
                type=int,
                description='Mois (1-12)',
                required=False
            ),
            OpenApiParameter(
                name='year',
                type=int,
                description='Année',
                required=False
            ),
        ]
    )
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Dashboard comptabilité avec vue d'ensemble"""
        restaurateur = self.get_restaurateur()
        
        # Récupération de la période
        now = timezone.now()
        month = int(request.GET.get('month', now.month))
        year = int(request.GET.get('year', now.year))
        
        # Dates de début et fin de période
        date_debut = datetime(year, month, 1).date()
        if month == 12:
            date_fin = datetime(year + 1, 1, 1).date() - timedelta(days=1)
        else:
            date_fin = datetime(year, month + 1, 1).date() - timedelta(days=1)
        
        # Récupération ou calcul du récapitulatif TVA
        recap_tva, created = RecapitulatifTVA.objects.get_or_create(
            restaurateur=restaurateur,
            year=year,
            month=month
        )
        
        if created or recap_tva.updated_at < timezone.now() - timedelta(hours=1):
            self._update_recap_tva(recap_tva, date_debut, date_fin)
        
        # Statistiques Stripe
        stripe_stats = self._get_stripe_stats(restaurateur, date_debut, date_fin)
        
        # Derniers exports
        derniers_exports = ExportComptable.objects.filter(
            restaurateur=restaurateur
        ).order_by('-created_at')[:5]
        
        return Response({
            'periode': {
                'mois': month,
                'annee': year,
                'date_debut': date_debut.isoformat(),
                'date_fin': date_fin.isoformat(),
            },
            'chiffre_affaires': {
                'ht': float(recap_tva.ca_ht),
                'ttc': float(recap_tva.ca_ttc),
                'tva_total': float(recap_tva.tva_total),
                'nombre_factures': recap_tva.nombre_factures,
                'ticket_moyen': float(recap_tva.ticket_moyen),
            },
            'tva': {
                'taux_5_5': {
                    'base': float(recap_tva.tva_5_5_base),
                    'montant': float(recap_tva.tva_5_5_montant),
                },
                'taux_10': {
                    'base': float(recap_tva.tva_10_base),
                    'montant': float(recap_tva.tva_10_montant),
                },
                'taux_20': {
                    'base': float(recap_tva.tva_20_base),
                    'montant': float(recap_tva.tva_20_montant),
                },
                'total': float(recap_tva.tva_total),
            },
            'stripe': stripe_stats,
            'exports_recents': [
                {
                    'id': exp.id,
                    'type': exp.type_export,
                    'periode': f"{exp.periode_debut} - {exp.periode_fin}",
                    'statut': exp.statut,
                    'date': exp.created_at.isoformat(),
                    'url': exp.fichier_url if exp.statut == 'complete' else None,
                }
                for exp in derniers_exports
            ],
            'alertes': self._get_alertes_comptables(restaurateur, recap_tva),
        })
    
    @extend_schema(
        summary="Journal des ventes",
        description="Liste des écritures comptables (ventes)",
        parameters=[
            OpenApiParameter(name='date_debut', type=str, required=True),
            OpenApiParameter(name='date_fin', type=str, required=True),
        ]
    )
    @action(detail=False, methods=['get'])
    def journal_ventes(self, request):
        """Récupère le journal des ventes"""
        restaurateur = self.get_restaurateur()
        
        date_debut = datetime.strptime(request.GET['date_debut'], '%Y-%m-%d').date()
        date_fin = datetime.strptime(request.GET['date_fin'], '%Y-%m-%d').date()
        
        ecritures = EcritureComptable.objects.filter(
            restaurateur=restaurateur,
            ecriture_date__gte=date_debut,
            ecriture_date__lte=date_fin,
            journal_code='VE'
        ).order_by('ecriture_date', 'ecriture_num')
        
        return Response({
            'periode': {
                'debut': date_debut.isoformat(),
                'fin': date_fin.isoformat(),
            },
            'ecritures': EcritureComptableSerializer(ecritures, many=True).data,
            'totaux': {
                'debit': float(ecritures.aggregate(Sum('debit'))['debit__sum'] or 0),
                'credit': float(ecritures.aggregate(Sum('credit'))['credit__sum'] or 0),
                'nombre': ecritures.count(),
            }
        })
    
    @extend_schema(
        summary="Export FEC",
        description="Génère le Fichier des Écritures Comptables (format légal)",
        parameters=[
            OpenApiParameter(name='annee', type=int, required=True),
        ]
    )
    @action(detail=False, methods=['post'])
    def export_fec(self, request):
        """Génère un export FEC (Fichier des Écritures Comptables)"""
        restaurateur = self.get_restaurateur()
        annee = int(request.data.get('annee', timezone.now().year))
        
        # Créer l'enregistrement d'export
        export = ExportComptable.objects.create(
            restaurateur=restaurateur,
            type_export='FEC',
            periode_debut=datetime(annee, 1, 1).date(),
            periode_fin=datetime(annee, 12, 31).date(),
            statut='en_cours'
        )
        
        try:
            # Générer le FEC
            generator = FECGenerator(restaurateur, annee)
            file_content, file_name = generator.generate()
            
            # Calculer le checksum
            checksum = hashlib.md5(file_content.encode()).hexdigest()
            
            # Sauvegarder le fichier (ici en local, en prod utiliser S3)
            file_path = f"exports/{restaurateur.id}/{file_name}"
            # TODO: Sauvegarder sur S3
            
            # Mettre à jour l'export
            export.fichier_nom = file_name
            export.fichier_url = f"/api/v1/comptabilite/download/{export.id}/"
            export.fichier_taille = len(file_content)
            export.checksum_md5 = checksum
            export.statut = 'complete'
            export.expires_at = timezone.now() + timedelta(days=30)
            export.save()
            
            return Response({
                'export_id': export.id,
                'fichier': file_name,
                'taille': export.fichier_taille,
                'checksum': checksum,
                'url': export.fichier_url,
                'expires': export.expires_at.isoformat(),
            })
            
        except Exception as e:
            export.statut = 'erreur'
            export.message_erreur = str(e)
            export.save()
            
            return Response(
                {'error': f"Erreur lors de la génération du FEC: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @extend_schema(
        summary="Export CSV",
        description="Export des données comptables en CSV",
        parameters=[
            OpenApiParameter(name='date_debut', type=str, required=True),
            OpenApiParameter(name='date_fin', type=str, required=True),
            OpenApiParameter(name='type', type=str, description='Type: ventes, tva, complet'),
        ]
    )
    @action(detail=False, methods=['post'])
    def export_csv(self, request):
        """Export CSV des données comptables"""
        restaurateur = self.get_restaurateur()
        
        date_debut = datetime.strptime(request.data['date_debut'], '%Y-%m-%d').date()
        date_fin = datetime.strptime(request.data['date_fin'], '%Y-%m-%d').date()
        export_type = request.data.get('type', 'complet')
        
        # Créer le CSV
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        
        if export_type == 'ventes':
            # En-têtes pour export ventes
            writer.writerow([
                'Date', 'Numéro', 'Client', 'Montant HT', 
                'TVA 5.5%', 'TVA 10%', 'TVA 20%', 'Total TTC',
                'Moyen paiement', 'Statut'
            ])
            
            # Récupérer les commandes
            from api.models import Order
            orders = Order.objects.filter(
                restaurant__owner=restaurateur,
                created_at__date__gte=date_debut,
                created_at__date__lte=date_fin,
                payment_status='paid'
            ).order_by('created_at')
            
            for order in orders:
                # Calculer la TVA (simplifié, à adapter selon votre modèle)
                tva_details = self._calculate_order_vat(order)
                
                writer.writerow([
                    order.created_at.strftime('%Y-%m-%d %H:%M'),
                    order.order_number,
                    order.client.user.get_full_name() if order.client else 'Client anonyme',
                    f"{float(order.total_amount / 1.1):.2f}",  # HT approximatif
                    f"{tva_details.get('5.5', 0):.2f}",
                    f"{tva_details.get('10', 0):.2f}",
                    f"{tva_details.get('20', 0):.2f}",
                    f"{float(order.total_amount):.2f}",
                    'Carte bancaire',  # À adapter
                    order.payment_status,
                ])
        
        elif export_type == 'tva':
            # Export récapitulatif TVA
            writer.writerow([
                'Période', 'CA HT', 'Base 5.5%', 'TVA 5.5%',
                'Base 10%', 'TVA 10%', 'Base 20%', 'TVA 20%',
                'TVA Totale', 'CA TTC'
            ])
            
            # Récupérer les récaps mensuels
            recaps = RecapitulatifTVA.objects.filter(
                restaurateur=restaurateur,
                year__gte=date_debut.year,
                year__lte=date_fin.year
            ).order_by('year', 'month')
            
            for recap in recaps:
                writer.writerow([
                    f"{recap.month:02d}/{recap.year}",
                    f"{float(recap.ca_ht):.2f}",
                    f"{float(recap.tva_5_5_base):.2f}",
                    f"{float(recap.tva_5_5_montant):.2f}",
                    f"{float(recap.tva_10_base):.2f}",
                    f"{float(recap.tva_10_montant):.2f}",
                    f"{float(recap.tva_20_base):.2f}",
                    f"{float(recap.tva_20_montant):.2f}",
                    f"{float(recap.tva_total):.2f}",
                    f"{float(recap.ca_ttc):.2f}",
                ])
        
        # Créer la réponse HTTP
        csv_content = output.getvalue()
        response = HttpResponse(csv_content, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="export_{export_type}_{date_debut}_{date_fin}.csv"'
        
        # Enregistrer l'export
        ExportComptable.objects.create(
            restaurateur=restaurateur,
            type_export='CSV',
            periode_debut=date_debut,
            periode_fin=date_fin,
            fichier_nom=f"export_{export_type}_{date_debut}_{date_fin}.csv",
            fichier_taille=len(csv_content),
            statut='complete',
            nombre_lignes=output.getvalue().count('\n')
        )
        
        return response
    
    @extend_schema(
        summary="Rapport PDF",
        description="Génère un rapport comptable en PDF"
    )
    @action(detail=False, methods=['post'])
    def rapport_pdf(self, request):
        """Génère un rapport PDF mensuel"""
        restaurateur = self.get_restaurateur()
        
        month = int(request.data.get('month', timezone.now().month))
        year = int(request.data.get('year', timezone.now().year))
        
        # Générer le PDF
        generator = PDFReportGenerator(restaurateur, year, month)
        pdf_content, filename = generator.generate()
        
        # Créer la réponse
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        # Enregistrer l'export
        ExportComptable.objects.create(
            restaurateur=restaurateur,
            type_export='PDF',
            periode_debut=datetime(year, month, 1).date(),
            periode_fin=datetime(year, month + 1, 1).date() - timedelta(days=1) if month < 12 else datetime(year, 12, 31).date(),
            fichier_nom=filename,
            fichier_taille=len(pdf_content),
            statut='complete'
        )
        
        return response
    
    @extend_schema(
        summary="Synchronisation Stripe",
        description="Synchronise les données avec Stripe"
    )
    @action(detail=False, methods=['post'])
    def sync_stripe(self, request):
        """Synchronise les données comptables avec Stripe"""
        restaurateur = self.get_restaurateur()
        
        if not restaurateur.stripe_account_id:
            return Response(
                {'error': 'Compte Stripe non configuré'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Récupérer les transactions Stripe du mois
            transfers = stripe.Transfer.list(
                destination=restaurateur.stripe_account_id,
                limit=100
            )
            
            # Récupérer les frais
            balance_transactions = stripe.BalanceTransaction.list(
                stripe_account=restaurateur.stripe_account_id,
                limit=100
            )
            
            # Calculer les totaux
            total_transfers = sum(t.amount for t in transfers.data) / 100
            total_fees = sum(
                t.fee for t in balance_transactions.data 
                if t.type == 'charge'
            ) / 100
            
            return Response({
                'virements': {
                    'nombre': len(transfers.data),
                    'total': float(total_transfers),
                },
                'commissions': {
                    'total': float(total_fees),
                },
                'derniere_sync': timezone.now().isoformat(),
            })
            
        except stripe.error.StripeError as e:
            return Response(
                {'error': f"Erreur Stripe: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _update_recap_tva(self, recap, date_debut, date_fin):
        """Met à jour le récapitulatif TVA"""
        from api.models import Order, OrderItem
        
        # Récupérer toutes les commandes payées de la période
        orders = Order.objects.filter(
            restaurant__owner=recap.restaurateur,
            created_at__date__gte=date_debut,
            created_at__date__lte=date_fin,
            payment_status='paid'
        )
        
        # Calculer les totaux
        recap.ca_ttc = orders.aggregate(Sum('total_amount'))['total_amount__sum'] or Decimal('0')
        recap.nombre_factures = orders.count()
        
        if recap.nombre_factures > 0:
            recap.ticket_moyen = recap.ca_ttc / recap.nombre_factures
        
        # Calculer la TVA par taux (simplifié)
        # En production, utiliser les taux réels des OrderItem
        recap.ca_ht = recap.ca_ttc / Decimal('1.10')  # Approximation 10%
        recap.tva_10_base = recap.ca_ht
        recap.tva_10_montant = recap.ca_ttc - recap.ca_ht
        recap.tva_total = recap.tva_10_montant
        
        recap.save()
    
    def _get_stripe_stats(self, restaurateur, date_debut, date_fin):
        """Récupère les statistiques Stripe"""
        if not restaurateur.stripe_account_id:
            return None
        
        try:
            # Récupérer le solde disponible
            balance = stripe.Balance.retrieve(
                stripe_account=restaurateur.stripe_account_id
            )
            
            return {
                'solde_disponible': float(balance.available[0].amount / 100) if balance.available else 0,
                'solde_en_attente': float(balance.pending[0].amount / 100) if balance.pending else 0,
            }
        except:
            return None
    
    def _calculate_order_vat(self, order):
        """Calcule la ventilation TVA d'une commande"""
        # Simplifié - à adapter selon votre modèle
        return {
            '10': float(order.total_amount) * 0.0909,  # TVA 10%
        }
    
    def _get_alertes_comptables(self, restaurateur, recap_tva):
        """Génère les alertes comptables"""
        alertes = []
        
        # Alerte export FEC
        dernier_fec = ExportComptable.objects.filter(
            restaurateur=restaurateur,
            type_export='FEC'
        ).order_by('-created_at').first()
        
        if not dernier_fec or dernier_fec.created_at < timezone.now() - timedelta(days=365):
            alertes.append({
                'type': 'warning',
                'message': "Pensez à générer votre FEC annuel pour l'administration fiscale",
                'action': 'export_fec'
            })
        
        # Alerte déclaration TVA
        if recap_tva.tva_total > 0:
            jour_du_mois = timezone.now().day
            if jour_du_mois >= 15 and jour_du_mois <= 20:
                alertes.append({
                    'type': 'info',
                    'message': f"Déclaration TVA à effectuer. Montant: {float(recap_tva.tva_total):.2f}€",
                    'action': 'declaration_tva'
                })
        
        return alertes