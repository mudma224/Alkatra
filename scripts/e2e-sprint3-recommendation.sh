#!/bin/bash
# scripts/validate-sprint3-infra.sh
# Validation infra Sprint 3 (partie Dev1) — à lancer après docker compose up

set -euo pipefail

echo "=== Sprint 3 — Validation infra (Dev1) ==="

echo ""
echo "1) Container recommendation-service healthy ?"
docker inspect --format='{{.State.Health.Status}}' alkatra-recommendation

echo ""
echo "2) Health endpoint /api/v1/health/ready..."
curl -sf http://localhost:3004/api/v1/health/ready | jq .

echo ""
echo "3) Base recommendation_db accessible avec recommendation_user..."
docker exec alkatra-postgres psql -U recommendation_user -d recommendation_db -c "\dt"

echo ""
echo "4) Isolation multi-bases : recommendation_user NE DOIT PAS accéder à farm_db..."
if docker exec alkatra-postgres psql -U recommendation_user -d farm_db -c "\dt" 2>/dev/null; then
  echo "  ❌ ALERTE : recommendation_user a accès à farm_db (isolation cassée)"
  exit 1
else
  echo "  ✅ Isolation confirmée : accès refusé à farm_db"
fi

echo ""
echo "5) Topic Kafka recommendations-generated..."
docker exec alkatra-kafka kafka-topics.sh --describe \
  --bootstrap-server localhost:9094 --topic recommendations-generated

echo ""
echo "6) Cible Prometheus recommendation-service..."
curl -s http://localhost:9090/api/v1/targets \
  | jq '.data.activeTargets[] | select(.labels.job=="recommendation-service")'

echo ""
echo "7) farm-service joignable depuis recommendation-service (réseau Docker)..."
docker exec alkatra-recommendation wget -qO- http://farm-service:3003/api/v1/health/live || \
  echo "  ⚠️ farm-service injoignable — vérifier FARM_SERVICE_URL et le réseau alkatra-net"

echo ""
echo "=== Fin validation infra Sprint 3 (Dev1) ==="