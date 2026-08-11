# iot-service — Documentation technique

> Cette documentation reflète l'état du code source, de la configuration et des tests. Elle est basée uniquement sur le code implémenté, pas sur les commentaires.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complète)
4. [Démarrage](#4-démarrage)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Routes HTTP](#6-routes-http)
7. [Fonctionnement interne par fichier](#7-fonctionnement-interne-par-fichier)
8. [Bridge MQTT → Kafka (validation capteur)](#8-bridge-mqtt--kafka-validation-capteur)
9. [Consumer Kafka → MongoDB](#9-consumer-kafka--mongodb)
10. [Persistance MongoDB (collection ai_sensor_features)](#10-persistance-mongodb-collection-ai_sensor_features)
11. [Observabilité (métriques Prometheus)](#11-observabilité-métriques-prometheus)
12. [Gestion des erreurs](#12-gestion-des-erreurs)
13. [Health checks](#13-health-checks)
14. [Tests](#14-tests)
15. [Docker](#15-docker)
16. [Ce que le service NE fait PAS](#16-ce-que-le-service-ne-fait-pas)
17. [Comportements notables](#17-comportements-notables)
18. [Résumé opérationnel](#18-résumé-opérationnel)

---

## 1. Rôle du service

`iot-service` est un microservice NestJS (port 3005) qui assure l'ingestion temps réel des mesures capteurs agricoles (ESP32) et leur projection vers la couche de feature engineering. Il joue trois rôles complémentaires dans le pipeline d'irrigation intelligente :

1. **Bridge MQTT → Kafka** — souscrit au broker Mosquitto, valide le contrat IA des payload capteurs, détecte les anomalies, puis publie les lectures enrichies sur le topic Kafka `raw-sensor-data`.
2. **Consumer Kafka → MongoDB** — consomme le topic `raw-sensor-data` et persiste chaque lecture dans la collection MongoDB `ai_sensor_features` (rétention 90 jours).
3. **Surface d'observabilité** — expose deux endpoints non protégés : `GET /health` (statistiques runtime) et `GET /metrics` (métriques au format Prometheus).

**Ce qu'il fait :**

- Il souscrit au wildcard MQTT `alkatra/farm/+/parcel/+/sensor/+/data` (QoS 1)
- Il valide la présence des 7 variables IA obligatoires (avec tolérance d'alias)
- Il détecte les anomalies physiques (températures, vent, rayonnement, humidités, pluie)
- Il enrichit chaque lecture avec `farm_id`, `parcel_id`, `device_id` extraits du topic
- Il publie vers Kafka avec une clé `{farm_id}:{parcel_id}` (partitionnement par parcelle)
- Il persiste les lectures enrichies dans MongoDB
- Il expose des compteurs Prometheus (messages reçus, transférés, anomalies)

**Ce qu'il ne fait PAS :**

- Il n'expose aucune API REST métier (lecture/écriture de données capteur)
- Il ne consomme pas le topic `recommendations-generated`
- Il n'appelle pas le `ml-inference-service` (la variable `ML_INFERENCE_URL` est déclarée dans docker-compose mais non lue par le code)
- Il ne détient aucun endpoint d'authentification

---

## 2. Architecture et flux

### Flux principal (MQTT → Kafka → Mongo)

```
ESP32 / capteurs
   │
   │  MQTT publish : alkatra/farm/<farm>/parcel/<parcel>/sensor/<device>/data
   ▼
Mosquitto (1883)
   │
   ▼
iot-service — MqttService
   ├→ 1. JSON.parse + validation des 7 variables IA (+ alias tolérés)
   ├→ 2. Extraction farm_id / parcel_id / device_id depuis le topic
   ├→ 3. Détection d'anomalies physiques (is_anomaly, anomaly_reasons)
   └→ 4. KafkaService.send() sur "raw-sensor-data" (clé farm_id:parcel_id, compression GZIP)
              │
              ▼
        Kafka topic "raw-sensor-data"
              │
              ▼
iot-service — SensorDataConsumer (group iot-service-mongodb-persister)
   ├→ JSON.parse + contrôle device_id / farm_id / parcel_id
   └→ AiSensorFeatureRepository.saveFeature()
              │
              ▼
        MongoDB — collection ai_sensor_features (TTL 90 jours)
```

### Architecture des dépendances

```
iot-service (port 3005)
│
├── Mosquitto (via mqtt v5)
│   └── Subscribe : alkatra/farm/+/parcel/+/sensor/+/data (QoS 1)
│
├── Kafka (via kafkajs)
│   ├── Producer : topic "raw-sensor-data" (allowAutoTopicCreation, GZIP)
│   └── Consumer : topic "raw-sensor-data" (group iot-service-mongodb-persister)
│
└── MongoDB (via @nestjs/mongoose)
    └── Collection : ai_sensor_features (TTL 90 jours)
```

Le producer et le consumer Kafka sont des clients distincts (clientId `alkatra-iot-service` côté producer, `iot-service-consumer` côté consumer) — la consommation ne transite pas par le `KafkaService`.

---

## 3. Arborescence complète

```
apps/iot-service/
├── .eslintrc.js                                # Configuration ESLint (TS + Jest)
├── Dockerfile                                  # Build multi-stage (development / builder / production)
├── package.json                                # Dépendances et scripts NestJS
├── tsconfig.json                               # Configuration TypeScript (target ES2021)
├── tsconfig.build.json                         # Config build (exclut tests, dist)
│
├── src/
│   ├── main.ts                                 # Point d'entrée NestJS (port 3005, préfixe api/v1)
│   ├── app.module.ts                           # Module racine (imports tous les modules)
│   │
│   ├── mqtt/
│   │   ├── mqtt.module.ts                      # Module MQTT (importe KafkaModule)
│   │   └── mqtt.service.ts                     # Subscriber MQTT + validation IA + détection anomalies
│   │
│   ├── kafka/
│   │   ├── kafka.module.ts                     # Module Kafka (exporte KafkaService)
│   │   └── kafka.service.ts                    # Producer Kafka (send, isReady, subscribe mort)
│   │
│   ├── kafka-consumer/
│   │   ├── kafka-consumer.module.ts            # Module consumer (déclare SensorDataConsumer)
│   │   └── sensor-data.consumer.ts             # Consumer Kafka raw-sensor-data → MongoDB
│   │   └── sensor-data.consumer.spec.ts        # Test unitaire du consumer
│   │
│   ├── mongodb/
│   │   ├── mongodb.module.ts                   # Module Mongoose (forRootAsync + forFeature)
│   │   ├── repositories/
│   │   │   └── ai-sensor-reading.repository.ts # Repository AiSensorFeature (saveFeature, requêtes)
│   │   └── schemas/
│   │       └── ai-sensor-feature.schema.ts     # Schéma Mongoose + index (TTL 90j)
│   │
│   ├── health/
│   │   ├── health.module.ts                    # Module health (Terminus + MQTT + Kafka)
│   │   └── health.controller.ts                # GET /health (stats runtime)
│   │
│   └── metrics/
│       ├── metrics.module.ts                   # Module metrics
│       └── metrics.controller.ts               # GET /metrics (format Prometheus texte)
│
└── tests/
    ├── mqtt.service.spec.ts                    # Tests MqttService (validation, anomalies, forward)
    └── kafka.service.spec.ts                   # Tests KafkaService (connect, send, isReady)
```

> **Note :** Seuls les fichiers `.ts` sont conservés dans le contrôle de version. Les artefacts de compilation (`.js`, `.d.ts`) vont dans `dist/` (exclu du VCS).

---

## 4. Démarrage

### En local (développement)

```bash
cd apps/iot-service

npm run build          # nest build
npm run start          # node dist/main
npm run start:dev      # nest start --watch (hot reload)
npm run start:debug    # nest start --debug --watch
npm run lint           # eslint "{src,tests}/**/*.ts" --fix
npm run test           # jest
npm run test:cov       # jest --coverage
```

### Dans Docker

Le `docker-compose` (`infra/docker/docker-compose.yml`) construit l'image avec `target: development`, ce qui exécute `npm run start:dev` à l'intérieur du conteneur avec un volume bind sur `src/` pour le hot reload.

```bash
# Depuis la racine du monorepo
docker compose --project-directory infra/docker -f infra/docker/docker-compose.yml up iot-service
```

### Prérequis

- Mosquitto accessible sur le port 1883 (URL `MQTT_BROKER_URL`)
- Kafka accessible avec le topic `raw-sensor-data` (ou `allowAutoTopicCreation: true` côté producer pour le créer à la volée)
- MongoDB accessible avec la base `alkatra_iot` (collection `ai_sensor_features`)
- Variables d'authentification MQTT (`MQTT_USERNAME`, `MQTT_PASSWORD`) optionnelles

---

## 5. Variables d'environnement

### Configuration centralisée (`src/app.module.ts` + docker-compose)

La configuration n'utilise pas de fonction `registerAs`. Elle s'appuie sur `ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })` et lit directement les variables via `ConfigService.get<string>(...)` dans les services.

### Tableau récapitulatif

| Variable | Défaut dans le code | Valeur docker-compose | Utilisation |
|----------|---------------------|-----------------------|-------------|
| `NODE_ENV` | — | `development` | Environnement d'exécution |
| `PORT` | `3005` | `3005` | Port d'écoute HTTP (main.ts) |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | `mqtt://mosquitto:1883` | URL du broker Mosquitto |
| `MQTT_USERNAME` | `undefined` (optionnel) | `${MQTT_USER:-}` | Identifiant MQTT (optionnel) |
| `MQTT_PASSWORD` | `undefined` (optionnel) | `${MQTT_PASSWORD:-}` | Mot de passe MQTT (optionnel) |
| `KAFKA_BROKERS` | `localhost:9094` (producer) / `kafka:9092` (consumer) | `kafka:9092` | Brokers Kafka (séparés par virgules) |
| `MONGODB_URI` | — | `mongodb://<user>:<pass>@mongodb:27017/alkatra_iot?authSource=admin` | URI MongoDB |
| `ML_INFERENCE_URL` | non lu par le code | `http://ml-inference-service:8000` | Déclarée dans docker-compose mais non consommée |

### Exemple de `.env` local

```env
NODE_ENV=development
PORT=3005

MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

KAFKA_BROKERS=localhost:9092

MONGODB_URI=mongodb://localhost:27017/alkatra_iot
```

> ⚠️ Le défaut `KAFKA_BROKERS` diffère entre le producer (`localhost:9094`) et le consumer (`kafka:9092`) : en local, il faut fixer explicitement `KAFKA_BROKERS=localhost:9092` (ou le port du broker exposé) pour aligner les deux clients.

---

## 6. Routes HTTP

Le service applique le préfixe global `api/v1` via `app.setGlobalPrefix('api/v1', { exclude: [...] })`. Les endpoints `/health` et `/metrics` sont **explicitement exclus** du préfixe et restent donc accessibles à la racine.

| Méthode | Route | Préfixée ? | Auth | Comportement |
|---------|-------|-----------|------|-------------|
| `GET` | `/health` | non | aucune | Retourne le statut runtime (stats MQTT, état Kafka, MongoDB/ML statiques) |
| `GET` | `/metrics` | non | aucune | Expose les métriques au format texte Prometheus |

Il n'existe aucune route métier sous `/api/v1/*` (aucun controller n'est monté sur ce préfixe). Le service ne publie pas d'API REST de données capteur.

---

## 7. Fonctionnement interne par fichier

### Détail par fichier source

| Fichier | Rôle |
|---------|------|
| `src/main.ts` | Point d'entrée NestJS. Active le logger (`log`, `error`, `warn`, `debug`). Applique le préfixe `api/v1` en excluant `GET /metrics` et `GET /health`. Écoute sur `0.0.0.0:${PORT}` (3005 par défaut). |
| `src/app.module.ts` | Module racine. Importe `ConfigModule.forRoot` (global, `.env`), `MongooseModule.forRootAsync` (URI depuis `MONGODB_URI`), `KafkaConsumerModule`, `KafkaModule`, `MqttModule`, `HealthModule`, `MetricsModule`. |
| `src/mqtt/mqtt.module.ts` | Importe `KafkaModule` pour injecter `KafkaService`. Déclare et exporte `MqttService`. |
| `src/mqtt/mqtt.service.ts` | Cœur du bridge MQTT. `onModuleInit` : connexion Mosquitto (clientId daté, `reconnectPeriod: 3000`, `connectTimeout: 10000`). Subscribe au wildcard QoS 1. `handleMessage` : parse → `buildSensorReading` → `detectAnomalies` → `kafkaService.send`. Expose `getStats()`. Voir [section 8](#8-bridge-mqtt--kafka-validation-capteur). |
| `src/kafka/kafka.module.ts` | Déclare et exporte `KafkaService`. |
| `src/kafka/kafka.service.ts` | Producer Kafka. `onModuleInit` : client (`clientId: alkatra-iot-service`, `logLevel: WARN`, retry 10x), producer (`allowAutoTopicCreation: true`, `transactionTimeout: 30000`). `send(topic, key, value)` : compression GZIP, timestamp, log en `warn` si non connecté. `subscribe()` : code mort (jamais appelé, voir [section 17](#17-comportements-notables)). |
| `src/kafka-consumer/kafka-consumer.module.ts` | Importe `MongodbModule`. Déclare `SensorDataConsumer` comme `@Controller()`. |
| `src/kafka-consumer/sensor-data.consumer.ts` | Consumer Kafka. `onModuleInit` : client (`clientId: iot-service-consumer`), consumer (`groupId: iot-service-mongodb-persister`, `sessionTimeout: 30000`, `heartbeatInterval: 3000`). Subscribe `raw-sensor-data` (`fromBeginning: false`). Validation minimale puis `saveFeature`. Voir [section 9](#9-consumer-kafka--mongodb). |
| `src/mongodb/mongodb.module.ts` | `forRootAsync` (URI + pool `maxPoolSize: 10`, `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 45000`). `forFeature([{ name: AiSensorFeature.name, schema }]`)). Déclare et exporte `AiSensorFeatureRepository`. |
| `src/mongodb/repositories/ai-sensor-reading.repository.ts` | Repository. `saveFeature(payload)` : instancie un document `AiSensorFeature` à partir du payload et le persiste. `getLatestByParcel(parcelId, limit=48)` : tri `ts: -1`, `.lean()`. `getLastByDevice(deviceId)` : `findOne` trié `ts: -1`. |
| `src/mongodb/schemas/ai-sensor-feature.schema.ts` | Schéma de la collection `ai_sensor_features`. Voir [section 10](#10-persistance-mongodb-collection-ai_sensor_features). |
| `src/health/health.module.ts` | Importe `TerminusModule`, `MqttModule`, `KafkaModule`. Déclare `HealthController`. |
| `src/health/health.controller.ts` | `GET /health`. Retourne `{ status, service, timestamp, mqtt: {...}, kafka: {ready}, mongodb: {connected}, ml_consumer: {active} }`. Voir [section 13](#13-health-checks). |
| `src/metrics/metrics.module.ts` | Importe `MqttModule` et `KafkaModule`. Déclare `MetricsController`. |
| `src/metrics/metrics.controller.ts` | `GET /metrics` (Content-Type `text/plain; version=0.0.4`). Génère à la main les lignes Prometheus (compteurs + gauges + dernières valeurs capteur). Voir [section 11](#11-observabilité-métriques-prometheus). |

---

## 8. Bridge MQTT → Kafka (validation capteur)

### Topic MQTT souscrit

```
alkatra/farm/+/parcel/+/sensor/+/data   (QoS 1)
```

Le wildcard `+` capture respectivement `farm_id`, `parcel_id` et `device_id`. La connexion utilise un `clientId` horodaté (`alkatra-iot-service-<timestamp>`) et les options `reconnectPeriod: 3000`, `connectTimeout: 10000`, `clean: true`. En cas de déconnexion, le service se reconnecte automatiquement et se réabonne.

### Les 7 variables IA et alias

Le contrat IA impose 7 variables obligatoires (constante `REQUIRED_AI_FIELDS`). Chaque variable accepte un ensemble d'alias via `FIELD_ALIASES` : le premier alias présent et non vide dans le payload est utilisé (résolu en nombre via `Number(...)`).

| Variable IA canonique | Alias acceptés |
|-----------------------|----------------|
| `temperature_min_c` | `temperature_min_c`, `temp_min_c`, `min_temperature_c` |
| `temperature_max_c` | `temperature_max_c`, `temp_max_c`, `max_temperature_c` |
| `wind_speed_ms` | `wind_speed_ms`, `wind_speed_mps`, `wind_m_s` |
| `solar_radiation_mj_m2_day` | `solar_radiation_mj_m2_day`, `solar_radiation`, `solar_mj_m2_day` |
| `soil_humidity_pct` | `soil_humidity_pct`, `soil_moisture_pct`, `soil_moisture_1` |
| `air_humidity_pct` | `air_humidity_pct`, `air_humidity` |
| `rain_mm_day` | `rain_mm_day`, `rainfall_mm_day`, `rain_mm` |

Si l'une des 7 variables est absente ou non finie, `extractAiFeatures` retourne `null` et le message est rejeté avant publication Kafka (log `warn`, aucun envoi).

### Construction de la lecture enrichie

`buildSensorReading(topic, data)` produit un objet normalisé :

```json
{
  "schema_version": "sensor-ai-v2",
  "ts": 1714896000,
  "device_id": "esp32-001",
  "farm_id": "farm_001",
  "parcel_id": "parcel_A",
  "temperature_min_c": 12.5,
  "temperature_max_c": 31.2,
  "wind_speed_ms": 4.7,
  "solar_radiation_mj_m2_day": 21.4,
  "soil_humidity_pct": 46.8,
  "air_humidity_pct": 62.1,
  "rain_mm_day": 3.4,
  "received_at": "2026-08-09T10:00:00.000Z",
  "is_anomaly": false,
  "anomaly_reasons": []
}
```

Les identifiants `farm_id`, `parcel_id`, `device_id` sont extraits des segments du topic (`topic.split('/')[2]`, `[4]`, `[6]`) avec repli sur les champs homonymes du payload, puis sur `'unknown'`. Le champ `ts` utilise `data.ts` s'il est numérique, sinon `Math.floor(Date.now() / 1000)`.

### Détection d'anomalies

`detectAnomalies` applique les seuils définis dans `ANOMALY_THRESHOLDS` :

| Variable | Condition d'anomalie |
|----------|----------------------|
| `temperature_min_c` | valeur < `-10 °C` |
| `temperature_max_c` | valeur > `60 °C` |
| températures | `temperature_min_c > temperature_max_c` |
| `wind_speed_ms` | hors `[0, 45]` m/s |
| `solar_radiation_mj_m2_day` | hors `[0, 40]` MJ/m²/jour |
| `soil_humidity_pct` | hors `[0, 100]` % |
| `air_humidity_pct` | hors `[0, 100]` % |
| `rain_mm_day` | hors `[0, 200]` mm/jour |

Chaque franchissement de seuil ajoute un message en français au tableau `anomaly_reasons` (ex. `soil_humidity_pct hors limites: 140%`). Si au moins une raison est collectée, `is_anomaly = true`. Le message est tout de même publié vers Kafka (l'anomalie est un attribut, pas un filtre). Un log `warn` est émis avec le `device_id` et les raisons.

### Publication Kafka

```typescript
kafkaService.send('raw-sensor-data', `${farm_id}:${parcel_id}`, enrichedReading);
```

La clé `{farm_id}:{parcel_id}` garantit que toutes les lectures d'une même parcelle atterrissent dans la même partition Kafka (ordonnancement préservé).

---

## 9. Consumer Kafka → MongoDB

Le consumer est implémenté dans `SensorDataConsumer` (`src/kafka-consumer/sensor-data.consumer.ts`), indépendant du `KafkaService` producteur.

### Connexion et abonnement

- Client : `clientId: iot-service-consumer`
- Consumer : `groupId: iot-service-mongodb-persister`, `sessionTimeout: 30000`, `heartbeatInterval: 3000`
- Subscribe : topic `raw-sensor-data`, `fromBeginning: false`
- Retry : `initialRetryTime: 3000`, `retries: 10`

En cas d'échec de connexion initiale, le consumer retente après 10 secondes (`setTimeout(() => this.connect(), 10000)`).

### Traitement de chaque message

```
Kafka "raw-sensor-data"
   │
   ▼
SensorDataConsumer.consume() → consumer.run({ eachMessage })
   │
   ├── 1. message.value vide → log warn + skip
   │
   ├── 2. JSON.parse(message.value)
   │      └── échec → log error (stack) + skip
   │
   ├── 3. Validation minimale : device_id, farm_id, parcel_id présents
   │      └── invalide → log warn + skip
   │
   └── 4. AiSensorFeatureRepository.saveFeature(payload) → MongoDB
          └── échec → log error (stack) + skip
```

La validation se limite à la présence de `device_id`, `farm_id` et `parcel_id` : les 7 variables IA ne sont **pas** re-validées par le consumer (elles l'ont été en amont par le bridge MQTT). En cas d'exception à quelque étape que ce soit, le message est loggé puis ignoré — il n'y a pas de Dead Letter Queue côté consumer.

---

## 10. Persistance MongoDB (collection ai_sensor_features)

### Schéma

Le schéma `AiSensorFeature` (`src/mongodb/schemas/ai-sensor-feature.schema.ts`) déclare la collection `ai_sensor_features` (`timestamps: false`, `versionKey: false`).

```typescript
@Schema({ collection: 'ai_sensor_features', timestamps: false, versionKey: false })
class AiSensorFeature {
  device_id: string;                    // required, index
  farm_id: string;                      // required, index
  parcel_id: string;                    // required, index
  ts: number;                           // required, index (epoch secondes)
  temperature_min_c: number;            // required
  temperature_max_c: number;            // required
  wind_speed_ms: number;                // required
  solar_radiation_mj_m2_day: number;    // required
  soil_humidity_pct: number;            // required
  air_humidity_pct: number;             // required
  rain_mm_day: number;                  // required
  is_anomaly: boolean;                  // default false, index
  anomaly_reasons: string[];            // default []
  schema_version: string;               // required
  received_at: Date;                    // default Date.now
}
```

Le repository (`saveFeature`) reçoit le payload tel quel et instancie un document. Le champ `received_at` est reconstruit via `new Date(payload.received_at)` (chaîne ISO du bridge).

### Index

Le schéma définit quatre index composites calculés par Mongoose au démarrage :

| Index | Champs | Usage |
|-------|--------|-------|
| Dashboard ferme/parcelle | `{ farm_id: 1, parcel_id: 1, ts: -1 }` | `getLatestByParcel` (filtrage + tri temporel) |
| Monitoring device | `{ device_id: 1, ts: -1 }` | `getLastByDevice` |
| TTL rétention | `{ received_at: 1 }` (`expireAfterSeconds: 7776000`) | Suppression automatique après 90 jours |
| Monitoring anomalies | `{ is_anomaly: 1, ts: -1 }` | Requête sur les anomalies récentes |

Les index simples portés par chaque `@Prop({ index: true })` (`device_id`, `farm_id`, `parcel_id`, `ts`, `is_anomaly`) sont également créés.

---

## 11. Observabilité (métriques Prometheus)

### Endpoint /metrics

`GET /metrics` (Content-Type `text/plain; version=0.0.4; charset=utf-8`) génère à la main les lignes Prometheus, sans dépendance à `prom-client`. Le pattern maison est cohérent avec celui du `recommendation-service`.

### Métriques exposées

| Nom Prometheus | Type | Labels | Description |
|----------------|------|--------|-------------|
| `alkatra_iot_messages_received_total` | counter | — | Total des messages MQTT reçus |
| `alkatra_iot_messages_forwarded_total` | counter | — | Total des lectures transférées vers Kafka |
| `alkatra_iot_anomalies_detected_total` | counter | — | Total des anomalies détectées |
| `alkatra_iot_mqtt_connected` | gauge | — | État de la connexion MQTT (1 connecté, 0 déconnecté) |
| `alkatra_iot_kafka_ready` | gauge | — | État du producer Kafka (1 prêt, 0 non prêt) |
| `alkatra_iot_last_sensor_value` | gauge | `farm_id`, `parcel_id`, `device_id`, `field` | Dernière valeur reçue par variable IA (7 séries) |
| `alkatra_iot_last_message_timestamp_seconds` | gauge | `farm_id`, `parcel_id`, `device_id` | Timestamp (epoch secondes) du dernier message valide |

Les séries `alkatra_iot_last_sensor_value` et `alkatra_iot_last_message_timestamp_seconds` ne sont émises que si une lecture a déjà été reçue (`stats.lastReading` non null). Les valeurs de labels sont échappées (`\` et `"`).

### Exemple d'extrait

```
# HELP alkatra_iot_messages_received_total Total MQTT messages received by iot-service.
# TYPE alkatra_iot_messages_received_total counter
alkatra_iot_messages_received_total 142
# HELP alkatra_iot_messages_forwarded_total Total sensor messages forwarded to Kafka.
# TYPE alkatra_iot_messages_forwarded_total counter
alkatra_iot_messages_forwarded_total 140
# HELP alkatra_iot_mqtt_connected MQTT connection status, 1 connected and 0 disconnected.
# TYPE alkatra_iot_mqtt_connected gauge
alkatra_iot_mqtt_connected 1
```

---

## 12. Gestion des erreurs

Le service n'utilise pas de filtre HTTP global ni de Dead Letter Queue. La gestion des erreurs est répartie par composant :

| Composant | Stratégie |
|-----------|-----------|
| Bridge MQTT | JSON invalide → log `warn` + skip. Variables IA manquantes → log `warn` + skip (pas de publication Kafka). |
| Anomalies physiques | Non bloquantes : `is_anomaly = true`, raisons collectées, lecture publiée quand même. |
| Producer Kafka | Non connecté → log `warn` "message perdu" + skip (pas de file d'attente). Échec `producer.send` → log `error` + skip. |
| Consumer Kafka | `message.value` vide → log `warn` + skip. JSON invalide / champs manquants / erreur persistance → log `error` avec stack + skip. Aucune DLQ. |
| Connexion producer | Échec → retry `setTimeout(connect, 5000)` indéfiniment. |
| Connexion consumer | Échec → retry `setTimeout(connect, 10000)` indéfiniment. |

Les compteurs `messagesReceived`, `messagesForwarded`, `anomaliesDetected` sont incrémentés en mémoire (non persistés) et exposés via `/health` et `/metrics`.

---

## 13. Health checks

### GET /health

```json
{
  "status": "ok",
  "service": "alkatra-iot-service",
  "timestamp": "2026-08-09T10:00:00.000Z",
  "mqtt": {
    "connected": true,
    "messagesReceived": 142,
    "messagesForwarded": 140,
    "anomaliesDetected": 2
  },
  "kafka": {
    "ready": true
  },
  "mongodb": {
    "connected": true
  },
  "ml_consumer": {
    "active": true
  }
}
```

La réponse combine :

- `mqtt.connected` : `client.connected` (état réel de la connexion MQTT)
- `mqtt.messagesReceived` / `messagesForwarded` / `anomaliesDetected` : compteurs runtime
- `kafka.ready` : `kafkaService.isReady()` (état réel du producer)
- `mongodb.connected` : valeur **statique** `true`
- `ml_consumer.active` : valeur **statique** `true`

### Healthcheck Docker

Le `docker-compose` définit un healthcheck qui interroge `/health` :

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3005/health || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 10
  start_period: 45s
```

Le `start_period` de 45 secondes laisse le temps au producer, au consumer et au subscriber MQTT de se connecter avant que le healthcheck ne devienne contraignant.

---

## 14. Tests

### Fichiers de test

| Fichier | Ce qu'il teste |
|---------|----------------|
| `tests/mqtt.service.spec.ts` | `MqttService` — validation des 7 variables IA (avec/sans variable manquante), détection d'anomalies (`min > max`, humidité hors limites, pluie hors limites, cas normal sans anomalie), normalisation et forward vers Kafka (clé `farm_001:parcel_A`), rejet des payloads invalides avant Kafka, stats |
| `tests/kafka.service.spec.ts` | `KafkaService` — instanciation, `isReady()` après init, appel à `send('raw-sensor-data', 'farm_001:parcel_A', {...})` |
| `src/kafka-consumer/sensor-data.consumer.spec.ts` | `SensorDataConsumer` — instanciation, appel direct au repository `saveFeature` avec un payload valide, contrôle de cohérence sur la détection d'anomalie côté payload |

### Caractéristiques

- **Framework** : Jest (config inline dans `package.json`, `testRegex: ".*\\.spec\\.ts$"`, `testEnvironment: "node"`, transformation `ts-jest`).
- **Mocks** : `mqtt` et `kafkajs` sont mockés via `jest.mock(...)` pour éviter toute connexion réseau. Aucun broker réel, aucune base réelle.
- **Coverage** : `npm run test:cov` collecte depuis `src/**/*.(t|j)s` et écrit dans `./coverage`.
- **Pas de tests E2E** : le dossier `tests/` ne contient que des specs unitaires ; `SensorDataConsumer` est testé au plus près via son repository mocké.

### Commandes

```bash
npm run test          # Lance tous les tests Jest
npm run test:cov      # Avec couverture
```

---

## 15. Docker

### Dockerfile

Le `apps/iot-service/Dockerfile` est un build multi-stage en 3 cibles, basé sur `node:20-alpine`.

```dockerfile
# Stage 1 : development — utilisé par docker-compose (target: development)
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3005
CMD ["npm", "run", "start:dev"]

# Stage 2 : builder — compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 3 : production — image finale
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3005
CMD ["node", "dist/main"]
```

### docker-compose (section iot-service)

Le service est déclaré dans `infra/docker/docker-compose.yml` avec `target: development` (hot reload via volume bind).

```yaml
iot-service:
  build:
    context: ./../../apps/iot-service
    dockerfile: Dockerfile
    target: development
  container_name: alkatra-iot
  restart: unless-stopped
  depends_on:
    kafka:        { condition: service_healthy }
    mosquitto:    { condition: service_healthy }
    mongodb:      { condition: service_healthy }
  environment:
    NODE_ENV: development
    PORT: "3005"
    MQTT_BROKER_URL: mqtt://mosquitto:1883
    MQTT_USERNAME: ${MQTT_USER:-}
    MQTT_PASSWORD: ${MQTT_PASSWORD:-}
    KAFKA_BROKERS: kafka:9092
    MONGODB_URI: mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb:27017/alkatra_iot?authSource=admin
    ML_INFERENCE_URL: http://ml-inference-service:8000
  ports:
    - "3005:3005"
  volumes:
    - ./../../apps/iot-service/src:/app/src
  healthcheck:
    test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3005/health || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 10
    start_period: 45s
  networks:
    - alkatra-net
```

### Points clés

| Élément | Valeur |
|---------|--------|
| Image de base | `node:20-alpine` |
| Cible docker-compose | `development` (hot reload) |
| Dépendances | `kafka`, `mosquitto`, `mongodb` (tous `service_healthy`) |
| Port exposé | 3005 |
| Volume | `src/` monté en bind pour le hot reload |
| Healthcheck | `wget -q -O /dev/null http://127.0.0.1:3005/health` |
| Commande dev | `npm run start:dev` |
| Commande prod | `node dist/main` |

---

## 16. Ce que le service NE fait PAS

- Il n'expose aucune API REST métier (lecture/écriture de données capteur, agrégation, historique HTTP).
- Il ne consomme pas le topic `recommendations-generated`.
- Il n'appelle pas le `ml-inference-service` : la variable `ML_INFERENCE_URL` est déclarée dans le `docker-compose` mais n'est jamais lue par le code source.
- Il ne persiste pas dans PostgreSQL ni dans une autre base que MongoDB.
- Il ne valide pas, côté consumer, les 7 variables IA (la validation a lieu une seule fois dans le bridge MQTT ; le consumer ne contrôle que la présence de `device_id`, `farm_id`, `parcel_id`).
- Il ne fournit pas de Dead Letter Queue : un message en échec de parsing ou de persistance est loggé puis définitivement ignoré.
- Il n'authentifie pas les requêtes (`/health` et `/metrics` sont publiques).
- Il n'utilise pas `prom-client` : les métriques Prometheus sont générées à la main.

---

## 17. Comportements notables

1. **`KafkaService.subscribe()` est du code mort.** La classe `KafkaService` expose une méthode `subscribe(topic, callback)` qui instancierait un consumer (groupId `iot-service-group`). Cette méthode n'est jamais appelée : la consommation réelle de `raw-sensor-data` est assurée par `SensorDataConsumer`, qui instancie son propre client Kafka (`clientId: iot-service-consumer`, groupId `iot-service-mongodb-persister`). Il en résulte deux clients Kafka distincts dans le service.

2. **`/health` contient des valeurs statiques.** Les champs `mongodb.connected` et `ml_consumer.active` sont des booléens codés en dur à `true` dans `HealthController`. Ils ne reflètent pas l'état réel de MongoDB (pas de ping `mongoose.connection.readyState`) ni l'existence d'un quelconque consumer ML. Seuls `mqtt.connected` et `kafka.ready` sont dynamiques.

3. **Compteur `messagesForwarded` non garanti.** `MqttService.handleMessage` incrémente `messagesForwarded` après l'appel à `kafkaService.send`, mais `send` ne lève pas d'exception en cas d'échec (elle log en `error`). Le compteur comptabilise donc les tentatives valides (payload accepté), pas les acquittements Kafka.

4. **Incohérence de défaut `KAFKA_BROKERS`.** Le producteur (`KafkaService`) utilise `localhost:9094` comme défaut, tandis que le consumer (`SensorDataConsumer`) utilise `kafka:9092`. En l'absence de variable explicite, les deux clients pointeraient vers des brokers différents. Le `docker-compose` fixe `KAFKA_BROKERS: kafka:9092`, ce qui aligne les deux.

5. **`SensorDataConsumer` déclaré comme `@Controller()`.** Bien qu'il s'agisse d'un consumer Kafka et qu'il ne expose aucune route HTTP, la classe est annotée `@Controller()` et enregistrée dans `controllers: []` du module. C'est un détournement du mécanisme NestJS (qui l'instancie et déclenche `onModuleInit`), mais sans aucune route associée.

6. **Validation asymétrique.** Le bridge MQTT rejette les payloads sans les 7 variables IA, mais le consumer Kafka ne les re-vérifie pas. Si un autre producteur publiait sur `raw-sensor-data` un payload ne respectant pas le contrat IA, il serait persisté tel quel et échouerait à l'insert Mongo (`required: true` sur chaque variable IA → erreur Mongoose).

---

## 18. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Bridge MQTT → Kafka + Consumer Kafka → MongoDB |
| **Framework** | NestJS 11 |
| **Port** | 3005 |
| **Préfixe global** | `api/v1` (avec `/health` et `/metrics` exclus) |
| **Broker MQTT** | Mosquitto via `mqtt` v5 (topic wildcard QoS 1) |
| **Kafka** | `kafkajs` (producer `raw-sensor-data` + consumer group `iot-service-mongodb-persister`) |
| **Base de données** | MongoDB collection `ai_sensor_features` (Mongoose) |
| **Rétention** | TTL 90 jours (`expireAfterSeconds: 7776000`) |
| **Schéma IA** | 7 variables (`sensor-ai-v2`) avec alias tolérés |
| **Anomalies** | Températures, vent, rayonnement, humidités, pluie |
| **Health checks** | `GET /health` (healthcheck Docker) |
| **Métriques** | `GET /metrics` (Prometheus texte, sans `prom-client`) |
| **Authentification** | aucune (endpoints publics) |
| **Tests** | Jest (2 specs dans `tests/` + 1 spec dans `src/`) |
| **Langage** | TypeScript 5.7 (target ES2021) |
| **Node.js** | 20 (Alpine) |
| **Docker** | Multi-stage (development / builder / production), hot reload via volume |

### Commandes essentielles

```bash
# Démarrer en développement (local)
cd apps/iot-service && npm run start:dev

# Construire l'image (depuis la racine du monorepo)
docker compose --project-directory infra/docker -f infra/docker/docker-compose.yml build iot-service

# Lancer le conteneur
docker compose --project-directory infra/docker -f infra/docker/docker-compose.yml up iot-service

# Lancer les tests
cd apps/iot-service && npm test

# Couverture
cd apps/iot-service && npm run test:cov

# Vérifier la santé
curl http://localhost:3005/health

# Métriques Prometheus
curl http://localhost:3005/metrics

# Publier un payload de test vers Mosquitto
mosquitto_pub -h localhost -p 1883 \
  -t "alkatra/farm/farm_001/parcel/parcel_A/sensor/esp32-001/data" \
  -m '{"ts":1714896000,"temperature_min_c":12.5,"temperature_max_c":31.2,"wind_speed_ms":4.7,"solar_radiation_mj_m2_day":21.4,"soil_humidity_pct":46.8,"air_humidity_pct":62.1,"rain_mm_day":3.4}'
```
