# Étape 1 : build avec image officielle python
FROM python:3.11-slim

# Variables d’environnement de base
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Création du dossier app
WORKDIR /app

# Installation des dépendances système minimales
RUN apt-get update && apt-get install -y \
    libpq-dev gcc netcat-openbsd && \
    apt-get clean

# Copier les fichiers de requirements
COPY requirements.txt /app/

# Installer les requirements Python
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copier tout le code projet
COPY . /app/

# Collectstatic (important en prod)
RUN python manage.py collectstatic --noinput

# Exposer le port par défaut
EXPOSE 8000

# Lancement via Gunicorn (WSGI)
CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]
