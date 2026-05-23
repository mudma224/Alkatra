"""
Al Katra Bel Qatra — ML Inference Service
Phase 0 S4 placeholder — FastAPI minimal avec /health
Le code complet (XGBoost, MLflow, SHAP, endpoints predict) sera ajouté en S4 par Dev2
"""
from fastapi import FastAPI
from datetime import datetime
import os

app = FastAPI(
    title="Al Katra — ML Inference Service",
    description="Service de prédiction d'irrigation XGBoost via MLflow",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)


@app.get("/health")
async def health():
    """
    Health check endpoint.
    Utilisé par Docker healthcheck, K8s liveness probe et scripts/health-check.sh
    """
    return {
        "status": "ok",
        "service": "ml-inference-service",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "phase": "S4 placeholder — XGBoost/MLflow à implémenter",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/")
async def root():
    return {
        "message": "Al Katra ML Inference Service",
        "docs": "/api/docs",
        "health": "/health",
    }