# Eat&Go

Application mobile de gestion de restaurants développée avec React Native et Expo.

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- Expo CLI
- Un émulateur Android/iOS ou un appareil physique

### Installation

```bash
# Cloner le repository
git clone <votre-repo>
cd EatAndGo

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos configurations

# Démarrer l'application
npm start
```

### Configuration API

1. Assurez-vous que le backend Django est démarré sur `http://localhost:8000`
2. Configurez `EXPO_PUBLIC_API_URL` dans le fichier `.env`
3. Pour les tests avec un appareil physique, remplacez `localhost` par l'IP de votre machine

### Structure du projet

```
EatQuickeR/
├── app/                    # Routes et écrans (Expo Router)
│   ├── (auth)/            # Écrans d'authentification
│   ├── (tabs)/            # Navigation par onglets
│   ├── restaurant/        # Écrans de restaurant
│   ├── menu/              # Écrans de menu
│   └── order/             # Écrans de commande
├── components/            # Composants réutilisables
│   ├── ui/               # Composants UI de base
│   ├── restaurant/       # Composants restaurant
│   ├── menu/             # Composants menu
│   └── order/            # Composants commande
├── contexts/             # Contextes React
├── services/             # Services API
├── types/                # Types TypeScript
├── utils/                # Utilitaires
└── assets/               # Images, icônes, fonts
```

## 📱 Fonctionnalités

### Authentification
- [x] Connexion/Inscription
- [x] Gestion du profil utilisateur
- [x] Stockage sécurisé des tokens

### Gestion des restaurants
- [x] Liste des restaurants
- [x] Création/édition de restaurants
- [x] Gestion du statut (ouvert/fermé)
- [x] Upload d'images
- [x] Recherche et filtres

### Gestion des menus
- [x] Création de menus par restaurant
- [x] Gestion des catégories de produits
- [x] Ajout/édition de produits
- [x] Gestion des variantes et add-ons
- [x] Informations nutritionnelles

### Système de commandes
- [x] Panier de commande
- [x] Calcul automatique des totaux
- [x] Gestion des adresses de livraison
- [x] Suivi des commandes
- [x] Historique des commandes

### Interface utilisateur
- [x] Design moderne et responsive
- [x] Navigation intuitive
- [x] Composants réutilisables
- [x] Gestion des états de chargement
- [x] Validation des formulaires

## 🛠️ Technologies utilisées

- **React Native** - Framework mobile
- **Expo** - Plateforme de développement
- **TypeScript** - Typage statique
- **Expo Router** - Navigation
- **Axios** - Client HTTP
- **AsyncStorage** - Stockage local
- **React Hook Form** - Gestion des formulaires
- **Zod** - Validation des données

## 🚀 Déploiement

### Build de développement
```bash
# Android
eas build --platform android --profile development

# iOS
eas build --platform ios --profile development
```

### Build de production
```bash
# Android
eas build --platform android --profile production

# iOS
eas build --platform ios --profile production
```

### Publication sur les stores
```bash
# Google Play Store
eas submit --platform android

# Apple App Store
eas submit --platform ios
```

## 🔧 Configuration avancée

### Variables d'environnement

```env
# API
EXPO_PUBLIC_API_URL=https://your-api.com
EXPO_PUBLIC_API_TIMEOUT=10000

# Stripe
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Google Maps (optionnel)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key

# Environnement
EXPO_PUBLIC_ENVIRONMENT=production
```

### Personnalisation

1. **Couleurs** : Modifiez `utils/constants.ts` pour changer la palette de couleurs
2. **Logos** : Remplacez les fichiers dans `assets/`
3. **Configurations** : Adaptez `app.json` selon vos besoins

## 📚 Documentation API

L'application communique avec le backend Django via une API REST. Les endpoints principaux :

- `POST /auth/login/` - Connexion
- `GET /restaurants/` - Liste des restaurants
- `POST /restaurants/` - Création de restaurant
- `GET /menus/{id}/` - Détails d'un menu
- `POST /orders/` - Création de commande

## 🐛 Dépannage

### Problèmes courants

1. **Erreur de connexion API**
   - Vérifiez que le backend est démarré
   - Vérifiez l'URL dans `.env`

2. **Erreur de build**
   - Nettoyez le cache : `npx expo start --clear`
   - Réinstallez les dépendances : `rm -rf node_modules && npm install`

3. **Problèmes de navigation**
   - Vérifiez que tous les écrans sont correctement configurés dans `app/`

## 🤝 Contribution

1. Fork le projet
2. Créez une branche feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Équipe

- **Développeur Frontend** - Développement de l'application mobile
- **Développeur Backend** - API Django et base de données
- **UI/UX Designer** - Design de l'interface utilisateur

## 📞 Support

Pour toute question ou support, contactez-nous :
- Email: support@eatquicker.com
- Issues GitHub: [Créer un ticket](https://github.com/your-repo/issues)