#!/bin/bash
# Test E2E Sprint 5 — Al Katra Bel Qatra (alert-service / notifications)
# Vérifie le flux complet :
#   health → inscription OTP → login → enregistrement device
#   → ingestion interne sensor_offline (409 dédup au 2e envoi)
#   → liste / unread-count / mark-read via la gateway
#   → alerte hydric_stress_critical via message Kafka recommendations-generated
#
# Prérequis : stack phase1 UP (npm run docker:up-phase1) + recréation de
# notification_db avec le schéma enrichi (voir docs/guides/alert-service.md).
set -e

GATEWAY="http://localhost:8080"
ALERT_DIRECT="http://localhost:3006"
TEST_PHONE="+212600000009"
COMPOSE_FILE="infra/docker/docker-compose.yml"

echo "🚀 Démarrage du test E2E Sprint 5 (alertes)..."

check_status() {
  local description=$1
  local expected=$2
  local actual=$3
  if [ "$actual" != "$expected" ]; then
    echo "❌ ÉCHEC : $description (attendu $expected, obtenu $actual)"
    exit 1
  fi
  echo "✅ $description"
}

# 0. Santé du service (direct, hors gateway — /internal et /health ne sont pas routés)
ALERT_HEALTH=$(curl -s -o /tmp/alert-health.json -w "%{http_code}" "$ALERT_DIRECT/health")
check_status "GET alert-service /health" "200" "$ALERT_HEALTH"

# 1. Inscription + OTP (modèle e2e-sprint1-auth.sh)
REGISTER_STATUS=$(curl -s -o /tmp/register5.json -w "%{http_code}" -X POST "$GATEWAY/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$TEST_PHONE\"}")
check_status "POST /api/v1/auth/register" "200" "$REGISTER_STATUS"

sleep 1
OTP_CODE=$(docker compose -f $COMPOSE_FILE logs auth-service \
  | grep "DEV-OTP" | grep "$TEST_PHONE" | tail -1 | grep -oE '[0-9]{6}' | tail -1)
if [ -z "$OTP_CODE" ]; then
  echo "❌ ÉCHEC : impossible d'extraire le code OTP depuis les logs"
  exit 1
fi

VERIFY_STATUS=$(curl -s -o /tmp/verify5.json -w "%{http_code}" -X POST "$GATEWAY/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$TEST_PHONE\", \"otp\": \"$OTP_CODE\"}")
check_status "POST /api/v1/auth/verify-otp" "200" "$VERIFY_STATUS"

ACCESS_TOKEN=$(jq -r '.accessToken' /tmp/verify5.json)
USER_ID=$(jq -r '.user.id' /tmp/verify5.json)

# 2. Enregistrement d'un token device (canal push — FCM désactivé en dev : in-app only)
DEVICE_STATUS=$(curl -s -o /tmp/device5.json -w "%{http_code}" -X POST "$GATEWAY/api/v1/devices" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "e2e-fake-fcm-token-0123456789abcdef", "platform": "android"}')
check_status "POST /api/v1/devices (token FCM)" "201" "$DEVICE_STATUS"

# 3. Ingestion interne : alerte capteur hors ligne (simule le push de farm-service)
INTERNAL_TOKEN=$(grep -E '^INTERNAL_TOKEN=' .env 2>/dev/null | cut -d= -f2 || true)
INTERNAL_ARGS=()
if [ -n "$INTERNAL_TOKEN" ]; then
  INTERNAL_ARGS=(-H "X-Internal-Token: $INTERNAL_TOKEN")
fi

SENSOR_OFFLINE_BODY="{\"alertType\": \"sensor_offline\", \"userId\": \"$USER_ID\", \"parcelId\": null, \"severity\": \"info\", \"message\": \"Le capteur esp32-e2e n'envoie plus de données depuis plus de 2 h.\", \"data\": {\"deviceId\": \"esp32-e2e\", \"silentHours\": 2}}"

ALERT1_STATUS=$(curl -s -o /tmp/alert1.json -w "%{http_code}" -X POST "$ALERT_DIRECT/internal/alerts" \
  -H "Content-Type: application/json" "${INTERNAL_ARGS[@]}" -d "$SENSOR_OFFLINE_BODY")
check_status "POST /internal/alerts (sensor_offline)" "201" "$ALERT1_STATUS"
ALERT_ID=$(jq -r '.id' /tmp/alert1.json)

# 4. Dédup : le même envoi doit renvoyer 409 (fenêtre 24 h)
ALERT2_STATUS=$(curl -s -o /tmp/alert2.json -w "%{http_code}" -X POST "$ALERT_DIRECT/internal/alerts" \
  -H "Content-Type: application/json" "${INTERNAL_ARGS[@]}" -d "$SENSOR_OFFLINE_BODY")
check_status "POST /internal/alerts (doublon → 409 dédup)" "409" "$ALERT2_STATUS"

# 5. Liste + unread-count via la gateway
LIST_STATUS=$(curl -s -o /tmp/list5.json -w "%{http_code}" "$GATEWAY/api/v1/alerts?limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
check_status "GET /api/v1/alerts (via gateway)" "200" "$LIST_STATUS"
LIST_COUNT=$(jq -r '.total' /tmp/list5.json)
if [ "$LIST_COUNT" -lt 1 ]; then
  echo "❌ ÉCHEC : au moins 1 alerte attendue dans la liste"
  exit 1
fi
echo "✅ Liste contient $LIST_COUNT alerte(s)"

UNREAD_STATUS=$(curl -s -o /tmp/unread5.json -w "%{http_code}" "$GATEWAY/api/v1/alerts/unread-count" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
check_status "GET /api/v1/alerts/unread-count" "200" "$UNREAD_STATUS"
UNREAD_COUNT=$(jq -r '.count' /tmp/unread5.json)
if [ "$UNREAD_COUNT" -lt 1 ]; then
  echo "❌ ÉCHEC : unread-count devrait être ≥ 1 (obtenu $UNREAD_COUNT)"
  exit 1
fi
echo "✅ unread-count = $UNREAD_COUNT"

# 6. Mark read + mark all read
READ_STATUS=$(curl -s -o /tmp/read5.json -w "%{http_code}" -X PATCH "$GATEWAY/api/v1/alerts/$ALERT_ID/read" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
check_status "PATCH /api/v1/alerts/:id/read" "200" "$READ_STATUS"

# 7. Alerte hydrique critique via Kafka : créer une parcelle puis publier un
#    message critique sur recommendations-generated (contournement Spark/ML).
echo "📌 Étape Kafka : création ferme + parcelle puis publication message critique..."
FARM_ID=$(curl -s -X POST "$GATEWAY/api/v1/farms" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "Ferme E2E Alertes", "totalAreaHa": 10}' | jq -r '.id')
PARCEL_ID=$(curl -s -X POST "$GATEWAY/api/v1/parcels" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"farmId\": \"$FARM_ID\", \"name\": \"Parcelle E2E\", \"areaHa\": 2, \"cropType\": \"olive\", \"soilType\": \"clay\", \"irrigationMethod\": \"drip\"}" | jq -r '.id')
if [ -z "$PARCEL_ID" ] || [ "$PARCEL_ID" == "null" ]; then
  echo "❌ ÉCHEC : parcelle de test non créée (vérifier les enums du POST /api/v1/parcels)"
  exit 1
fi

# Le message doit satisfaire la règle : should_irrigate + proba ≥ 0.75 + sol ≤ 25 %
MSYS_NO_PATHCONV=1 docker exec alkatra-kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server kafka:9092 --topic recommendations-generated <<EOF
{"parcel_id": "$PARCEL_ID", "should_irrigate": true, "irrigation_probability": 0.93, "water_amount_mm": 14.2, "soil_humidity_pct": 11.5, "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

# Le consumer traite le message de manière asynchrone — sonner avant de vérifier.
echo "⏳ Attente traitement consumer (8 s)..."
sleep 8

HYDRIC_COUNT=$(curl -s "$GATEWAY/api/v1/alerts?limit=50" -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq -r '[.data[] | select(.alertType == "hydric_stress_critical")] | length')
if [ "$HYDRIC_COUNT" -lt 1 ]; then
  echo "❌ ÉCHEC : alerte hydric_stress_critical attendue après publication Kafka"
  echo "   (vérifier : consumer connecté /health/ready, topic, résolution owner farm-service)"
  exit 1
fi
echo "✅ Alerte hydric_stress_critical reçue via Kafka"

# 8. Métriques (direct)
METRICS_STATUS=$(curl -s -o /tmp/metrics5.txt -w "%{http_code}" "$ALERT_DIRECT/metrics")
check_status "GET /metrics" "200" "$METRICS_STATUS"

# 9. Machine à états santé capteur (inactive 2 h → failing 24 h)
# Prérequis : SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES=1 dans le .env pour
# rendre le cycle observable en E2E (défaut prod-like : 15 min).
echo ""
echo "📌 Étape santé capteur : association + simulation de silence via SQL..."
HEALTH_SENSOR="esp32-e2e-health"
ASSOCIATE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/api/v1/sensors/associate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"deviceId\": \"$HEALTH_SENSOR\", \"parcelId\": \"$PARCEL_ID\"}")
check_status "POST /api/v1/sensors/associate" "201" "$ASSOCIATE_STATUS"

# Attente passive du statut attendu (polling toutes les 5 s).
wait_sensor_health() {
  local expected=$1
  local timeout=${2:-120}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    HEALTH=$(curl -s "$GATEWAY/api/v1/sensors/parcel/$PARCEL_ID" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      | jq -r ".[] | select(.deviceId == \"$HEALTH_SENSOR\") | .healthStatus")
    if [ "$HEALTH" == "$expected" ]; then
      echo "✅ Capteur $HEALTH_SENSOR → healthStatus=$expected (après ${elapsed}s)"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "❌ ÉCHEC : $HEALTH_SENSOR attendu à « $expected » (obtenu « $HEALTH » après ${timeout}s)"
  echo "   Vérifier SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES et les logs farm-service."
  exit 1
}

# 9a. Silence 3 h → inactive (+ notification info)
MSYS_NO_PATHCONV=1 docker exec alkatra-postgres psql -U farm_user -d farm_db -c \
  "UPDATE sensors SET health_status = 'active', last_seen_at = NOW() - INTERVAL '3 hours' WHERE device_id = '$HEALTH_SENSOR';" > /dev/null
wait_sensor_health "inactive"

INFO_ALERTS=$(curl -s "$GATEWAY/api/v1/alerts?limit=50" -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq -r '[.data[] | select(.alertType == "sensor_offline" and .severity == "info")] | length')
if [ "$INFO_ALERTS" -lt 1 ]; then
  echo "❌ ÉCHEC : alerte sensor_offline/info attendue au passage inactive"
  exit 1
fi
echo "✅ Notification légère (info) reçue au passage « désactivé »"

# 9b. Silence 25 h → failing (+ alerte rouge critical)
MSYS_NO_PATHCONV=1 docker exec alkatra-postgres psql -U farm_user -d farm_db -c \
  "UPDATE sensors SET last_seen_at = NOW() - INTERVAL '25 hours' WHERE device_id = '$HEALTH_SENSOR';" > /dev/null
wait_sensor_health "failing"

CRITICAL_ALERTS=$(curl -s "$GATEWAY/api/v1/alerts?limit=50" -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq -r '[.data[] | select(.alertType == "sensor_offline" and .severity == "critical")] | length')
if [ "$CRITICAL_ALERTS" -lt 1 ]; then
  echo "❌ ÉCHEC : alerte sensor_offline/critical attendue au passage failing"
  echo "   (la dédup par sévérité doit laisser passer la critique après l'info)"
  exit 1
fi
echo "✅ Alerte rouge (critical) reçue au passage « défaillant »"

echo ""
echo "🎉 E2E Sprint 5 (alertes) : SUCCÈS"
echo "   - sensor_offline créée + dédup 24h par sévérité vérifiée (409)"
echo "   - API REST user-scopée via gateway (liste, unread-count, mark-read)"
echo "   - hydric_stress_critical via consumer Kafka recommendations-generated"
echo "   - machine à états capteur : active → inactive (2 h, info) → failing (24 h, critical)"
