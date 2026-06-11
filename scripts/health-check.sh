#!/bin/bash
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  local name=$1 url=$2 expected=${3:-200}
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  if [ "$HTTP_CODE" = "$expected" ]; then
    echo -e "${GREEN}✅ ${name} (${HTTP_CODE})${NC}"; PASS=$((PASS+1))
  else
    echo -e "${RED}❌ ${name} — attendu ${expected}, reçu ${HTTP_CODE:-timeout}${NC}"; FAIL=$((FAIL+1))
  fi
}

check_optional() {
  local name=$1 url=$2 expected=${3:-200}
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  if [ "$HTTP_CODE" = "$expected" ]; then
    echo -e "${GREEN}✅ ${name} (${HTTP_CODE})${NC}"; PASS=$((PASS+1))
  else
    echo -e "${YELLOW}⚠️  ${name} optionnel (${HTTP_CODE:-timeout})${NC}"
  fi
}

check_docker() {
  local name=$1 container=$2
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null)
  if [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✅ Docker: ${name}${NC}"; PASS=$((PASS+1))
  else
    echo -e "${RED}❌ Docker: ${name} (${STATUS:-not found})${NC}"; FAIL=$((FAIL+1))
  fi
}

echo -e "${YELLOW}🔍 Al Katra Bel Qatra — Health Check v2.0${NC}"
echo "=============================================="

echo -e "\n📦 Infrastructure Docker:"
check_docker "PostgreSQL"   "alkatra-postgres"
check_docker "MongoDB"      "alkatra-mongodb"
check_docker "Redis"        "alkatra-redis"
check_docker "Kafka"        "alkatra-kafka"
check_docker "Mosquitto"    "alkatra-mosquitto"
check_docker "IoT Service"  "alkatra-iot"
check_docker "Spark Job"    "alkatra-spark"

echo -e "\n🌐 Services Web:"
check "Grafana"         "http://localhost:3000/api/health"
check "Kafka UI"        "http://localhost:8090"
check "Prometheus"      "http://localhost:9090/-/healthy"
check "MailHog"         "http://localhost:8025"
check "MLflow"          "http://localhost:5000/health"

echo -e "\n🔬 Services Applicatifs (actifs après S2-S4):"
check "IoT Service"     "http://localhost:3005/health"
check "ML Inference" "http://localhost:8000/health"

echo -e "\n=============================================="
echo -e "Résultat: ${GREEN}${PASS} OK${NC} | ${RED}${FAIL} FAIL${NC}"

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 Tout est opérationnel !${NC}"; exit 0
else
  echo -e "${RED}⚠️  ${FAIL} service(s) en erreur. Logs: npm run docker:logs${NC}"; exit 1
fi
