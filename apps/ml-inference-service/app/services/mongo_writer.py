"""Écriture des recommandations dans MongoDB."""
import logging
from datetime import datetime, timezone
from pymongo import MongoClient, DESCENDING

from app.config import settings

logger = logging.getLogger(__name__)


class MongoWriter:
    def __init__(self):
        self.client = MongoClient(settings.MONGODB_URI)
        self.col = self.client[settings.MONGO_DB][settings.MONGO_COLLECTION]
        self.col.create_index([("parcel_id", DESCENDING), ("created_at", DESCENDING)])
        logger.info("MongoWriter prêt → %s.%s", settings.MONGO_DB, settings.MONGO_COLLECTION)

    def save(self, response, source: str = "kafka"):
        doc = {
            "parcel_id": response.parcel_id,
            "should_irrigate": response.should_irrigate,
            "irrigation_probability": response.irrigation_probability,
            "water_amount_mm": response.water_amount_mm,
            "water_amount_raw_mm": response.water_amount_raw_mm,
            "bias_applied_mm": response.bias_applied_mm,
            "top_factors": [f.model_dump() for f in response.top_factors],
            "model_version": response.model_version,
            "source": source,
            "created_at": datetime.now(timezone.utc),
        }
        self.col.insert_one(doc)
        logger.debug("Recommandation enregistrée: %s", response.parcel_id)

    def close(self):
        self.client.close()


mongo_writer: MongoWriter | None = None
