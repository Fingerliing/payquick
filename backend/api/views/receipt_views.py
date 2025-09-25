from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.core.mail import EmailMessage
from django.template.loader import render_to_string
from django.conf import settings
from drf_spectacular.utils import extend_schema, OpenApiResponse
import json
import logging

from api.models import Order
from api.serializers.order_serializers import OrderDetailSerializer

logger = logging.getLogger(__name__)

@extend_schema(
    tags=["Receipts"],
    summary="Envoyer un ticket par email",
    description="Envoie le ticket de caisse par email au client"
)
class SendReceiptEmailView(APIView):
    def post(self, request):
        try:
            order_id = request.data.get('order_id')
            email = request.data.get('email')
            
            if not order_id or not email:
                return Response({
                    'success': False,
                    'message': 'order_id et email sont requis'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            order = get_object_or_404(Order, id=order_id)
            
            # Générer le contenu du ticket
            receipt_data = self._generate_receipt_data(order)
            
            # Créer l'email
            subject = f'Ticket de caisse - Commande #{order.order_number or order.id}'
            
            # Template simple en texte
            message_text = self._generate_text_receipt(receipt_data)
            
            # Envoyer l'email
            email_message = EmailMessage(
                subject=subject,
                body=message_text,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
            )
            
            email_message.send(fail_silently=False)
            
            logger.info(f"Receipt sent to {email} for order {order_id}")
            
            return Response({
                'success': True,
                'message': 'Ticket envoyé avec succès'
            })
            
        except Exception as e:
            logger.error(f"Error sending receipt email: {e}")
            return Response({
                'success': False,
                'message': f'Erreur lors de l\'envoi: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _generate_receipt_data(self, order):
        """Générer les données du ticket"""
        return {
            'order_id': order.id,
            'order_number': order.order_number or f'ORD-{order.id}',
            'restaurant_name': order.restaurant.name if order.restaurant else 'Restaurant',
            'restaurant_address': getattr(order.restaurant, 'address', '') if order.restaurant else '',
            'customer_name': order.customer_name or '',
            'customer_email': getattr(order, 'customer_email', '') or '',
            'table_number': order.table_number or '',
            'items': [
                {
                    'name': item.menu_item.name if hasattr(item, 'menu_item') and item.menu_item else 'Article',
                    'quantity': item.quantity,
                    'unit_price': float(item.unit_price or 0),
                    'total_price': float(item.total_price or 0),
                    'customizations': json.dumps(getattr(item, 'customizations', {})) if hasattr(item, 'customizations') else '',
                }
                for item in order.items.all()
            ],
            'subtotal': float(order.total_amount or 0),
            'total': float(order.total_amount or 0),
            'payment_method': order.payment_method or 'unknown',
            'payment_status': order.payment_status or 'pending',
            'created_at': order.created_at.strftime('%d/%m/%Y %H:%M'),
        }
    
    def _generate_text_receipt(self, receipt_data):
        """Générer le ticket en format texte"""
        lines = []
        lines.append("=" * 40)
        lines.append(f"TICKET DE CAISSE")
        lines.append("=" * 40)
        lines.append(f"Restaurant: {receipt_data['restaurant_name']}")
        lines.append(f"Commande N°: {receipt_data['order_number']}")
        lines.append(f"Date: {receipt_data['created_at']}")
        
        if receipt_data['table_number']:
            lines.append(f"Table: {receipt_data['table_number']}")
        
        if receipt_data['customer_name']:
            lines.append(f"Client: {receipt_data['customer_name']}")
        
        lines.append("-" * 40)
        lines.append("ARTICLES:")
        
        for item in receipt_data['items']:
            lines.append(f"{item['quantity']}x {item['name']}")
            lines.append(f"    {item['unit_price']:.2f}€ x {item['quantity']} = {item['total_price']:.2f}€")
        
        lines.append("-" * 40)
        lines.append(f"TOTAL: {receipt_data['total']:.2f}€")
        lines.append(f"Mode de paiement: {receipt_data['payment_method']}")
        lines.append("=" * 40)
        lines.append("Merci de votre visite !")
        
        return "\n".join(lines)

@extend_schema(
    tags=["Receipts"],
    summary="Obtenir les données du ticket",
    description="Récupère les données formatées du ticket pour une commande"
)
class GetReceiptDataView(APIView):
    def get(self, request, order_id):
        try:
            order = get_object_or_404(Order, id=order_id)
            
            # Construire les données du ticket directement depuis l'objet Order
            receipt_data = {
                'order_id': order.id,
                'order_number': order.order_number or f'ORD-{order.id}',
                
                # Restaurant info - accès direct aux attributs avec les bons noms de champs
                'restaurant_name': order.restaurant.name if order.restaurant else 'Restaurant',
                'restaurant_address': order.restaurant.address if order.restaurant else '',
                'restaurant_city': order.restaurant.city if order.restaurant else '',
                'restaurant_postal_code': order.restaurant.zip_code if order.restaurant else '',  # CORRECTION: zip_code au lieu de postal_code
                'restaurant_phone': order.restaurant.phone if order.restaurant else '',
                'restaurant_email': order.restaurant.email if order.restaurant else '',
                'restaurant_siret': getattr(order.restaurant, 'siret', '') if order.restaurant else '',
                'restaurant_tva_number': getattr(order.restaurant, 'tva_number', '') if order.restaurant else '',
                'restaurant_legal_form': getattr(order.restaurant, 'legal_form', '') if order.restaurant else '',
                
                # Customer info - accès direct
                'customer_name': getattr(order, 'customer_name', ''),
                'customer_email': getattr(order, 'customer_email', ''),
                'customer_phone': getattr(order, 'phone', ''),
                'table_number': order.table_number or '',
                
                # Items - accès direct aux relations
                'items': [
                    {
                        'name': item.menu_item.name if hasattr(item, 'menu_item') and item.menu_item else 'Article',
                        'menu_item_name': item.menu_item.name if hasattr(item, 'menu_item') and item.menu_item else 'Article',
                        'quantity': int(item.quantity or 1),
                        'price': float(item.unit_price or 0),
                        'unit_price': float(item.unit_price or 0),
                        'total_price': float(item.total_price or 0),
                        'tva_rate': float(getattr(item, 'tva_rate', 0.20)),  # 20% par défaut
                        'tax_rate': float(getattr(item, 'tva_rate', 0.20)),
                        'customizations': self._safe_get_customizations(item),
                        'special_instructions': getattr(item, 'special_instructions', ''),
                        'description': getattr(item, 'description', ''),
                    }
                    for item in order.items.all()  # Utiliser .all() pour récupérer tous les items
                ],
                
                # Totaux - accès direct
                'subtotal': float(order.total_amount or 0),
                'total_amount': float(order.total_amount or 0),
                'tip_amount': float(getattr(order, 'tip_amount', 0)),
                'tax_amount': float(getattr(order, 'tax_amount', 0)),
                'total': float(order.total_amount or 0),
                
                # Payment info - accès direct
                'payment_method': getattr(order, 'payment_method', 'cash'),
                'payment_status': getattr(order, 'payment_status', 'pending'),
                'payment_date': order.created_at.isoformat() if order.created_at else '',
                'paid_at': order.created_at.isoformat() if order.created_at else '',
                
                # Timestamps
                'created_at': order.created_at.isoformat() if order.created_at else '',
                'served_at': order.served_at.isoformat() if hasattr(order, 'served_at') and order.served_at else '',
                
                # Optional fields
                'transaction_id': getattr(order, 'transaction_id', ''),
                'sequential_number': getattr(order, 'sequential_number', ''),
                'sequential_receipt_number': getattr(order, 'sequential_receipt_number', ''),
                'notes': getattr(order, 'notes', ''),
                'order_type': getattr(order, 'order_type', 'dine_in'),
                
                # Legal notices
                'warranty_notice': '',
                'tva_notice': '',
                'receipt_notice': 'Ticket à conserver comme justificatif',
            }
            
            return Response(receipt_data)
            
        except Exception as e:
            logger.error(f"Error getting receipt data for order {order_id}: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _safe_get_customizations(self, item):
        """Récupérer les customizations de façon sécurisée"""
        try:
            if hasattr(item, 'customizations'):
                customizations = item.customizations
                if isinstance(customizations, str):
                    # Si c'est déjà une string JSON, la retourner
                    return customizations
                elif isinstance(customizations, dict):
                    # Si c'est un dict, le sérialiser en JSON
                    return json.dumps(customizations)
                else:
                    # Autres types, convertir en string
                    return str(customizations)
            return '{}'
        except Exception:
            return '{}'
@extend_schema(
    tags=["Receipts"],
    summary="Générer un PDF du ticket",
    description="Génère et retourne un PDF du ticket de caisse"
)
class GenerateReceiptPDFView(APIView):
    def get(self, request, order_id):
        try:
            order = get_object_or_404(Order, id=order_id)
            
            # Import reportlab only when needed
            try:
                from reportlab.pdfgen import canvas
                from reportlab.lib.pagesizes import A4
                from reportlab.lib.units import cm
                from io import BytesIO
            except ImportError:
                return Response({
                    'error': 'PDF generation not available (reportlab not installed)'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
            
            # Create PDF
            buffer = BytesIO()
            p = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            
            # Title
            p.setFont("Helvetica-Bold", 16)
            p.drawString(2*cm, height - 3*cm, 'TICKET DE CAISSE')
            
            # Restaurant info
            p.setFont("Helvetica", 12)
            y_pos = height - 5*cm
            p.drawString(2*cm, y_pos, f'Restaurant: {order.restaurant.name if order.restaurant else "N/A"}')
            y_pos -= 0.7*cm
            p.drawString(2*cm, y_pos, f'Commande N°: {order.order_number or order.id}')
            y_pos -= 0.7*cm
            p.drawString(2*cm, y_pos, f'Date: {order.created_at.strftime("%d/%m/%Y %H:%M")}')
            
            if order.table_number:
                y_pos -= 0.7*cm
                p.drawString(2*cm, y_pos, f'Table: {order.table_number}')
            
            # Items
            y_pos -= 1.5*cm
            p.setFont("Helvetica-Bold", 12)
            p.drawString(2*cm, y_pos, 'Articles:')
            
            p.setFont("Helvetica", 10)
            for item in order.items.all():
                y_pos -= 0.8*cm
                item_name = item.menu_item.name if hasattr(item, 'menu_item') and item.menu_item else 'Article'
                p.drawString(2.5*cm, y_pos, f'{item.quantity}x {item_name}')
                y_pos -= 0.5*cm
                p.drawString(3*cm, y_pos, f'{float(item.unit_price or 0):.2f}€ x {item.quantity} = {float(item.total_price or 0):.2f}€')
            
            # Total
            y_pos -= 1*cm
            p.setFont("Helvetica-Bold", 12)
            p.drawString(2*cm, y_pos, f'TOTAL: {float(order.total_amount or 0):.2f}€')
            
            y_pos -= 0.7*cm
            p.setFont("Helvetica", 10)
            p.drawString(2*cm, y_pos, f'Mode de paiement: {order.payment_method or "N/A"}')
            
            # Footer
            y_pos -= 2*cm
            p.drawString(2*cm, y_pos, 'Merci de votre visite !')
            
            p.showPage()
            p.save()
            
            # Return PDF response
            pdf_data = buffer.getvalue()
            buffer.close()
            
            response = HttpResponse(pdf_data, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="ticket_{order.id}.pdf"'
            
            return response
            
        except Exception as e:
            logger.error(f"Error generating PDF for order {order_id}: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)