corrige ce fichier en utilisant les bonnes commandes adaptés aux conteneurs et a powershell 

#!/bin/bash
# Al Katra Bel Qatra — Validation Pipeline IoT End-to-End
# Usage: bash scripts/validate-pipeline.sh [--env /chemin/vers/.env]
#
# Ce script valide le pipeline complet :
# ESP32 (simule) → MQTT → Kafka raw → MongoDB → Kafka processed
#
# Prerequis : tous les services doivent etre demarres (npm run docker:up)
# Credentials : lus automatiquement depuis .env a la racine du repo
#               (ou via --env pour un chemin custom)

# ================================================================
# !!!!NOTE:  Utilser powershell pour lancer le script sous Windows
# ================================================================

# ================================================
# RESOLUTION DU FICHIER .env
# ================================================

# Par defaut on cherche .env a la racine du repo (deux niveaux au-dessus
# de scripts/ si le script est appele depuis la racine : bash scripts/validate-pipeline.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

# Permettre de surcharger via --env /autre/chemin
if [ "$1" = "--env" ] && [ -n "$2" ]; then
  ENV_FILE="$2"
fi

# Charger le .env si present — les variables deja exportees dans le shell
# ont la priorite (comportement identique a Docker Compose)
if [ -f "${ENV_FILE}" ]; then
  # On n'ecrase pas les variables deja presentes dans l'environnement
  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a
else
  echo "WARN: fichier .env non trouve a ${ENV_FILE}"
  echo "      Les valeurs par defaut seront utilisees."
  echo "      Passer --env /chemin/vers/.env pour specifier un autre fichier."
  echo ""
fi

# ================================================
# VALEURS PAR DEFAUT (si absentes du .env)
# Miroir exact des defaults du docker-compose.yml
# ================================================
MONGO_USER="${MONGO_USER:-alkatra}"
MONGO_PASSWORD="${MONGO_PASSWORD:-123}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-alkatra-kafka}"
MONGO_CONTAINER="${MONGO_CONTAINER:-alkatra-mongodb}"
IOT_PORT="${IOT_PORT:-3005}"
IOT_HEALTH_PATH="${IOT_HEALTH_PATH:-/health}"
MONGO_DB="${MONGO_DB:-alkatra_iot}"
MONGO_COLLECTION="${MONGO_COLLECTION:-ai_sensor_features}"

# ================================================
# COULEURS ET COMPTEURS
# ================================================
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

# Helper : execute une commande mongosh dans le container MongoDB
# avec les credentials issus du .env.
# Usage : mongo_eval <database> <eval_expression>
# Retourne la sortie brute de mongosh (sans les logs de connexion).
mongo_eval() {
  local db="$1"
  local expr="$2"
  docker exec "${MONGO_CONTAINER}" mongosh "${db}" \
    -u "${MONGO_USER}" \
    -p "${MONGO_PASSWORD}" \
    --authenticationDatabase admin \
    --quiet \
    --eval "${expr}" 2>/dev/null
}

echo -e "${BLUE}"
echo "Al Katra Bel Qatra — Validation Pipeline IoT"
echo "=============================================="
echo "Env file : ${ENV_FILE}"
echo "Mongo    : ${MONGO_USER}@${MONGO_CONTAINER}/${MONGO_DB}.${MONGO_COLLECTION}"
echo "Kafka    : ${KAFKA_CONTAINER}"
echo "IoT      : localhost:${IOT_PORT}${IOT_HEALTH_PATH}"
echo -e "==============================================\n${NC}"

# ================================================
# ETAPE 1 — Infrastructure
# ================================================
echo "Etape 1 — Infrastructure"

# Kafka accessible
docker exec "${KAFKA_CONTAINER}" nc -z localhost 9092 2>/dev/null && \
  result "OK" "Kafka broker accessible" || \
  result "FAIL" "Kafka broker inaccessible" "docker compose up kafka"

# MongoDB accessible — on utilise les credentials du .env
# print(1) retourne "1" ; si on ne recoit pas "1" le ping a echoue
MONGO_PING=$(mongo_eval "admin" "print(db.adminCommand('ping').ok)" | tr -d '\r\n ')
if [ "${MONGO_PING}" = "1" ]; then
  result "OK" "MongoDB accessible (user: ${MONGO_USER})"
else
  result "FAIL" "MongoDB inaccessible" \
    "Verifier MONGO_USER/MONGO_PASSWORD dans .env — recu: '${MONGO_PING}'"
fi

# IoT Service health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:${IOT_PORT}${IOT_HEALTH_PATH}" 2>/dev/null || echo "000")
[ "${HTTP_CODE}" = "200" ] && \
  result "OK" "IoT Service health (200)" || \
  result "FAIL" "IoT Service health" "recu ${HTTP_CODE} — attendu 200"

echo ""

# ================================================
# ETAPE 2 — Topics Kafka
# ================================================
echo "Etape 2 — Topics Kafka"

TOPICS=$(docker exec "${KAFKA_CONTAINER}" /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list 2>/dev/null)

for TOPIC in raw-sensor-data processed-sensor-data recommendations-generated \
             alerts-outbound sensor-anomalies ml-inference-requests; do
  echo "${TOPICS}" | grep -q "^${TOPIC}$" && \
    result "OK" "Topic: ${TOPIC}" || \
    result "FAIL" "Topic manquant: ${TOPIC}" "bash infra/kafka/topics.sh"
done

echo ""

# ================================================
# ETAPE 3 — Envoi d'un message de test
# ================================================
echo "Etape 3 — Envoi message de test (simulateur)"

node scripts/simulate-sensor.js 1000 2>/dev/null &
SIM_PID=$!
sleep 5
kill "${SIM_PID}" 2>/dev/null || true

# Consommer 1 message depuis raw-sensor-data (timeout 5s)
CONSUMED_OUTPUT=$(docker exec "${KAFKA_CONTAINER}" \
  /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic raw-sensor-data \
  --from-beginning \
  --max-messages 1 \
  --timeout-ms 5000 2>/dev/null || true)

if [ -n "${CONSUMED_OUTPUT}" ]; then
  result "OK" "Message MQTT → Kafka raw-sensor-data (consomme)"
else
  result "FAIL" "Aucun message dans raw-sensor-data" \
    "Verifier iot-service et mosquitto"
fi

echo ""

# ================================================
# ETAPE 4 — Persistance MongoDB
# ================================================
echo "Etape 4 — Persistance MongoDB"

# Laisser le consumer Kafka le temps de traiter le message
sleep 5

# Compter les documents dans la collection cible
DOC_COUNT=$(mongo_eval "${MONGO_DB}" \
  "print(db.${MONGO_COLLECTION}.countDocuments({}))" | tail -1 | tr -d '\r\n ')

# S'assurer que la valeur est numerique avant la comparaison
if ! [[ "${DOC_COUNT}" =~ ^[0-9]+$ ]]; then
  DOC_COUNT=0
fi

if [ "${DOC_COUNT}" -gt "0" ]; then
  result "OK" "Documents dans MongoDB ${MONGO_COLLECTION} (${DOC_COUNT} docs)"
else
  result "FAIL" "Aucun document dans ${MONGO_COLLECTION}" \
    "Verifier le Kafka consumer dans iot-service"
fi

# Verifier le TTL index (expireAfterSeconds = 7776000 = 90 jours)
TTL_INDEX=$(mongo_eval "${MONGO_DB}" \
  "print(db.${MONGO_COLLECTION}.getIndexes().filter(i => i.expireAfterSeconds === 7776000).length)" \
  | tail -1 | tr -d '\r\n ')

if ! [[ "${TTL_INDEX}" =~ ^[0-9]+$ ]]; then
  TTL_INDEX=0
fi

[ "${TTL_INDEX}" -gt "0" ] && \
  result "OK" "TTL index MongoDB (90 jours)" || \
  result "WARN" "TTL index non trouve" \
    "Les vieilles donnees ne seront pas supprimees automatiquement"

echo ""

# ================================================
# ETAPE 5 — Topic processed-sensor-data (Spark)
# ================================================
echo "Etape 5 — processed-sensor-data (Spark — optionnel en S3)"

RAW_OFFSET=$(docker exec "${KAFKA_CONTAINER}" \
  /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 \
  --topic processed-sensor-data 2>/dev/null | \
  awk -F: '{sum+=$3} END {print sum}')


# Nettoyer la valeur (supprimer espaces, retours chariot)
RAW_OFFSET=$(echo "${RAW_OFFSET}" | tr -d ' \t\r\n')
if ! [[ "${RAW_OFFSET}" =~ ^[0-9]+$ ]]; then
  RAW_OFFSET=0
fi

if [ "${RAW_OFFSET}" -gt "0" ]; then
  result "OK" "Messages dans processed-sensor-data (${RAW_OFFSET}) — Spark operationnel"
else
  result "WARN" "Aucun message dans processed-sensor-data" \
    "Spark job pas encore actif — normal si Dev2 n'a pas fini"
fi

echo ""

# ================================================
# RESULTAT FINAL
# ================================================
echo "=============================================="
echo -e "${GREEN}OK  : ${PASS}${NC}"
echo -e "${YELLOW}WARN: ${WARN}${NC} (non bloquants)"
echo -e "${RED}FAIL: ${FAIL}${NC}"
echo "=============================================="

if [ "${FAIL}" -gt "0" ]; then
  echo -e "${RED}Pipeline incomplet — ${FAIL} test(s) en echec${NC}"
  exit 1
else
  echo -e "${GREEN}Pipeline valide — ${PASS} tests OK, ${WARN} avertissements${NC}"
  exit 0
fi