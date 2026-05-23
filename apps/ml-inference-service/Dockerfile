# =============================================
# ML Inference Service — FastAPI + XGBoost
# Phase 0 S4 — Python 3.11
# =============================================

FROM python:3.11-slim AS base

WORKDIR /app

# Dépendances système nécessaires pour XGBoost et scikit-learn
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000

# --reload : hot-reload en développement (désactiver en production)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]