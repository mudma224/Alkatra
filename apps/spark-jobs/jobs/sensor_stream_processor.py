"""
Al Katra Bel Qatra — Spark Structured Streaming
Consomme raw-sensor-data (Kafka) → calcule les features → produit processed-sensor-data
Compatible avec le contrat capteur sensor-ai-v2 (iot-sensor-payload.md).
"""
import json
import logging
import os
from datetime import datetime, timezone

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json
from pyspark.sql.types import (
    BooleanType,
    FloatType,
    StringType,
    StructField,
    StructType,
)

from feature_engineering import compute_derived_features
from state_manager import get_parcel_state, update_parcel_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092")
INPUT_TOPIC = os.getenv("KAFKA_INPUT_TOPIC", "raw-sensor-data")
OUTPUT_TOPIC = os.getenv("KAFKA_OUTPUT_TOPIC", "processed-sensor-data")
CHECKPOINT_DIR = os.getenv("SPARK_CHECKPOINT_DIR", "/tmp/spark-checkpoint")
KAFKA_STARTING_OFFSETS = os.getenv("KAFKA_STARTING_OFFSETS", "latest")
# failOnDataLoss=false par défaut (dev) — passer à "true" en prod stricte
KAFKA_FAIL_ON_DATA_LOSS = os.getenv("KAFKA_FAIL_ON_DATA_LOSS", "false")
# DRY_RUN=1 : ne pas écrire dans Kafka, logguer le payload enrichi (test local)
DRY_RUN = os.getenv("DRY_RUN", "0") in ("1", "true", "True")

# Alias acceptés (cf. docs/reference/iot-sensor-payload.md). Chaque champ canonique
# peut arriver sous un nom alternatif : on normalise avant calcul des features.
FIELD_ALIASES = {
    "temperature_min_c": ["temp_min_c", "min_temperature_c"],
    "temperature_max_c": ["temp_max_c", "max_temperature_c"],
    "wind_speed_ms": ["wind_speed_mps", "wind_m_s"],
    "solar_radiation_mj_m2_day": ["solar_radiation", "solar_mj_m2_day"],
    "soil_humidity_pct": ["soil_moisture_pct", "soil_moisture_1"],
    "air_humidity_pct": ["air_humidity"],
    "rain_mm_day": ["rainfall_mm_day", "rain_mm"],
}


def _resolve_field(raw: dict, canonical: str):
    """Retourne la valeur canonique ou, à défaut, le premier alias présent."""
    if raw.get(canonical) is not None:
        return raw.get(canonical)
    for alias in FIELD_ALIASES.get(canonical, []):
        if raw.get(alias) is not None:
            return raw.get(alias)
    return None


# ─────────────────────────────────────────────
# Schéma du message Kafka entrant
# Conforme au contrat sensor-ai-v2 (iot-sensor-payload.md)
# ─────────────────────────────────────────────
# Note: on parse `value` brut en JSON Python (cf. _parse_payload) plutôt que
# via from_json(schema) figé, afin de tolérer `ts` numérique/string et les
# alias de champs. RAW_SCHEMA reste pour référence/documentation du contrat.
RAW_SCHEMA = StructType([
    StructField("schema_version", StringType(), True),
    StructField("ts", StringType(), True),
    StructField("device_id", StringType(), True),
    StructField("farm_id", StringType(), True),
    StructField("parcel_id", StringType(), True),
    # 7 variables IA obligatoires
    StructField("temperature_min_c", FloatType(), True),
    StructField("temperature_max_c", FloatType(), True),
    StructField("wind_speed_ms", FloatType(), True),
    StructField("solar_radiation_mj_m2_day", FloatType(), True),
    StructField("soil_humidity_pct", FloatType(), True),
    StructField("air_humidity_pct", FloatType(), True),
    StructField("rain_mm_day", FloatType(), True),
    # Métadonnées iot-service
    StructField("received_at", StringType(), True),
    StructField("is_anomaly", BooleanType(), True),
])


def _to_float(value) -> float:
    """Conversion robuste vers float (gère None, str, virgule décimale)."""
    if value is None:
        return 0.0
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _ts_to_iso(ts_value) -> str:
    """Normalise `ts` (Unix secondes numérique OU ISO8601 string) → ISO8601."""
    if ts_value is None:
        return ""
    # Unix epoch (int/float)
    if isinstance(ts_value, (int, float)):
        try:
            return datetime.fromtimestamp(float(ts_value), tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return ""
    # String : peut être un epoch sérialisé ou déjà ISO8601
    s = str(ts_value).strip()
    if s.isdigit():
        try:
            return datetime.fromtimestamp(int(s), tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return ""
    return s



def _parse_datetime(received_at: str) -> tuple:
    """
    Extrait mois, jour_annee, jour_semaine depuis received_at ISO8601.
    Retourne (month, day_of_year, day_of_week).
    """
    try:
        dt = datetime.fromisoformat(received_at.replace("Z", "+00:00"))
    except Exception:
        dt = datetime.now(timezone.utc)

    day_of_year = dt.timetuple().tm_yday
    day_of_week = dt.weekday()  # 0=lundi … 6=dimanche
    month = dt.month
    return month, day_of_year, day_of_week


def process_batch(df, epoch_id: int) -> None:
    """
    Micro-batch Spark : enrichit chaque message avec les features ML
    et publie dans processed-sensor-data.
    """
    # Defensive logging + robust empty-check: use count() (more reliable across versions)
    try:
        count = df.count()
    except Exception as e:
        logger.exception(f"Error counting batch {epoch_id}: {e}")
        return

    logger.info(f"Batch {epoch_id} — {count} message(s) reçus depuis {INPUT_TOPIC}")

    if count == 0:
        return

    # Collect rows for processing
    try:
        rows = df.collect()
    except Exception as e:
        logger.exception(f"Error collecting rows for batch {epoch_id}: {e}")
        return
    output_records = []
    rejected = 0

    for row in rows:
        # `value` est la charge utile brute (string JSON) lue depuis Kafka.
        try:
            raw = json.loads(row["value"]) if row["value"] else {}
        except (json.JSONDecodeError, TypeError) as e:
            rejected += 1
            logger.warning(f"Message rejeté (JSON invalide) batch={epoch_id}: {e}")
            continue

        parcel_id = raw.get("parcel_id") or "unknown"
        if parcel_id == "unknown":
            rejected += 1
            logger.warning(f"Message rejeté (parcel_id absent) batch={epoch_id}")
            continue

        try:
            # ── Valeurs brutes du capteur (canonique + alias) ──────────
            temp_max = _to_float(_resolve_field(raw, "temperature_max_c"))
            temp_min = _to_float(_resolve_field(raw, "temperature_min_c"))
            air_humidity = _to_float(_resolve_field(raw, "air_humidity_pct"))
            wind_ms = _to_float(_resolve_field(raw, "wind_speed_ms"))
            solar_rad = _to_float(_resolve_field(raw, "solar_radiation_mj_m2_day"))
            rain_mm = _to_float(_resolve_field(raw, "rain_mm_day"))
            soil_humidity = _to_float(_resolve_field(raw, "soil_humidity_pct"))

            # ── Temporel ───────────────────────────────────────────────
            # received_at prioritaire ; fallback sur ts (epoch ou ISO).
            received_at = raw.get("received_at") or _ts_to_iso(raw.get("ts"))
            month, day_of_year, day_of_week = _parse_datetime(received_at)


            # ── État journalier depuis Redis ───────────────────────────
            state = get_parcel_state(parcel_id)

            # ── Calcul features ────────────────────────────────────────
            features = compute_derived_features(
                temp_max_c=temp_max,
                temp_min_c=temp_min,
                air_humidity_pct=air_humidity,
                wind_speed_ms=wind_ms,
                solar_radiation_mj_m2_day=solar_rad,
                rain_mm_day=rain_mm,
                soil_humidity_pct=soil_humidity,
                month=month,
                day_of_year=day_of_year,
                day_of_week=day_of_week,
                soil_humidity_j1=state["soil_humidity_j1"],
                rain_j1=state["rain_j1"],
                etc_j1=state["etc_j1"],
                rain_j2=state["rain_j2"],
                rain_j3=state["rain_j3"],
                soil_humidity_rolling3=state["soil_humidity_rolling3"],
            )

            # ── Mise à jour état Redis ─────────────────────────────────
            update_parcel_state(
                parcel_id=parcel_id,
                soil_humidity_pct=soil_humidity,
                rain_mm=rain_mm,
                etc=features["ETc"],
            )

            # ── Message enrichi complet ────────────────────────────────
            enriched = {
                # Identifiants
                "schema_version": "processed-v1",
                "ts": raw.get("ts"),
                "device_id": raw.get("device_id"),
                "farm_id": raw.get("farm_id"),
                "parcel_id": parcel_id,
                "received_at": received_at,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "is_anomaly": raw.get("is_anomaly", False),
                # Toutes les features ML (22 features)
                **features,
            }

            output_records.append({
                "key": parcel_id,
                "value": json.dumps(enriched),
            })

            logger.debug(
                f"  Parcel {parcel_id} | "
                f"ETo={features['ET0_mm']:.2f}mm | "
                f"soil={soil_humidity:.1f}% | "
                f"pluie={rain_mm:.1f}mm"
            )

        except Exception as e:
            logger.error(
                f"Erreur enrichissement parcel={parcel_id} "
                f"batch={epoch_id}: {e}"
            )

    if rejected:
        logger.warning(f"Batch {epoch_id} — {rejected} message(s) rejeté(s)")

    if not output_records:
        return

    # ── Mode DRY_RUN : on logge sans écrire dans Kafka ─────────────────
    if DRY_RUN:
        for rec in output_records:
            logger.info(f"[DRY_RUN] {OUTPUT_TOPIC} <- {rec['value']}")
        logger.info(f"Batch {epoch_id} — {len(output_records)} records (DRY_RUN, non publiés)")
        return

    # ── Envoi vers Kafka processed-sensor-data ─────────────────────────
    spark = SparkSession.getActiveSession()
    if spark is None:
        logger.error("Pas de SparkSession active — impossible d'écrire dans Kafka")
        return

    output_df = spark.createDataFrame(output_records)
    (
        output_df.write.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKERS)
        .option("topic", OUTPUT_TOPIC)
        .save()
    )

    logger.info(
        f"Batch {epoch_id} — {len(output_records)} records "
        f"→ {OUTPUT_TOPIC}"
    )



def main() -> None:
    logger.info("🌿 Al Katra — Spark Streaming Job démarrage...")
    logger.info(f"  Input  : {INPUT_TOPIC} @ {KAFKA_BROKERS}")
    logger.info(f"  Output : {OUTPUT_TOPIC}")
    logger.info(f"  Checkpoint : {CHECKPOINT_DIR}")

    spark = (
        SparkSession.builder
        .appName("AlKatra-SensorStreamProcessor")
        .config("spark.streaming.kafka.consumer.cache.enabled", "false")
        .config("spark.sql.streaming.checkpointLocation", CHECKPOINT_DIR)
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    logger.info(f"  startingOffsets : {KAFKA_STARTING_OFFSETS} | failOnDataLoss : {KAFKA_FAIL_ON_DATA_LOSS} | DRY_RUN : {DRY_RUN}")

    raw_stream = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKERS)
        .option("subscribe", INPUT_TOPIC)
        .option("startingOffsets", KAFKA_STARTING_OFFSETS)
        .option("failOnDataLoss", KAFKA_FAIL_ON_DATA_LOSS)
        .load()
    )

    # On garde la valeur brute (string) et on parse/normalise côté Python
    # (process_batch) pour tolérer `ts` numérique et les alias de champs.
    parsed = raw_stream.select(col("value").cast("string").alias("value"))

    query = (
        parsed.writeStream

        .foreachBatch(process_batch)
        .option("checkpointLocation", f"{CHECKPOINT_DIR}/main")
        .trigger(processingTime="30 seconds")
        .start()
    )

    logger.info(f"✅ Stream actif — en attente de messages...")
    query.awaitTermination()


if __name__ == "__main__":
    main()