"""Configuration centralisée — lue depuis variables d'environnement."""
import os

class Settings:
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # MLflow — port interne 5001 confirmé
    MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5001")
    CLASSIFIER_NAME = os.getenv("MLFLOW_CLASSIFIER_NAME", "AlKatra-Classifier")
    REGRESSOR_NAME = os.getenv("MLFLOW_REGRESSOR_NAME", "AlKatra-Regressor")
    MODEL_STAGE = os.getenv("MLFLOW_MODEL_STAGE", "Production")

    # Kafka
    KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092")
    KAFKA_INPUT_TOPIC = os.getenv("KAFKA_INPUT_TOPIC", "processed-sensor-data")
    KAFKA_OUTPUT_TOPIC = os.getenv("KAFKA_OUTPUT_TOPIC", "recommendations-generated")
    KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "ml-inference-group")
    KAFKA_AUTO_OFFSET_RESET = os.getenv("KAFKA_AUTO_OFFSET_RESET", "latest")
    ENABLE_KAFKA_CONSUMER = os.getenv("ENABLE_KAFKA_CONSUMER", "true").lower() == "true"
    ENABLE_KAFKA_PRODUCER = os.getenv("ENABLE_KAFKA_PRODUCER", "true").lower() == "true"

    # MongoDB
    MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://alkatra:[REDACTED]@mongodb:27017/alkatra_iot?authSource=admin")
    MONGO_DB = os.getenv("MONGO_DB", "alkatra_iot")
    MONGO_COLLECTION = os.getenv("MONGO_RECO_COLLECTION", "irrigation_recommendations")

    # Logique métier
    CLASSIFICATION_THRESHOLD = float(os.getenv("CLASSIFICATION_THRESHOLD", "0.35"))

    # Model loading retry policy (seconds)
    MODEL_LOAD_RETRIES = int(os.getenv("MODEL_LOAD_RETRIES", "6"))
    MODEL_LOAD_DELAY = float(os.getenv("MODEL_LOAD_DELAY", "5"))

settings = Settings()
