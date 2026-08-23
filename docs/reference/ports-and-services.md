# Reference - Ports et services

## Services applicatifs

| Service | Container | Port direct | Gateway | Profil Docker |
|---------|-----------|-------------|---------|---------------|
| **API Gateway** | `alkatra-gateway` | `localhost:8080` | — | `phase1` |
| **Auth Service** | `alkatra-auth` | `http://localhost:3001` | `http://localhost:8080/api/v1/auth/*` | `phase1` |
| **User Service** | `alkatra-user` | `http://localhost:3002` | `http://localhost:8080/api/v1/user/*` | `phase1` |
| **Farm Service** | `alkatra-farm` | `http://localhost:3003` | `http://localhost:8080/api/v1/farms/*`, `/api/v1/parcels/*`, `/api/v1/sensors/*` | `phase1` |
| **Recommendation Service** | `alkatra-recommendation` | `http://localhost:3004` | Non exposé (consommation interne) | `phase1` |
| **Alert Service** | `alkatra-alert` | `http://localhost:3006` | `http://localhost:8080/api/v1/alerts/*`, `/api/v1/devices/*` | `phase1` |
| **IoT Service** | `alkatra-iot` | `http://localhost:3005` | Non exposé (communication interne uniquement) | — |
| **ML Inference** | `alkatra-ml` | `http://localhost:8000` | Non exposé (communication interne uniquement) | — |

## Infrastructure

| Service | Container | Port / URL | Usage |
|---------|-----------|------------|-------|
| **Postgres** | `alkatra-postgres` | `localhost:5432` | Base relationnelle principale |
| **MongoDB** | `alkatra-mongodb` | `localhost:27017` | Données IoT time-series |
| **Redis** | `alkatra-redis` | `localhost:6379` | Cache + OTP |
| **Kafka interne** | `alkatra-kafka` | `kafka:9092` | Depuis le réseau Docker |
| **Kafka externe** | `alkatra-kafka` | `localhost:9094` | Depuis le host |
| **Kafka UI** | `alkatra-kafka-ui` | `http://localhost:8090` | Interface d'admin Kafka |
| **Mosquitto MQTT** | `alkatra-mosquitto` | `localhost:1883` | Broker MQTT |
| **Mosquitto WS** | `alkatra-mosquitto` | `localhost:9010` | WebSocket MQTT |
| **MLflow** | `alkatra-mlflow` | `http://localhost:5001` | Tracking + registry modèles IA |
| **Minio API** | `alkatra-minio` | `localhost:9000` | Stockage S3 compatible |
| **Minio Console** | `alkatra-minio` | `http://localhost:9001` | Interface d'admin MinIO |
| **MailHog SMTP** | `alkatra-mailhog` | `localhost:1025` | SMTP de développement |
| **MailHog UI** | `alkatra-mailhog` | `http://localhost:8025` | Interface email dev |
| **Keycloak** | `alkatra-keycloak` | `http://localhost:8081` | Auth OIDC (intégration produit réservée), port changé à 8081 pour éviter conflit avec la gateway (8080) |
| **Prometheus** | `alkatra-prometheus` | `http://localhost:9090` | Collecte de métriques + évaluation des règles |
| **Grafana** | `alkatra-grafana` | `http://localhost:3000` | Dashboards (14, dossiers par domaine) |
| **Alertmanager** | `alkatra-alertmanager` | `http://localhost:9093` | Routage des alertes infra → email (UI statut/silences) |
| **PushGateway** | `alkatra-pushgateway` | `http://localhost:9091` | Métriques spark-jobs (job non scrapable) |
| **Loki** | `alkatra-loki` | `http://localhost:3100` | Centralisation des logs (via Grafana Explore) |

Les exporters (`postgres-exporter:9187`, `mongodb-exporter:9216`,
`redis-exporter:9121`, `kafka-exporter:9308`, `blackbox-exporter:9115` et
`promtail:9080`) restent internes au réseau Docker — aucun port host exposé.

## Routage API Gateway (port 8080)

| Route Gateway | Cible | Description |
|---------------|-------|-------------|
| `GET /health` | Gateway | Health check du gateway lui-même |
| `/api/v1/auth/*` | auth-service:3001 | Authentification (register, verify-otp, login, refresh) |
| `/api/v1/user/*` | user-service:3002 | Profil utilisateur |
| `/api/v1/farms/*` | farm-service:3003 | Gestion des fermes |
| `/api/v1/parcels/*` | farm-service:3003 | Gestion des parcelles |
| `/api/v1/sensors/*` | farm-service:3003 | Gestion des capteurs |
| `/api/v1/alerts/*` | alert-service:3006 | Notifications (liste, unread-count, mark-read) |
| `/api/v1/devices/*` | alert-service:3006 | Enregistrement des tokens push FCM |

Le gateway (NGINX, template `infra/nginx/nginx.conf.template`) est en place et exécute le routage ci-dessus. Les services `iot-service` et `ml-inference-service` ne sont pas exposés via le gateway : ils ne communiquent qu'en interne sur le réseau Docker. Les endpoints `/internal/*` (heartbeat capteurs, ingestion d'alertes, résolution owner) ne sont jamais routés par la gateway.

## Commandes utiles

```bash
# Démarrer la stack avec le profil phase1 (inclut gateway, auth, user)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Voir les conteneurs
docker compose --env-file .env -f infra/docker/docker-compose.yml ps

# Voir les logs
npm run docker:logs

# Tester le gateway
curl http://localhost:8080/health

# Tester une route via le gateway
curl http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "+212612345678"}'

# Tester un service directement (toujours possible)
curl http://localhost:3001/health
curl http://localhost:3002/api/v1/health/live