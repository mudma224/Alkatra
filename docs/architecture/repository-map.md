# Carte du repository

Ce document décrit la structure du dépôt Al Katra Bel Qatra et le rôle de chaque répertoire et fichier significatif.

## Racine

| Chemin | Rôle |
|---|---|
| `package.json` | Workspaces npm, scripts racine, dépendances partagées |
| `package-lock.json` | Lockfile npm |
| `turbo.json` | Orchestration Turborepo (`build`, `test`, `test:cov`, `lint`, `dev`) |
| `tsconfig.json` | Configuration TypeScript racine (`strict`, `esModuleInterop`) |
| `tsconfig.eslint.json` | Configuration TypeScript pour ESLint |
| `.eslintrc.js` | Règles ESLint TypeScript partagées |
| `.prettierrc` | Formatage unifié (single quote, trailing comma, 2 espaces) |
| `.editorconfig` | Conventions éditeur (LF, indentation 2) |
| `.gitattributes` | Normalisation LF pour les scripts shell |
| `.gitignore` | Fichiers ignorés par git |
| `.nvmrc` | Version Node (20+) |
| `.env.example` | Modèle des variables d'environnement |
| `requirements-ml.txt` | Dépendances Python pour les scripts ML racine |

## Applications

### `apps/auth-service`

Service NestJS d'authentification : inscription par téléphone, OTP SMS, JWT (access + refresh), Keycloak (diagnostic), gestion interne des utilisateurs.

| Chemin | Rôle |
|---|---|
| `src/main.ts` | Bootstrap : préfixe `api/v1`, CORS, ValidationPipe |
| `src/app.module.ts` | Module racine (ConfigModule, TypeOrmModule, Auth, Metrics, Otp, Keycloak, User) |
| `src/config/configuration.ts` | Schéma de configuration validé |
| `src/auth/` | Controller + service + strategies + guards + DTOs + entité `UserEntity` |
| `src/otp/` | Génération et vérification OTP, providers Redis et SMS (Infobip) |
| `src/keycloak/` | Module de diagnostic Keycloak |
| `src/user/` | Profil public (`/api/v1/user`) + gestion interne (`/internal/user`) |
| `src/metrics/` | Endpoint Prometheus |
| `Dockerfile` | Multi-stage (builder + production) |
| `test/` | Specs Jest |
| `.env.example` | Variables locales |

Voir [guides/auth-service.md](../guides/auth-service.md).

### `apps/user-service`

Service NestJS proxy/BFF vers auth-service. N'a pas de base de données. Expose le profil utilisateur en HTTP et délègue à auth-service via `/internal/user/:userId`.

| Chemin | Rôle |
|---|---|
| `src/main.ts` | Bootstrap : préfixe `api/v1`, CORS, ValidationPipe |
| `src/app.module.ts` | Module racine |
| `src/auth/` | Stratégie JWT + guard Passport |
| `src/user/` | Controller profil + service proxy HTTP |
| `src/farms/` | Route `GET /api/v1/farms` (renvoie 501, réservée) |
| `src/health/` | Healthchecks (liveness + readiness vers auth-service) |
| `src/metrics/` | Endpoint Prometheus |
| `Dockerfile` | Multi-stage |
| `test/` | Specs Jest |

Voir [guides/user-service.md](../guides/user-service.md).

### `apps/farm-service`

Service NestJS de gestion fermes, parcelles, capteurs. Persistance PostgreSQL + PostGIS.

| Chemin | Rôle |
|---|---|
| `src/main.ts` | Bootstrap : préfixe `api/v1`, ValidationPipe, filtres globaux |
| `src/app.module.ts` | Module racine (TypeORM PostGIS, modules métier) |
| `src/config/configuration.ts` | Configuration validée |
| `src/database/entities/` | Entités `Farm`, `Parcel`, `Sensor` |
| `src/modules/farms/` | CRUD fermes (controller + service + dto) |
| `src/modules/parcels/` | CRUD parcelles (controller + service + dto) |
| `src/modules/sensors/` | Association capteurs (controller + service + dto) |
| `src/modules/health/` | Healthchecks (liveness + readiness avec `SELECT 1`) |
| `src/common/` | Decorators (`@CurrentUser`), guards, strategies, filters, types GeoJSON |
| `src/auth/` | Client HTTP vers auth-service (verifyUserExists) |
| `Dockerfile` | Multi-stage |
| `test/` | Specs Jest |
| `.env.example` | Variables locales |

Voir [guides/farm-service.md](../guides/farm-service.md).

### `apps/recommendation-service`

Service NestJS exposant les recommandations d'irrigation et consommant Kafka pour projeter les prédictions vers PostgreSQL.

| Chemin | Rôle |
|---|---|
| `src/main.ts` | Bootstrap : préfixe `api/v1`, filtres, intercepteurs |
| `src/app.module.ts` | Module racine |
| `src/config/configuration.ts` | Configuration validée |
| `src/entities/` | Entité `Recommendation` |
| `src/recommendations/` | Controller + service + client HTTP farm-service (circuit breaker) |
| `src/sync/` | Consumer Kafka + service de projection vers Postgres + DLQ |
| `src/explanation/` | Génération des explications FR/Darija + reason codes |
| `src/dto/` | DTOs (feedback, prediction-event, recommendation-response) |
| `src/health/` | Healthchecks (DB + état Kafka) |
| `src/metrics/` | Endpoint Prometheus (registre maison) |
| `src/common/` | Guards, strategies, filters, interceptors, decorators |
| `Dockerfile` | Multi-stage (4 stages) |
| `tests/` | Specs Jest (unitaires + E2E) |
| `.env.example` | Variables locales |

Voir [guides/recommendation-service.md](../guides/recommendation-service.md).

### `apps/iot-service`

Service NestJS d'ingestion MQTT → Kafka → Mongo. Valide le contrat capteur et persiste les lectures.

| Chemin | Rôle |
|---|---|
| `src/main.ts` | Bootstrap (préfixe `api/v1` mais `/health` et `/metrics` exclus) |
| `src/app.module.ts` | Module racine (MongooseModule, Kafka, MQTT, Health, Metrics) |
| `src/mqtt/` | Bridge MQTT → Kafka (validation 7 variables IA + anomalies) |
| `src/kafka/` | Producer Kafka (GZIP, auto-topic-creation) |
| `src/kafka-consumer/` | Consumer Kafka → persistance MongoDB |
| `src/mongodb/` | Module + repository + schéma `ai-sensor-feature` |
| `src/health/` | Healthcheck (stats MQTT + Kafka + Mongo) |
| `src/metrics/` | Endpoint Prometheus (compteurs + gauges) |
| `Dockerfile` | Multi-stage |
| `tests/` | Specs Jest |

Voir [guides/iot-service.md](../guides/iot-service.md).

### `apps/ml-inference-service`

Service Python FastAPI d'inférence XGBoost. Charge les modèles depuis MLflow, consomme Kafka et publie les recommandations.

| Chemin | Rôle |
|---|---|
| `app/main.py` | FastAPI entrypoint : `/health`, `/predict`, `/metrics` |
| `app/config.py` | Configuration centralisée (classe `Settings`) |
| `app/core/metrics.py` | Définitions Prometheus |
| `app/schemas/prediction.py` | Modèles Pydantic (request 22 features + response) |
| `app/services/model_service.py` | Chargement MLflow + logique de prédiction + SHAP |
| `app/services/kafka_consumer.py` | Consumer Kafka asynchrone (thread daemon) |
| `app/services/kafka_producer.py` | Producer Kafka |
| `app/services/mongo_writer.py` | Persistance MongoDB |
| `Dockerfile` | Python 3.11-slim |
| `requirements.txt` | Dépendances Python |
| `tests/` | Tests pytest |

Voir [guides/ml-inference-service.md](../guides/ml-inference-service.md).

### `apps/spark-jobs`

Jobs PySpark de feature engineering et streaming Kafka → Kafka.

| Chemin | Rôle |
|---|---|
| `jobs/feature_engineering.py` | Calcul ETo (Penman-Monteith), Kc olivier, 22 features dérivées |
| `jobs/state_manager.py` | État journalier par parcelle (Redis, 4 jours) |
| `jobs/sensor_stream_processor.py` | Structured Streaming (raw-sensor-data → processed-sensor-data) |
| `tests/` | Tests pytest (conftest, test_feature_engineering, test_state_manager) |
| `Dockerfile` | Image `apache/spark:3.5.1` avec jars Kafka vendorisés |
| `entrypoint.sh` | Gestion permissions checkpoint |
| `requirements.txt` | Dépendances dev/test |

Voir [guides/spark-jobs.md](../guides/spark-jobs.md).

### `apps/alert-service`

Service NestJS de notification (Sprint 5, port 3006) : alertes in-app (`notification_db`), push FCM (`firebase-admin`, dégradation gracieuse), consumer Kafka `recommendations-generated` (stress hydrique critique, DLQ `alerts-dlq`), publication `alerts-outbound`, ingestion interne `POST /internal/alerts`.

Voir [guides/alert-service.md](../guides/alert-service.md).

## Packages partagés

### `packages/shared-types`

Types TypeScript partagés entre les services NestJS.

| Chemin | Rôle |
|---|---|
| `src/auth.types.ts` | Types d'authentification |
| `src/farm.types.ts` | Types métier fermes/parcelles |
| `src/sensor.types.ts` | Types capteur |
| `src/user.types.ts` | Types utilisateur |
| `src/index.ts` | Barrel export |

### `packages/shared-utils`

Dossier réservé. Contient uniquement `.gitkeep`.

## Infrastructure

### `infra/docker/`

| Chemin | Rôle |
|---|---|
| `docker-compose.yml` | Stack Docker complète (project name `al-katra-bel-qatra`) |

### `infra/postgres/`

| Chemin | Rôle |
|---|---|
| `00-create-databases.sh` | Crée les 6 bases + 6 utilisateurs + permissions + applique les schémas |
| `05-keycloak-db.sql` | Schéma Keycloak (géré par Keycloak lui-même) |
| `06-mlflow-db.sql` | Schéma MLflow (géré par Alembic) |
| `schemas/auth-db.sql` | Schéma de `auth_db` |
| `schemas/farm-db.sql` | Schéma de `farm_db` |
| `schemas/recommendation-db.sql` | Schéma de `recommendation_db` |
| `schemas/notification-db.sql` | Schéma de `notification_db` |

### `infra/nginx/`

| Chemin | Rôle |
|---|---|
| `Dockerfile` | Image Nginx + gettext pour envsubst |
| `entrypoint.sh` | Validation vars + substitution template |
| `nginx.conf.template` | Template de configuration (routes, rate limiting, headers) |

### `infra/kafka/`

| Chemin | Rôle |
|---|---|
| `topics.sh` | Création des 7 topics Kafka |

### `infra/grafana/`

| Chemin | Rôle |
|---|---|
| `provisioning/datasources/datasources.yml` | Datasource Prometheus (par nom) |
| `provisioning/dashboards/dashboards.yml` | Provider dashboards |
| `dashboards/iot-pipeline.json` | Dashboard pipeline IoT |
| `dashboards/ml-inference.json` | Dashboard inférence ML |

### `infra/prometheus/`

| Chemin | Rôle |
|---|---|
| `prometheus.yml` | Configuration du scrape (5 jobs) |

### `infra/mosquitto/`

| Chemin | Rôle |
|---|---|
| `mosquitto.dev.conf` | Configuration dev (port 1883 + WS 9010) |
| `mosquitto.prod.conf` | Configuration prod |
| `certs/` | Dossier réservé pour les certificats |

### `infra/mlflow/`

| Chemin | Rôle |
|---|---|
| `Dockerfile` | Image MLflow custom |
| `start.sh` | Script de démarrage (port 5001, backend Postgres, artifacts MinIO) |

### `infra/kubernetes/`

| Chemin | Rôle |
|---|---|
| `namespace.yaml` | Namespace `alkatra` |
| `configmap.yaml` | Variables d'environnement K8s |
| `secrets-template.yaml` | Template de secrets (placeholder) |
| `ml-inference/deployment.yaml` | Déploiement du ml-inference-service (2 replicas) |

> Le déploiement K8s est partiel : seul `ml-inference-service` possède un manifest. Les autres services n'ont pas encore de manifests K8s.

## Scripts

| Chemin | Rôle |
|---|---|
| `scripts/simulate-sensor.js` | Simulateur de capteur MQTT (payload `sensor-ai-v2`) |
| `scripts/health-check.sh` | Vérification rapide de la stack locale |
| `scripts/setup.sh` | Setup initial du projet |
| `scripts/keycloak-init.js` | Initialisation du realm Keycloak |
| `scripts/register-models.py` | Enregistrement des modèles dans MLflow |
| `scripts/create-recommendation-indexes.js` | Création des index MongoDB pour les recommandations |
| `scripts/validate-mongodb-indexes.js` | Validation des index MongoDB |
| `scripts/validate-pipeline.sh` | Validation du pipeline IoT |
| `scripts/e2e-sprint1-auth.sh` | Tests E2E d'authentification |
| `scripts/smoke_test.sh` | Smoke test global |
| `scripts/smoke_ml_integration.py` | Smoke test intégration ML |
| `scripts/test-infobic-connection.js` | Test de connexion Infobip (SMS) |
| `scripts/test_load_models.py` | Test de chargement des modèles MLflow |
| `scripts/final_test.py` | Test de régression final |

## CI/CD

| Chemin | Rôle |
|---|---|
| `.github/workflows/ci-common.yml` | Lint + build Docker iot/spark/ml + validation K8s (kubeconform) |
| `.github/workflows/ci-iot.yml` | Tests Jest iot-service avec coverage |
| `.github/workflows/ci-ml.yml` | Tests pytest ML + Spark + ruff |
| `.github/workflows/ci-spark.yml` | Tests pytest Spark + build Docker |
| `.github/workflows/ci-auth.yml` | Tests auth-service (workspace npm) |
| `.github/workflows/ci-farm.yml` | Tests farm-service avec service Postgres PostGIS |

Voir [guides/ci-cd.md](../guides/ci-cd.md).

## Documentation

| Chemin | Rôle |
|---|---|
| `docs/README.md` | Index de la documentation |
| `docs/AL-KATRA-SKILL.md` | Référence projet pour assistance IA |
| `docs/architecture/` | Vues d'ensemble, architecture, carte du dépôt |
| `docs/guides/` | Guides pratiques par service et transverses |
| `docs/reference/` | Contrats et tables de référence |
| `docs/runbooks/` | Procédures de diagnostic et résolution d'incidents |
| `docs/adr/` | Décisions d'architecture et leur justification |
| `docs/lecons/` | Notes pédagogiques personnelles (hors périmètre projet) |
