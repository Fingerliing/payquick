from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.db import transaction
from api.models import Table, Restaurant, Menu, MenuItem
from api.permissions import IsRestaurateur, IsValidatedRestaurateur
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
import qrcode
from io import BytesIO
import base64
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table as PDFTable, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
import os
import tempfile

@extend_schema(tags=["Tables • Management"])
class TableViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour la gestion des tables par les restaurateurs
    """
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    
    def get_queryset(self):
        """Filtre les tables par restaurant du propriétaire"""
        try:
            return Table.objects.filter(
                restaurant__owner=self.request.user.restaurateur_profile
            ).select_related('restaurant').order_by('restaurant', 'number')
        except AttributeError:
            return Table.objects.none()

    @extend_schema(
        summary="Création en lot de tables",
        description="Crée plusieurs tables d'un coup pour un restaurant",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'restaurant_id': {'type': 'string'},
                    'table_count': {'type': 'integer', 'minimum': 1, 'maximum': 50},
                    'start_number': {'type': 'integer', 'minimum': 1, 'default': 1},
                    'capacity': {'type': 'integer', 'minimum': 1, 'maximum': 20, 'default': 4}
                },
                'required': ['restaurant_id', 'table_count']
            }
        },
        responses={
            201: OpenApiResponse(description="Tables créées avec succès"),
            400: OpenApiResponse(description="Données invalides"),
            404: OpenApiResponse(description="Restaurant non trouvé")
        }
    )
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Crée plusieurs tables d'un coup"""
        try:
            restaurant_id = request.data.get('restaurant_id')
            table_count = request.data.get('table_count')
            start_number = request.data.get('start_number', 1)
            capacity = request.data.get('capacity', 4)
            
            # Validation des données
            if not restaurant_id:
                return Response({
                    'error': 'restaurant_id est requis'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if not table_count or table_count < 1 or table_count > 50:
                return Response({
                    'error': 'table_count doit être entre 1 et 50'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Vérifier que le restaurant appartient au restaurateur
            try:
                restaurant = Restaurant.objects.get(
                    id=restaurant_id,
                    owner=request.user.restaurateur_profile
                )
            except Restaurant.DoesNotExist:
                return Response({
                    'error': 'Restaurant non trouvé ou non autorisé'
                }, status=status.HTTP_404_NOT_FOUND)
            
            created_tables = []
            
            with transaction.atomic():
                for i in range(table_count):
                    table_number = start_number + i
                    identifiant = f"R{restaurant_id}T{str(table_number).zfill(3)}"
                    
                    # Vérifier que la table n'existe pas déjà
                    if Table.objects.filter(restaurant=restaurant, number=str(table_number)).exists():
                        return Response({
                            'error': f'La table {table_number} existe déjà'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    
                    table = Table.objects.create(
                        restaurant=restaurant,
                        number=str(table_number),
                        capacity=capacity,
                        is_active=True,
                        qr_code=identifiant
                    )
                    
                    created_tables.append(table)
            
            # Formater la réponse
            tables_data = []
            for table in created_tables:
                base_url = request.build_absolute_uri('/').rstrip('/')
                tables_data.append({
                    'id': str(table.id),
                    'number': table.number,
                    'identifiant': table.qr_code,
                    'restaurant': str(table.restaurant.id),
                    'capacity': table.capacity,
                    'is_active': table.is_active,
                    'qrCodeUrl': f"{base_url}/table/{table.qr_code}",
                    'manualCode': table.qr_code,
                    'created_at': table.created_at.isoformat()
                })
            
            return Response({
                'success': True,
                'message': f'{len(created_tables)} tables créées avec succès',
                'tables': tables_data,
                'restaurant': restaurant.name
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la création des tables',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Génère un QR code pour une table",
        description="Génère et retourne le QR code d'une table"
    )
    @action(detail=True, methods=['post'])
    def generate_qr(self, request, pk=None):
        """Génère un QR code pour une table"""
        try:
            table = self.get_object()
            
            # Générer l'identifiant s'il n'existe pas
            if not table.qr_code:
                table.qr_code = f"R{table.restaurant.id}T{str(table.number).zfill(3)}"
                table.save(update_fields=['qr_code'])
            
            # URL pour accéder à la table
            base_url = request.build_absolute_uri('/').rstrip('/')
            qr_url = f"{base_url}/table/{table.qr_code}"
            
            # Générer le QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(qr_url)
            qr.make(fit=True)
            
            # Créer l'image QR code
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # Convertir en base64 pour la réponse
            buffer = BytesIO()
            qr_img.save(buffer, format='PNG')
            qr_base64 = base64.b64encode(buffer.getvalue()).decode()
            
            return Response({
                'success': True,
                'table_id': str(table.id),
                'table_number': table.number,
                'identifiant': table.qr_code,
                'qr_code_url': qr_url,
                'qr_code_image': f"data:image/png;base64,{qr_base64}",
                'manual_code': table.qr_code
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la génération du QR code',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Active/désactive une table",
        description="Change le statut actif/inactif d'une table"
    )
    @action(detail=True, methods=['post'])
    def toggle_status(self, request, pk=None):
        """Active/désactive une table"""
        try:
            table = self.get_object()
            table.is_active = not table.is_active
            table.save(update_fields=['is_active'])
            
            return Response({
                'id': str(table.id),
                'number': table.number,
                'is_active': table.is_active,
                'message': f'Table {table.number} {"activée" if table.is_active else "désactivée"}'
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors du changement de statut',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=["Restaurants • Management"])  
class RestaurantTableManagementViewSet(viewsets.ViewSet):
    """
    ViewSet pour la gestion des tables depuis le restaurant
    """
    permission_classes = [IsAuthenticated, IsRestaurateur, IsValidatedRestaurateur]
    
    @extend_schema(
        summary="Tables d'un restaurant",
        description="Récupère toutes les tables d'un restaurant"
    )
    @action(detail=True, methods=['get'])
    def tables(self, request, pk=None):
        """Liste des tables d'un restaurant"""
        try:
            restaurant = get_object_or_404(
                Restaurant, 
                id=pk, 
                owner=request.user.restaurateur_profile
            )
            
            tables = Table.objects.filter(restaurant=restaurant).order_by('number')
            
            tables_data = []
            for table in tables:
                base_url = request.build_absolute_uri('/').rstrip('/')
                tables_data.append({
                    'id': str(table.id),
                    'number': table.number,
                    'identifiant': table.qr_code or f"R{restaurant.id}T{str(table.number).zfill(3)}",
                    'capacity': table.capacity,
                    'is_active': table.is_active,
                    'qrCodeUrl': f"{base_url}/table/{table.qr_code or table.id}",
                    'manualCode': table.qr_code or str(table.id),
                    'created_at': table.created_at.isoformat()
                })
            
            return Response({
                'restaurant': {
                    'id': str(restaurant.id),
                    'name': restaurant.name
                },
                'tables': tables_data,
                'total_tables': len(tables_data)
            })
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la récupération des tables',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Export PDF des QR codes",
        description="Génère un PDF avec tous les QR codes du restaurant"
    )
    @action(detail=True, methods=['get'])
    def export_qr(self, request, pk=None):
        """Exporte les QR codes en PDF"""
        try:
            restaurant = get_object_or_404(
                Restaurant, 
                id=pk, 
                owner=request.user.restaurateur_profile
            )
            
            tables = Table.objects.filter(restaurant=restaurant).order_by('number')
            
            if not tables:
                return Response({
                    'error': 'Aucune table trouvée pour ce restaurant'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Créer le PDF
            buffer = BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            story = []
            styles = getSampleStyleSheet()
            
            # Style personnalisé
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                spaceAfter=30,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#059669')
            )
            
            # Titre
            story.append(Paragraph(f"QR Codes - {restaurant.name}", title_style))
            story.append(Spacer(1, 20))
            
            base_url = request.build_absolute_uri('/').rstrip('/')
            
            # Générer les QR codes pour chaque table
            for table in tables:
                if not table.qr_code:
                    table.qr_code = f"R{restaurant.id}T{str(table.number).zfill(3)}"
                    table.save(update_fields=['qr_code'])
                
                qr_url = f"{base_url}/table/{table.qr_code}"
                
                # Générer QR code
                qr = qrcode.QRCode(
                    version=1,
                    error_correction=qrcode.constants.ERROR_CORRECT_L,
                    box_size=8,
                    border=4,
                )
                qr.add_data(qr_url)
                qr.make(fit=True)
                
                qr_img = qr.make_image(fill_color="black", back_color="white")
                
                # Sauvegarder temporairement l'image
                with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp_file:
                    qr_img.save(tmp_file.name)
                    
                    # Contenu de la table
                    table_data = [
                        [Paragraph("<b>Eat&Go</b>", styles['Heading2']), ""],
                        [Paragraph(f"<b>Table {table.number}</b>", styles['Heading3']), ""],
                        [Image(tmp_file.name, width=2*inch, height=2*inch), ""],
                        [Paragraph(f"<b>Code manuel :</b><br/>{table.qr_code}", styles['Normal']), ""],
                        [Paragraph("Scannez le QR code ou saisissez le code manuel", styles['Normal']), ""]
                    ]
                    
                    table_pdf = PDFTable(table_data, colWidths=[3*inch, 2*inch])
                    table_pdf.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 0), (-1, -1), 12),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black),
                        ('BOX', (0, 0), (-1, -1), 2, colors.black),
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0fdf4')),
                    ]))
                    
                    story.append(table_pdf)
                    story.append(Spacer(1, 30))
                    
                    # Nettoyer le fichier temporaire
                    os.unlink(tmp_file.name)
            
            # Construire le PDF
            doc.build(story)
            buffer.seek(0)
            
            # Retourner le PDF
            response = HttpResponse(buffer, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="qr_codes_{restaurant.name.replace(" ", "_")}.pdf"'
            return response
            
        except Exception as e:
            return Response({
                'error': 'Erreur lors de la génération du PDF',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Tables • Public"],
    summary="Accès public par QR Code",
    description="Endpoint public pour accéder au menu d'une table via QR code",
    parameters=[
        OpenApiParameter(
            name="identifiant",
            type=str,
            location=OpenApiParameter.PATH,
            required=True,
            description="Identifiant unique de la table"
        )
    ],
    responses={
        200: OpenApiResponse(description="Menu actif et ses items"),
        404: OpenApiResponse(description="Table ou menu non trouvé")
    }
)
class TableQRRouterView(APIView):
    """
    Endpoint public : accessible via un QR code sans authentification.
    Permet de récupérer le menu actif associé à une table.
    """
    permission_classes = [AllowAny]

    def get(self, request, identifiant):
        try:
            # Chercher la table par son identifiant QR
            table = get_object_or_404(Table, qr_code=identifiant, is_active=True)
            restaurant = table.restaurant
            
            # Vérifier que le restaurant est actif
            if not restaurant.is_active or not restaurant.can_receive_orders:
                return Response({
                    "error": "Restaurant temporairement fermé",
                    "message": "Ce restaurant n'accepte pas de commandes pour le moment."
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Chercher le menu actif
            menu = Menu.objects.filter(
                restaurant=restaurant, 
                is_available=True
            ).first()

            if not menu:
                return Response({
                    "error": "Aucun menu actif",
                    "message": "Ce restaurant n'a pas de menu disponible pour le moment.",
                    "restaurant_info": {
                        "name": restaurant.name,
                        "phone": restaurant.phone,
                        "address": restaurant.full_address
                    }
                }, status=status.HTTP_404_NOT_FOUND)

            # Récupérer les items du menu
            items = MenuItem.objects.filter(
                menu=menu, 
                is_available=True
            ).order_by('category', 'name')

            # Organiser les items par catégorie
            categories = {}
            for item in items:
                if item.category not in categories:
                    categories[item.category] = []
                
                categories[item.category].append({
                    "id": str(item.id),
                    "name": item.name,
                    "description": item.description,
                    "price": float(item.price),
                    "allergens": item.allergen_display,
                    "dietary_tags": item.dietary_tags,
                    "is_vegetarian": item.is_vegetarian,
                    "is_vegan": item.is_vegan,
                    "is_gluten_free": item.is_gluten_free
                })

            response_data = {
                "success": True,
                "restaurant": {
                    "id": str(restaurant.id),
                    "name": restaurant.name,
                    "description": restaurant.description,
                    "cuisine": restaurant.get_cuisine_display(),
                    "phone": restaurant.phone,
                    "address": restaurant.full_address,
                    "price_range": restaurant.price_range_display,
                    "accepts_meal_vouchers": restaurant.accepts_meal_vouchers,
                    "meal_voucher_info": restaurant.meal_voucher_info if restaurant.accepts_meal_vouchers else None
                },
                "table": {
                    "number": table.number,
                    "identifiant": table.qr_code,
                    "capacity": table.capacity
                },
                "menu": {
                    "id": str(menu.id),
                    "name": menu.name,
                    "categories": categories
                },
                "ordering_info": {
                    "can_order": restaurant.can_receive_orders,
                    "payment_methods": ["card", "cash"] if restaurant.is_stripe_active else ["cash"],
                    "accepts_meal_vouchers": restaurant.accepts_meal_vouchers
                }
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Table.DoesNotExist:
            return Response({
                "error": "Table non trouvée",
                "message": "L'identifiant de table n'est pas valide ou la table est désactivée."
            }, status=status.HTTP_404_NOT_FOUND)
            
        except Exception as e:
            return Response({
                "error": "Erreur serveur",
                "message": "Une erreur est survenue lors de la récupération du menu.",
                "details": str(e) if request.user.is_staff else None
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)