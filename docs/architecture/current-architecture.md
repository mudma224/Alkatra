# Architecture technique actuelle

## Vue logique

```text
Capteur ESP32 ou simulateur
        |
        | MQTT topic:
        | alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
        v
Mosquitto
        |
        v
iot-service NestJS
        |
        | valide + enrichit
        v
Kafka topic: raw-sensor-data
        |
        +--> futurs traitements Spark / stream processing
        +--> futur service ML inference
        +--> futures alertes / recommandations
```

## Infrastructure locale

La stack est definie dans `infra/docker/docker-compose.yml`.

| Service | Role | Port local |
| --- | --- | --- |
| Postgres/PostGIS | base relationnelle metier | `5432` |
| MongoDB | stockage IoT/time-series futur | `27017` |
| Redis | cache/sessions futur | `6379` |
| Kafka | bus d'evenements | `9094` externe, `9092` interne |
| Kafka UI | interface Kafka | `8090` |
| Mosquitto | broker MQTT | `1883`, `9001` |
| MLflow | tracking et registry modeles IA | `5000` |
| Prometheus | collecte metriques | `9090` |
| Grafana | dashboards | `3000` |
| MailHog | email dev | `8025`, `1025` |
| Keycloak | auth future, profile `auth` | `8080` |

## Service IoT

Le service `apps/iot-service` est une application NestJS.

Modules principaux:

- `MqttModule`: connexion Mosquitto, validation payload, publication Kafka.
- `KafkaModule`: producer Kafka vers `raw-sensor-data`.
- `HealthModule`: endpoint `/health`.

Endpoint expose:

```text
GET http://localhost:3005/health
```

La reponse contient l'etat MQTT, Kafka et les compteurs de messages.

## Kafka

Kafka fonctionne en mode KRaft single-node pour le developpement.

Topics prevus dans `infra/kafka/topics.sh`:

| Topic | Usage |
| --- | --- |
| `raw-sensor-data` | mesures capteurs brutes validees par iot-service |
| `processed-sensor-data` | donnees enrichies futures |
| `ml-inference-requests` | requetes futures vers modele IA |
| `recommendations-generated` | recommandations futures |
| `alerts-outbound` | alertes sortantes futures |
| `sensor-anomalies` | anomalies capteurs futures |

## Observabilite

Grafana est provisionne depuis:

```text
infra/grafana/provisioning
infra/grafana/dashboards
```

Le dashboard actuel:

```text
Al Katra IoT / Al Katra - IoT Pipeline
```

Prometheus lit sa configuration dans:

```text
infra/prometheus/prometheus.yml
```
