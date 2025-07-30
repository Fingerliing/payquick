# 🍽️ Eat&Go

**Solution de commande à table digitale pour restaurants**

Eat&Go révolutionne l'expérience de restauration en permettant aux clients de commander directement depuis leur table en scannant un QR code, tout en offrant aux restaurateurs un système de gestion complet et temps réel.

## 🚀 Concept

### Pour le restaurateur
- 📝 Enregistrement et gestion de ses restaurants
- 🍕 Configuration des menus avec photos et descriptions
- 📱 Génération automatique de QR codes uniques par table
- 🏷️ Placement des codes sur les tables (avec code de secours)
- 📊 Réception et suivi des commandes en temps réel
- ✅ Gestion des statuts de commande (préparation → prêt → servi)
- 💰 Suivi des paiements (app ou caisse)

### Pour le client
- 📷 Scan du QR code ou saisie manuelle du code table
- 📋 Accès instantané à la carte du restaurant
- 👥 **Commande collaborative** - plusieurs personnes commandent sur la même table
- 💳 Choix du mode de paiement (via app ou en caisse)
- 🧮 **Répartition des frais** entre les convives si paiement via app
- ⏱️ Suivi en temps réel de l'état de la commande
- 🔔 Notifications quand la commande est prête

## 🏗️ Architecture

- **Backend** : Django + Django REST Framework
- **Frontend** : React.js + Expo (responsive mobile/desktop)
- **Base de données** : PostgreSQL
- **Temps réel** : WebSocket (Node.js + Socket.io)
- **QR Codes** : Génération automatique avec python-qrcode

## 📁 Structure du projet

```
eatandgo/
├── backend/                 # API Django
│   ├── api/                # Application principale
│   │   ├── models/         # Modèles (Restaurant, Table, Order, etc.)
│   │   ├── views/          # API endpoints
│   │   ├── serializers/    # Sérialiseurs DRF
│   │   └── utils/          # Génération QR, logique métier
│   ├── requirements.txt    # Dépendances Python
│   └── manage.py          # Script Django
├── frontend/               # Application React
│   └── EatAndGo/          # Code source React
│       ├── src/
│       │   ├── components/ # Composants React
│       │   │   ├── Restaurant/  # Interface restaurateur
│       │   │   ├── Customer/    # Interface client
│       │   │   └── Shared/      # Composants partagés
│       │   ├── services/   # API calls
│       │   ├── context/    # State management
│       │   └── hooks/      # Hooks personnalisés
│       └── package.json    # Dépendances React
├── ws-server/              # Serveur WebSocket
└── scripts/                # Scripts utilitaires
```

## 🛠️ Technologies

### Backend
- **Django 5.0** - Framework web Python
- **Django REST Framework** - API REST
- **PostgreSQL** - Base de données
- **python-qrcode** - Génération QR codes
- **JWT** - Authentification
- **Pillow** - Traitement images

### Frontend  
- **React.js 18** - Interface utilisateur
- **qr-scanner** - Scanner QR codes
- **Socket.io-client** - WebSocket client
- **Axios** - Requêtes HTTP
- **React Context** - Gestion d'état
- **CSS Modules** - Styles

### Infrastructure
- **Node.js + Socket.io** - Serveur temps réel
- **PostgreSQL** - Stockage données
- **Heroku** - Déploiement (optionnel)

## ⚡ Installation rapide

### Prérequis
- Python 3.11+
- Node.js 16+
- PostgreSQL
- Git

### 1. Cloner le repository
```bash
git clone https://github.com/Fingerliing/payquick.git
cd payquick
```

### 2. Configuration Backend
```bash
cd backend

# Environnement virtuel Python
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Installation dépendances
pip install -r requirements.txt

# Configuration base de données
python manage.py migrate
python manage.py createsuperuser

# Lancement serveur Django
python manage.py runserver  # http://localhost:8000
```

### 3. Configuration Frontend
```bash
cd frontend/EatAndGo

# Installation dépendances Node.js
npm install

# Lancement serveur React
npm start  # http://localhost:3000
```

### 4. Serveur WebSocket
```bash
cd ws-server

# Installation et lancement
npm install
npm start  # ws://localhost:8080
```

## 🔧 Configuration

### Variables d'environnement Backend (.env)
```env
SECRET_KEY=votre-clé-secrète-django
DEBUG=True
DATABASE_URL=postgresql://user:password@localhost/eatandgo_db
QR_CODE_BASE_URL=https://votre-domaine.com/table/
WEBSOCKET_URL=ws://localhost:8080
```

### Variables d'environnement Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8080
REACT_APP_QR_SCANNER_ENABLED=true
```

## 📱 Utilisation

### Configuration Restaurateur

1. **Connexion** à l'interface restaurateur
2. **Ajout du restaurant** avec informations et logo
3. **Configuration du menu** :
   ```
   - Catégories (Entrées, Plats, Desserts...)
   - Plats avec photos, descriptions, prix
   - Allergènes et informations nutritionnelles
   ```
4. **Génération des QR codes** :
   ```
   - Un QR code unique par table
   - Code de secours (6 chiffres) affiché sous le QR
   - Impression des codes pour placement sur tables
   ```

### Expérience Client

1. **Accès à la table** :
   - Scanner le QR code avec l'appareil photo
   - Ou saisir manuellement le code de secours
   
2. **Commande collaborative** :
   - Plusieurs personnes peuvent commander simultanément
   - Chaque item est attribué à une personne
   - Synchronisation temps réel entre tous les appareils
   
3. **Finalisation** :
   - Choix du mode de paiement (app ou caisse)
   - Si paiement app : répartition automatique des frais
   - Confirmation et suivi de la commande

### Gestion Restaurateur

1. **Réception commandes** :
   - Notifications temps réel des nouvelles commandes
   - Vue détaillée par table et par plat
   
2. **Mise à jour statuts** :
   - En préparation → Prêt → Servi
   - Notifications automatiques aux clients
   
3. **Suivi paiements** :
   - Statut payé/non payé par commande
   - Distinction paiement app vs caisse

## 🔗 API Endpoints

### Accès Tables
```
GET  /api/tables/access/{qr_code}/     # Accès via QR code
POST /api/tables/access/manual/       # Accès manuel
GET  /api/tables/{id}/menu/           # Menu de la table
```

### Commandes Collaboratives
```
POST /api/orders/start-session/       # Démarrer session
GET  /api/orders/session/{id}/        # État session
POST /api/orders/add-item/            # Ajouter item
POST /api/orders/finalize/            # Finaliser commande
```

### Gestion Restaurateur
```
GET  /api/restaurant/orders/          # Commandes en cours
PUT  /api/restaurant/orders/{id}/status/  # Mise à jour statut
POST /api/restaurant/tables/qr/       # Générer QR codes
```

## 🔄 WebSocket Events

### Événements Client
```javascript
// Rejoindre une table
socket.emit('join_table', { qr_code: 'TABLE_CODE' });

// Écouter mises à jour commande
socket.on('order_updated', (data) => {
  // Synchronisation commande collaborative
});

// Notification statut
socket.on('order_status_changed', (status) => {
  // "Votre commande est prête !"
});
```

### Événements Restaurateur
```javascript
// Nouvelle commande
socket.on('new_order', (order) => {
  playNotificationSound();
  displayNewOrder(order);
});
```

## 🧪 Tests

### Backend
```bash
cd backend
python manage.py test
```

### Frontend
```bash
cd frontend/EatAndGo  
npm test
```

## 📊 Modèles de données

### Restaurant
- Informations établissement (nom, adresse, contact)
- Logo et images
- Propriétaire (compte restaurateur)

### Table  
- Numéro de table
- QR code unique généré automatiquement
- Code de secours (6 chiffres)
- Nombre de places

### Order
- Session de commande collaborative
- Items commandés avec attribution par personne
- Statut (en attente → préparation → prêt → servi)
- Mode et statut de paiement

### MenuItem
- Plats du menu avec photos
- Prix, descriptions, catégories
- Allergènes et disponibilité

## 🚀 Déploiement

### Déploiement Heroku
```bash
# Configuration Heroku
heroku create eatandgo-app
heroku addons:create heroku-postgresql:basic

# Variables d'environnement
heroku config:set SECRET_KEY=your-secret-key
heroku config:set DATABASE_URL=your-db-url

# Déploiement
git push heroku main
heroku run python manage.py migrate
```

## 🔒 Sécurité

- **QR codes uniques** : Impossible à deviner ou bruteforcer
- **Validation serveur** : Vérification authenticity des codes
- **Sessions sécurisées** : Isolation des commandes par table
- **Rate limiting** : Protection contre le spam
- **Authentification JWT** : Sécurisation API restaurateur

## 🌟 Avantages

### Pour les restaurants
- ⚡ **Réduction temps d'attente** clients
- 🎯 **Optimisation du service** (serveurs focalisés sur le service)
- 📈 **Augmentation efficacité** prise de commandes
- 📊 **Analytics détaillées** sur les ventes
- 💰 **Réduction erreurs** de commande

### Pour les clients  
- 🕐 **Commande à leur rythme** sans attendre le serveur
- 👥 **Commande de groupe** simplifiée et équitable
- 💳 **Flexibilité paiement** (app ou caisse)
- 🔍 **Transparence** prix et descriptions détaillées
- 📱 **Solution moderne** et hygiénique

## 🤝 Contribution

Les contributions sont les bienvenues ! 

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commit vos changements (`git commit -m 'Ajout nouvelle fonctionnalité'`)
4. Push vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 📞 Support

Pour toute question ou suggestion :
- 🐛 **Issues** : [GitHub Issues](https://github.com/Fingerliing/payquick/issues)
- 📧 **Email** : support@eatandgo.com
- 📚 **Documentation** : [Wiki du projet](https://github.com/Fingerliing/payquick/wiki)

---

**Eat&Go** - *Révolutionnez votre expérience de restauration* 🍽️✨