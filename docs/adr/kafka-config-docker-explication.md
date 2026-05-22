# ADR - Configuration Kafka Docker locale

## Statut

Accepte.

## Contexte

Kafka est le bus d'evenements central du projet. Il recoit les donnees capteurs validees par `iot-service`, puis les rend disponibles aux futures briques de traitement:

- stream processing;
- pipeline ML;
- alertes;
- recommandations;
- dashboards.

## Decision

La stack locale utilise l'image officielle:

```yaml
image: apache/kafka:3.7.0
```

Kafka tourne en mode KRaft single-node:

```yaml
KAFKA_PROCESS_ROLES: "broker,controller"
KAFKA_NODE_ID: 1
```

Listeners:

```yaml
KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:9092,EXTERNAL://0.0.0.0:9094,CONTROLLER://0.0.0.0:9093"
KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094"
```

Cela donne deux usages:

- `kafka:9092` depuis les autres conteneurs Docker;
- `localhost:9094` depuis la machine hote.

## Pourquoi deux ports

Les conteneurs sur le reseau Docker doivent joindre Kafka avec le nom DNS `kafka`.

Les applications lancees depuis la machine hote doivent joindre Kafka via `localhost`.

Sans listener externe separe, les clients Kafka recoivent parfois une adresse qu'ils ne peuvent pas joindre.

## Topics

Le script `infra/kafka/topics.sh` cree les topics de developpement:

```text
raw-sensor-data
processed-sensor-data
ml-inference-requests
recommendations-generated
alerts-outbound
sensor-anomalies
```

## Limites dev

Cette configuration est volontairement simple:

- replication factor `1`;
- PLAINTEXT;
- un seul broker;
- auto-create topics active.

En production, il faudra prevoir:

- plusieurs brokers;
- replication factor superieur a 1;
- TLS;
- authentification SASL;
- monitoring Kafka plus complet;
- strategie de retention par topic.

## References

- `infra/docker/docker-compose.yml`
- `infra/kafka/topics.sh`
- `apps/iot-service/src/kafka/kafka.service.ts`
