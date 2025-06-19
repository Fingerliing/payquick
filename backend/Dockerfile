# Dockerfile

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Dépendances système minimales
RUN apt-get update && apt-get install -y gcc libpq-dev && apt-get clean

# Install requirements
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copie du projet
COPY . .

# Collect static si nécessaire (optionnel)
# RUN python manage.py collectstatic --noinput

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]
