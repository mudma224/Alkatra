"""
Producer Kafka — publie les recommandations sur le topic 'recommendations-generated'.
Conserve en parallèle la sauvegarde MongoDB (gérée par mongo_writer).
"""
import json
import logging
from datetime import datetime, timezone

from kafka import KafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)


class KafkaRecommendationProducer:
    """Producer Kafka pour publier les recommandations d'irrigation."""

    def __init__(self):
        self._producer: KafkaProducer | None = None
        self._topic = settings.KAFKA_OUTPUT_TOPIC
        # Initialiser immédiatement (pas de lazy init)
        self._ensure_connected()

    def _ensure_connected(self):
        if self._producer is None:
            self._producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BROKERS.split(","),
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                retries=3,
            )
            logger.info(
                "KafkaRecommendationProducer connecté → topic=%s", self._topic
            )

    def publish(self, response):
        """Publie une PredictionResponse sur le topic recommendations-generated.

        Args:
            response: PredictionResponse avec les champs étendus
                      (duration_minutes, soil_humidity_pct, eto, generated_at).
        """
        if not settings.ENABLE_KAFKA_PRODUCER:
            return

        try:
            self._ensure_connected()

            message = {
                "parcel_id": response.parcel_id,
                "should_irrigate": response.should_irrigate,
                "irrigation_probability": response.irrigation_probability,
                "water_amount_mm": response.water_amount_mm,
                "water_amount_raw_mm": response.water_amount_raw_mm,
                "bias_applied_mm": response.bias_applied_mm,
                "top_factors": [f.model_dump() for f in response.top_factors],
                "model_version": response.model_version,
                "demo_mode": response.demo_mode,
                "duration_minutes": response.duration_minutes,
                "soil_humidity_pct": response.soil_humidity_pct,
                "eto": response.eto,
                "generated_at": response.generated_at or datetime.now(timezone.utc).isoformat(),
            }

            self._producer.send(self._topic, key=response.parcel_id, value=message)
            self._producer.flush(timeout=5)
            logger.info("✓ Recommandation publiée Kafka: parcel=%s", response.parcel_id)

        except Exception as exc:
            logger.error("✗ Échec publication Kafka (BLOQUANT): %s", exc)
            raise

    def close(self):
        if self._producer is not None:
            try:
                self._producer.flush(timeout=5)
                self._producer.close()
            except Exception:
                pass
            self._producer = None


# Instance globale (init immédiate dans le lifespan)
kafka_producer: KafkaRecommendationProducer | None = None
