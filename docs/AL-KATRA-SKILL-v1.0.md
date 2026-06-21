# 🧠 Al Katra Bel Qatra — Skill IA Complet

> **Version** : 1.0.0 — Phase 0 (Sprints S2-S4 terminés)  
> **Projet** : Plateforme Smart Irrigation IoT + IA destinée aux fermiers marocains  
> **Stack** : Monorepo npm/Turborepo | TypeScript (NestJS) | Python (FastAPI/XGBoost) | Docker  
> **Auteur du skill** : Lead Dev / Chef de projet  
> **Usage** : Ce fichier permet à n'importe quelle IA de comprendre le projet de fond en comble

---

## 📋 TABLE DES MATIÈRES

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Structure du monorepo](#2-structure-du-monorepo)
3. [Architecture technique](#3-architecture-technique)
4. [Pipeline IoT complet](#4-pipeline-iot-complet)
5. [Pipeline ML / IA](#5-pipeline-ml--ia)
6. [Services détaillés](#6-services-détaillés)
7. [Infrastructure Docker](#7-infrastructure-docker)
8. [Base de données Postgres](#8-base-de-données-postgres)
9. [MongoDB](#9-mongodb)
10. [Modèle de données partagées (shared-types)](#10-modèle-de-données-partagées-shared-types)
11. [Monitoring et Observabilité](#11-monitoring-et-observabilité)
12. [Tests](#12-tests)
13. [CI/CD](#13-cicd)
14. [Scripts utiles](#14-scripts-utiles)
15. [Roadmap et planning](#15-roadmap-et-planning)
16. [Règles de développement](#16-règles-de-développement)
17. [Guide de démarrage rapide](#17-guide-de-démarrage-rapide)
18. [Références techniques](#18-références-techniques)
19. [Annexes](#19-annexes)

---

## 1. VUE D'ENSEMBLE DU PROJET

### Objectif produit
**Al Katra Bel Qatra** (القطرة بالقاطرة — "La goutte par le goutte-à-goutte") est une plateforme d'irrigation intelligente qui :
- Collecte des données terrain via capteurs IoT (ESP32)
- Les traite en flux via Kafka
- Exécute des prédictions XGBoost (via MLflow)
- Produit des recommandations d'irrigation en darija/français/arabe
- Destinée aux **agriculteurs marocains**

### État actuel (fin Phase 0)
- ✅ `iot-service` (NestJS) : Bridge MQTT → Kafka fonctionnel + tests Jest
- ✅ `ml-inference-service` (FastAPI) : Prédictions XGBoost (classifieur + régresseur) via MLflow Model Registry — démarrage résilient (retry), `/health` expose `models_loaded`, `/metrics` exposées pour Prometheus. Le consumer Kafka incrémente désormais `ml_predictions_total`.
- ✅ **Infrastructure Docker** complète (14 services)
- ✅ **Modèle IA** : Classifieur XGBoost + Régresseur XGBoost (22 features). Modèles enregistrés dans MLflow Registry sous les noms `AlKatra-Classifier` et `AlKatra-Regressor`. Artefact de biais : `champ_bias_dict.joblib`.
- 🟡 `auth-service` : Placeholder (Phase 1)
- 🟡 `spark-jobs` : PySpark (Squelette — à remplir S3)
- 🔴 `farm-service, user-service, recommendation-service, alert-service` : Vides

### Équipe
- **Dev1 + Dev2** (Lead Dev = Chef de projet)
- Merge systématique avant chaque sprint
- Projet non-expérimenté en Kubernetes (tout est local/Docker pour l'instant)

---

## 2. STRUCTURE DU MONOREPO

```
alkatra-platform/
├── package.json              # Racine npm workspaces + scripts
├── package-lock.json         # Lockfile npm
├── turbo.json                # Orchestration Turborepo
├── tsconfig.json             # TypeScript racine
├── .eslintrc.js              # ESLint TypeScript
├── .prettierrc               # Formatage (single quote, trailing comma)
├── .editorconfig             # LF, indentation 2
├── .nvmrc                    # Version Node imposée
├── .env.example              # Modèle des variables d'env
│
├── apps/
│   ├── iot-service/          # ✅ Fonctionnel - Bridge MQTT→Kafka
│   ├── ml-inference-service/ # ✅ Fonctionnel - FastAPI XGBoost
│   ├── auth-service/         # 🟡 Placeholder Phase 1
│   ├── spark-jobs/           # 🟡 Squelette PySpark
│   ├── farm-service/         # 🔴 Vide
│   ├── recommendation-service/ # 🔴 Vide
│   ├── user-service/         # 🔴 Vide
│   └── alert-service/        # 🔴 Vide
│
├── packages/
│   ├── shared-types/         # Types TypeScript partagés
│   └── shared-utils/         # Utilitaires (vide)
│
├── infra/
│   ├── docker/               # docker-compose.yml
│   ├── postgres/             # init.sql (schéma complet)
│   ├── kafka/                # topics.sh (création topics)
│   ├── mosquitto/            # Config MQTT dev/prod
│   ├── mlflow/               # Dockerfile + start.sh
│   ├── grafana/              # Dashboards + provisioning
│   ├── prometheus/           # prometheus.yml
│   └── kubernetes/           # Manifests (inutilisés)
│
├── docs/                     # Documentation complète
│   ├── architecture/         # ADR, flux, repository-map
│   ├── guides/               # Dev, tests, CI/CD
│   ├── reference/            # Ports, payload, env
│   └── runbooks/             # Troubleshooting
│
└── scripts/
    ├── simulate-sensor.js    # Simulateur capteur MQTT
    ├── health-check.sh       # Vérification stack
    └── ...                   # Scripts de migration/test/smoke
```

---

## 3. ARCHITECTURE TECHNIQUE

### Vue logique (flux de données)

```text
Capteur ESP32 physique ou Simulateur (Node.js)
        │
        │ MQTT (QoS 1)
        │ Topic: alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
        ▼
┌────────────────────────────────────────────────────┐
│ Mosquitto (Broker MQTT)                            │
│ Ports: 1883 (MQTT), 9001 (WebSocket)              │
│ Dev: allow_anonymous=true                          │
└────────────────────┬───────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────┐
│ iot-service (NestJS)                               │
│ Port: 3005                                         │
│ 1. Parse le JSON                                   │
│ 2. Extrait farm_id, parcel_id, device_id du topic  │
│ 3. Valide les 7 variables IA (obligatoires)        │
│    (avec support d'alias pour transition)          │
│ 4. Détecte anomalies simples (seuils physiques)    │
│ 5. Enrichit le message (schema_version, received_at)│
│ 6. Publie dans Kafka                                │
└────────────────────┬───────────────────────────────┘
                     │
                     │ Kafka topic: raw-sensor-data
                     │ Clé: {farm_id}:{parcel_id}
                     ▼
┌────────────────────────────────────────────────────┐
│ Kafka (KRaft mode, single-node)                    │
│ Ports: 9092 (interne), 9094 (externe)             │
│ Topics prédéfinis (voir Section 3.1)              │
└────────────────────┬───────────────────────────────┘
                     │
                     ├────────────────────────────────────┐
                     │                                    │
                     ▼                                    ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│ iot-service               │          │ Spark Jobs (S3 - futur)  │
│ Kafka Consumer            │          │ Feature Engineering     │
│ raw-sensor-data → MongoDB │          │ ETo, Kc, rolling windows│
│ (persistance temps réel)  │          │ raw-sensor-data          │
└──────────────────────────┘          │ → processed-sensor-data  │
                                      └──────────┬───────────────┘
                                                 │
                                                 ▼
                              ┌────────────────────────────────────┐
                              │ ML Inference Service (FastAPI)     │
                              │ Port: 8000                         │
                              │ 1. Reçoit les 22 features          │
                              │ 2. Classifieur → irrigation ?      │
                              │ 3. Régresseur → quantité (mm)     │
                              │ 4. Digital Twin bias              │
                              │ 5. SHAP explanations (top 5)       │
                              │ Output: irrigation_recommendations │
                              └──────────┬────────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ MongoDB                   │
                              │ Collection:               │
                              │ irrigation_recommendations│
                              └──────────────────────────┘
```

### 3.1 Topics Kafka

| Topic | Partitions | Rétention | Usage |
|-------|-----------|-----------|-------|
| `raw-sensor-data` | 6 | 7 jours | Données brutes validées par iot-service |
| `processed-sensor-data` | 6 | 7 jours | Données enrichies par Spark (futur) |
| `ml-inference-requests` | 3 | 1 heure | Requêtes vers modèle IA (futur) |
| `recommendations-generated` | 3 | 1 jour | Recommandations produites (futur) |
| `alerts-outbound` | 3 | 1 jour | Alertes sortantes (futur) |
| `sensor-anomalies` | 2 | 7 jours | Anomalies capteurs (futur) |

Création via : `infra/kafka/topics.sh`

---

## 4. PIPELINE IoT COMPLET

### 4.1 Contrat capteur IA (sensor-ai-v2)

Le capteur (ou simulateur) doit envoyer ces **7 variables obligatoires** :

| Variable | Unité | Min | Max | Alias acceptés |
|----------|-------|-----|-----|---------------|
| `temperature_min_c` | °C | -10 | - | `temp_min_c`, `min_temperature_c` |
| `temperature_max_c` | °C | - | 60 | `temp_max_c`, `max_temperature_c` |
| `wind_speed_ms` | m/s | 0 | 45 | `wind_speed_mps`, `wind_m_s` |
| `solar_radiation_mj_m2_day` | MJ/m²/j | 0 | 40 | `solar_radiation`, `solar_mj_m2_day` |
| `soil_humidity_pct` | % | 0 | 100 | `soil_moisture_pct`, `soil_moisture_1` |
| `air_humidity_pct` | % | 0 | 100 | `air_humidity` |
| `rain_mm_day` | mm/j | 0 | 200 | `rainfall_mm_day`, `rain_mm` |

Métadonnées requises dans le payload : `ts` (epoch), `device_id`, `farm_id`, `parcel_id`

### 4.2 Message Kafka enrichi

```json
{
  "schema_version": "sensor-ai-v2",
  "ts": 1710000000,
  "device_id": "esp32-sim-001",
  "farm_id": "farm_test_001",
  "parcel_id": "parcel_test_001",
  "temperature_min_c": 13.2,
  "temperature_max_c": 34.7,
  "wind_speed_ms": 4.1,
  "solar_radiation_mj_m2_day": 22.8,
  "soil_humidity_pct": 46.5,
  "air_humidity_pct": 61.3,
  "rain_mm_day": 3.4,
  "received_at": "2026-05-22T11:00:00.000Z",
  "is_anomaly": false,
  "anomaly_reasons": []
}
```

### 4.3 Détection d'anomalies (côté iot-service)

Seuils définis dans `MqttService` :
- `temperature_min_c < -10` ou `temperature_max_c > 60`
- `temperature_min_c > temperature_max_c`
- `wind_speed_ms ∉ [0, 45]`
- `solar_radiation_mj_m2_day ∉ [0, 40]`
- `soil_humidity_pct` ou `air_humidity_pct ∉ [0, 100]`
- `rain_mm_day ∉ [0, 200]`

---

## 5. PIPELINE ML / IA

### 5.1 Origine du modèle

Le modèle a été entraîné dans un notebook Jupyter (`docs/model IA.ipynb`) sur un dataset `dataset_irrigation_FINAL.csv` contenant des données historiques d'irrigation avec feature engineering.

### 5.2 Architecture du modèle

**Modèle hybride à 2 étages :**

```
Étape 1 : CLASSIFIEUR (XGBoost)
- Features d'entrée (cellule V2 du notebook) : 22 features
- Sortie : probabilité d'irrigation (seuil = 0.35)
- Objectif : "Faut-il irriguer aujourd'hui ?"

Étape 2 : RÉGRESSEUR (XGBoost) — conditionnel
- Appliqué uniquement si classifieur = irrigation
- Target transformée : log1p(besoin_brut_mm)
- Prédiction : expm1(prediction_log) → quantité en mm
- Ajustement : Digital Twin bias (parcelle) + arrondi 0.5mm

Notes techniques :
- Les modèles sont sauvegardés et servis via **MLflow Model Registry**. Les noms utilisés en production sont `AlKatra-Classifier` et `AlKatra-Regressor`.
- Le bias (Digital Twin) est stocké comme artefact (`champ_bias_dict.joblib`) et appliqué au score régresseur.
```

### 5.3 Les 22 features du modèle

| Feature | Label FR | Label AR | Description |
|---------|----------|----------|-------------|
| `temp_max` | Température max | أقصى حرارة | |
| `temp_min` | Température min | أدنى حرارة | |
| `temp_moy` | Température moyenne | متوسط الحرارة | (max+min)/2 |
| `delta_temp` | Amplitude thermique | المدى الحراري | max - min |
| `humidite_air` | Humidité air | رطوبة الهواء | |
| `vent` | Vitesse du vent | سرعة الريح | |
| `rayonnement` | Rayonnement solaire | الإشعاع الشمسي | |
| `pluie` | Pluie du jour | شتا اليوم | |
| `ET0_mm` | Evapotranspiration ETo | التبخر والنتح المرجعي | |
| `ETc` | Evapotranspiration culture | التبخر والنتح للزراعة | |
| `humidite_sol_avant_%` | Humidité sol actuelle | رطوبة التربة الحالية | |
| `humidite_sol_rolling3` | Humidité sol moyenne 3j | متوسط رطوبة التربة 3 أيام | rolling window |
| `jour_annee` | Jour de l'année | يوم السنة | 1-365 |
| `mois` | Mois | الشهر | 1-12 |
| `jour_semaine` | Jour de la semaine | يوم الأسبوع | 0-6 |
| `humidite_sol_j-1` | Humidité sol hier | رطوبة التربة البارح | lag 1 jour |
| `pluie_j-1` | Pluie hier | شتا البارح | lag 1 jour |
| `ETc_j-1` | ETc hier | التبخر البارح | lag 1 jour |
| `pluie_3j` | Cumul pluie 3j | مجموع الشتا 3 أيام | rolling sum |
| `eto_hum_ratio` | Ratio ETo/humidité | نسبة التبخر/الرطوبة | ET0/(hum+1) |
| `deficit_hydrique` | Déficit hydrique | العجز المائي | ETc - pluie_3j |
| `regime_sol` | Régime du sol | نظام التربة | 0=sec, 1=moyen, 2=humide |

### 5.4 Digital Twin Bias

- Ajustement par parcelle stocké dans MLflow (artefact `bias/champ_bias_dict.joblib`)
- Valeur de biais limitée à [-5.0, 5.0] mm
- Appliqué à la quantité brute avant arrondi

### 5.5 SHAP Explanations

Le régresseur produit des `pred_contribs` (SHAP values) :
- Top 5 features contributrices
- Labels bilingues FR/AR
- Permet d'expliquer à l'agriculteur POURQUOI irriguer ou non

### 5.6 Mode DEMO

- Fallback automatique si MLflow inaccessible
- Génère des prédictions aléatoires mais structurées
- Détectable via `response.demo_mode == True`

---

## 6. SERVICES DÉTAILLÉS

### 6.1 iot-service (NestJS — Port 3005)

**Module** : `@alkatra/iot-service`

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Statut MQTT + Kafka + compteurs |
| `/metrics` | GET | Métriques Prometheus |
| `/api/v1/` | - | Préfixe API (futur) |

**Architecture interne :**
```
AppModule
├── ConfigModule (globale, .env)
├── MqttModule
│   └── MqttService (subscribe MQTT, validation, enrichissement)
├── KafkaModule
│   └── KafkaService (producer vers raw-sensor-data)
├── KafkaConsumerModule
│   └── SensorDataConsumer (raw-sensor-data → MongoDB)
├── MongodbModule
│   ├── AiSensorFeature Schema (Mongoose)
│   └── AiSensorFeatureRepository
├── HealthModule
│   └── HealthController (/health)
└── MetricsModule
    └── MetricsController (/metrics Prometheus)
```

**Dockerfile** : 3 stages (development / builder / production)
- Dev : hot-reload via `npm run start:dev`
- Prod : `node dist/main` (multi-stage)

### 6.2 ml-inference-service (FastAPI — Port 8000)

**Modules Python :**

| Fichier | Rôle |
|---------|------|
| `app/main.py` | Entrypoint FastAPI + endpoints /health, /predict, /metrics |
| `app/config.py` | Settings centralisés (env vars) |
| `app/schemas/prediction.py` | Pydantic models (PredictionRequest, PredictionResponse, ShapFactor) |
| `app/services/model_service.py` | ModelService (load, predict, SHAP) |
| `app/services/kafka_consumer.py` | MLKafkaConsumer (threadé, écoute processed-sensor-data) |
| `app/services/mongo_writer.py` | MongoWriter (sauvegarde recommandations) |
| `app/core/metrics.py` | Prometheus counters/histograms |

**Endpoints :**

| Endpoint | Méthode | Body | Description |
|----------|---------|------|-------------|
| `/health` | GET | - | Statut modèles + mode demo |
| `/predict` | POST | JSON 22 features | Prédiction complète |
| `/metrics` | GET | - | Métriques Prometheus |

**Flux kafka_consumer (threadé) :**
```
processed-sensor-data (topic Kafka)
    → Validation stricte des 22 features
    → Construction PredictionRequest
    → model_service.predict(req)
    → MongoWriter.save(response)
    → Métriques Prometheus (ok/error/missing_features)
```

**IMPORTANT** : Le consumer écoute `processed-sensor-data` (sortie Spark), PAS `raw-sensor-data`. Pour les tests sans Spark, il faut soit :
- Alimenter manuellement le topic `processed-sensor-data`
- Ou modifier le consumer pour écouter `raw-sensor-data` en attendant

### Configuration et observabilité (ml-inference-service)

- Variables d'environnement importantes :
  - `MODEL_LOAD_RETRIES` (défaut : 6) — nombre de tentatives de chargement des modèles au démarrage.
  - `MODEL_LOAD_DELAY` (défaut : 5) — délai (s) entre tentatives.
  - `ALKATRA_CLASSIFIER_MODEL_PATH`, `ALKATRA_REGRESSOR_MODEL_PATH`, `ALKATRA_BIAS_MODEL_PATH` — chemins locaux (override) pour les scripts de registration / tests (définis dans le `.env` racine si présent).
  - `MLFLOW_TRACKING_URI`, `MLFLOW_S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — requis pour accéder au registry et au store d'artefacts.

- Comportement au démarrage : `ModelService.load()` tente de charger les modèles depuis MLflow en respectant la politique de retry ci-dessus. Si toutes les tentatives échouent, le service bascule en `demo_mode=True` (fallback). Le champ `/health` expose `models_loaded` et `demo_mode`.

- Métriques exposées (via `/metrics`) :
  - `ml_predictions_total{source, result}` — compteur global des prédictions (incrémenté par l'endpoint HTTP et par le consumer Kafka).
  - `ml_kafka_messages_total{status}` — messages Kafka traités (ok, missing_features, error).
  - `ml_missing_features_total{feature}` — compte les champs manquants par feature.
  - `ml_prediction_latency_seconds` — histogramme de latence des prédictions.

Ces métriques sont scrappées par Prometheus et affichables dans Grafana (dashboard ML Inference).

### 6.3 auth-service (NestJS — Port 3001)

**État** : Placeholder Phase 1
- Endpoint `/health` uniquement
- Code métier (OTP SMS, JWT, Keycloak) à implémenter
- Activé via profil Docker `auth`

### 6.4 spark-jobs (PySpark)

**État** : Squelette
- Dockerfile basé sur `apache/spark:3.5.1`
- Vendor des JARs Kafka (spark-sql-kafka)
- Dossier `jobs/` et `tests/` vides (à remplir en S3)
- Commande par défaut : `jobs/sensor_stream_processor.py`

---

## 7. INFRASTRUCTURE DOCKER

### 7.1 Services

| Service | Image | Port(s) | Dépendances |
|---------|-------|---------|-------------|
| **postgres** | postgis/postgis:16-3.4-alpine | 5432 | - |
| **mongodb** | mongo:7.0 | 27017 | - |
| **redis** | redis:7.2-alpine | 6379 | - |
| **kafka** | apache/kafka:3.7.0 | 9092, 9094 | - |
| **kafka-ui** | provectuslabs/kafka-ui:latest | 8090 | kafka |
| **mosquitto** | eclipse-mosquitto:2.0 | 1883, 9001 | - |
| **mlflow** | Custom (infra/mlflow/Dockerfile) | 5001 | postgres, minio |
| **minio** | minio/minio:latest | 9000, 9003 | - |
| **mailhog** | mailhog/mailhog:latest | 1025, 8025 | - |
| **keycloak** | quay.io/keycloak/keycloak:24.0 | 8080 | postgres (profile auth) |
| **prometheus** | prom/prometheus:latest | 9090 | - |
| **grafana** | grafana/grafana:latest | 3000 | prometheus |
| **iot-service** | Custom (apps/iot-service/Dockerfile) | 3005 | kafka, mosquitto, mongodb |
| **spark-job** | Custom (apps/spark-jobs/Dockerfile) | - | kafka, redis |
| **ml-inference-service** | Custom (apps/ml-inference-service/Dockerfile) | 8000 | kafka, mongodb, mlflow |

### 7.2 Configuration MLflow

- Backend store : PostgreSQL (`postgresql://admin:password@postgres:5432/alkatra_db`)
- Artifact store : MinIO S3 (`s3://mlflow-artifacts`)
- Port interne : 5001 (interne Docker) — ne pas confondre avec 5000 de la doc
- Base image : python:3.11-slim + mlflow==2.13.0
- Script d'init : `/start.sh` (attends Postgres puis MinIO)

### 7.3 Configuration Mosquitto

**Dev** (`mosquitto.dev.conf`) :
- `allow_anonymous true`
- Ports 1883 (MQTT) + 9001 (WebSocket)
- Log stdout

**Prod** (`mosquitto.prod.conf`) :
- À configurer avec auth + TLS (certs/)

### 7.4 Démarrage

```bash
npm run docker:up          # Démarre toute la stack
npm run docker:down        # Arrête
npm run docker:reset       # Arrête + supprime volumes
npm run docker:logs        # Logs en temps réel
```

**Avec profile Keycloak :**
```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile auth up -d
```

### 7.5 Interfaces exposees

| Service | URL |
|---------|-----|
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |
| Kafka UI | http://localhost:8090 |
| MLflow | http://localhost:5001 |
| MailHog | http://localhost:8025 |
| Keycloak | http://localhost:8080 |

---

## 8. BASE DE DONNÉES POSTGRES

### 8.1 Schéma

Fichier : `infra/postgres/init.sql`

**Tables :**

| Table | Description |
|-------|-------------|
| `users` | Agriculteurs (phone, rôle, langue, keycloak_id) |
| `farms` | Fermes (user_id, région, localisation PostGIS, surface) |
| `parcels` | Parcelles (farm_id, culture, sol, irrigation, polygone PostGIS) |
| `sensors` | Capteurs (parcel_id, device_id, batterie, firmware) |
| `recommendations` | Recommandations (parcel_id, irrigate, quantity_mm, shap_factors, explanations FR/Darija) |
| `subscription_plans` | Plans d'abonnement (freemium, starter, farmer, pro) |
| `subscriptions` | Abonnements souscrits |
| `alerts` | Alertes (type: hydric_stress, rain_detected, sensor_offline...) |

### 8.2 Types énumérés

`user_language_enum`, `user_role_enum`, `crop_type_enum`, `soil_type_enum`, `irrigation_method_enum`, `recommendation_feedback_enum`, `subscription_status_enum`, `payment_method_enum`, `recommendation_status_enum`, `alert_type_enum`, `alert_status_enum`

### 8.3 Données initiales

- **4 plans** : freemium (0 MAD, 2 parcelles), starter (350 MAD, 5), farmer (750 MAD, 15), pro (1800 MAD, 50)
- **Utilisateur test** : +212600000001 / Hamid Test Dev / darija / farmer
- **Ferme test** : Beni Mellal-Khénifra, 8.0 ha
- **Parcelle test** : Nord — Oliviers Picholine, 4.0 ha, irrigation goutte-à-goutte
- **Capteur test** : `esp32-sim-001` (match le simulateur)

### 8.4 Contraintes importantes

- `users.phone_number` : Regex `^\+212[67]\d{8}$` (numéros marocains)
- `parcels` : Index spatial GIST sur `centroid`
- `recommendations` : Champs SHAP en JSONB
- Index TTL MongoDB : 90 jours de rétention (`ai_sensor_features`)

---

## 9. MONGODB

### 9.1 Collection : `ai_sensor_features`

**Schema** (Mongoose — iot-service) :

| Champ | Type | Description |
|-------|------|-------------|
| `device_id` | string | Identifiant capteur |
| `farm_id` | string | Identifiant ferme |
| `parcel_id` | string | Identifiant parcelle |
| `ts` | number | Timestamp epoch |
| `temperature_min_c` | number | |
| `temperature_max_c` | number | |
| `wind_speed_ms` | number | |
| `solar_radiation_mj_m2_day` | number | |
| `soil_humidity_pct` | number | |
| `air_humidity_pct` | number | |
| `rain_mm_day` | number | |
| `is_anomaly` | boolean | Anomalie détectée |
| `anomaly_reasons` | string[] | Liste des raisons |
| `schema_version` | string | "sensor-ai-v2" |
| `received_at` | Date | Auto |

**Index :**
- `{ farm_id: 1, parcel_id: 1, ts: -1 }` (dashboard)
- `{ device_id: 1, ts: -1 }` (device monitoring)
- `{ received_at: 1 }` avec TTL 90 jours (7776000s)
- `{ is_anomaly: 1, ts: -1 }` (anomaly monitoring)

### 9.2 Collection : `irrigation_recommendations`

**Documents écrits par** : `ml-inference-service` (MongoWriter)

Structure :
```json
{
  "parcel_id": "...",
  "should_irrigate": true,
  "irrigation_probability": 0.7523,
  "water_amount_mm": 12.5,
  "water_amount_raw_mm": 12.8,
  "bias_applied_mm": -0.3,
  "top_factors": [
    {"feature": "humidite_sol_avant_%", "label_fr": "...", "label_ar": "...", "contribution": 0.45}
  ],
  "model_version": "1.0.0",
  "source": "kafka",
  "created_at": "2026-..."
}
```

---

## 10. MODÈLE DE DONNÉES PARTAGÉES (shared-types)

Package : `@alkatra/shared-types`

### sensor.types.ts

```typescript
RawSensorPayload {
  ts: number
  device_id, farm_id, parcel_id: string
  temperature_min_c, temperature_max_c, wind_speed_ms,
  solar_radiation_mj_m2_day, soil_humidity_pct, air_humidity_pct, rain_mm_day: number
}

KafkaSensorReading extends RawSensorPayload {
  schema_version: "sensor-ai-v2"
  received_at: string
  is_anomaly: boolean
  anomaly_reasons: string[]
}

ProcessedSensorData extends KafkaSensorReading {
  eto_mm_day?, kc_coefficient?, etc_mm_day?, water_deficit_mm?: number
  enriched_at?: string
  enrichment_version?: string
}

SensorAnomaly {
  device_id, parcel_id: string
  anomaly_type: 'OUT_OF_RANGE' | 'MISSING_DATA' | 'INCONSISTENT_TEMPERATURE' | 'OFFLINE'
  field?, value?, threshold?: ...
  detected_at: string
}
```

### farm.types.ts

```typescript
Farm { id, user_id, name, region?, location?, total_area_ha?, created_at, updated_at }
Parcel { id, farm_id, name, area_ha, crop_type, crop_variety?, soil_type, irrigation_method, ... }
IrrigationRecommendation { id, parcel_id, irrigate, quantity_mm?, shap_factors?, explanations? }
ShapFactor { feature_name, feature_value, shap_value, impact, label_fr, label_darija }
```

---

## 11. MONITORING ET OBSERVABILITÉ

### 11.1 Prometheus

**Fichier** : `infra/prometheus/prometheus.yml`

**Jobs de scrape :**
- `prometheus` (localhost:9090) — scrape toutes les 5s
- `iot-service` (iot-service:3005/metrics)
 - `ml-inference-service` (ml-inference-service:8000/metrics)

**Métriques exposées par iot-service :**
```
alkatra_iot_messages_received_total (counter)
alkatra_iot_messages_forwarded_total (counter)
alkatra_iot_anomalies_detected_total (counter)
alkatra_iot_mqtt_connected (gauge: 0/1)
alkatra_iot_kafka_ready (gauge: 0/1)
alkatra_iot_last_sensor_value{farm_id, parcel_id, device_id, field} (gauge)
alkatra_iot_last_message_timestamp_seconds (gauge)
```

**Métriques exposées par ml-inference-service :**
```
ml_predictions_total{source, result} (counter)
ml_missing_features_total{feature} (counter)
ml_prediction_latency_seconds (histogram)
ml_kafka_messages_total{status} (counter)
```

### 11.2 Grafana

**Dashboard** : "Al Katra - IoT Pipeline"
- Provisionné automatiquement dans `infra/grafana/`
- Datasource : Prometheus (nommée "Prometheus")
- Plugins : grafana-clock-panel

**Dashboard ML** : "Al Katra - ML Inference"
- Provisionné automatiquement : `infra/grafana/dashboards/ml-inference.json`
- Montre : `ml_predictions_total`, taux de prédictions (/min), `ml_kafka_messages_total`, latence de prédiction, et erreurs de features manquantes.

---

## 12. TESTS

### 12.1 iot-service (Jest)

**Fichiers :**
- `apps/iot-service/tests/mqtt.service.spec.ts` (MQTT validation, anomalies, envoi Kafka)
- `apps/iot-service/tests/kafka.service.spec.ts` (Kafka producer)

**Tests (MQTT Service) :**
- Validation des 7 variables IA obligatoires
- Détection d'anomalies (température inversée, humidity hors limites, pluie négative)
- Pas d'anomalie pour données normales
- Envoi Kafka après validation d'un payload valide
- Rejet des payloads invalides (pas d'appel Kafka)
- Retour des stats

**Tests (Kafka Service) :**
- Définition du service
- Ready après init
- Envoi d'un message

### 12.2 ml-inference-service (pytest)

**Fichiers :**
- `apps/ml-inference-service/tests/test_model_service.py`
- `apps/ml-inference-service/tests/test_predict_endpoint.py`

**Tests (Mode DEMO) :**
- `test_demo_mode_response` : prédiction avec mode démo
- `test_feature_names_count` : vérification des 22 features
- `test_predict_demo` : endpoint HTTP /predict en mode démo

### 12.3 Exécution

```bash
npm run test              # Tous les tests (via Turbo)
npm run test:cov          # Avec couverture
npm run test -w @alkatra/iot-service  # Tests iot-service seulement
cd apps/ml-inference-service && python -m pytest tests/ -v  # Tests ML
```

---

## 13. CI/CD

### 13.1 Workflows GitHub Actions

| Workflow | Déclencheur | Actions |
|----------|-------------|---------|
| `ci-common.yml` | Push/PR sur main/develop | ESLint + Prettier + Build Docker + Validation K8s |
| `ci-iot.yml` | Changements apps/iot-service/ | Tests Jest |
| `ci-ml.yml` | Changements apps/ml-inference/ ou spark-jobs/ | Tests pytest + ruff |

### 13.2 Fichiers GitHub

- `.github/CODEOWNERS` : Propriétaires par dossier
- `.github/PULL_REQUEST_TEMPLATE.md` : Template PR

---

## 14. SCRIPTS UTILES

| Commande | Description |
|----------|-------------|
| `npm run dev` | Démarre tous les services en dev (Turbo) |
| `npm run build` | Build tous les packages |
| `npm run lint` | Lint TypeScript |
| `npm run format` | Formatage Prettier |
| `npm run simulate` | Simulateur capteur MQTT (intervalle 30s) |
| `node scripts/simulate-sensor.js 5000` | Simulateur avec intervalle perso |
| `npm run docker:up` | Démarre stack Docker |
| `npm run docker:down` | Arrête stack Docker |
| `npm run docker:logs` | Logs en temps réel |
| `npm run docker:reset` | Reset complet (avec suppression volumes) |
| `npm run health` | Vérification stack |
| `npm run setup` | Script setup initial |
| `npm run models:register` | Enregistre modèles dans MLflow |
| `npm run validate:mongodb` | Valide index MongoDB |
| `npm run validate:pipeline` | Valide pipeline complet |

| `python scripts/test_load_models.py` | Teste le chargement des modèles depuis MLflow (utilise `.env` racine pour credentials S3 / MinIO) |
| `python scripts/register-models.py` | Register models into MLflow — accepte `--classifier`, `--regressor`, `--bias` ou utilise les variables d'env `ALKATRA_*_MODEL_PATH` |
| `infra/grafana/dashboards/ml-inference.json` | Dashboard provisionné pour visualiser prédictions / métriques ML |

---

## 15. ROADMAP ET PLANNING

### Phase 0 (Terminée — Sprint S2 à S4)
- ✅ S2 : Infrastructure Docker + iot-service MQTT→Kafka + tests
- ✅ S3 : Consumer Kafka iot-service → MongoDB + Spark skeleton
- ✅ S4 : ml-inference-service (FastAPI/XGBoost) + endpoints + tests

### Phase 1 (À venir)
- **Auth Service** : OTP SMS (Infobip), JWT, Keycloak intégration
- **Farm Service** : CRUD fermes/parcelles/capteurs
- **User Service** : Gestion utilisateurs, profils
- **Spark Jobs S3** : Feature engineering (ETo Penman-Monteith, Kc phénologique, rolling windows)
- **Application mobile/web** : Interface pour agriculteurs

### Phase 2 (Future)
- **Recommendation Service** : Alertes, recommandations temps réel
- **Alert Service** : Notifications push (Firebase)
- **Paiement** : Intégration CMI, Orange Money
- **Production** : Déploiement Kubernetes

---

## 16. RÈGLES DE DÉVELOPPEMENT

### 16.1 Conventions
- Langue des commentaires : **Français** (le projet est au Maroc)
- Langue du code : **Anglais** (variables, fonctions, types)
- Formatage : Prettier (single quote, trailing comma, tabWidth 2)
- TypeScript : ESLint + @typescript-eslint/recommended
- Python : ruff (linting)
- Commits : Pas de convention stricte imposée

### 16.2 Structure des PR
- Template obligatoire dans `.github/PULL_REQUEST_TEMPLATE.md`
- Merge dans develop d'abord, puis main
- Merge systématique avant chaque sprint

### 16.3 Gestion des dépendances
- npm workspaces (pas de package.json en double inutile)
- Turborepo pour orchestration (build, test, lint, dev)
- Python : requirements.txt (ml-inference-service, spark-jobs)

### 16.4 Variables d'environnement
- Copier `.env.example` → `.env`
- `.env` ne doit jamais être commité
- Docker Compose utilise `--env-file .env` explicitement
- Les scripts racine utilisent toujours le `.env` racine

- Variables liées aux modèles (ajoutez vos chemins locaux si nécessaire) :
  - `ALKATRA_CLASSIFIER_MODEL_PATH` — chemin local du fichier classifier (ex: C:/Users/you/model_classification_xgb.json)
  - `ALKATRA_REGRESSOR_MODEL_PATH` — chemin local du fichier regressor
  - `ALKATRA_BIAS_MODEL_PATH` — chemin local de l'artefact de bias (`champ_bias_dict.joblib`)

- Variables de résilience :
  - `MODEL_LOAD_RETRIES` (défaut `6`) — tentatives lors du chargement des modèles
  - `MODEL_LOAD_DELAY` (défaut `5`) — secondes entre tentatives

### 16.5 Règles ML spécifiques
- **Ne JAMAIS deviner une feature manquante** → message rejeté
- Les features doivent être exactement les 22 de FEATURE_NAMES
- `to_feature_dict()` est la méthode officielle pour convertir PredictionRequest → dict
- Seul `FEATURE_NAMES` et `FEATURE_LABELS` sont la source unique de vérité
- Le Consumer Kafka écoute `processed-sensor-data` (sortie Spark)
- Mode DEMO = fallback automatique si MLflow inaccessible

---

## 17. GUIDE DE DÉMARRAGE RAPIDE

### Prérequis
- Node.js >= 20, npm >= 10
- Docker Desktop
- Python 3.11 (pour ml-inference-service)

### Installation
```bash
git clone <repo>
npm install
cp .env.example .env
```

### Démarrage
```bash
npm run docker:up           # Stack complète (15s-2min)
npm run simulate            # Simulateur capteur (terminal 2)
npm run health              # Vérification (terminal 3)
```

### Vérifier les prédictions (rapide)

1. Lancer une simulation courte (ex : 500 messages) :
```bash
npm run simulate -- 500
```
2. Vérifier l'état du service ML et le chargement des modèles :
```bash
curl http://localhost:8000/health
# attendre: { "models_loaded": true, "demo_mode": false }
```
3. Vérifier les métriques exposées par le service ML (compteurs de prédictions) :
```bash
curl http://localhost:8000/metrics | grep ml_predictions_total || true
```
4. Requête Prometheus (taux prédictions / min) :
```bash
curl -sG --data-urlencode "query=sum(rate(ml_predictions_total[1m]))*60" "http://localhost:9090/api/v1/query"
```
5. Contrôler les documents écrits dans MongoDB (5 derniers) :
```bash
docker compose -f infra/docker/docker-compose.yml exec -T mongodb \
  mongosh -u ${MONGO_USER:-alkatra} -p ${MONGO_PASSWORD:-123} --authenticationDatabase admin \
  --eval "db.getSiblingDB('alkatra_iot').irrigation_recommendations.find().sort({created_at:-1}).limit(5).pretty()"
```
6. Ouvrir Grafana → dossier "Al Katra IoT" → dashboard "Al Katra - ML Inference" pour visualiser prédictions et taux en temps réel.


### Arrêt
```bash
npm run docker:down
```

### Dev local (sans Docker)
```bash
npm run dev -w @alkatra/iot-service   # iot-service sur 3005
cd apps/ml-inference-service && uvicorn app.main:app --reload  # ML sur 8000
```

---

## 18. RÉFÉRENCES TECHNIQUES

### Ports utilisés

| Port | Service |
|------|---------|
| 3005 | iot-service |
| 3001 | auth-service |
| 8000 | ml-inference-service |
| 5432 | Postgres |
| 27017 | MongoDB |
| 6379 | Redis |
| 9092/9094 | Kafka |
| 1883/9001 | Mosquitto |
| 5001 | MLflow (interne Docker) |
| 9000/9003 | MinIO |
| 1025/8025 | MailHog |
| 8080 | Keycloak |
| 9090 | Prometheus |
| 3000 | Grafana |
| 8090 | Kafka UI |

### Fichiers de référence critique

| Fichier | Contenu |
|---------|---------|
| `infra/docker/docker-compose.yml` | Stack complète (431 lignes) |
| `infra/postgres/init.sql` | Schéma Postgres (407 lignes) |
| `infra/kafka/topics.sh` | Création des 6 topics Kafka |
| `apps/iot-service/src/mqtt/mqtt.service.ts` | Coeur du pipeline IoT (314 lignes) |
| `apps/ml-inference-service/app/services/model_service.py` | Coeur du modèle ML (220 lignes) |
| `apps/ml-inference-service/app/schemas/prediction.py` | Contrat 22 features Pydantic |
| `packages/shared-types/src/sensor.types.ts` | Types TypeScript capteurs |
| `docs/model IA.ipynb` | Notebook Jupyter d'entraînement du modèle |
| `scripts/simulate-sensor.js` | Simulateur capteur MQTT |

---

## 19. ANNEXES

### 19.1 Liste des commandes npm complète

```bash
npm install                  # Installer dépendances
npm run dev                  # Dev tous les services
npm run build                # Build tous les workspaces
npm run test                 # Tous les tests
npm run test:cov             # Tests avec couverture
npm run lint                 # Lint TypeScript
npm run format               # Formatage Prettier
npm run docker:up            # Docker stack up
npm run docker:down          # Docker stack down
npm run docker:logs          # Logs Docker
npm run docker:reset         # Reset Docker (down -v + up)
npm run simulate             # Simulateur MQTT
npm run health               # Health check
npm run setup                # Setup initial
```

### 19.2 Checklist de déploiement (quand prêt)
- [ ] Ajouter CI/CD Kubernetes
- [ ] Configurer Mosquitto prod (auth + TLS)
- [ ] Remplacer les passwords par défaut
- [ ] Configurer domaines et certificats SSL
- [ ] Mettre en place la persistence Kafka
- [ ] Configurer les backups Postgres
- [ ] Activer auth Keycloak pour tous les services

### 19.3 Problèmes connus / Limitations
- Kubernetes jamais utilisé → pas de déploiement prod
- Le consumer ML écoute `processed-sensor-data` mais Spark n'est pas encore actif
- auth-service, farm-service, user-service, recommendation-service, alert-service sont encore vides
- Pas d'application mobile/front-end pour l'instant (Phase 0)
- Les tokens JWT ne sont pas encore configurés
- Le dataset d'entraînement (`dataset_irrigation_FINAL.csv`) n'est pas dans le repo

- Correction récente : le consumer Kafka incrémente désormais `ml_predictions_total` (les dashboards Grafana ML Inference doivent afficher les prédictions). Si le panneau reste vide :
  - vérifier que `ml-inference-service` a bien été reconstruit (`docker compose up -d --build ml-inference-service`),
  - vérifier que Prometheus et Grafana ont été recréés pour prendre en compte le provisioning (`docker compose up -d --force-recreate prometheus grafana`),
  - vérifier `/metrics` et `/health` sur le service ML.

---

*Fin du skill — Généré le 17/06/2026 — Projet Al Katra Bel Qatra v1.0.0*