#!/bin/bash
# Al Katra Bel Qatra — Validation Pipeline IoT End-to-End
# Usage: bash scripts/validate-pipeline.sh
#
# Ce script valide le pipeline complet :
# ESP32 (simule) → MQTT → Kafka raw → MongoDB → Kafka processed
#
# Prerequis : tous les services doivent etre demarres (npm run docker:up)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

result() {
  local status=$1
  local label=$2
  local detail=$3

  if [ "$status" = "OK" ]; then
    echo -e "${GREEN}OK${NC}  $label"
    PASS=$((PASS + 1))
  elif [ "$status" = "WARN" ]; then
    echo -e "${YELLOW}WARN${NC} $label${detail:+ — $detail}"
    WARN=$((WARN + 1))
  else
    echo -e "${RED}FAIL${NC} $label${detail:+ — $detail}"
    FAIL=$((FAIL + 1))
  fi
}

echo -e "${BLUE}"
echo "Al Katra Bel Qatra — Validation Pipeline IoT"
echo "=============================================="
echo -e "${NC}"

# ================================================
# ETAPE 1 — Infrastructure
# ================================================
echo "Etape 1 — Infrastructure"

# Kafka accessible
docker exec alkatra-kafka nc -z localhost 9092 2>/dev/null && \
  result "OK" "Kafka broker accessible" || \
  result "FAIL" "Kafka broker inaccessible" "docker compose up kafka"

# MongoDB accessible (robust check that works with mongosh output)
MONGO_OK=$(docker exec alkatra-mongodb mongosh --quiet \
  -u "${MONGO_USER:-alkatra}" -p "${MONGO_PASSWORD:-123}" \
  --authenticationDatabase admin --eval "print(db.adminCommand('ping').ok)" 2>/dev/null | tr -d '\r\n' || echo "")
if [ "$MONGO_OK" = "1" ]; then
  result "OK" "MongoDB accessible"
else
  result "FAIL" "MongoDB inaccessible" "docker compose up mongodb"
fi

# IoT Service health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/health 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && \
  result "OK" "IoT Service health (200)" || \
  result "FAIL" "IoT Service health" "recu $HTTP_CODE — attendu 200"

echo ""

# ================================================
# ETAPE 2 — Topics Kafka
# ================================================
echo "Etape 2 — Topics Kafka"

TOPICS=$(docker exec alkatra-kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list 2>/dev/null)

for TOPIC in raw-sensor-data processed-sensor-data recommendations-generated alerts-outbound sensor-anomalies ml-inference-requests; do
  echo "$TOPICS" | grep -q "^${TOPIC}$" && \
    result "OK" "Topic: $TOPIC" || \
    result "FAIL" "Topic manquant: $TOPIC" "bash infra/kafka/topics.sh"
done

echo ""

# ================================================
# ETAPE 3 — Envoi d'un message de test
# ================================================
echo "Etape 3 — Envoi message de test (simulateur)"

# Envoyer 1 message de test (simulateur) et tenter de consommer un message
node scripts/simulate-sensor.js 1 2>/dev/null &
SIM_PID=$!
sleep 5
kill $SIM_PID 2>/dev/null || true

# Essayer de lire 1 message depuis le topic (timeout 5s)
CONSUMED_OUTPUT=$(docker exec alkatra-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic raw-sensor-data --from-beginning --max-messages 1 --timeout-ms 5000 2>/dev/null || true)

if [ -n "${CONSUMED_OUTPUT}" ]; then
  result "OK" "Message MQTT → Kafka raw-sensor-data (consumed)"
else
  result "FAIL" "Aucun nouveau message dans raw-sensor-data" "verifier iot-service et mosquitto"
fi

echo ""

# ================================================
# ETAPE 4 — Persistance MongoDB
# ================================================
echo "Etape 4 — Persistance MongoDB"

sleep 5  # Laisser le consumer traiter le message

# Compter les documents dans ai_sensor_features
DOC_COUNT=$(docker exec alkatra-mongodb mongosh alkatra_iot \
  -u "${MONGO_USER:-alkatra}" -p "${MONGO_PASSWORD:-123}" \
  --authenticationDatabase admin --quiet \
  --eval "db.ai_sensor_features.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

if [ "$DOC_COUNT" -gt "0" ]; then
  result "OK" "Documents dans MongoDB ai_sensor_features ($DOC_COUNT docs)"
else
  result "FAIL" "Aucun document dans ai_sensor_features" "verifier kafka consumer dans iot-service"
fi

# Verifier les index TTL
TTL_INDEX=$(docker exec alkatra-mongodb mongosh alkatra_iot \
  -u "${MONGO_USER:-alkatra}" -p "${MONGO_PASSWORD:-123}" \
  --authenticationDatabase admin --quiet \
  --eval "JSON.stringify(db.ai_sensor_features.getIndexes().filter(i => i.expireAfterSeconds))" \
  2>/dev/null | grep -c "7776000" || echo "0")

[ "$TTL_INDEX" -gt "0" ] && \
  result "OK" "TTL index MongoDB (90 jours)" || \
  result "WARN" "TTL index non trouve" "les vieilles donnees ne seront pas auto-supprimees"

echo ""

# ================================================
# ETAPE 5 — Topic processed-sensor-data (Spark)
# ================================================
echo "Etape 5 — processed-sensor-data (Spark — optionnel en S3)"

MSG_PROCESSED=$(docker exec alkatra-kafka /opt/kafka/bin/kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 \
  --topic processed-sensor-data \
  --time -1 2>/dev/null | awk -F: '{sum+=$3} END {print sum}' || echo "0")

if [ "$MSG_PROCESSED" -gt "0" ]; then
  result "OK" "Messages dans processed-sensor-data ($MSG_PROCESSED) — Spark operationnel"
else
  result "WARN" "Aucun message dans processed-sensor-data" "Spark job pas encore actif — normal si Dev2 n'a pas fini"
fi

echo ""

# ================================================
# RESULTAT FINAL
# ================================================
echo "=============================================="
echo -e "${GREEN}OK  : $PASS${NC}"
echo -e "${YELLOW}WARN: $WARN${NC} (non bloquants)"
echo -e "${RED}FAIL: $FAIL${NC}"
echo "=============================================="

if [ "$FAIL" -gt "0" ]; then
  echo -e "${RED}Pipeline incomplet — $FAIL test(s) en echec${NC}"
  exit 1
else
  echo -e "${GREEN}Pipeline valide — $PASS tests OK, $WARN avertissements${NC}"
  exit 0
fi