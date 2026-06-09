# Etat actuel du projet - structure et fonctionnement

Controle effectue le 2026-06-08.

Ce document resume la structure actuelle du projet Al Katra Platform et ce qui fonctionne a ce stade. Il distingue les elements confirmes par commande locale, les elements configures dans le code, et les points encore a surveiller.

## Resume rapide

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

## Structure du repository

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

## Services Docker configures

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
| MLflow | `http://localhost:5000` |
| MailHog | `http://localhost:8025` |
| PostgreSQL | `localhost:5432` |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6379` |
| Mosquitto MQTT | `localhost:1883` |
| Mosquitto WebSocket | `localhost:9001` |
| Kafka depuis l'hote | `localhost:9094` |
| Kafka depuis Docker | `kafka:9092` |

## Ce qui fonctionne actuellement

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

## Commandes principales

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

## Points a surveiller

### `health-check.sh` sur Windows

La commande suivante n'a pas pu etre lancee dans l'environnement courant:

```bash
bash scripts/health-check.sh
```

Erreur observee:

```text
execvpe(/bin/bash) failed: No such file or directory
```

Cause observee:

```text
bash => C:\Windows\System32\bash.exe
```

Cela indique que PowerShell trouve le lanceur WSL Windows, mais pas un environnement Bash Linux utilisable. Le script lui-meme existe, mais il faut Git Bash, WSL fonctionnel, ou une variante PowerShell du health check pour l'executer sur cette machine.

### Donnees capteur non encore observees dans cette session

Le service IoT est up et connecte, mais les compteurs indiquaient encore:

```text
messagesReceived: 0
messagesForwarded: 0
```

Donc l'infrastructure fonctionne, mais le flux de donnees complet doit etre confirme en relancant le simulateur pendant que la stack tourne:

```bash
node scripts/simulate-sensor.js 5000
```

Puis verifier:

```text
http://localhost:3005/health
http://localhost:3005/metrics
http://localhost:8090
http://localhost:3000
```

### Documentation a aligner

Le fichier `docs/reference/ports-and-services.md` indique encore que le service IoT est une app locale hors Compose. Dans l'etat actuel du Compose, `iot-service` est bien declare comme service Docker `alkatra-iot`.

### Etat Git local

Au moment du controle, `infra/docker/docker-compose.yml` etait modifie dans le working tree.

## Prochaines mises a jour utiles

- Ajouter ou adapter une version PowerShell de `scripts/health-check.sh`.
- Creer explicitement le topic Kafka `raw-sensor-data` au demarrage si l'on veut qu'il apparaisse dans Kafka UI avant le premier message.
- Ajouter un test smoke automatisable qui publie un message MQTT unique et verifie l'increment des compteurs IoT, la presence du topic `raw-sensor-data` et la visibilite du message dans Kafka.
- Aligner `docs/reference/ports-and-services.md` avec le Compose actuel.
