"""
Modèles IA — Import de menu par photo + charte graphique
=========================================================
Permet à un restaurateur de photographier sa carte physique. Un pipeline
asynchrone (Celery) envoie la/les image(s) à un modèle de vision, en extrait
la structure (catégories, sous-catégories, plats, prix, descriptions), détecte
la charte graphique (couleurs dominantes) et traduit le contenu dans plusieurs
langues.

Flux fonctionnel
----------------
    1. Le restaurateur crée un `MenuScanJob` et y attache 1..n `MenuScanImage`
       (une image par page de la carte, dans l'ordre via le champ `order`).
    2. Une tâche Celery passe le job en `processing`, appelle le modèle de
       vision, remplit `extracted_data` (brouillon éditable) + `branding_data`,
       puis `translating` pour les traductions, et termine en `ready`.
    3. Le restaurateur relit / corrige le brouillon dans l'app (les prix
       touchant à la facturation Stripe, la relecture humaine est obligatoire).
    4. À la validation (`apply`), le brouillon est matérialisé en
       `MenuCategory` / `MenuSubCategory` / `MenuItem` réels et la charte est
       appliquée via `RestaurantBranding`.
"""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


# -----------------------------------------------------------------------------
# Langues
# -----------------------------------------------------------------------------
# Langue source des cartes (restaurants français).
SOURCE_LANGUAGE = 'fr'

# Langues cibles proposées pour la traduction du contenu du menu.
SUPPORTED_LANGUAGES = [
    ('fr', 'Français'),
    ('en', 'Anglais'),
    ('es', 'Espagnol'),
    ('de', 'Allemand'),
    ('it', 'Italien'),
    ('pt', 'Portugais'),
    ('nl', 'Néerlandais'),
    ('zh', 'Chinois'),
    ('ja', 'Japonais'),
    ('ar', 'Arabe'),
    ('eu', 'Basque'),
]

SUPPORTED_LANGUAGE_CODES = {code for code, _ in SUPPORTED_LANGUAGES}

# Sélection cochée par défaut côté restaurateur (hors français = source).
DEFAULT_TARGET_LANGUAGES = ['en', 'es', 'de', 'it']


def default_target_languages():
    """Callable pour le `default` du JSONField (évite le mutable partagé)."""
    return list(DEFAULT_TARGET_LANGUAGES)


# -----------------------------------------------------------------------------
# Job d'import
# -----------------------------------------------------------------------------
class MenuScanJob(models.Model):
    """Tâche d'import d'un menu à partir d'une ou plusieurs photos.

    Le champ `extracted_data` contient un brouillon structuré et éditable.
    Hiérarchie : catégorie -> (items directs) + sous-catégories -> items.
    Forme attendue (toutes les valeurs sont éditables côté restaurateur) ::

        {
          "categories": [
            {
              "name": "Plats",
              "icon": "🍽️",
              "order": 1,
              "translations": {"en": {"name": "Mains"}, ...},
              "items": [
                {
                  "name": "Salade César",
                  "description": "Laitue romaine, parmesan, croûtons.",
                  "price": "12.50",
                  "is_vegetarian": false,
                  "is_vegan": false,
                  "is_gluten_free": false,
                  "allergens": ["gluten", "lait"],
                  "translations": {
                    "en": {"name": "Caesar salad", "description": "..."},
                    ...
                  }
                }
              ],
              "subcategories": [
                {
                  "name": "Viandes",
                  "order": 1,
                  "translations": {"en": {"name": "Meats"}, ...},
                  "items": [
                    { "... même structure de plat que ci-dessus ..." }
                  ]
                }
              ]
            }
          ]
        }

    - `items` au niveau catégorie : plats SANS sous-catégorie.
    - `subcategories[].items`      : plats regroupés dans une sous-catégorie.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', "En attente"
        PROCESSING = 'processing', "Analyse de l'image"
        TRANSLATING = 'translating', "Traduction en cours"
        READY = 'ready', "Prêt à valider"
        APPLIED = 'applied', "Appliqué au menu"
        FAILED = 'failed', "Échec"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='menu_scan_jobs',
        verbose_name="Restaurant",
    )
    # Menu cible : celui depuis lequel l'import a ete lance. Optionnel — si
    # absent (anciens jobs, lancement hors contexte menu), `apply` retombe
    # sur le premier menu du restaurant.
    menu = models.ForeignKey(
        'Menu',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='menu_scan_jobs',
        verbose_name="Menu cible",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='menu_scan_jobs',
        verbose_name="Créé par",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
        verbose_name="Statut",
    )

    target_languages = models.JSONField(
        default=default_target_languages,
        blank=True,
        help_text="Codes ISO des langues cibles pour la traduction (hors français).",
        verbose_name="Langues cibles",
    )

    # Brouillon structuré, éditable par le restaurateur avant validation.
    extracted_data = models.JSONField(
        default=dict, blank=True,
        verbose_name="Données extraites (brouillon)",
    )

    # Charte graphique détectée par la vision.
    # {"primary_color": "#1E2A78", "secondary_color": "#D4AF37",
    #  "accent_color": "#2938A3", "background_color": "#F9FAFB",
    #  "text_color": "#111827", "style": "bistrot élégant"}
    branding_data = models.JSONField(
        default=dict, blank=True,
        verbose_name="Charte graphique détectée",
    )

    # Réponse brute du modèle (debug / audit). Non exposée à l'API publique.
    raw_response = models.JSONField(
        default=dict, blank=True,
        verbose_name="Réponse brute du modèle",
    )

    error_message = models.TextField(
        blank=True, default='',
        verbose_name="Message d'erreur",
    )

    # Métriques optionnelles (suivi des coûts).
    model_used = models.CharField(max_length=80, blank=True, default='')
    tokens_used = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Import de menu (IA)"
        verbose_name_plural = "Imports de menu (IA)"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurant', 'status']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f"Scan menu {self.restaurant.name} — {self.get_status_display()}"

    # -- Propriétés utilitaires -----------------------------------------------
    @property
    def is_terminal(self):
        """Le job est-il dans un état final (plus de traitement attendu) ?"""
        return self.status in {self.Status.APPLIED, self.Status.FAILED}

    @property
    def is_reviewable(self):
        """Le brouillon est-il prêt à être relu / corrigé / validé ?"""
        return self.status == self.Status.READY

    @property
    def categories_count(self):
        return len(self.extracted_data.get('categories', []))

    @property
    def subcategories_count(self):
        """Nombre total de sous-catégories, toutes catégories confondues."""
        return sum(
            len(cat.get('subcategories', []))
            for cat in self.extracted_data.get('categories', [])
        )

    @property
    def items_count(self):
        """Nombre total de plats : items directs + items des sous-catégories."""
        total = 0
        for cat in self.extracted_data.get('categories', []):
            total += len(cat.get('items', []))
            for sub in cat.get('subcategories', []):
                total += len(sub.get('items', []))
        return total

    def clean(self):
        """Valide les codes langues cibles."""
        langs = self.target_languages or []
        if not isinstance(langs, list):
            raise ValidationError({'target_languages': "Liste de codes langues attendue."})
        invalid = [c for c in langs if c not in SUPPORTED_LANGUAGE_CODES]
        if invalid:
            raise ValidationError({
                'target_languages': f"Langues non prises en charge : {', '.join(invalid)}.",
            })


def menu_scan_image_path(instance, filename):
    """Chemin d'upload : isole les photos par job."""
    return f"menu_scans/{instance.job_id}/{filename}"


class MenuScanImage(models.Model):
    """Photo de carte rattachée à un job (une carte = plusieurs pages possibles).

    Le champ `order` porte le numéro de page : le pipeline lit les images dans
    cet ordre pour gérer correctement les cartes multi-pages.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(
        MenuScanJob,
        on_delete=models.CASCADE,
        related_name='images',
        verbose_name="Job d'import",
    )
    image = models.ImageField(
        upload_to=menu_scan_image_path,
        verbose_name="Photo de la carte",
    )
    order = models.PositiveIntegerField(
        default=0,
        verbose_name="Ordre de la page",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Photo de carte"
        verbose_name_plural = "Photos de carte"
        ordering = ['job', 'order']
        indexes = [
            models.Index(fields=['job', 'order']),
        ]

    def __str__(self):
        return f"Page {self.order} — job {self.job_id}"


# -----------------------------------------------------------------------------
# Charte graphique
# -----------------------------------------------------------------------------
class RestaurantBranding(models.Model):
    """Charte graphique d'un restaurant, éventuellement détectée par l'IA.

    Sert à thématiser l'affichage côté client (écran menu) avec les couleurs
    propres au restaurant, au lieu du design system global de l'app.

    Les couleurs détectées par la vision DOIVENT être assainies (format
    `#RRGGBB`) par le service d'extraction avant d'arriver ici : `save()`
    déclenche `full_clean()`.
    """

    HEX_FIELDS = (
        'primary_color', 'secondary_color', 'accent_color',
        'background_color', 'text_color',
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.OneToOneField(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='branding',
        verbose_name="Restaurant",
    )

    primary_color = models.CharField(
        max_length=7, default='#1E2A78',
        verbose_name="Couleur principale",
    )
    secondary_color = models.CharField(
        max_length=7, default='#D4AF37',
        verbose_name="Couleur secondaire",
    )
    accent_color = models.CharField(
        max_length=7, default='#2938A3',
        verbose_name="Couleur d'accent",
    )
    background_color = models.CharField(
        max_length=7, default='#F9FAFB',
        verbose_name="Couleur de fond",
    )
    text_color = models.CharField(
        max_length=7, default='#111827',
        verbose_name="Couleur du texte",
    )

    style_descriptor = models.CharField(
        max_length=120, blank=True, default='',
        help_text="Ambiance détectée (ex: « élégant », « bistrot chaleureux »).",
        verbose_name="Style",
    )

    is_ai_generated = models.BooleanField(
        default=False,
        verbose_name="Générée par l'IA",
    )
    source_job = models.ForeignKey(
        MenuScanJob,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='branding_results',
        verbose_name="Job d'origine",
    )

    # Indications complémentaires libres (police suggérée, contraste, etc.).
    extra = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Charte graphique de restaurant"
        verbose_name_plural = "Chartes graphiques de restaurant"

    def __str__(self):
        return f"Charte {self.restaurant.name}"

    def clean(self):
        for field in self.HEX_FIELDS:
            value = (getattr(self, field) or '').strip()
            if value and (not value.startswith('#') or len(value) != 7):
                raise ValidationError({
                    field: "Couleur hexadécimale attendue au format #RRGGBB.",
                })

    def save(self, *args, **kwargs):
        # Normalise en minuscules avant validation.
        for field in self.HEX_FIELDS:
            value = getattr(self, field) or ''
            setattr(self, field, value.strip().lower())
        self.full_clean()
        super().save(*args, **kwargs)

    def as_theme(self):
        """Dictionnaire prêt à être consommé par le thème client (Phase 5)."""
        return {
            'primaryColor': self.primary_color,
            'secondaryColor': self.secondary_color,
            'accentColor': self.accent_color,
            'backgroundColor': self.background_color,
            'textColor': self.text_color,
            'style': self.style_descriptor,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Job de traduction du menu existant (traduction en masse)
# ─────────────────────────────────────────────────────────────────────────────
class MenuTranslationJob(models.Model):
    """Tâche de traduction automatique du menu déjà saisi d'un restaurant.

    Complète les traductions manquantes des plats / catégories / sous-catégories
    via le fournisseur IA. Le front suit l'avancement par polling (progress).
    """

    class Status(models.TextChoices):
        PENDING = 'pending', "En attente"
        PROCESSING = 'processing', "Traduction en cours"
        DONE = 'done', "Terminé"
        FAILED = 'failed', "Échec"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='menu_translation_jobs',
        verbose_name="Restaurant",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='menu_translation_jobs',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    target_languages = models.JSONField(default=default_target_languages, blank=True)

    # Progression (pour le polling front).
    progress_done = models.PositiveIntegerField(default=0)
    progress_total = models.PositiveIntegerField(default=0)

    # Bilan final.
    report = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Traduction de menu (IA)"
        verbose_name_plural = "Traductions de menu (IA)"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['restaurant', 'status']),
        ]

    def __str__(self):
        return f"Traduction menu {self.restaurant_id} — {self.get_status_display()}"

    @property
    def progress_percent(self):
        if not self.progress_total:
            return 0
        return round(100 * self.progress_done / self.progress_total)