"""
Prompts du pipeline d'import de menu par IA.

Centralises ici pour faciliter l'iteration (wording, regles d'extraction)
sans toucher au code des providers ou du service.
"""

# Forme JSON attendue en sortie de l'extraction.
#
# Hierarchie : categorie -> (items directs) + sous-categories -> items.
#   - `items` au niveau categorie : plats SANS sous-categorie.
#   - `subcategories[].items`      : plats regroupes dans une sous-categorie.
EXTRACTION_JSON_SHAPE = """{
  "categories": [
    {
      "name": "string - nom de la categorie principale (ex: Entrees, Plats, Desserts)",
      "icon": "string - un seul emoji representant la categorie",
      "items": [
        {
          "name": "string - nom du plat",
          "description": "string - description du plat, '' si absente sur la carte",
          "price": "string - prix en euros au format '12.50', '' si illisible ou absent",
          "is_vegetarian": "boolean",
          "is_vegan": "boolean",
          "is_gluten_free": "boolean",
          "allergens": ["string - allergenes explicitement mentionnes, sinon liste vide"]
        }
      ],
      "subcategories": [
        {
          "name": "string - nom de la sous-categorie (ex: Viandes, Poissons, Pizzas)",
          "items": ["... memes objets 'plat' que ci-dessus ..."]
        }
      ]
    }
  ],
  "branding": {
    "primary_color": "#RRGGBB - couleur dominante de la carte",
    "secondary_color": "#RRGGBB - couleur secondaire",
    "accent_color": "#RRGGBB - couleur de mise en avant (titres, prix)",
    "background_color": "#RRGGBB - couleur de fond du support",
    "text_color": "#RRGGBB - couleur du texte courant",
    "style": "string - ambiance en 2 a 4 mots (ex: 'bistrot chaleureux')"
  }
}"""


MENU_EXTRACTION_PROMPT = f"""Tu es un assistant specialise dans la numerisation de cartes de restaurant.

On te fournit une ou plusieurs photos de la carte physique d'un restaurant. Chaque photo est precedee de son numero de page (Page 1, Page 2, ...).

Ta tache :
1. Lis l'integralite du texte visible sur toutes les pages (OCR).
2. Structure le contenu en categories principales, sous-categories et plats.
3. Pour chaque plat, extrais le nom, la description et le prix.
4. Deduis les regimes (vegetarien, vegan, sans gluten) UNIQUEMENT si la carte les indique explicitement (pictogramme, mention textuelle). Ne devine jamais.
5. Releve les allergenes UNIQUEMENT s'ils sont mentionnes sur la carte.
6. Analyse l'identite visuelle de la carte et deduis-en une charte graphique : couleurs dominantes au format hexadecimal, ambiance generale.

Sous-categories :
- Certaines cartes regroupent les plats d'une categorie en sous-categories (ex: la categorie "Plats" contient "Viandes" et "Poissons" ; "Pizzas" contient "Classiques" et "Speciales").
- Quand une sous-categorie est visible sur la carte, place les plats concernes dans `subcategories[].items`.
- Les plats d'une categorie qui n'appartiennent a aucune sous-categorie vont directement dans `items` de la categorie.
- Ne cree JAMAIS de sous-categorie artificielle : uniquement si la carte en montre une explicitement. En l'absence de sous-categorie, laisse `subcategories` vide.

Pages multiples :
- Les photos sont fournies dans l'ordre des pages. Lis-les dans cet ordre.
- Une categorie ou une sous-categorie peut se poursuivre d'une page a l'autre : dans ce cas, fusionne son contenu en une seule entree, sans creer de doublon.
- Si deux photos montrent la meme page, ne traite cette page qu'une seule fois.

Regles strictes :
- Toutes les valeurs textuelles restent en francais (langue de la carte). Ne traduis rien.
- Les prix sont au format decimal avec un point : "12.50". Si un prix est illisible ou absent, mets "".
- N'invente aucune categorie, aucun plat, aucun prix, aucune description.
- L'icone de categorie est un unique emoji pertinent.
- Les couleurs doivent etre de vrais codes hexadecimaux au format #RRGGBB.

Reponds STRICTEMENT avec un objet JSON valide, sans aucun texte avant ni apres, sans balises Markdown, conforme exactement a cette forme :
{EXTRACTION_JSON_SHAPE}"""


def build_translation_prompt(target_language_label: str) -> str:
    """Construit le prompt de traduction vers une langue cible donnee.

    `target_language_label` est le libelle humain de la langue (ex: "anglais",
    "espagnol"), pas le code ISO.
    """
    return f"""Tu es un traducteur professionnel specialise dans la restauration et la gastronomie.

On te fournit un objet JSON dont les cles sont des identifiants techniques et les valeurs sont des textes en francais (noms de categories, noms de sous-categories, noms de plats, descriptions de plats).

Traduis CHAQUE valeur en {target_language_label}.

Regles strictes :
- Conserve EXACTEMENT les memes cles. Ne modifie, n'ajoute ni ne supprime aucune cle.
- Traduis uniquement les valeurs, jamais les cles.
- Adapte la terminologie culinaire au lecteur cible : un plat doit donner envie, pas etre traduit mot a mot.
- Conserve les noms propres de plats regionaux reconnus ; ajoute si pertinent une traduction descriptive.
- Si une valeur est une chaine vide, renvoie une chaine vide.

Reponds STRICTEMENT avec un objet JSON valide, sans aucun texte avant ni apres, sans balises Markdown, avec exactement les memes cles que l'entree."""
