FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DOCKER_ENV=1

WORKDIR /app

# Dépendances système minimales
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copie du projet
COPY . .

# Fichiers statiques (admin Django, Swagger, etc.)
RUN python manage.py collectstatic --noinput

# Dossiers media et exports (seront montés en volumes)
RUN mkdir -p /app/media /app/exports

# Daphne (ASGI) pour supporter HTTP + WebSocket
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "backend.asgi:application"]