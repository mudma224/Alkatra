# Etat actuel du projet - structure et fonctionnement

Controle effectue le 2026-06-08.

Ce document resume la structure actuelle du projet Al Katra Platform et ce qui fonctionne a ce stade. Il distingue les elements confirmes par commande locale, les elements configures dans le code, et les points encore a surveiller.
# Etat actuel du projet - structure et fonctionnement

Contrôle effectué le 2026-06-15.

Ce document fournit une analyse technique et factuelle de l'état actuel du projet "Al Katra Bel Qatra".
Il s'appuie exclusivement sur le code et les scripts présents dans le dépôt et indique clairement :
- ce qui est implémenté et opérationnel ;
- ce qui est partiellement implémenté ;
- ce qui est manquant ou déclaré "NOT IMPLEMENTED".

## Resume rapide

Monorepo TypeScript / Python orienté IoT → Streaming → Feature Engineering → ML.

Pipeline principal implémenté (end-to-end components présents) :

```text
ESP32 (simulateur) -> Mosquitto MQTT -> apps/iot-service (NestJS) -> Kafka (raw-sensor-data)
  -> apps/spark-jobs (Spark Structured Streaming) -> Kafka (processed-sensor-data)
  -> apps/iot-service Kafka consumer -> MongoDB (ai_sensor_features)
```

Éléments confirmés par lecture de code et scripts :

- Simulateur MQTT : [scripts/simulate-sensor.js](scripts/simulate-sensor.js)
- Bridge MQTT → Kafka : [apps/iot-service/src/mqtt/mqtt.service.ts](apps/iot-service/src/mqtt/mqtt.service.ts#L1-L300)
- Kafka producer : [apps/iot-service/src/kafka/kafka.service.ts](apps/iot-service/src/kafka/kafka.service.ts#L1-L200)
- Kafka consumer → MongoDB : [apps/iot-service/src/kafka-consumer/sensor-data.consumer.ts](apps/iot-service/src/kafka-consumer/sensor-data.consumer.ts#L1-L300)
- MongoDB schema et repository : [apps/iot-service/src/mongodb/schemas/ai-sensor-feature.schema.ts](apps/iot-service/src/mongodb/schemas/ai-sensor-feature.schema.ts#L1-L240) et [apps/iot-service/src/mongodb/repositories/ai-sensor-reading.repository.ts](apps/iot-service/src/mongodb/repositories/ai-sensor-reading.repository.ts#L1-L200)
- Spark feature engineering jobs : [apps/spark-jobs/jobs/sensor_stream_processor.py](apps/spark-jobs/jobs/sensor_stream_processor.py#L1-L400), [apps/spark-jobs/jobs/feature_engineering.py](apps/spark-jobs/jobs/feature_engineering.py#L1-L240)
- Redis-backed state manager for Spark jobs : [apps/spark-jobs/jobs/state_manager.py](apps/spark-jobs/jobs/state_manager.py#L1-L240)
- Docker stack orchestration : [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml#L1-L420)
- Kafka topics creation script : [infra/kafka/topics.sh](infra/kafka/topics.sh#L1-L200)
- Pipeline validation scripts : [scripts/validate-pipeline.sh](scripts/validate-pipeline.sh#L1-L240) and [scripts/validate-mongodb-indexes.js](scripts/validate-mongodb-indexes.js#L1-L200)

Remarques : la pile CI/CD inclut des workflows pour l'IoT, le ML et Spark : [/.github/workflows](.github/workflows) (voir `ci-iot.yml`, `ci-ml.yml`, `ci-spark.yml`).

Le projet est un monorepo npm/Turborepo pour une plateforme Smart Irrigation IoT + IA. La partie la plus avancee est le pipeline IoT:

```text
simulateur capteur -> Mosquitto MQTT -> iot-service -> Kafka -> Kafka UI / Prometheus / Grafana
```

Etat confirme:

- le build npm passe;
- les tests Jest du service IoT passent;
- le fichier Docker Compose est valide;
- les conteneurs principaux Alkatra sont demarres;
- `alkatra-iot` est healthy;
- `/health` et `/metrics` de `iot-service` repondent en HTTP 200;
- Prometheus scrape bien `prometheus` et `iot-service`;
- Grafana, Kafka UI, MLflow, MailHog et Prometheus repondent en HTTP 200.

## Structure du repository (extrait)

Le repo suit une organisation monorepo : `apps/` (services TypeScript/Python), `infra/` (docker, kafka, monitoring), `scripts/` (helpers, validation), `packages/` (shared types).

Principaux éléments :

- `apps/iot-service`: bridge NestJS MQTT → Kafka + Kafka consumer → MongoDB (sprint S2/S3). [app.module.ts](apps/iot-service/src/app.module.ts#L1-L80)
- `apps/spark-jobs`: jobs PySpark pour feature engineering et streaming. [jobs/](apps/spark-jobs/jobs)
- `apps/ml-inference-service`: service FastAPI placeholder (health only) prêt pour S4. [app/main.py](apps/ml-inference-service/app/main.py#L1-L120)
- `infra/docker/docker-compose.yml`: orchestration locale et liens réseau entre services.
- `infra/kafka/topics.sh`: script de création de topics Kafka attendus.
- `scripts/validate-pipeline.sh` et `scripts/validate-mongodb-indexes.js`: validations end-to-end et index MongoDB.

```text
alkatra-platform/
+-- apps/
|   +-- iot-service/
|       +-- src/
|       |   +-- health/
|       |   +-- kafka/
|       |   +-- metrics/
|       |   +-- mqtt/
|       |   +-- app.module.ts
|       |   +-- main.ts
|       +-- tests/
|       +-- Dockerfile
|       +-- package.json
|       +-- tsconfig.json
|       +-- tsconfig.build.json
+-- docs/
|   +-- adr/
|   +-- architecture/
|   +-- guides/
|   +-- reference/
|   +-- runbooks/
|   +-- README.md
+-- infra/
|   +-- docker/
|   |   +-- docker-compose.yml
|   +-- grafana/
|   |   +-- dashboards/
|   |   +-- provisioning/
|   +-- kafka/
|   +-- kubernetes/
|   +-- mlflow/
|   +-- mosquitto/
|   +-- postgres/
|   +-- prometheus/
+-- packages/
|   +-- shared-types/
+-- scripts/
|   +-- health-check.sh
|   +-- setup.sh
|   +-- simulate-sensor.js
+-- package.json
+-- package-lock.json
+-- turbo.json
```

## Roles des dossiers

| Chemin | Role actuel |
| --- | --- |
| `apps/iot-service` | Service NestJS qui consomme MQTT, valide les donnees capteur, publie vers Kafka et expose health/metrics. |
| `packages/shared-types` | Package TypeScript partage pour les types du domaine. |
| `infra/docker` | Stack Docker Compose locale. |
| `infra/grafana` | Provisioning Grafana et dashboard IoT. |
| `infra/prometheus` | Configuration Prometheus. |
| `infra/mosquitto` | Configuration du broker MQTT. |
| `infra/mlflow` | Image et script de lancement MLflow. |
| `infra/postgres` | Schema SQL initial. |
| `infra/kafka` | Script de creation de topics Kafka. |
| `infra/kubernetes` | Premiers manifests Kubernetes. |
| `scripts` | Scripts de setup, health check et simulation capteur. |
| `docs` | Documentation architecture, guides, references, runbooks et ADR. |

## Services Docker (vue rapide)

Le fichier `infra/docker/docker-compose.yml` orchestre : Postgres, MongoDB, Redis, Kafka (KRaft), Kafka UI, Mosquitto, MLflow, Prometheus, Grafana, MailHog, `iot-service`, et un `spark-job` (image construite depuis `apps/spark-jobs`). Voir [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml#L1-L420).

Points importants repérés dans la configuration Docker :

- `iot-service` dépend de `kafka`, `mosquitto`, `mongodb` et reçoit `MONGODB_URI` via variables d'environnement.
- Le service `spark-job` est configuré pour construire depuis `apps/spark-jobs` et publie vers `processed-sensor-data`.
- Kafka est configuré avec `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"` (auto-creation possible) mais le dépôt fournit aussi `infra/kafka/topics.sh` pour créer explicitement les topics attendus.

Utilisez `docker compose --env-file .env -f infra/docker/docker-compose.yml up --build` pour démarrer la stack locale.

Le fichier `infra/docker/docker-compose.yml` declare actuellement:

| Service | Conteneur | Etat observe |
| --- | --- | --- |
| PostgreSQL/PostGIS | `alkatra-postgres` | up, healthy |
| MongoDB | `alkatra-mongodb` | up, healthy |
| Redis | `alkatra-redis` | up, healthy |
| Kafka | `alkatra-kafka` | up, healthy |
| Kafka UI | `alkatra-kafka-ui` | up, healthy |
| Mosquitto | `alkatra-mosquitto` | up, healthy |
| MLflow | `alkatra-mlflow` | up, healthy |
| Prometheus | `alkatra-prometheus` | up, pas de healthcheck Docker declare |
| Grafana | `alkatra-grafana` | up, pas de healthcheck Docker declare |
| MailHog | `alkatra-mailhog` | up, pas de healthcheck Docker declare |
| IoT Service | `alkatra-iot` | up, healthy |
| Keycloak | `alkatra-keycloak` | configure via profile Docker `auth`, non lance par defaut |

Validation Compose:

```text
docker compose --env-file .env -f infra/docker/docker-compose.yml config --quiet
=> OK
```

## URLs et ports utiles

| Service | URL / port |
| --- | --- |
| IoT Service | `http://localhost:3005` |
| IoT Health | `http://localhost:3005/health` |
| IoT Metrics | `http://localhost:3005/metrics` |
| Grafana | `http://localhost:3000` |
| Prometheus | `http://localhost:9090` |
| Kafka UI | `http://localhost:8090` |
| MLflow | `http://localhost:5001` |
| MailHog | `http://localhost:8025` |
| PostgreSQL | `localhost:5432` |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6379` |
| Mosquitto MQTT | `localhost:1883` |
| Mosquitto WebSocket | `localhost:9001` |
| Kafka depuis l'hote | `localhost:9094` |
| Kafka depuis Docker | `kafka:9092` |

## Ce qui fonctionne actuellement (TRUTH-BASED)

Basé exclusivement sur l'inspection du code et des scripts :

- Ingestion MQTT et normalisation : implémenté par [apps/iot-service/src/mqtt/mqtt.service.ts](apps/iot-service/src/mqtt/mqtt.service.ts#L1-L300). Le simulateur MQTT est opérationnel : [scripts/simulate-sensor.js](scripts/simulate-sensor.js#L1-L200).
- Publication Kafka (producer) : [apps/iot-service/src/kafka/kafka.service.ts](apps/iot-service/src/kafka/kafka.service.ts#L1-L200) — la logique de connexion et d'envoi est présente.
- Consumer Kafka → persistance MongoDB : [apps/iot-service/src/kafka-consumer/sensor-data.consumer.ts](apps/iot-service/src/kafka-consumer/sensor-data.consumer.ts#L1-L300) et repository [apps/iot-service/src/mongodb/repositories/ai-sensor-reading.repository.ts](apps/iot-service/src/mongodb/repositories/ai-sensor-reading.repository.ts#L1-L200).
- Schéma MongoDB et indexation (TTL 90 jours) : [apps/iot-service/src/mongodb/schemas/ai-sensor-feature.schema.ts](apps/iot-service/src/mongodb/schemas/ai-sensor-feature.schema.ts#L1-L240).
- Spark Structured Streaming + feature engineering : [apps/spark-jobs/jobs/sensor_stream_processor.py](apps/spark-jobs/jobs/sensor_stream_processor.py#L1-L400) et [apps/spark-jobs/jobs/feature_engineering.py](apps/spark-jobs/jobs/feature_engineering.py#L1-L240). Ces jobs calculent les features (ETo, ETc, etc.) et publient vers `processed-sensor-data`.
- Redis state management pour features stateful : [apps/spark-jobs/jobs/state_manager.py](apps/spark-jobs/jobs/state_manager.py#L1-L240).
- Scripts de validation end-to-end : [scripts/validate-pipeline.sh](scripts/validate-pipeline.sh#L1-L240) vérifie topics, ingestion, persistance et presence de documents MongoDB ; [scripts/validate-mongodb-indexes.js](scripts/validate-mongodb-indexes.js#L1-L200) vérifie les index MongoDB.
- Orchestration locale Docker : [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml#L1-L420) définit les services et variables d'environnement.

Observation runtime : plusieurs scripts et le compose indiquent que les services sont pensés pour démarrer ensemble; la logique de connexion/retentative est présente (MQTT reconnect, Kafka retries, consumer retry loops).

### Build et tests

Commandes lancees:

```text
npm.cmd run test
npm.cmd run build
```

Resultats:

```text
Tests: 11 passed, 11 total
Test Suites: 2 passed, 2 total
Build: 2 tasks successful, 2 total
```

Les tests couvrent actuellement:

- creation du `KafkaService`;
- connexion Kafka simulee;
- envoi Kafka simule;
- creation du `MqttService`;
- validation des sept variables IA obligatoires;
- detection d'anomalies;
- rejet des payloads invalides;
- normalisation et forwarding MQTT vers Kafka;
- exposition des statistiques internes.

### IoT Service

Le service `apps/iot-service` fonctionne comme bridge MQTT vers Kafka.

Fonctions presentes:

- endpoint `GET /health`;
- endpoint `GET /metrics`;
- connexion MQTT a Mosquitto;
- abonnement au topic wildcard `alkatra/farm/+/parcel/+/sensor/+/data`;
- validation du contrat capteur IA v2;
- enrichissement du message avec `schema_version`, `received_at`, `is_anomaly`, `anomaly_reasons`;
- publication Kafka vers `raw-sensor-data`;
- compteurs internes pour messages recus, messages forwardes, anomalies, et statut MQTT/Kafka.

Etat observe de `/health`:

```json
{
  "status": "ok",
  "service": "alkatra-iot-service",
  "mqtt": {
    "connected": true,
    "messagesReceived": 0,
    "messagesForwarded": 0,
    "anomaliesDetected": 0
  },
  "kafka": {
    "ready": true
  }
}
```

Interpretation: le service est bien demarre, connecte a MQTT et pret cote Kafka. Au moment du controle, aucun message capteur n'avait encore ete recu par cette instance demarree.

### Contrat capteur IA

Le simulateur `scripts/simulate-sensor.js` publie un payload conforme au contrat IA v2:

```text
temperature_min_c
temperature_max_c
wind_speed_ms
solar_radiation_mj_m2_day
soil_humidity_pct
air_humidity_pct
rain_mm_day
```

Il publie par defaut sur:

```text
mqtt://localhost:1883
alkatra/farm/farm_test_001/parcel/parcel_test_001/sensor/esp32-sim-001/data
```

Commande:

```bash
node scripts/simulate-sensor.js 5000
```

### Prometheus

Prometheus est actif sur:

```text
http://localhost:9090
```

Targets actives observees:

| Job | Target | Etat |
| --- | --- | --- |
| `prometheus` | `localhost:9090` | up |
| `iot-service` | `iot-service:3005` | up |

Prometheus scrape `iot-service` toutes les 5 secondes via:

```text
http://iot-service:3005/metrics
```

Metriques IoT exposees:

```text
alkatra_iot_messages_received_total
alkatra_iot_messages_forwarded_total
alkatra_iot_anomalies_detected_total
alkatra_iot_mqtt_connected
alkatra_iot_kafka_ready
alkatra_iot_last_sensor_value
alkatra_iot_last_message_timestamp_seconds
```

Au moment du controle:

```text
alkatra_iot_mqtt_connected 1
alkatra_iot_kafka_ready 1
alkatra_iot_messages_received_total 0
alkatra_iot_messages_forwarded_total 0
```

### Grafana

Grafana est actif sur:

```text
http://localhost:3000
```

Configuration observee:

- datasource provisionnee: `Prometheus`;
- dashboard provisionne: `Al Katra - IoT Pipeline`;
- dossier Grafana: `Al Katra IoT`;
- refresh du dashboard: `5s`;
- reload provisioning dashboards: `30s`.

Le dashboard utilise actuellement les donnees Prometheus pour afficher:

- targets Prometheus;
- statut MQTT du service IoT;
- statut Kafka producer du service IoT;
- messages MQTT recus par minute;
- messages forwardes Kafka par minute;
- compteurs IoT;
- dernieres valeurs capteur apres reception de donnees;
- age du dernier message.

### Kafka et Kafka UI

Kafka est actif et healthy.

Kafka UI repond sur:

```text
http://localhost:8090
```

Au moment du controle, la commande de listing Kafka ne retournait aucun topic. Cela veut dire qu'aucun topic visible n'existait encore dans le broker au moment exact du controle. Le topic `raw-sensor-data` doit apparaitre apres publication effective d'un message valide par `iot-service`, ou apres creation explicite via un script Kafka.

### MLflow

MLflow est actif et healthy sur:

```text
http://localhost:5000
```

Le service utilise:

- Postgres comme backend store;
- le volume Docker `mlflow_data` pour les artifacts;
- `infra/mlflow/start.sh` comme script de lancement.

### MailHog

MailHog repond sur:

```text
http://localhost:8025
```

Il est pret pour les tests emails en developpement.

## Commandes principales (exemples)

```bash
npm install
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build
node scripts/simulate-sensor.js 5000
bash scripts/validate-pipeline.sh
node scripts/validate-mongodb-indexes.js
```

Note Windows (PowerShell) : utiliser `npm.cmd` si nécessaire.

```bash
npm install
npm run docker:up
npm run docker:down
npm run docker:logs
npm run test
npm run build
npm run simulate
npm run health
```

Sur Windows PowerShell, si `npm` est bloque par `npm.ps1`, utiliser:

```powershell
npm.cmd run test
npm.cmd run build
```

