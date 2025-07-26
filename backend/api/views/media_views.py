from django.http import HttpResponse, Http404
from django.conf import settings
import os
import mimetypes

def serve_media(request, path):
    """Vue personnalisée pour servir les fichiers média avec le bon Content-Type"""
    
    # Construire le chemin complet du fichier
    file_path = os.path.join(settings.MEDIA_ROOT, path)
    
    # Vérifier que le fichier existe
    if not os.path.exists(file_path):
        raise Http404("Fichier non trouvé")
    
    # Deviner le type MIME
    content_type, _ = mimetypes.guess_type(file_path)
    
    # Forcer le type pour WebP si pas reconnu
    if file_path.lower().endswith('.webp'):
        content_type = 'image/webp'
    elif file_path.lower().endswith('.avif'):
        content_type = 'image/avif'
    elif file_path.lower().endswith('.heic'):
        content_type = 'image/heic'
    elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
        content_type = 'image/jpeg'
    elif file_path.lower().endswith('.png'):
        content_type = 'image/png'
    
    # Par défaut, utiliser octet-stream
    if not content_type:
        content_type = 'application/octet-stream'
    
    print(f"Serving file: {file_path}")
    print(f"Content-Type: {content_type}")
    
    # Lire et retourner le fichier
    try:
        with open(file_path, 'rb') as f:
            response = HttpResponse(f.read(), content_type=content_type)
            
            # Ajouter des headers pour le cache
            response['Cache-Control'] = 'public, max-age=3600'
            
            # Header pour affichage inline (pas de téléchargement)
            response['Content-Disposition'] = 'inline'
            
            return response
    except IOError:
        raise Http404("Erreur de lecture du fichier")