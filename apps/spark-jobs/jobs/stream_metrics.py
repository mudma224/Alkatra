"""
Métriques Prometheus du job Spark — poussées vers PushGateway à chaque micro-batch.

`foreachBatch` s'exécute sur le driver Python : on peut pousser directement
après chaque batch (y compris vide — la fraîcheur du push prouve la vitalité
du stream ; l'alerte `SparkStreamStalled` s'appuie dessus).

Désactivé proprement si PUSHGATEWAY_URL est absent (tests unitaires, DRY_RUN
local) : les appels deviennent des no-ops journalisés une seule fois.
"""
import logging
import os

from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

logger = logging.getLogger(__name__)

PUSHGATEWAY_URL = os.getenv("PUSHGATEWAY_URL", "").strip()
JOB_NAME = os.getenv("STREAM_METRICS_JOB", "spark-jobs")
INSTANCE = os.getenv("STREAM_METRICS_INSTANCE", "feature-engineering")

registry = CollectorRegistry()

BATCH_DURATION = Gauge(
    "spark_stream_batch_duration_seconds",
    "Durée de traitement du dernier micro-batch (driver, foreachBatch)",
    registry=registry,
)
BATCH_ID = Gauge(
    "spark_stream_batch_id",
    "Identifiant du dernier micro-batch traité (croissant ; figé = stream bloqué)",
    registry=registry,
)
INPUT_ROWS = Gauge(
    "spark_stream_num_input_rows",
    "Messages lus dans le dernier micro-batch",
    registry=registry,
)
OUTPUT_ROWS = Gauge(
    "spark_stream_num_output_rows",
    "Messages enrichis publiés dans le dernier micro-batch",
    registry=registry,
)
REJECTED_MESSAGES = Gauge(
    "spark_stream_rejected_messages",
    "Messages rejetés dans le dernier micro-batch (JSON invalide, parcel_id absent)",
    registry=registry,
)

_warned_disabled = False


def push_batch_metrics(
    epoch_id: int,
    input_rows: int,
    output_rows: int,
    rejected: int,
    duration_seconds: float,
) -> None:
    """Enregistre les métriques du batch et pousse le groupe vers PushGateway."""
    global _warned_disabled

    BATCH_DURATION.set(round(duration_seconds, 3))
    BATCH_ID.set(epoch_id)
    INPUT_ROWS.set(input_rows)
    OUTPUT_ROWS.set(output_rows)
    REJECTED_MESSAGES.set(rejected)

    if not PUSHGATEWAY_URL:
        if not _warned_disabled:
            logger.warning(
                "PUSHGATEWAY_URL non défini — métriques Spark désactivées (no-op)"
            )
            _warned_disabled = True
        return

    try:
        push_to_gateway(
            PUSHGATEWAY_URL,
            job=JOB_NAME,
            registry=registry,
            grouping_key={"instance": INSTANCE},
        )
    except Exception as exc:  # noqa: BLE001 — la télémétrie ne doit jamais casser le job
        logger.warning("Push PushGateway échoué (%s) — batch %s continué", exc, epoch_id)
