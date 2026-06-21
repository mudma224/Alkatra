"""Métriques Prometheus."""
from prometheus_client import Counter, Histogram

PREDICTIONS_TOTAL = Counter(
    "ml_predictions_total", "Nombre total de prédictions", ["source", "result"]
)
MISSING_FEATURES_TOTAL = Counter(
    "ml_missing_features_total", "Messages rejetés (features manquantes)", ["feature"]
)
PREDICTION_LATENCY = Histogram(
    "ml_prediction_latency_seconds", "Latence d'une prédiction"
)
KAFKA_MESSAGES_TOTAL = Counter(
    "ml_kafka_messages_total", "Messages Kafka traités", ["status"]
)
