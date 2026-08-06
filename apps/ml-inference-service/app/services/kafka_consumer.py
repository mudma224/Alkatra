"""
Consumer Kafka : processed-sensor-data (22 features Spark) → predict → MongoDB + Kafka publish.
Validation stricte : features manquantes = message rejeté (PAS de devinette).
"""
import json
import logging
import threading

from kafka import KafkaConsumer

from app.config import settings
from app.schemas.prediction import FEATURE_NAMES, PredictionRequest
from app.services.model_service import model_service
from app.core.metrics import KAFKA_MESSAGES_TOTAL, MISSING_FEATURES_TOTAL, PREDICTIONS_TOTAL

logger = logging.getLogger(__name__)


class MLKafkaConsumer:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info("Kafka consumer démarré (topic=%s)", settings.KAFKA_INPUT_TOPIC)

    def _run(self):
        from app.services.mongo_writer import mongo_writer
        consumer = KafkaConsumer(
            settings.KAFKA_INPUT_TOPIC,
            bootstrap_servers=settings.KAFKA_BROKERS.split(","),
            group_id=settings.KAFKA_GROUP_ID,
            auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
            enable_auto_commit=True,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        )
        for msg in consumer:
            if not self._running:
                break
            try:
                self._process(msg.value, mongo_writer)
            except Exception as exc:
                logger.exception("Erreur traitement message: %s", exc)
                KAFKA_MESSAGES_TOTAL.labels(status="error").inc()

    def _process(self, payload: dict, mongo_writer):
        parcel_id = payload.get("parcel_id")
        if not parcel_id:
            KAFKA_MESSAGES_TOTAL.labels(status="no_parcel").inc()
            return

        # Validation stricte des 22 features
        missing = [f for f in FEATURE_NAMES if f not in payload]
        if missing:
            for f in missing:
                MISSING_FEATURES_TOTAL.labels(feature=f).inc()
            logger.warning("Message %s rejeté — features manquantes: %s", parcel_id, missing)
            KAFKA_MESSAGES_TOTAL.labels(status="missing_features").inc()
            return

        # Construction du PredictionRequest à partir du payload Kafka
        features = {f: payload[f] for f in FEATURE_NAMES}
        features["parcel_id"] = parcel_id
        req = PredictionRequest(**features)
        response = model_service.predict(req)
        # Count prediction regardless of source (HTTP vs Kafka)
        try:
            PREDICTIONS_TOTAL.labels(
                source="kafka",
                result=("irrigate" if response.should_irrigate else "no_irrigate"),
            ).inc()
        except Exception:
            logger.exception("Erreur incrémentation métrique PREDICTIONS_TOTAL")
        if mongo_writer:
            mongo_writer.save(response, source="kafka")
        
        # Publier la prédiction sur Kafka
        if settings.ENABLE_KAFKA_PRODUCER:
            try:
                from app.services.kafka_producer import kafka_producer
                if kafka_producer:
                    kafka_producer.publish(response)
            except Exception as exc:
                logger.error("Erreur publication Kafka pour parcel=%s: %s", parcel_id, exc)
        
        KAFKA_MESSAGES_TOTAL.labels(status="ok").inc()

    def stop(self):
        self._running = False


ml_kafka_consumer = MLKafkaConsumer()
