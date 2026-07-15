# Reference - Ports et services

## Services applicatifs

| Service | Container | Port direct | Gateway | Profil Docker |
|---------|-----------|-------------|---------|---------------|
| **API Gateway** | `alkatra-gateway` | `localhost:8080` | — | `phase1` |
| **Auth Service** | `alkatra-auth` | `http://localhost:3001` | `http://localhost:8080/api/v1/auth/*` | `phase1` |
| **User Service** | `alkatra-user` | `http://localhost:3002` | `http://localhost:8080/api/v1/user/*` | `phase1` |
| **IoT Service** | `alkatra-iot` | `http://localhost:3005` | À venir | — |
| **ML Inference** | `alkatra-ml` | `http://localhost:8000` | À venir | — |

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
| **Keycloak** | `alkatra-keycloak` | `http://localhost:8081` | Auth OIDC (Phase 2), port changé à 8081 pour éviter conflit avec la gateway (8080) |
| **Prometheus** | `alkatra-prometheus` | `http://localhost:9090` | Collecte de métriques |
| **Grafana** | `alkatra-grafana` | `http://localhost:3000` | Dashboards |

## Routage API Gateway (port 8080)

| Route Gateway | Cible | Description |
|---------------|-------|-------------|
| `GET /health` | Gateway | Health check du gateway lui-même |
| `GET /health/upstream` | Gateway | Health check agrégé (auth + user) |
| `/api/v1/auth/*` | auth-service:3001 | Authentification (register, verify-otp, login, refresh) |
| `/api/v1/user/*` | user-service:3002 | Profil utilisateur |
| `/api/v1/farms/*` | user-service:3002 | Fermes (placeholder) |

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