# AL-KATRA-SKILL — Référence projet pour assistance IA

Ce document est la source de référence pour comprendre la plateforme Al Katra Bel Qatra dans son ensemble. Il décrit l'architecture, les conventions, les contrats techniques et les procédures d'extension du projet. Il est conçu pour permettre à un assistant IA (ou à un nouvel développeur) de générer du code conforme, d'étendre un service existant ou d'en créer un nouveau en respectant les patterns établis.

Pour le détail technique d'un service précis (logique métier, edge cases, tests), se reporter au guide correspondant dans `docs/guides/`. Pour les contrats exhaustifs, voir `docs/reference/`. Pour les décisions architecturales, voir `docs/adr/`.

---

## Table des matières

1. [Objectif produit](#1-objectif-produit)
2. [Vue d'ensemble de l'architecture](#2-vue-densemble-de-larchitecture)
3. [Structure du monorepo](#3-structure-du-monorepo)
4. [Pipeline de données](#4-pipeline-de-données)
5. [Contrat capteur](#5-contrat-capteur)
6. [Services applicatifs](#6-services-applicatifs)
7. [Bases de données](#7-bases-de-données)
8. [Topics Kafka](#8-topics-kafka)
9. [Infrastructure Docker](#9-infrastructure-docker)
10. [API Gateway (Nginx)](#10-api-gateway-nginx)
11. [CI/CD](#11-cicd)
12. [Conventions de code](#12-conventions-de-code)
13. [Comment étendre le projet](#13-comment-étendre-le-projet)
14. [Sources de détail](#14-sources-de-détail)

---

## 1. Objectif produit

Al Katra Bel Qatra (« Goutte à goutte ») est une plateforme d'irrigation intelligente destinée aux petits exploitants agricoles. Le système collecte les données terrain via des capteurs IoT, les traite en flux, alimente un modèle d'apprentissage automatique d'aide à la décision, puis produit des recommandations d'irrigation consultables par l'agriculteur (quantité d'eau en millimètres, durée d'arrosage, explication en français et en darija).

La chaîne de valeur :

```
Capteurs IoT → Données terrain → Modèle ML → Recommandation → Application agriculteur
```

La plateforme cible prioritairement l'oléiculture au Maroc. Le modèle de culture (Kc phénologique de l'olivier) et les seuils d'anomalie sont adaptés à ce contexte.

---

## 2. Vue d'ensemble de l'architecture

La plateforme est un monorepo composé de 7 services applicatifs et d'une stack d'infrastructure Docker locale. Les services communiquent de deux façons :

- **Synchrone** : HTTP via l'API Gateway Nginx (front → services métier) et appels inter-services directs (user-service → auth-service, recommendation-service → farm-service).
- **Asynchrone** : flux d'événements via Kafka (pipeline IoT → ML → recommandations).

```
                    ┌──────────────┐
                    │   ESP32 /    │
                    │ Simulateur   │
                    └──────┬───────┘
                           │ MQTT
                           ▼
                    ┌──────────────┐
                    │  Mosquitto   │  (broker MQTT)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐    raw-sensor-data    ┌──────────────┐
                    │ iot-service  │─────────────────────▶│  spark-jobs  │
                    │  (port 3005) │◀─────────────────────│              │
                    └──────┬───────┘                       └──────┬───────┘
                           │ persist                              │ processed-sensor-data
                           ▼                                      ▼
                    ┌──────────────┐                       ┌──────────────┐
                    │  MongoDB     │                       │ ml-inference │
                    │ (time-series)│                       │  (port 8000) │
                    └──────────────┘                       └──────┬───────┘
                                                                  │ recommendations-generated
                                                                  ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Frontend /  │   │ auth-service │   │ user-service │   │recommendation│
   │   Client     │   │  (port 3001) │   │  (port 3002) │   │   -service   │
   └──────┬───────┘   └──────────────┘   └──────────────┘   │  (port 3004) │
          │ HTTP                                          └──────┬───────┘
          ▼                                                       │ persist
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        ▼
   │ API Gateway  │──▶│ farm-service │   │  Postgres    │◀───────┘
   │ Nginx (8080) │   │  (port 3003) │   │  (multi-DB)  │
   └──────────────┘   └──────────────┘   └──────────────┘
```

### Stack technologique par catégorie

| Catégorie | Technologie |
|---|---|
| Services backend (NestJS) | TypeScript, NestJS 11, TypeORM, Passport-JWT |
| Service ML | Python 3.11, FastAPI, XGBoost, MLflow, SHAP |
| Jobs Spark | Python 3.11, PySpark 3.5.1, Redis |
| Bases relationnelles | PostgreSQL 16 + PostGIS |
| Base time-series / documents | MongoDB 7.0 |
| Cache / état | Redis 7.2 |
| Streaming | Apache Kafka 3.7 (mode KRaft single-node) |
| IoT | MQTT via Mosquitto 2.0 |
| MLOps | MLflow (tracking + registry), MinIO (artifacts S3) |
| Observabilité | Prometheus, Grafana |
| API Gateway | Nginx (template dynamique via envsubst) |
| Orchestration locale | Docker Compose (profil `phase1` pour services métier) |
| Monorepo | npm workspaces + Turborepo |

---

## 3. Structure du monorepo

Le dépôt suit une organisation en workspaces npm, orchestrée par Turborepo.

```
alkatra-platform/
├── apps/                       Services applicatifs
│   ├── auth-service/           NestJS — authentification OTP + JWT
│   ├── user-service/           NestJS — proxy/BFF profil utilisateur
│   ├── farm-service/           NestJS — fermes, parcelles, capteurs
│   ├── recommendation-service/ NestJS — recommandations d'irrigation
│   ├── iot-service/            NestJS — bridge MQTT → Kafka → Mongo
│   ├── ml-inference-service/   FastAPI — inférence XGBoost
│   ├── spark-jobs/             PySpark — feature engineering + streaming
│   └── alert-service/          (dossier réservé, vide)
├── packages/
│   ├── shared-types/           Types TypeScript partagés (auth, farm, sensor, user)
│   └── shared-utils/           (dossier réservé, vide)
├── infra/                      Infrastructure Docker
│   ├── docker/                 docker-compose.yml central
│   ├── postgres/               scripts d'init multi-bases + schémas SQL
│   ├── nginx/                  API Gateway (Dockerfile + template)
│   ├── kafka/                  création des topics
│   ├── grafana/                dashboards + provisioning
│   ├── prometheus/             configuration du scrape
│   ├── mosquitto/              configurations MQTT dev/prod
│   ├── mlflow/                 image + script de démarrage
│   └── kubernetes/             manifests K8s (partiel — ml-inference uniquement)
├── scripts/                    Scripts utilitaires (simulateur, validation, setup)
├── docs/                       Documentation
├── .github/workflows/          CI/CD (6 workflows)
├── package.json                Workspaces, scripts racine, dépendances partagées
├── turbo.json                  Orchestration build/test/dev
├── tsconfig.json               Configuration TypeScript racine
├── .env.example                Modèle des variables d'environnement
└── .nvmrc                      Version Node (20+)
```

### Workspaces npm

Le `package.json` racine déclare les workspaces :

```json
"workspaces": ["apps/*", "packages/*", "frontend/*"]
```

Chaque service dans `apps/` possède son propre `package.json` (services NestJS) ou `requirements.txt` (services Python), avec ses dépendances et ses scripts locaux. Les dépendances communes (`@types/jest`, `eslint`, `prettier`, `turbo`, `mqtt`, `mongodb`, `ioredis`, `prom-client`) sont portées par le `package.json` racine.

### Scripts racine

Les commandes utiles sont définies dans `package.json` racine et passent systématiquement `--env-file .env` aux commandes Docker (décision [ADR-0002](adr/0002-docker-compose-env-file.md)).

| Script | Action |
|---|---|
| `npm install` | Installe les dépendances de tous les workspaces |
| `npm run dev` | Démarre tous les services en mode développement (Turborepo parallel) |
| `npm run build` | Build de tous les workspaces |
| `npm run test` | Tests de tous les workspaces |
| `npm run test:cov` | Tests avec couverture |
| `npm run lint` | Lint de tous les workspaces |
| `npm run docker:up` | Démarre la stack infrastructure de base |
| `npm run docker:up-phase1` | Démarre la stack complète incluant les services métier (profil `phase1`) |
| `npm run docker:down` | Arrête la stack |
| `npm run docker:logs` | Suit les logs de tous les conteneurs |
| `npm run simulate` | Lance le simulateur de capteur MQTT |
| `npm run health` | Vérifie l'état de la stack locale |

### Version des runtimes

- **Node.js** : `>=20.0.0` (`.nvmrc`)
- **npm** : `>=10.0.0` (version exacte déclarée via `"packageManager": "npm@11.9.0"`, requis par Turborepo 2)
- **Python** : `3.11` (services ML et Spark)

---

## 4. Pipeline de données

Le pipeline transforme les mesures capteur brutes en recommandations d'irrigation consultables. Chaque étape a une responsabilité unique.

```
ESP32 / simulateur
  │
  │ Publication MQTT sur le topic :
  │   alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
  ▼
Mosquitto (broker MQTT, port 1883)
  │
  ▼
iot-service (NestJS, port 3005)
  │ - Valide les 7 variables IA + les alias
  │ - Détecte les anomalies (température, humidité, vent, etc.)
  │ - Publie sur Kafka la clé {farm_id}:{parcel_id}
  ▼
Kafka topic "raw-sensor-data" (6 partitions, rétention 7 j)
  │
  ├──▶ iot-service (consumer, group iot-service-mongodb-persister)
  │      └─▶ MongoDB collection "ai_sensor_features" (persistance brute, TTL 90 j)
  │
  └──▶ spark-jobs (Structured Streaming, trigger 30 s)
         │ - Calcule ETo (Penman-Monteith FAO-56)
         │ - Applique le Kc olivier (phénologique par mois)
         │ - Cumul pluie 3-4 jours via état Redis (clés day0..day3)
         │ - Produit 22 features dérivées dans l'ordre canonique
         ▼
       Kafka topic "processed-sensor-data" (6 partitions, rétention 7 j)
         │
         ▼
       ml-inference-service (FastAPI, port 8000, group ml-inference-group)
         │ - Charge 2 modèles XGBoost depuis MLflow (Classifier + Regressor)
         │ - Classification (seuil 0.35) → irriguer oui/non
         │ - Si oui : régression log1p inversée → quantité en mm
         │ - Applique le biais Digital Twin (±5 mm max)
         │ - Calcule les facteurs SHAP (top 5)
         │ - Génère un reason_code + explications FR/Darija
         │
         ├──▶ MongoDB collection "irrigation_recommendations"
         │      (index parcel_id DESC, created_at DESC)
         │
         └──▶ Kafka topic "recommendations-generated" (3 partitions, rétention 24 h)
               │
               ▼
         recommendation-service (NestJS, port 3004)
           │ - Consomme avec idempotence (UNIQUE parcel_id, generated_at)
           │ - DLQ sur "recommendations-generated-dlq" en cas d'erreur
           │ - Persiste dans Postgres (recommendation_db)
           │
           ▼
         API REST exposée :
           GET  /api/v1/recommendations/parcel/:parcelId/today
           GET  /api/v1/recommendations/parcel/:parcelId/history
           PATCH /api/v1/recommendations/:id/feedback
           PATCH /api/v1/recommendations/:id/execute
```

### Latence et sémantique

- Le consumer Kafka du recommendation-service utilise `subscribe({ fromBeginning: false })` avec auto-commit, ce qui produit une sémantique **at-most-once**. L'idempotence applicative (clé unique `(parcel_id, generated_at)`) garantit néanmoins qu'une recommandation ne soit pas dupliquée en base.
- Le job Spark tourne avec un trigger de 30 secondes et un checkpoint sur volume nommé (`spark-job:/tmp/spark-checkpoint`).

---

## 5. Contrat capteur

Le payload capteur est normalisé sous la version `sensor-ai-v2`. Le iot-service valide 7 variables IA obligatoires, chacune assortie d'alias acceptés (issue de la diversité des firmwares capteurs).

| Variable IA (canonique) | Unité | Alias acceptés |
|---|---|---|
| `temperature_min_c` | °C | `t_min`, `tmin`, `temperature_min` |
| `temperature_max_c` | °C | `t_max`, `tmax`, `temperature_max` |
| `wind_speed_ms` | m/s | `wind`, `wind_speed` |
| `solar_radiation_mj_m2_day` | MJ/m²/jour | `solar_rad`, `radiation` |
| `soil_humidity_pct` | % | `soil_moisture`, `soil_humidity`, `sm` |
| `air_humidity_pct` | % | `humidity`, `air_humidity`, `rh` |
| `rain_mm_day` | mm/jour | `rain`, `precipitation` |

### Règles de validation (iot-service)

- Les 7 variables canoniques ou leurs alias doivent être présentes. Une variable manquante rejette le message (compteur Prometheus incrémenté).
- Détection d'anomalies (message publié mais flaggé) :
  - `temperature_min_c < -10` ou `temperature_max_c > 60`
  - `temperature_min_c > temperature_max_c`
  - `wind_speed_ms` hors `[0, 45]`
  - `solar_radiation_mj_m2_day` hors `[0, 40]`
  - `soil_humidity_pct` ou `air_humidity_pct` hors `[0, 100]`
  - `rain_mm_day` hors `[0, 200]`

### Métadonnées obligatoires

Le payload doit aussi contenir :
- `device_id` — identifiant du capteur (ex. `esp32-001`)
- `farm_id` — identifiant de la ferme
- `parcel_id` — identifiant de la parcelle
- `ts` — timestamp (epoch ou ISO 8601)
- `schema_version` — `sensor-ai-v2`

Pour le contrat exhaustif (exemples JSON, format de l'enveloppe), voir [`docs/reference/iot-sensor-payload.md`](reference/iot-sensor-payload.md). La décision de contrat est documentée dans [ADR-0001](adr/0001-iot-ai-sensor-contract.md).

---

## 6. Services applicatifs

Tableau récapitulatif. Pour le détail, suivre le lien vers le guide de chaque service.

| Service | Port | Langage | Base de données | Rôle | Guide |
|---|---|---|---|---|---|
| `auth-service` | 3001 | NestJS / TS | `auth_db` (Postgres) + Redis | Inscription téléphone, OTP SMS, JWT (access + refresh), Keycloak (diagnostic), profil interne | [guides/auth-service.md](guides/auth-service.md) |
| `user-service` | 3002 | NestJS / TS | (aucune, proxy HTTP) | BFF public : proxy profil utilisateur vers auth-service, validation JWT | [guides/user-service.md](guides/user-service.md) |
| `farm-service` | 3003 | NestJS / TS | `farm_db` (Postgres + PostGIS) | CRUD fermes, parcelles, capteurs ; isolation par propriétaire ; cohérence des surfaces | [guides/farm-service.md](guides/farm-service.md) |
| `recommendation-service` | 3004 | NestJS / TS | `recommendation_db` (Postgres) | API recommandations, consumer Kafka, sync vers Postgres, circuit breaker | [guides/recommendation-service.md](guides/recommendation-service.md) |
| `iot-service` | 3005 | NestJS / TS | MongoDB (`ai_sensor_features`) | Bridge MQTT → Kafka, validation capteur, persistance time-series | [guides/iot-service.md](guides/iot-service.md) |
| `ml-inference-service` | 8000 | Python / FastAPI | MongoDB (`irrigation_recommendations`) | Inférence XGBoost, consumer/producer Kafka, registre MLflow | [guides/ml-inference-service.md](guides/ml-inference-service.md) |
| `spark-jobs` | — | Python / PySpark | Redis (état) | Feature engineering (ETo, Kc), streaming Kafka→Kafka | [guides/spark-jobs.md](guides/spark-jobs.md) |
| `alert-service` | — | (réservé) | — | Dossier réservé, non implémenté | — |

### Endpoints clés par service

**auth-service** (`/api/v1/auth`, `/api/v1/user`, `/internal/user`, `/health`, `/metrics`)
- `POST /api/v1/auth/register` — inscription par téléphone, déclenche OTP
- `POST /api/v1/auth/verify-otp` — vérification OTP
- `POST /api/v1/auth/login` — obtention des tokens JWT
- `POST /api/v1/auth/refresh` — refresh token
- `GET /api/v1/user/profile` — profil (JWT)
- `GET /internal/user/:userId` — lecture interne (sans guard, réseau interne)
- `PATCH /internal/user/:userId` — mise à jour interne

**user-service** (`/api/v1/user`, `/api/v1/farms`, `/api/v1/health`, `/metrics`)
- `GET /api/v1/user/profile` — proxy vers auth-service
- `PATCH /api/v1/user/profile` — proxy vers auth-service
- `GET /api/v1/farms` — renvoie `501 NotImplementedException` (route réservée)

**farm-service** (`/api/v1/farms`, `/api/v1/parcels`, `/api/v1/sensors`, `/api/v1/health`)
- CRUD complet sur `farms` et `parcels` (JWT, isolation par `ownerId`)
- `POST /api/v1/sensors/associate` — association capteur → parcelle

**recommendation-service** (`/api/v1/recommendations`, `/health`, `/metrics`)
- `GET /parcel/:parcelId/today` — recommandation du jour
- `GET /parcel/:parcelId/history` — historique paginé
- `PATCH /:id/feedback` — feedback (`accepted` | `rejected` | `ignored`)
- `PATCH /:id/execute` — marquer comme exécutée

**iot-service** (`/api/v1/health`, `/metrics`)
- Pas d'API métier REST. Le service consomme MQTT et publie Kafka.

**ml-inference-service** (`/health`, `/predict`, `/metrics`)
- `POST /predict` — inférence à la demande (22 features en entrée)
- Consumer Kafka asynchrone en parallèle

---

## 7. Bases de données

La plateforme adopte le principe **un service = une base de données**, avec isolation stricte par utilisateur Postgres dédié (les connexions cross-base sont interdites).

### PostgreSQL 16 + PostGIS (multi-bases)

| Base | Propriétaire (rôle) | Service propriétaire | Tables |
|---|---|---|---|
| `auth_db` | `auth_user` | auth-service | `users` |
| `farm_db` | `farm_user` | farm-service | `farms`, `parcels`, `sensors` |
| `recommendation_db` | `recommendation_user` | recommendation-service | `recommendations` |
| `notification_db` | `notify_user` | (réservé) | `alerts` |
| `keycloak_db` | `keycloak_user` | Keycloak | (gérée par Keycloak) |
| `mlflow_db` | `mlflow_user` | MLflow | (gérée par MLflow Alembic) |

Initialisation : `infra/postgres/00-create-databases.sh` crée les 6 bases, les 6 utilisateurs, applique les permissions restreintes (REVOKE sur `public`), puis exécute les schémas SQL dans `infra/postgres/schemas/`. Le schéma de la base relationnelle est documenté dans [`docs/reference/postgres-databases.md`](reference/postgres-databases.md).

### MongoDB 7.0 (base `alkatra_iot`)

| Collection | Service propriétaire | Usage |
|---|---|---|
| `ai_sensor_features` | iot-service | Persistance brute des lectures capteur (TTL 90 jours, index `farm_id`/`parcel_id`/`ts`) |
| `irrigation_recommendations` | ml-inference-service | Recommandations produites (index `parcel_id DESC, created_at DESC`) |

### Redis 7.2

Deux usages distincts :
- **auth-service** : stockage OTP (clés `otp:`, `otp:attempts:`, `otp:blocked:`) avec TTL configurables
- **spark-jobs** : état journalier par parcelle (clés `alkatra:state:<parcel_id>:day0..day3`, TTL 5 jours)

---

## 8. Topics Kafka

Kafka tourne en mode KRaft single-node (image `apache/kafka:3.7.0`) avec deux listeners : `9092` (réseau interne Docker) et `9094` (host). La configuration est détaillée dans [`docs/adr/kafka-config-docker-explication.md`](adr/kafka-config-docker-explication.md).

| Topic | Partitions | Rétention | Producteur | Consommateur |
|---|---|---|---|---|
| `raw-sensor-data` | 6 | 7 jours | iot-service | iot-service (persistance Mongo), spark-jobs |
| `processed-sensor-data` | 6 | 7 jours | spark-jobs | ml-inference-service |
| `recommendations-generated` | 3 | 24 heures | ml-inference-service | recommendation-service |
| `recommendations-generated-dlq` | 3 | 7 jours | recommendation-service | (dead letter queue) |
| `ml-inference-requests` | 3 | 1 heure | (réservé) | (réservé) |
| `alerts-outbound` | 3 | 24 heures | (réservé pour alert-service) | (réservé) |
| `sensor-anomalies` | 2 | 7 jours | (réservé) | (réservé) |

Les topics sont créés par `infra/kafka/topics.sh` (replication-factor 1, single-node). L'auto-création est aussi activée côté broker (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`) et côté producer iot-service (`allowAutoTopicCreation: true`).

La stratégie de gestion des messages malformés est documentée dans [ADR-003](adr/ADR-003-malformed-kafka-messages.md) (log and skip).

---

## 9. Infrastructure Docker

La stack complète est définie dans `infra/docker/docker-compose.yml` (project name `al-katra-bel-qatra`). Tous les scripts npm passent `--env-file .env` (ADR-0002).

### Services d'infrastructure (toujours démarrés)

| Conteneur | Image | Port host | Rôle |
|---|---|---|---|
| `alkatra-postgres` | `postgis/postgis:16-3.4-alpine` | 5432 | Base relationnelle multi-bases |
| `alkatra-mongodb` | `mongo:7.0` | 27017 | Base time-series / documents |
| `alkatra-redis` | `redis:7.2-alpine` | 6379 | Cache + état |
| `alkatra-kafka` | `apache/kafka:3.7.0` | 9092 (interne), 9094 (host) | Streaming |
| `alkatra-kafka-ui` | `provectuslabs/kafka-ui` | 8090 → 8080 | Admin Kafka |
| `alkatra-mosquitto` | `eclipse-mosquitto:2.0` | 1883, 9010 (WS) | Broker MQTT |
| `alkatra-minio` | `minio/minio` | 9000 (API), 9001 (console) | Stockage S3 (artifacts MLflow) |
| `alkatra-mlflow` | (build local) | 5001 | Tracking + registry ML |
| `alkatra-mailhog` | `mailhog/mailhog` | 1025 (SMTP), 8025 (UI) | SMTP dev |
| `alkatra-prometheus` | `prom/prometheus` | 9090 | Collecte métriques |
| `alkatra-grafana` | `grafana/grafana` | 3000 | Dashboards |

### Services applicatifs (profil `phase1`)

Les services métier sont démarrés avec le profil `phase1` via `npm run docker:up-phase1`. La stack de base (sans profil) démarre l'infrastructure + iot-service + spark-jobs + ml-inference-service.

| Conteneur | Port host | Profil | Dépend de |
|---|---|---|---|
| `alkatra-iot` | 3005 | — | kafka, mosquitto, mongodb |
| `alkatra-spark-job` | — | — | kafka, redis |
| `alkatra-ml` | 8000 | — | kafka, mongodb, mlflow |
| `alkatra-gateway` | 8080 | `phase1` | auth, user, farm, recommendation (healthy) |
| `alkatra-auth` | 3001 | `phase1` | postgres, redis, keycloak |
| `alkatra-user` | 3002 | `phase1` | auth-service |
| `alkatra-farm` | 3003 | `phase1` | postgres, auth-service |
| `alkatra-recommendation` | 3004 | `phase1` | postgres, kafka, farm-service |
| `alkatra-keycloak` | 8081 → 8080 | `phase1` | postgres |

> Le port Keycloak exposé sur le host est **8081** (modifié pour éviter le conflit avec la gateway sur 8080). En interne Docker, le conteneur écoute sur 8080.

La liste exhaustive des ports est dans [`docs/reference/ports-and-services.md`](reference/ports-and-services.md).

---

## 10. API Gateway (Nginx)

L'API Gateway est un Nginx avec template dynamique (`infra/nginx/nginx.conf.template` + `entrypoint.sh` qui exécute `envsubst`). Elle écoute sur le port **8080**.

### Routes

| Route | Cible | Rate limiting |
|---|---|---|
| `GET /health` | (interne gateway, JSON 200) | — |
| `/api/v1/auth/` | auth-service:3001 | `auth_limit` (10 r/s, burst 20) |
| `/api/v1/user/` | user-service:3002 | — |
| `~ ^/api/v1/farms(/.*)?$` | farm-service:3003 | `api_limit` (30 r/s, burst 20) |
| `~ ^/api/v1/parcels(/.*)?$` | farm-service:3003 | `api_limit` |
| `~ ^/api/v1/sensors(/.*)?$` | farm-service:3003 | `api_limit` |
| `/` | (404 JSON) | — |

Les routes iot-service, ml-inference-service et recommendation-service ne sont pas exposées via la gateway.

### Variables d'environnement requises par le template

Le `entrypoint.sh` valide la présence de 6 variables avant substitution et refuse de démarrer sinon :

- `AUTH_SERVICE_HOST`, `AUTH_SERVICE_PORT`
- `USER_SERVICE_HOST`, `USER_SERVICE_PORT`
- `FARM_SERVICE_HOST`, `FARM_SERVICE_PORT`

Les variables `RECOMMENDATION_SERVICE_*` sont injectées par le compose mais ne sont pas consommées par le template actuel (réservées pour une route future).

### Sécurité

- Headers OWASP ajoutés sur toutes les réponses (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.)
- Logs au format JSON
- Resolver DNS Docker `127.0.0.11`
- `client_max_body_size 10M`

Le détail complet (config, ajouter une route) est dans [`docs/guides/api-gateway.md`](guides/api-gateway.md).

---

## 11. CI/CD

Six workflows GitHub Actions dans `.github/workflows/`. Tous se déclenchent sur `push` et `pull_request` vers `main` et `develop`, avec filtres de chemins pour ne lancer que les jobs pertinents.

| Workflow | Cible | Jobs |
|---|---|---|
| `ci-common.yml` | tout le dépôt | (1) Lint TypeScript + format check Prettier ; (2) build Docker iot/spark/ml ; (3) validation manifests K8s via **kubeconform** |
| `ci-iot.yml` | `apps/iot-service/**` | Tests Jest MQTT+Kafka mockés avec coverage, upload Codecov |
| `ci-ml.yml` | `apps/ml-inference-service/**`, `apps/spark-jobs/**` | pytest en mode DEMO, test feature engineering Spark (sans Spark), lint ruff |
| `ci-spark.yml` | `apps/spark-jobs/**` | pytest fonctions pures (`-k "not spark and not kafka"`), ruff, build + run image Docker |
| `ci-auth.yml` | `apps/auth-service/**`, `packages/shared-types/**` | Lint + build + tests unitaires (npm workspace) |
| `ci-farm.yml` | `apps/farm-service/**`, `packages/shared-types/**` | Tests avec service Postgres PostGIS (init `farm-db.sql`), build Docker |

Versions CI : **Node.js 20** pour les workflows TypeScript, **Python 3.11** pour les workflows ML/Spark.

Le détail est dans [`docs/guides/ci-cd.md`](guides/ci-cd.md).

---

## 12. Conventions de code

### Services NestJS (TypeScript)

Stack standard pour auth-service, user-service, farm-service, recommendation-service, iot-service :

- **NestJS 11** avec `@nestjs/platform-express`
- **TypeORM** pour la persistance Postgres (`synchronize: false`, entités explicites, `autoLoadEntities: true`)
- **Passport + passport-jwt** pour l'authentification (stratégie HS256, secret partagé via `JWT_SECRET`)
- **class-validator + class-transformer** pour la validation des DTOs (`ValidationPipe` global avec `whitelist`, `forbidNonWhitelisted`, `transform`, `enableImplicitConversion`)
- **ioredis** pour Redis, **prom-client** pour Prometheus
- Préfixe global `api/v1` via `app.setGlobalPrefix('api/v1')` (avec exceptions pour `/health` et `/metrics` quand non protégés)

#### Squelette standard d'un service NestJS

```
apps/<service>/
├── src/
│   ├── main.ts                 Bootstrap : préfixe global, CORS, ValidationPipe, Swagger optionnel
│   ├── app.module.ts           Module racine (imports ConfigModule, TypeOrmModule, modules métier)
│   ├── config/
│   │   └── configuration.ts    Schéma de configuration validé (ConfigModule.forRoot({ load: [configuration] }))
│   ├── common/                 (ou src/<module>/...) Decorators, guards, strategies, filters, interceptors
│   │   ├── decorators/         @CurrentUser, @Roles
│   │   ├── guards/             JwtAuthGuard extends AuthGuard('jwt')
│   │   ├── strategies/         JwtStrategy (extrait sub → { userId, phone })
│   │   ├── filters/            AllExceptionsFilter (format JSON normalisé)
│   │   └── interceptors/       LoggingInterceptor
│   ├── <module>/               Module métier (controller + service + dto + entities)
│   │   ├── <module>.module.ts
│   │   ├── <module>.controller.ts
│   │   ├── <module>.service.ts
│   │   ├── dto/                CreateXxxDto, UpdateXxxDto (avec class-validator)
│   │   └── entities/           Entités TypeORM
│   ├── health/                 HealthController (liveness + readiness)
│   └── metrics/                MetricsController + MetricsService (Prometheus)
├── test/                       (ou tests/) Specs Jest
├── Dockerfile                  Multi-stage (builder + production)
├── package.json                Dépendances et scripts locaux
├── tsconfig.json
└── .env.example
```

#### Squelette standard d'un endpoint protégé

```typescript
@Controller('api/v1/<resource>')
@UseGuards(JwtAuthGuard)
export class XxxController {
  constructor(private readonly xxxService: XxxService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateXxxDto) {
    return this.xxxService.create(userId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.xxxService.findOne(userId, id);
  }
}
```

Le `userId` est extrait du JWT via le décorateur `@CurrentUser` (qui lit `req.user.userId`, lui-même peuplé par `JwtStrategy.validate()` à partir de `payload.sub`).

### Services Python

#### ml-inference-service (FastAPI)

- **FastAPI** + **Pydantic** pour les schémas (`app/schemas/`)
- **Configuration centralisée** dans `app/config.py` (classe `Settings` qui lit l'environnement)
- **MLflow** pour charger les modèles depuis le registry (`models:/AlKatra-Classifier/Production`)
- **Prometheus** via `prometheus_client`
- Consumer Kafka asynchrone dans un thread daemon

#### spark-jobs (PySpark)

- **PySpark 3.5.1** (Structurred Streaming)
- Image de base `apache/spark:3.5.1` avec jars Kafka vendorisés (scala 2.12)
- **Redis** pour l'état (via `redis-py` ou `fakeredis` en tests)
- Tests pytest avec `fakeredis` (pas de Spark requis pour les tests unitaires des fonctions pures)

### Validation des DTOs

Les services NestJS utilisent systématiquement `ValidationPipe` global. Les DTOs TypeScript utilisent :
- `@IsString()`, `@IsEnum()`, `@IsNumber()`, `@IsOptional()`, `@Min()`, `@Max()`, `@IsUUID()`
- `@Type(() => ...)` pour la conversion imbriquée

Les schémas Pydantic (FastAPI) valident automatiquement via les annotations de type.

### Format de réponse d'erreur (NestJS)

Le filtre global `AllExceptionsFilter` normalise les erreurs :

```json
{
  "statusCode": 422,
  "errorCode": "VALIDATION_ERROR",
  "message": "...",
  "details": {...},
  "timestamp": "2026-...",
  "path": "/api/v1/...",
  "method": "POST"
}
```

Map `statusCode → errorCode` : 400 `BAD_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `VALIDATION_ERROR`, 500 `INTERNAL_ERROR`.

### TypeScript

- `tsconfig.json` racine avec `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`
- Préfixes de chemin : les imports utilisent des chemins relatifs (pas d'alias `@/`)
- Formatage : Prettier (single quote, trailing comma, 2 espaces)

### Git et qualité

- Normalisation LF via `.gitattributes` (scripts shell)
- Hooks de pre-commit optionnels (lint-staged non configuré actuellement)
- Chaque service a son propre `tsconfig.json` qui `extends` le racine

---

## 13. Comment étendre le projet

### Ajouter un nouveau service NestJS

1. Créer `apps/<nouveau-service>/` avec la structure standard (voir §12)
2. Ajouter un `package.json` avec le nom `@alkatra/<nouveau-service>` et les scripts `build`, `test`, `lint`
3. Créer un `Dockerfile` multi-stage (s'inspirer de `apps/farm-service/Dockerfile`)
4. Déclarer le service dans `infra/docker/docker-compose.yml` (profil `phase1` si métier)
5. Ajouter les variables d'environnement dans `.env.example` et dans le bloc `environment:` du compose
6. Si le service a une base dédiée :
   - Ajouter la base + l'utilisateur dans `infra/postgres/00-create-databases.sh`
   - Créer `infra/postgres/schemas/<nouveau>-db.sql`
   - Référencer le schéma dans la phase d'application (à la fin du script)
   - Documenter dans `docs/reference/postgres-databases.md`
7. Créer un workflow `.github/workflows/ci-<nouveau>.yml` (s'inspirer de `ci-farm.yml`)
8. Si exposé publiquement, ajouter une route dans `infra/nginx/nginx.conf.template` + les vars `*_SERVICE_HOST`/`*_SERVICE_PORT` dans `entrypoint.sh`
9. Créer le guide `docs/guides/<nouveau-service>.md` en suivant le squelette canonique à 19 sections
10. Mettre à jour `docs/architecture/repository-map.md` et `docs/AL-KATRA-SKILL.md`

### Ajouter un endpoint à un service existant

1. Ajouter ou modifier un DTO dans `<module>/dto/` avec les décorateurs class-validator appropriés
2. Ajouter la méthode au controller avec le guard `@UseGuards(JwtAuthGuard)` et le décorateur `@CurrentUser` si nécessaire
3. Implémenter la logique dans le service, avec isolation par `userId` si la ressource est possédée
4. Ajouter des tests unitaires dans `test/` (ou `tests/`) — cas succès + cas erreur + cas guard
5. Mettre à jour le guide du service dans la section « Routes HTTP »

### Ajouter une table PostgreSQL

1. Déclarer l'entité TypeORM dans `<service>/src/database/entities/` ou `<module>/entities/`
2. L'ajouter au `entities: []` du `TypeOrmModule.forRootAsync` (ou s'appuyer sur `autoLoadEntities: true`)
3. Ajouter le DDL correspondant dans `infra/postgres/schemas/<service>-db.sql`
4. Documenter la table dans `docs/reference/postgres-databases.md`
5. Si la table a des index uniques ou des CHECK, les mettre en cohérence entre l'entité et le SQL

### Ajouter un topic Kafka

1. Ajouter la commande `kafka-topics --create` dans `infra/kafka/topics.sh`
2. Documenter dans `docs/AL-KATRA-SKILL.md` (§8) et dans `docs/adr/kafka-config-docker-explication.md`
3. Côté code : utiliser `KAFKA_*_TOPIC` comme variable d'environnement (ne jamais hardcoder le nom du topic)
4. Pour un consumer : choisir un `group_id` explicite et décider de la sémantique (at-least-once vs at-most-once selon le `fromBeginning` et l'auto-commit)

### Ajouter une route gateway

1. Éditer `infra/nginx/nginx.conf.template` :
   - Ajouter un bloc `location` (préfixe ou regex)
   - Définir l'`upstream` via les variables `${<SERVICE>_HOST}:${<SERVICE>_PORT}`
   - Appliquer une zone de rate limiting si pertinent
2. Ajouter les variables `<SERVICE>_HOST` et `<SERVICE>_PORT` dans :
   - Le bloc `environment:` du service gateway dans `docker-compose.yml`
   - La liste `REQUIRED_VARS` dans `infra/nginx/entrypoint.sh`
   - La commande `envsubst` dans `entrypoint.sh`
3. Mettre à jour `docs/guides/api-gateway.md` et `docs/reference/ports-and-services.md`

### Ajouter un workflow CI

1. Créer `.github/workflows/ci-<service>.yml`
2. Définir le déclencheur `on: push/pull_request` avec `paths:` filtrant sur le service
3. Job de test : `npm ci` racine puis `npm run --workspace=@alkatra/<service> test`
4. Job Docker : `docker build apps/<service> --target production`
5. Mettre à jour `docs/guides/ci-cd.md`

---

## 14. Sources de détail

### Guides par service (détail technique complet)

- [`docs/guides/auth-service.md`](guides/auth-service.md)
- [`docs/guides/user-service.md`](guides/user-service.md)
- [`docs/guides/farm-service.md`](guides/farm-service.md)
- [`docs/guides/recommendation-service.md`](guides/recommendation-service.md)
- [`docs/guides/iot-service.md`](guides/iot-service.md)
- [`docs/guides/ml-inference-service.md`](guides/ml-inference-service.md)
- [`docs/guides/spark-jobs.md`](guides/spark-jobs.md)

### Guides transverses

- [`docs/guides/local-development.md`](guides/local-development.md) — Démarrage local de la plateforme
- [`docs/guides/local-ml.md`](guides/local-ml.md) — Stack ML locale + enregistrement modèles
- [`docs/guides/api-gateway.md`](guides/api-gateway.md) — Configuration Nginx
- [`docs/guides/ci-cd.md`](guides/ci-cd.md) — Pipelines GitHub Actions
- [`docs/guides/observability.md`](guides/observability.md) — Prometheus, Grafana, MLflow
- [`docs/guides/testing-and-quality.md`](guides/testing-and-quality.md) — Stratégie de test

### Références (contrats figés)

- [`docs/reference/iot-sensor-payload.md`](reference/iot-sensor-payload.md) — Contrat capteur exhaustif
- [`docs/reference/ports-and-services.md`](reference/ports-and-services.md) — Ports et routage gateway
- [`docs/reference/postgres-databases.md`](reference/postgres-databases.md) — Schémas PostgreSQL
- [`docs/reference/environment.md`](reference/environment.md) — Variables d'environnement

### Décisions d'architecture (ADR)

- [`docs/adr/0001-iot-ai-sensor-contract.md`](adr/0001-iot-ai-sensor-contract.md) — Contrat capteur
- [`docs/adr/0002-docker-compose-env-file.md`](adr/0002-docker-compose-env-file.md) — `--env-file .env` explicite
- [`docs/adr/0003-grafana-dashboard-provisioning.md`](adr/0003-grafana-dashboard-provisioning.md) — Provisioning Grafana
- [`docs/adr/0004-mlflow-local-runtime.md`](adr/0004-mlflow-local-runtime.md) — Runtime MLflow local
- [`docs/adr/ADR-001-monorepo.md`](adr/ADR-001-monorepo.md) — Choix monorepo Turborepo
- [`docs/adr/ADR-003-malformed-kafka-messages.md`](adr/ADR-003-malformed-kafka-messages.md) — Messages Kafka malformés
- [`docs/adr/kafka-config-docker-explication.md`](adr/kafka-config-docker-explication.md) — Config Kafka Docker

### Runbooks

- [`docs/runbooks/troubleshooting.md`](runbooks/troubleshooting.md) — Diagnostic d'incidents
- [`docs/runbooks/production-spark.md`](runbooks/production-spark.md) — Opération du job Spark
