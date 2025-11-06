import csv
import io
from datetime import datetime, date
from decimal import Decimal
from typing import List, Tuple
import hashlib
from api.models import Order, OrderItem, RestaurateurProfile


class FECGenerator:
    """
    Générateur de Fichier des Écritures Comptables (FEC)
    Conforme à l'article A.47 A-1 du livre des procédures fiscales
    """
    
    # Colonnes obligatoires du FEC
    FEC_COLUMNS = [
        'JournalCode',      # Code journal
        'JournalLib',       # Libellé journal
        'EcritureNum',      # Numéro d'écriture
        'EcritureDate',     # Date de l'écriture
        'CompteNum',        # Numéro de compte
        'CompteLib',        # Libellé du compte
        'CompAuxNum',       # Numéro de compte auxiliaire (facultatif)
        'CompAuxLib',       # Libellé compte auxiliaire (facultatif)
        'PieceRef',         # Référence de la pièce
        'PieceDate',        # Date de la pièce
        'EcritureLib',      # Libellé de l'écriture
        'Debit',            # Montant débit
        'Credit',           # Montant crédit
        'EcritureLet',      # Lettrage (facultatif)
        'DateLet',          # Date de lettrage (facultatif)
        'ValidDate',        # Date de validation
        'Montantdevise',    # Montant en devise (facultatif)
        'Idevise',          # Identifiant devise (facultatif)
    ]
    
    def __init__(self, restaurateur: RestaurateurProfile, year: int):
        self.restaurateur = restaurateur
        self.year = year
        self.siret = restaurateur.siret or "00000000000000"
        self.lines = []
        self.ecriture_counter = 0
        
    def generate(self) -> Tuple[str, str]:
        """
        Génère le fichier FEC pour l'année donnée
        Retourne: (contenu_fichier, nom_fichier)
        """
        # Nom du fichier conforme aux normes
        filename = self._generate_filename()
        
        # Récupérer toutes les commandes de l'année
        orders = self._get_orders()
        
        # Générer les écritures comptables
        for order in orders:
            self._process_order(order)
        
        # Générer le contenu CSV
        content = self._generate_csv()
        
        return content, filename
    
    def _generate_filename(self) -> str:
        """Génère le nom de fichier conforme"""
        # Format: SIRET + FEC + AAAAMMJJ + .txt
        date_str = datetime.now().strftime('%Y%m%d')
        return f"{self.siret}FEC{date_str}.txt"
    
    def _get_orders(self):
        """Récupère toutes les commandes payées de l'année"""
        return Order.objects.filter(
            restaurant__owner=self.restaurateur,
            created_at__year=self.year,
            payment_status='paid'
        ).order_by('created_at').select_related(
            'restaurant', 'client', 'table'
        ).prefetch_related('items__menu_item')
    
    def _process_order(self, order):
        """Traite une commande et génère les écritures comptables"""
        self.ecriture_counter += 1
        
        # Calculer la ventilation TVA
        vat_breakdown = self._calculate_vat_breakdown(order)
        
        # Date et référence
        order_date = order.created_at.date()
        piece_ref = f"FACT-{order.order_number}"
        
        # 1. Écriture client (débit 411)
        self.lines.append({
            'JournalCode': 'VE',
            'JournalLib': 'Ventes',
            'EcritureNum': str(self.ecriture_counter),
            'EcritureDate': order_date.strftime('%Y%m%d'),
            'CompteNum': '411000',
            'CompteLib': 'Clients',
            'CompAuxNum': f"C{order.client.id if order.client else '00000'}",
            'CompAuxLib': order.client.user.get_full_name() if order.client else 'Client comptoir',
            'PieceRef': piece_ref,
            'PieceDate': order_date.strftime('%Y%m%d'),
            'EcritureLib': f"Vente restaurant {order.restaurant.name}",
            'Debit': str(order.total_amount),
            'Credit': '0.00',
            'EcritureLet': '',
            'DateLet': '',
            'ValidDate': order_date.strftime('%Y%m%d'),
            'Montantdevise': '',
            'Idevise': '',
        })
        
        # 2. Écriture ventes HT (crédit 706)
        total_ht = sum(vat_breakdown[rate]['base'] for rate in vat_breakdown)
        self.lines.append({
            'JournalCode': 'VE',
            'JournalLib': 'Ventes',
            'EcritureNum': str(self.ecriture_counter),
            'EcritureDate': order_date.strftime('%Y%m%d'),
            'CompteNum': '706000',
            'CompteLib': 'Prestations de services',
            'CompAuxNum': '',
            'CompAuxLib': '',
            'PieceRef': piece_ref,
            'PieceDate': order_date.strftime('%Y%m%d'),
            'EcritureLib': f"Vente restaurant {order.restaurant.name}",
            'Debit': '0.00',
            'Credit': str(total_ht),
            'EcritureLet': '',
            'DateLet': '',
            'ValidDate': order_date.strftime('%Y%m%d'),
            'Montantdevise': '',
            'Idevise': '',
        })
        
        # 3. Écritures TVA par taux
        for rate, amounts in vat_breakdown.items():
            if amounts['tva'] > 0:
                compte_tva = self._get_compte_tva(rate)
                self.lines.append({
                    'JournalCode': 'VE',
                    'JournalLib': 'Ventes',
                    'EcritureNum': str(self.ecriture_counter),
                    'EcritureDate': order_date.strftime('%Y%m%d'),
                    'CompteNum': compte_tva,
                    'CompteLib': f"TVA collectée {rate}%",
                    'CompAuxNum': '',
                    'CompAuxLib': '',
                    'PieceRef': piece_ref,
                    'PieceDate': order_date.strftime('%Y%m%d'),
                    'EcritureLib': f"TVA {rate}% - {order.restaurant.name}",
                    'Debit': '0.00',
                    'Credit': str(amounts['tva']),
                    'EcritureLet': '',
                    'DateLet': '',
                    'ValidDate': order_date.strftime('%Y%m%d'),
                    'Montantdevise': '',
                    'Idevise': '',
                })
        
        # 4. Si pourboire, écriture séparée
        if hasattr(order, 'tip_amount') and order.tip_amount > 0:
            self.lines.append({
                'JournalCode': 'VE',
                'JournalLib': 'Ventes',
                'EcritureNum': str(self.ecriture_counter),
                'EcritureDate': order_date.strftime('%Y%m%d'),
                'CompteNum': '758000',
                'CompteLib': 'Produits divers de gestion courante',
                'CompAuxNum': '',
                'CompAuxLib': '',
                'PieceRef': piece_ref,
                'PieceDate': order_date.strftime('%Y%m%d'),
                'EcritureLib': f"Pourboire - {order.restaurant.name}",
                'Debit': '0.00',
                'Credit': str(order.tip_amount),
                'EcritureLet': '',
                'DateLet': '',
                'ValidDate': order_date.strftime('%Y%m%d'),
                'Montantdevise': '',
                'Idevise': '',
            })
    
    def _calculate_vat_breakdown(self, order):
        """Calcule la ventilation TVA d'une commande"""
        vat_breakdown = {
            '5.5': {'base': Decimal('0'), 'tva': Decimal('0')},
            '10': {'base': Decimal('0'), 'tva': Decimal('0')},
            '20': {'base': Decimal('0'), 'tva': Decimal('0')},
        }
        
        for item in order.items.all():
            # Déterminer le taux de TVA (par défaut 10% pour la restauration)
            vat_rate = self._get_vat_rate(item)
            rate_key = str(vat_rate * 100).replace('.0', '')
            
            # Calculer HT et TVA
            price_ttc = Decimal(str(item.total_price))
            price_ht = price_ttc / (1 + vat_rate)
            tva = price_ttc - price_ht
            
            if rate_key in vat_breakdown:
                vat_breakdown[rate_key]['base'] += price_ht.quantize(Decimal('0.01'))
                vat_breakdown[rate_key]['tva'] += tva.quantize(Decimal('0.01'))
        
        return vat_breakdown
    
    def _get_vat_rate(self, item):
        """Détermine le taux de TVA d'un article"""
        # Logique simplifiée - à adapter selon votre modèle
        # Par défaut 10% pour la restauration sur place
        if hasattr(item.menu_item, 'vat_rate'):
            return Decimal(str(item.menu_item.vat_rate))
        
        # Si c'est une boisson alcoolisée
        if item.menu_item.category in ['boissons', 'alcools']:
            if 'alcool' in item.menu_item.name.lower() or 'vin' in item.menu_item.name.lower():
                return Decimal('0.20')
        
        # Produits alimentaires emballés
        if hasattr(item.menu_item, 'is_packaged') and item.menu_item.is_packaged:
            return Decimal('0.055')
        
        # Par défaut: restauration sur place
        return Decimal('0.10')
    
    def _get_compte_tva(self, rate):
        """Retourne le compte TVA selon le taux"""
        compte_map = {
            '5.5': '445710',
            '10': '445711',
            '20': '445712',
        }
        return compte_map.get(rate, '445710')
    
    def _generate_csv(self) -> str:
        """Génère le contenu CSV du FEC"""
        output = io.StringIO()
        
        # Utiliser le séparateur TAB pour le FEC
        writer = csv.DictWriter(
            output,
            fieldnames=self.FEC_COLUMNS,
            delimiter='\t',
            quoting=csv.QUOTE_NONE
        )
        
        # Pas d'en-têtes dans le FEC standard
        # writer.writeheader()
        
        # Écrire les lignes
        for line in self.lines:
            writer.writerow(line)
        
        return output.getvalue()


class PDFReportGenerator:
    """Générateur de rapports PDF mensuels"""
    
    def __init__(self, restaurateur: RestaurateurProfile, year: int, month: int):
        self.restaurateur = restaurateur
        self.year = year
        self.month = month
        
    def generate(self) -> Tuple[bytes, str]:
        """
        Génère un rapport PDF
        Retourne: (contenu_pdf, nom_fichier)
        """
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        import io
        
        # Créer le buffer PDF
        buffer = io.BytesIO()
        
        # Nom du fichier
        filename = f"rapport_comptable_{self.year}_{self.month:02d}.pdf"
        
        # Créer le document
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1F2937'),
            alignment=1  # Centre
        )
        
        # Contenu
        elements = []
        
        # Titre
        elements.append(Paragraph(
            f"Rapport Comptable - {self.get_month_name()} {self.year}",
            title_style
        ))
        elements.append(Spacer(1, 20))
        
        # Informations restaurant
        elements.append(Paragraph(
            f"<b>Restaurant:</b> {self.restaurateur.restaurant_set.first().name if self.restaurateur.restaurant_set.exists() else 'N/A'}",
            styles['Normal']
        ))
        elements.append(Paragraph(
            f"<b>SIRET:</b> {self.restaurateur.siret or 'Non renseigné'}",
            styles['Normal']
        ))
        elements.append(Spacer(1, 20))
        
        # Récupérer les données
        from .models import RecapitulatifTVA
        recap = RecapitulatifTVA.objects.filter(
            restaurateur=self.restaurateur,
            year=self.year,
            month=self.month
        ).first()
        
        if recap:
            # Tableau récapitulatif
            data = [
                ['Indicateur', 'Valeur'],
                ['Chiffre d\'affaires HT', f"{float(recap.ca_ht):.2f} €"],
                ['TVA collectée', f"{float(recap.tva_total):.2f} €"],
                ['Chiffre d\'affaires TTC', f"{float(recap.ca_ttc):.2f} €"],
                ['Nombre de factures', str(recap.nombre_factures)],
                ['Ticket moyen', f"{float(recap.ticket_moyen):.2f} €"],
            ]
            
            table = Table(data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 14),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            
            elements.append(table)
            elements.append(Spacer(1, 20))
            
            # Détail TVA
            elements.append(Paragraph("<b>Détail TVA</b>", styles['Heading2']))
            
            tva_data = [
                ['Taux', 'Base HT', 'Montant TVA'],
                ['5.5%', f"{float(recap.tva_5_5_base):.2f} €", f"{float(recap.tva_5_5_montant):.2f} €"],
                ['10%', f"{float(recap.tva_10_base):.2f} €", f"{float(recap.tva_10_montant):.2f} €"],
                ['20%', f"{float(recap.tva_20_base):.2f} €", f"{float(recap.tva_20_montant):.2f} €"],
                ['TOTAL', f"{float(recap.ca_ht):.2f} €", f"{float(recap.tva_total):.2f} €"],
            ]
            
            tva_table = Table(tva_data)
            tva_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -2), colors.beige),
                ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            
            elements.append(tva_table)
        
        # Générer le PDF
        doc.build(elements)
        
        # Récupérer le contenu
        pdf_content = buffer.getvalue()
        buffer.close()
        
        return pdf_content, filename
    
    def get_month_name(self):
        """Retourne le nom du mois en français"""
        months = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ]
        return months[self.month - 1]