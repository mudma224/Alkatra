# Carte du repository

## Racine

| Chemin | Role |
| --- | --- |
| `package.json` | scripts racine, workspaces npm, Turbo |
| `package-lock.json` | lockfile npm |
| `turbo.json` | orchestration build/test/dev |
| `.env.example` | modele des variables locales |
| `.gitattributes` | normalisation LF pour scripts shell |

## Applications

```text
apps/iot-service
```

Service NestJS qui recoit MQTT et publie Kafka.

Sous-dossiers importants:

| Chemin | Role |
| --- | --- |
| `src/mqtt` | reception MQTT, validation payload IA |
| `src/kafka` | producer Kafka |
| `src/health` | endpoint de sante |
| `tests` | tests Jest |

## Infrastructure

```text
infra/docker/docker-compose.yml
```

Stack Docker locale.

```text
infra/postgres/init.sql
```

Schema initial Postgres.

```text
infra/grafana
```

Provisioning Grafana et dashboards.

```text
infra/prometheus/prometheus.yml
```

Configuration Prometheus.

```text
infra/mlflow
```

Image et script de demarrage MLflow.

```text
infra/kafka/topics.sh
```

Creation des topics Kafka.

```text
infra/mosquitto
```

Configurations MQTT dev/prod.

## Scripts

| Chemin | Role |
| --- | --- |
| `scripts/simulate-sensor.js` | simulateur MQTT du capteur IA v1 |
| `scripts/health-check.sh` | verification rapide de la stack locale |

## Documentation

| Chemin | Role |
| --- | --- |
| `docs/README.md` | point d'entree |
| `docs/architecture` | architecture et flux |
| `docs/guides` | guides pratiques |
| `docs/reference` | contrats et tables de reference |
| `docs/runbooks` | resolution d'incidents |
| `docs/adr` | decisions d'architecture |
