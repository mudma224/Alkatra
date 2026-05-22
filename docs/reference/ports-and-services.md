# Reference - Ports et services

| Service | Container | URL / Port | Notes |
| --- | --- | --- | --- |
| Postgres | `alkatra-postgres` | `localhost:5432` | base relationnelle |
| MongoDB | `alkatra-mongodb` | `localhost:27017` | reserve IoT/time-series |
| Redis | `alkatra-redis` | `localhost:6379` | cache futur |
| Kafka interne | `alkatra-kafka` | `kafka:9092` | depuis Docker network |
| Kafka externe | `alkatra-kafka` | `localhost:9094` | depuis host |
| Kafka UI | `alkatra-kafka-ui` | `http://localhost:8090` | inspection topics |
| Mosquitto | `alkatra-mosquitto` | `localhost:1883` | MQTT |
| Mosquitto WS | `alkatra-mosquitto` | `localhost:9001` | WebSocket MQTT |
| MLflow | `alkatra-mlflow` | `http://localhost:5000` | tracking IA |
| Prometheus | `alkatra-prometheus` | `http://localhost:9090` | metriques |
| Grafana | `alkatra-grafana` | `http://localhost:3000` | dashboards |
| MailHog | `alkatra-mailhog` | `http://localhost:8025` | emails dev |
| Keycloak | `alkatra-keycloak` | `http://localhost:8080` | profile `auth` |
| IoT Service | local app | `http://localhost:3005` | NestJS, hors compose actuellement |

## Commandes utiles

Voir les conteneurs:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
```

Voir les logs:

```bash
npm run docker:logs
```

Verifier MLflow:

```bash
curl http://localhost:5000/health
```

Verifier IoT service:

```bash
curl http://localhost:3005/health
```
