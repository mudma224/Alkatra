"""FastAPI — ML Inference Service Al Katra Bel Qatra."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.config import settings
from app.schemas.prediction import PredictionRequest, PredictionResponse
from app.services.model_service import model_service
from app.core.metrics import PREDICTIONS_TOTAL, PREDICTION_LATENCY

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_service.load()
    import app.services.mongo_writer as mw
    
    # Initialiser Kafka Producer
    if settings.ENABLE_KAFKA_PRODUCER:
        try:
            import app.services.kafka_producer as kp
            kp.kafka_producer = kp.KafkaRecommendationProducer()
            logger.info("Kafka Producer démarré")
        except Exception as exc:
            logger.error("Erreur initialisation Kafka Producer: %s", exc)
    
    if settings.ENABLE_KAFKA_CONSUMER and not model_service.demo_mode:
        try:
            mw.mongo_writer = mw.MongoWriter()
            from app.services.kafka_consumer import ml_kafka_consumer
            ml_kafka_consumer.start()
        except Exception as exc:
            logger.warning("Consumer/Mongo non démarrés: %s", exc)
    yield
    try:
        from app.services.kafka_consumer import ml_kafka_consumer
        ml_kafka_consumer.stop()
        if mw.mongo_writer:
            mw.mongo_writer.close()
        # Fermer Kafka Producer
        if settings.ENABLE_KAFKA_PRODUCER:
            import app.services.kafka_producer as kp
            if kp.kafka_producer:
                kp.kafka_producer.close()
    except Exception:
        pass


app = FastAPI(title="Al Katra ML Inference", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    models_ready = model_service._classifier is not None and model_service._regressor is not None
    return {
        "status": "ok" if models_ready else "degraded",
        "demo_mode": model_service.demo_mode,
        "models_loaded": models_ready,
        "mlflow_uri": settings.MLFLOW_TRACKING_URI,
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(req: PredictionRequest):
    try:
        with PREDICTION_LATENCY.time():
            response = model_service.predict(req)
        PREDICTIONS_TOTAL.labels(
            source="http",
            result="irrigate" if response.should_irrigate else "no_irrigate",
        ).inc()
        # Publier sur Kafka
        if settings.ENABLE_KAFKA_PRODUCER:
            try:
                from app.services.kafka_producer import kafka_producer
                if kafka_producer:
                    kafka_producer.publish(response)
            except Exception as exc:
                logger.error("Erreur publication Kafka: %s", exc)
        return response
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Feature manquante: {exc}")
    except Exception as exc:
        logger.exception("Erreur prédiction")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
