"""Métriques Prometheus."""
from prometheus_client import Counter, Gauge, Histogram

PREDICTIONS_TOTAL = Counter(
    "ml_predictions_total", "Nombre total de prédictions", ["source", "result"]
)
MISSING_FEATURES_TOTAL = Counter(
    "ml_missing_features_total", "Messages rejetés (features manquantes)", ["feature"]
)
PREDICTION_LATENCY = Histogram(
    "ml_prediction_latency_seconds", "Latence d'une prédiction (chemin HTTP /predict)"
)
PREDICTION_KAFKA_LATENCY = Histogram(
    "ml_prediction_kafka_latency_seconds", "Latence d'une prédiction (chemin Kafka)"
)
KAFKA_MESSAGES_TOTAL = Counter(
    "ml_kafka_messages_total", "Messages Kafka traités", ["status"]
)
MODELS_LOADED = Gauge(
    "ml_models_loaded", "Nombre de modèles chargés depuis MLflow (classifier + regressor)"
)
DEMO_MODE = Gauge(
    "ml_demo_mode", "Mode démo actif (1 = modèles de substitution, 0 = modèles MLflow)"
)
