#!/bin/bash
# Al Katra Bel Qatra — Setup Initial v2.0
# Usage: bash scripts/setup.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}"
echo "🌿 ============================================"
echo "   Al Katra Bel Qatra — Setup Initial v2.0"
echo "============================================${NC}"

# Vérification prérequis
echo -e "\n${YELLOW}📋 Vérification des prérequis...${NC}"

check_cmd() {
  if ! command -v $1 &>/dev/null; then
    echo -e "${RED}❌ $1 manquant — veuillez l'installer${NC}"; exit 1
  fi
  echo -e "${GREEN}✅ $1${NC}"
}

check_cmd docker
check_cmd git
check_cmd node
check_cmd npm
check_cmd python3

NODE_VER=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VER" -lt 20 ] && { echo -e "${RED}❌ Node.js 20+ requis${NC}"; exit 1; }
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# .env
echo -e "\n${YELLOW}⚙️  Configuration .env...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}✅ .env créé depuis .env.example${NC}"
  echo -e "${YELLOW}⚠️  IMPORTANT: Éditez .env avec vos vraies valeurs !${NC}"
else
  echo -e "${GREEN}✅ .env déjà présent${NC}"
fi

# Dossiers nécessaires
echo -e "\n${YELLOW}📁 Création dossiers...${NC}"
mkdir -p infra/mosquitto/log infra/mosquitto/certs apps/spark-jobs/jobs apps/spark-jobs/tests
echo -e "${GREEN}✅ Dossiers créés${NC}"

# Note: infra/prometheus/prometheus.yml est déjà versionné dans git — pas généré ici

# Install npm
echo -e "\n${YELLOW}📦 Installation dépendances Node.js...${NC}"
npm install

# Démarrage Docker
echo -e "\n${YELLOW}🐳 Démarrage infrastructure Docker...${NC}"
npm run docker:up

echo -e "\n${YELLOW}⏳ Attente démarrage services (45s)...${NC}"
sleep 45

# Topics Kafka
echo -e "\n${YELLOW}📨 Création topics Kafka...${NC}"
bash infra/kafka/topics.sh || { sleep 15; bash infra/kafka/topics.sh; }

echo -e "\n${GREEN}"
echo "🎉 ============================================"
echo "   Setup terminé !"
echo "============================================"
echo ""
echo "📊 Services disponibles :"
echo "  • Grafana      : http://localhost:3000   (admin/alkatra_grafana)"
echo "  • MLflow       : http://localhost:5000"
echo "  • Kafka UI     : http://localhost:8090"
echo "  • MailHog      : http://localhost:8025"
echo "  • Prometheus   : http://localhost:9090"
echo ""
echo "🚀 Prochaines étapes :"
echo "  1. Vérifier : bash scripts/health-check.sh"
echo "  2. Simuler un capteur : node scripts/simulate-sensor.js 10000"
echo "  3. Voir Kafka UI → topic raw-sensor-data"
echo "  4. Enregistrer vos modèles :"
echo "     python3 scripts/register-models.py \\"
echo "       --classifier /chemin/classifier.pkl \\"
echo "       --regressor  /chemin/regressor.pkl"
echo -e "============================================${NC}"