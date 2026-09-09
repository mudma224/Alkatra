#!/usr/bin/env bash
# =============================================================================
# Al Katra Bel Qatra — Smoke test du pipeline Spark Structured Streaming
# Produit un message de test dans raw-sensor-data puis vérifie qu'un message
# enrichi apparaît dans processed-sensor-data.
#
# Pré-requis : la stack tourne (docker compose ... up -d) — projet al-katra-bel-qatra.
# Usage :
#   bash scripts/smoke_test.sh
#   KAFKA_CONTAINER=alkatra-kafka SPARK_CONTAINER=alkatra-spark bash scripts/smoke_test.sh
# =============================================================================
set -euo pipefail

KAFKA_CONTAINER="${KAFKA_CONTAINER:-alkatra-kafka}"
SPARK_CONTAINER="${SPARK_CONTAINER:-alkatra-spark}"
INPUT_TOPIC="${INPUT_TOPIC:-raw-sensor-data}"
OUTPUT_TOPIC="${OUTPUT_TOPIC:-processed-sensor-data}"
CONSUMER_TIMEOUT_MS="${CONSUMER_TIMEOUT_MS:-45000}"
KCMD="/opt/kafka/bin"

log() { printf '\n\033[1;32m[smoke]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[smoke:ERREUR]\033[0m %s\n' "$*" >&2; }

# --- 1. Vérifier que les conteneurs sont là ---------------------------------
log "Vérification des conteneurs..."
docker ps --format '{{.Names}}' | grep -q "^${KAFKA_CONTAINER}$" \
  || { err "Conteneur Kafka '${KAFKA_CONTAINER}' introuvable. Lancer la stack d'abord."; exit 1; }
docker ps --format '{{.Names}}' | grep -q "^${SPARK_CONTAINER}$" \
  || { err "Conteneur Spark '${SPARK_CONTAINER}' introuvable. Lancer la stack d'abord."; exit 1; }

# --- 2. (Re)créer les topics si nécessaire ----------------------------------
log "Création/validation des topics ${INPUT_TOPIC} et ${OUTPUT_TOPIC}..."
for t in "${INPUT_TOPIC}" "${OUTPUT_TOPIC}"; do
  docker exec "${KAFKA_CONTAINER}" "${KCMD}/kafka-topics.sh" \
    --bootstrap-server localhost:9092 \
    --create --if-not-exists --topic "${t}" --partitions 1 --replication-factor 1 >/dev/null
done

# --- 3. Produire un message de test (contrat sensor-ai-v2) ------------------
TS_NOW="$(date +%s)"
PAYLOAD=$(cat <<JSON
{"schema_version":"sensor-ai-v2","ts":${TS_NOW},"device_id":"esp32-smoke","farm_id":"farm-smoke","parcel_id":"parcel-smoke","temperature_min_c":15.2,"temperature_max_c":23.5,"wind_speed_ms":3.2,"solar_radiation_mj_m2_day":18.5,"soil_humidity_pct":33.0,"air_humidity_pct":60.0,"rain_mm_day":0.0,"received_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","is_anomaly":false}
JSON
)
log "Envoi du message de test dans ${INPUT_TOPIC} :"
echo "  ${PAYLOAD}"
echo "${PAYLOAD}" | docker exec -i "${KAFKA_CONTAINER}" "${KCMD}/kafka-console-producer.sh" \
  --broker-list localhost:9092 --topic "${INPUT_TOPIC}"

# --- 4. Consommer processed-sensor-data -------------------------------------
log "Lecture de ${OUTPUT_TOPIC} (timeout ${CONSUMER_TIMEOUT_MS} ms)..."
OUTPUT=$(docker exec -i "${KAFKA_CONTAINER}" "${KCMD}/kafka-console-consumer.sh" \
  --bootstrap-server localhost:9092 \
  --topic "${OUTPUT_TOPIC}" \
  --from-beginning \
  --timeout-ms "${CONSUMER_TIMEOUT_MS}" 2>/dev/null || true)

if echo "${OUTPUT}" | grep -q '"parcel_id":"parcel-smoke"'; then
  log "SUCCÈS — message enrichi trouvé dans ${OUTPUT_TOPIC} :"
  echo "${OUTPUT}" | grep '"parcel_id":"parcel-smoke"' | tail -n 1
  exit 0
else
  err "Aucun message enrichi 'parcel-smoke' trouvé dans ${OUTPUT_TOPIC}."
  err "Logs récents du job Spark :"
  docker logs --tail 40 "${SPARK_CONTAINER}" || true
  exit 2
fi
