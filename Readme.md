# 🍽️ Payquick

Une application web complète pour la gestion de restaurants, construite avec **Next.js** côté frontend et **Django** côté backend.

---

## 🔧 Fonctionnalités

### 👨‍🍳 Restaurateurs
- Création de compte et authentification sécurisée
- Gestion complète des restaurants (CRUD)
- Tableau de bord personnalisé
- Gestion des menus et des produits
- Statistiques de ventes

### 🍴 Consommateurs
- Visualisation des restaurants et menus
- Système de recherche avancé
- Commande et paiement en ligne sécurisé
- Historique des commandes
- Système de notation et commentaires

---

## ⚙️ Stack technique

### Frontend
- ⚛️ **Framework** : Next.js 14
- 📝 **Langage** : TypeScript
- 🎨 **Styling** : Tailwind CSS
- 🔄 **State Management** : React Context API
- 📱 **Responsive Design** : Mobile-first

### Backend
- 🐍 **Framework** : Django 5.0
- 🔄 **API** : Django REST Framework
- 🗄️ **Base de données** : PostgreSQL
- 🔐 **Authentification** : JWT
- 📦 **Gestion des médias** : Pillow

### DevOps
- 🛡️ **Sécurité** : Variables d'environnement, CSRF, CORS
- 📊 **Monitoring** : Logging avancé
- 🧪 **Tests** : Unitaires et d'intégration
- 🚀 **CI/CD** : GitHub Actions

---

## 📂 Structure du projet

```bash
payquick/
├── backend/                 # Projet Django
│   ├── api/                # Application principale
│   │   ├── models/        # Modèles de données
│   │   ├── views/         # Vues API
│   │   ├── serializers/   # Sérialiseurs
│   │   └── tests/         # Tests unitaires
│   └── backend/           # Configuration Django
├── frontend/              # Projet Next.js
│   ├── app/              # Pages avec App Router
│   ├── components/       # Composants React
│   ├── lib/             # Utilitaires et API
│   ├── styles/          # Styles globaux
│   └── types/           # Types TypeScript
```

---

## 🚀 Installation et configuration

### Prérequis
- Python 3.11+
- Node.js 18+
- PostgreSQL
- Git

### 1. Configuration de l'environnement

```bash
# Cloner le dépôt
git clone https://github.com/Fiingerling/payquick.git
cd payquick

# Créer les fichiers d'environnement
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

### 2. Configuration du backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate sous Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### 3. Configuration du frontend

```bash
cd ../frontend
npm install
npm run dev
```

---

## 🔐 Configuration des variables d'environnement

### backend/.env
```env
SECRET_KEY=votre_secret_key
DEBUG=True
DB_NAME=payquick_db
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_HOST=localhost
DB_PORT=5432
```

### frontend/.env.local
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=votre_clé_stripe
```

---

## 🧪 Tests

### Backend
```bash
cd backend
python manage.py test
```

### Frontend
```bash
cd frontend
npm test
```

---

## 📝 Documentation

- [Documentation API](docs/api.md)
- [Guide de contribution](docs/contributing.md)
- [Changelog](docs/changelog.md)

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Consultez notre [guide de contribution](docs/contributing.md) pour plus de détails.

---

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

