# 🍽️ Restaurant App

Une application web complète pour la gestion de restaurants, construite avec **Next.js** côté frontend et **Django** côté backend.

---

## 🔧 Fonctionnalités

### 👨‍🍳 Restaurateurs
- Création de compte
- Ajout de restaurants avec description
- Liste des établissements enregistrés

### 🍴 Consommateurs
- Visualisation des restaurants
- (bientôt) Commande et paiement en ligne

---

## ⚙️ Stack technique

- ⚛️ **Frontend** : Next.js (TypeScript, Tailwind CSS)
- 🐍 **Backend** : Django + Django REST Framework
- 🛡️ **Sécurité** : Variables d'environnement `.env`, CSRF
- 🔌 **API REST** : Authentification, création et lecture de restaurants

---

## 📂 Structure du projet

```bash
mon-projet/
├── backend/         # Projet Django
│   ├── api/         # App Django avec modèles, vues, urls, tests
│   └── backend/     # Configuration principale Django
├── frontend/        # Projet Next.js (React + TS)
│   ├── app/         # Pages avec App Router
│   ├── components/  # Composants réutilisables
│   ├── types/       # Interfaces TypeScript
│   └── lib/         # Utilitaires (API, auth)
```

---

## 🚀 Démarrage rapide

### 1. Cloner le dépôt

```bash
git clone https://github.com/Fiingerling/payquick.git
cd restaurant-app
```

### 2. Configuration du backend (Django)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate sous Windows
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### 3. Configuration du frontend (Next.js)

```bash
cd ../frontend
npm install
cp .env.local.example .env.local
npm run dev
```

---

## 🔐 Fichiers `.env`

### backend/.env
```
SECRET_KEY=change-me
DEBUG=True
DB_NAME=db.sqlite3
```

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🔮 Tests

```bash
# Django
cd backend
python manage.py test
```

---

## 🧠 À venir

- Paiement en ligne (Stripe)
- Division de l’addition
- Authentification JWT
- Interface mobile responsive

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Merci d’ouvrir une issue ou une pull request pour proposer des idées.

---

## 📄 Licence

Ce projet est sous licence **MIT**.

