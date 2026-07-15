# 🧠 Al Katra Bel Qatra — Skill IA Complet v2.0

> **Version** : 2.0.0 — Audit réalisé le 26/06/2026  
> **Projet** : Plateforme Smart Irrigation IoT + IA destinée aux fermiers marocains  
> **Stack** : Monorepo npm/Turborepo | TypeScript (NestJS) | Python (FastAPI/XGBoost/PySpark) | Docker  
> **Source de vérité** : Code du dépôt (commit 208f167b7a2002e42c3ac0ff6f6ae15218638683)  
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
8. [Base de données PostgreSQL](#8-base-de-données-postgresql)
9. [MongoDB](#9-mongodb)
10. [Modèle de données partagées (shared-types)](#10-modèle-de-données-partagées-shared-types)
11. [Monitoring et Observabilité](#11-monitoring-et-observabilité)
12. [Tests](#12-tests)
13. [CI/CD](#13-cicd)
14. [Scripts utiles](#14-scripts-utiles)
15. [Variables d'environnement](#15-variables-denvironnement)
16. [Règles de développement](#16-règles-de-développement)
17. [Guide de démarrage rapide](#17-guide-de-démarrage-rapide)
18. [Références techniques](#18-références-techniques)
19. [Annexes](#19-annexes)

---

## 1. VUE D'ENSEMBLE DU PROJET

### Objectif produit
**Al Katra Bel Qatra** (القطرة بالقاطرة — "La goutte par le goutte-à-goutte") est une plateforme d'irrigation intelligente qui :
- Collecte des données terrain via capteurs IoT (ESP32 simulé ou réel)
- Les traite en flux via Kafka (KRaft mode, single-node)
- Exécute des prédictions XGBoost (classifieur + régresseur) via MLflow Model Registry
- Produit des recommandations d'irrigation avec explications SHAP bilingues FR/AR
- Destinée aux **agriculteurs marocains**

### État actuel

| Service | Statut | Détail |
|---------|--------|--------|
| `iot-service` (NestJS) | ✅ Fonctionnel | Bridge MQTT → Kafka + consumer Kafka → MongoDB. Tests Jest (12/12) |
| `ml-inference-service` (FastAPI) | ✅ Fonctionnel | Prédictions XGBoost via MLflow Registry. /health, /predict, /metrics. Démarrage résilient + fallback DEMO |
| `spark-jobs` (PySpark) | 🟡 Partiel | 3 jobs Python fonctionnels (sensor_stream_processor, feature_engineering, state_manager). Feature engineering ETo Penman-Monteith + Kc olivier |
| `auth-service` (NestJS) | 🟡 Placeholder | Uniquement endpoint `/health` (Phase 1) |
| `farm-service` | 🔴 Vide | À implémenter |
| `user-service` | 🔴 Vide | À implémenter |
| `recommendation-service` | 🔴 Vide | À implémenter |
| `alert-service` | 🔴 Vide | À implémenter |

### Infrastructure Docker
✅ **15 services** dans docker-compose : postgres, mongodb, redis, kafka, kafka-ui, mosquitto, mlflow, minio, mailhog, keycloak, prometheus, grafana, iot-service, spark-job, ml-inference-service

### Modèle IA
- **Classifieur** XGBoost : `AlKatra-Classifier` — probabilité d'irrigation (seuil 0.35)
- **Régresseur** XGBoost : `AlKatra-Regressor` — quantité en mm (log1p/expm1)
- **Digital Twin bias** : `champ_bias_dict.joblib` (artefact MLflow)
- **22 features** avec labels bilingues FR/AR
- **SHAP** top 5 facteurs contributifs

### Contraintes connues
- Kubernetes jamais utilisé en production (manifests partiels uniquement)
- Le consumer ML écoute `processed-sensor-data` mais Spark n'est pas encore déployé
- Pas d'application mobile/front-end
- Merge conflict dans `apps/spark-jobs/requirements.txt` (à corriger)
- `setup.sh` référence encore MLflow port 5000 (doit être 5001)

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
├── requirements-ml.txt       # Dépendances ML additionnelles
│
├── apps/
│   ├── iot-service/          # ✅ Fonctionnel - Bridge MQTT→Kafka + consumer→MongoDB
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── health/           # HealthController (/health)
│   │   │   ├── kafka/            # Kafka producer service
│   │   │   ├── kafka-consumer/   # SensorDataConsumer (raw-sensor-data → MongoDB)
│   │   │   ├── metrics/          # MetricsController (/metrics Prometheus)
│   │   │   ├── mongodb/
│   │   │   │   ├── schemas/      # AiSensorFeature, Et0 schemas
│   │   │   │   └── repositories/ # AiSensorFeatureRepository
│   │   │   └── mqtt/             # MqttService (MQTT→Kafka bridge)
│   │   └── tests/
│   │       ├── mqtt.service.spec.ts
│   │       └── kafka.service.spec.ts
│   │
│   ├── ml-inference-service/ # ✅ Fonctionnel - FastAPI XGBoost
│   │   ├── app/
│   │   │   ├── main.py           # FastAPI entrypoint
│   │   │   ├── config.py         # Settings centralisés
│   │   │   ├── schemas/          # Pydantic models (PredictionRequest/Response)
│   │   │   ├── services/
│   │   │   │   ├── model_service.py   # Chargement MLflow + prédiction
│   │   │   │   ├── kafka_consumer.py  # Consumer threadé Kafka→MongoDB
│   │   │   │   └── mongo_writer.py    # Écriture recommandations MongoDB
│   │   │   └── core/
│   │   │       └── metrics.py         # Prometheus metrics
│   │   └── tests/
│   │       ├── test_model_service.py
│   │       └── test_predict_endpoint.py
│   │
│   ├── auth-service/         # 🟡 Placeholder - uniquement /health
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── app.controller.ts   # GET /health
│   │
│   ├── spark-jobs/           # 🟡 Partiel - 3 jobs Python fonctionnels
│   │   ├── Dockerfile
│   │   ├── entrypoint.sh
│   │   ├── requirements.txt  # 🔴 MERGE CONFLICT À CORRIGER
│   │   ├── jobs/
│   │   │   ├── sensor_stream_processor.py  # Spark Structured Streaming
│   │   │   ├── feature_engineering.py       # ETo, Kc, features dérivées
│   │   │   └── state_manager.py            # État Redis par parcelle
│   │   └── tests/
│   │       ├── conftest.py
│   │       ├── test_feature_engineering.py
│   │       └── test_state_manager.py
│   │
│   ├── farm-service/         # 🔴 Vide
│   ├── recommendation-service/ # 🔴 Vide
│   ├── user-service/         # 🔴 Vide
│   └── alert-service/        # 🔴 Vide
│
├── packages/
│   ├── shared-types/         # Types TypeScript partagés (sensor.types.ts)
│   └── shared-utils/         # 🔴 Vide (uniquement .gitkeep)
│
├── infra/
│   ├── docker/               # docker-compose.yml (15 services)
│   ├── postgres/             # init.sql (schéma complet 407 lignes)
│   ├── kafka/                # topics.sh (création 6 topics)
│   ├── mosquitto/            # Config dev/prod + certs/
│   ├── mlflow/               # Dockerfile + start.sh
│   ├── grafana/              # Dashboards + provisioning
│   │   ├── dashboards/       # iot-pipeline.json, ml-inference.json
│   │   └── provisioning/     # datasources.yml, dashboards.yml
│   ├── prometheus/           # prometheus.yml
│   └── kubernetes/           # Manifests partiels (namespace, configmap, secrets, deployment)
│
├── docs/
│   ├── architecture/         # ADR, flux, repository-map, project-overview
│   ├── guides/               # Dev, tests, CI/CD, observability
│   ├── reference/            # Ports, payload, env
│   └── runbooks/             # Troubleshooting
│
└── scripts/
    ├── simulate-sensor.js          # Simulateur capteur MQTT
    ├── health-check.sh             # Vérification stack Docker
    ├── setup.sh                    # Setup initial
    ├── register-models.py          # Enregistrement modèles MLflow
    ├── validate-mongodb-indexes.js # Validation index MongoDB
    ├── validate-pipeline.sh        # Validation pipeline IoT
    ├── final_test.py               # Test chargement S3
    ├── smoke_ml_integration.py     # Test intégration ML
    ├── smoke_test.sh               # Smoke test
    └── test_load_models.py         # Test chargement modèles
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
│ Ports: 1883 (MQTT), 9010 (WebSocket)              │
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
└────┬───────────────┬───────────────────────────────┘
     │               │
     ▼               ▼
┌──────────┐   ┌──────────────────────────────────────┐
│ iot-     │   │ Spark Jobs (Structured Streaming)    │
│ service  │   │ raw-sensor-data → processed-sensor-  │
│ Consumer │   │ data                                 │
│ → MongoDB│   │ Feature Engineering :                │
│ (ai_     │   │ ETo Penman-Monteith, Kc olivier,    │
│ sensor_  │   │ rolling windows, lag features        │
│ features)│   │ État Redis : J-1, J-2, J-3          │
└──────────┘   └──────────────┬───────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────────┐
               │ ML Inference Service (FastAPI)        │
               │ Port: 8000                            │
               │ 1. Reçoit les 22 features             │
               │ 2. Classifieur → irrigation ?         │
               │ 3. Régresseur → quantité (mm)        │
               │ 4. Digital Twin bias                  │
               │ 5. SHAP explanations (top 5)          │
               │ Output: irrigation_recommendations    │
               └──────────────┬────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────────┐
               │ MongoDB                               │
               │ Collections:                          │
               │ - ai_sensor_features (données brutes) │
               │ - irrigation_recommendations (prédict)│
               │ - et0 (évapotranspiration calculée)   │
               └──────────────────────────────────────┘
```

### 3.1 Topics Kafka

Crédation via : `infra/kafka/topics.sh`

| Topic | Partitions | Rétention | Usage |
|-------|-----------|-----------|-------|
| `raw-sensor-data` | 6 | 7 jours | Données brutes validées par iot-service |
| `processed-sensor-data` | 6 | 7 jours | Données enrichies par Spark (features ML) |
| `ml-inference-requests` | 3 | 1 heure | Requêtes vers modèle IA (futur) |
| `recommendations-generated` | 3 | 1 jour | Recommandations produites (futur) |
| `alerts-outbound` | 3 | 1 jour | Alertes sortantes (futur) |
| `sensor-anomalies` | 2 | 7 jours | Anomalies capteurs (futur) |

**Note** : `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` dans la config Kafka, donc les topics peuvent être créés automatiquement.

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

Seuils définis dans `MqttService` (fichier : `apps/iot-service/src/mqtt/mqtt.service.ts`) :
- `temperature_min_c < -10` ou `temperature_max_c > 60`
- `temperature_min_c > temperature_max_c`
- `wind_speed_ms ∉ [0, 45]`
- `solar_radiation_mj_m2_day ∉ [0, 40]`
- `soil_humidity_pct` ou `air_humidity_pct ∉ [0, 100]`
- `rain_mm_day ∉ [0, 200]`

### 4.4 Consumer Kafka → MongoDB

Le `SensorDataConsumer` (dans `kafka-consumer/`) lit les messages du topic `raw-sensor-data` et les persiste dans la collection MongoDB `ai_sensor_features`. Il effectue une validation minimale (device_id, farm_id, parcel_id requis) avant persistance.

---

## 5. PIPELINE ML / IA

### 5.1 Architecture du modèle

**Modèle hybride à 2 étages :**

```
Étape 1 : CLASSIFIEUR (XGBoost)
- Features d'entrée : 22 features
- Sortie : probabilité d'irrigation (seuil = 0.35)
- Objectif : "Faut-il irriguer aujourd'hui ?"

Étape 2 : RÉGRESSEUR (XGBoost) — conditionnel
- Appliqué uniquement si classifieur >= seuil
- Target transformée : log1p(besoin_brut_mm)
- Prédiction : expm1(prediction_log) → quantité en mm
- Ajustement : Digital Twin bias (parcelle) + arrondi 0.5mm
```

**MLflow Model Registry** :
- Modèles enregistrés sous `AlKatra-Classifier` et `AlKatra-Regressor` (stage: Production)
- Bias stocké comme artefact (`bias/champ_bias_dict.joblib`) dans un run nommé `digital-twin-bias-registration`
- Backend store : PostgreSQL | Artifact store : MinIO S3

### 5.2 Les 22 features du modèle

Source unique de vérité : `FEATURE_NAMES` dans `model_service.py` et `prediction.py`

| # | Feature | Label FR | Label AR |
|---|---------|----------|----------|
| 1 | `temp_max` | Température max | أقصى حرارة |
| 2 | `temp_min` | Température min | أدنى حرارة |
| 3 | `temp_moy` | Température moyenne | متوسط الحرارة |
| 4 | `delta_temp` | Amplitude thermique | المدى الحراري |
| 5 | `humidite_air` | Humidité air | رطوبة الهواء |
| 6 | `vent` | Vitesse du vent | سرعة الريح |
| 7 | `rayonnement` | Rayonnement solaire | الإشعاع الشمسي |
| 8 | `pluie` | Pluie du jour | شتا اليوم |
| 9 | `ET0_mm` | Evapotranspiration ETo | التبخر والنتح المرجعي |
| 10 | `ETc` | Evapotranspiration culture | التبخر والنتح للزراعة |
| 11 | `humidite_sol_avant_%` | Humidité sol actuelle | رطوبة التربة الحالية |
| 12 | `humidite_sol_rolling3` | Humidité sol moyenne 3j | متوسط رطوبة التربة 3 أيام |
| 13 | `jour_annee` | Jour de l'année | يوم السنة |
| 14 | `mois` | Mois | الشهر |
| 15 | `jour_semaine` | Jour de la semaine | يوم الأسبوع |
| 16 | `humidite_sol_j-1` | Humidité sol hier | رطوبة التربة البارح |
| 17 | `pluie_j-1` | Pluie hier | شتا البارح |
| 18 | `ETc_j-1` | ETc hier | التبخر البارح |
| 19 | `pluie_3j` | Cumul pluie 3j | مجموع الشتا 3 أيام |
| 20 | `eto_hum_ratio` | Ratio ETo/humidité | نسبة التبخر/الرطوبة |
| 21 | `deficit_hydrique` | Déficit hydrique | العجز المائي |
| 22 | `regime_sol` | Régime du sol | نظام التربة |

### 5.3 Digital Twin Bias

- Ajustement par parcelle stocké dans MLflow (artefact `bias/champ_bias_dict.joblib`)
- Valeur de biais limitée à [-5.0, 5.0] mm
- Appliqué à la quantité brute avant arrondi 0.5mm
- Si aucune parcelle trouvée → bias = 0

### 5.4 SHAP Explanations

Le régresseur produit des `pred_contribs` (SHAP values) :
- Top 5 features contributrices (`TOP_N_FACTORS = 5`)
- Labels bilingues FR/AR
- Le biais du modèle (dernière colonne des contribs) est exclu

### 5.5 Mode DEMO

- Fallback automatique si MLflow inaccessible
- Génère des prédictions aléatoires mais structurées
- Détectable via `response.demo_mode == True`
- Politique de retry : `MODEL_LOAD_RETRIES` (défaut 6) × `MODEL_LOAD_DELAY` (défaut 5s)
- Utilisé en CI (pas de MLflow disponible)

---

## 6. SERVICES DÉTAILLÉS

### 6.1 iot-service (NestJS — Port 3005)

**Module** : `@alkatra/iot-service` | **Version** : 0.1.0

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Statut MQTT + Kafka + compteurs |
| `/metrics` | GET | Métriques Prometheus |

**Architecture interne :**
```
AppModule
├── ConfigModule (globale, .env)
├── MqttModule
│   └── MqttService (subscribe MQTT, validation 7 variables, enrichissement)
├── KafkaModule
│   └── KafkaService (producer vers raw-sensor-data, compression GZIP)
├── KafkaConsumerModule
│   └── SensorDataConsumer (raw-sensor-data → MongoDB, groupId: iot-service-mongodb-persister)
├── MongodbModule
│   ├── AiSensorFeature Schema (collection: ai_sensor_features)
│   ├── Et0 Schema (collection: et0)
│   └── AiSensorFeatureRepository
├── HealthModule
│   └── HealthController (/health)
└── MetricsModule
    └── MetricsController (/metrics Prometheus)
```

**Fichier** : `apps/iot-service/src/mqtt/mqtt.service.ts` (314 lignes)

**Dockerfile** : Target `development` (multi-stage). Dev : hot-reload via `npm run start:dev`. Prod : `node dist/main`.

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
- Ou modifier la variable d'env `KAFKA_INPUT_TOPIC`

**Comportement au démarrage** : `ModelService.load()` tente de charger les modèles depuis MLflow en respectant la politique de retry. Si toutes les tentatives échouent, bascule en `demo_mode=True`.

### 6.3 auth-service (NestJS — Port 3001)

**État** : Placeholder Phase 1
- Endpoint `/health` uniquement avec message "placeholder — Phase 1 not implemented"
- Code métier (OTP SMS, JWT, Keycloak) à implémenter
- Activé via profil Docker `auth`

### 6.4 spark-jobs (PySpark)

**État** : Partiel — contient du code fonctionnel

**Fichiers :**

| Fichier | Rôle |
|---------|------|
| `Dockerfile` | Image basée sur `apache/spark:3.5.1`, vendor JARs Kafka |
| `entrypoint.sh` | Script d'entrée |
| `requirements.txt` | 🔴 Contient un merge conflict à résoudre |
| `jobs/sensor_stream_processor.py` (337L) | Spark Structured Streaming : raw-sensor-data → processed-sensor-data |
| `jobs/feature_engineering.py` (163L) | Calcul ETo Penman-Monteith simplifié (FAO-56) + Kc olivier |
| `jobs/state_manager.py` (139L) | État journalier Redis par parcelle (J-1, J-2, J-3) |
| `tests/test_feature_engineering.py` | Tests des fonctions pures (sans Spark) |
| `tests/test_state_manager.py` | Tests du gestionnaire d'état Redis |

**Architecture du pipeline Spark :**

```
raw-sensor-data (Kafka)
    → Spark Structured Streaming (micro-batch 30s)
    → Parsing JSON + résolution alias
    → Feature engineering : ETo, Kc, features temporelles, rolling windows
    → Mise à jour état Redis (state_manager)
    → processed-sensor-data (Kafka)
    → Mode DRY_RUN (SPARK_DRY_RUN=1) pour test sans Kafka
```

**Feature Engineering détaillée** (dans `feature_engineering.py`) :
- `calculate_eto()` : ETo FAO-56 simplifié (Penman-Monteith)
- `get_kc_olivier()` : Kc mensuel pour olivier (FAO-56, conditions Maroc)
- `compute_derived_features()` : Calcule les 22 features complètes

**Gestion d'état Redis** (dans `state_manager.py`) :
- Clés : `alkatra:state:{parcel_id}:day{0-3}`
- TTL : 5 jours
- Rotation journalière : day3 ← day2 ← day1 ← day0
- Stateful features : humidite_sol_j-1, pluie_j-1, ETc_j-1, rolling3

---

## 7. INFRASTRUCTURE DOCKER

### 7.1 Services (15 services)

| Service | Image | Port(s) | Dépendances |
|---------|-------|---------|-------------|
| **postgres** | postgis/postgis:16-3.4-alpine | 5432 | - |
| **mongodb** | mongo:7.0 | 27017 | - |
| **redis** | redis:7.2-alpine | 6379 | - |
| **kafka** | apache/kafka:3.7.0 | 9092, 9094 | - |
| **kafka-ui** | provectuslabs/kafka-ui:latest | 8090 | kafka |
| **mosquitto** | eclipse-mosquitto:2.0 | 1883, 9010 | - |
| **mlflow** | Custom (infra/mlflow/Dockerfile) | 5001 | postgres, minio |
| **minio** | minio/minio:latest | 9000, 9001 | - |
| **mailhog** | mailhog/mailhog:latest | 1025, 8025 | - |
| **keycloak** | quay.io/keycloak/keycloak:24.0 | 8080 | postgres (profile auth) |
| **prometheus** | prom/prometheus:latest | 9090 | - |
| **grafana** | grafana/grafana:latest | 3000 | prometheus |
| **iot-service** | Custom (apps/iot-service/Dockerfile) | 3005 | kafka, mosquitto, mongodb |
| **spark-job** | Custom (apps/spark-jobs/Dockerfile) | - | kafka, redis |
| **ml-inference-service** | Custom (apps/ml-inference-service/Dockerfile) | 8000 | kafka, mongodb, mlflow |

### 7.2 Configuration MLflow

- Backend store : PostgreSQL (`postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`)
- Artifact store : MinIO S3 (`s3://mlflow-artifacts`)
- Port interne : 5001
- Base image : python:3.11-slim + mlflow==2.13.0
- Script d'init : `/start.sh` (attend Postgres puis MinIO)

### 7.3 Configuration Mosquitto

**Dev** (`mosquitto.dev.conf`) :
- `allow_anonymous true`
- Ports 1883 (MQTT) + 9010 (WebSocket)
- Log stdout

**Prod** (`mosquitto.prod.conf`) :
- TLS avec certificats (cafile, certfile, keyfile)
- `require_certificate true` pour authentification par certificat
- `allow_anonymous false` + password_file
- Port 8883 (MQTT sécurisé)

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

### 7.5 Interfaces exposées

| Service | URL |
|---------|-----|
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |
| Kafka UI | http://localhost:8090 |
| MLflow | http://localhost:5001 |
| MailHog | http://localhost:8025 |
| Keycloak | http://localhost:8081 |
| MinIO Console | http://localhost:9001 |

---

## 8. BASE DE DONNÉES POSTGRESQL

### 8.1 Schéma

Fichier : `infra/postgres/init.sql` (407 lignes)

**Tables :**

| Table | Description |
|-------|-------------|
| `users` | Agriculteurs (phone, rôle, langue, keycloak_id) |
| `farms` | Fermes (user_id, région, localisation PostGIS, surface) |
| `parcels` | Parcelles (farm_id, culture, sol, irrigation, polygone PostGIS) |
| `sensors` | Capteurs (parcel_id, device_id, batterie, firmware) |
| `recommendations` | Recommandations (parcel_id, irrigate, quantity_mm, shap_factors JSONB, explanations FR/Darija) |
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

---

## 9. MONGODB

### 9.1 Collection : `ai_sensor_features`

**Schema** (Mongoose — `ai-sensor-feature.schema.ts`) :

| Champ | Type | Description |
|-------|------|-------------|
| `device_id` | string (indexé) | Identifiant capteur |
| `farm_id` | string (indexé) | Identifiant ferme |
| `parcel_id` | string (indexé) | Identifiant parcelle |
| `ts` | number (indexé) | Timestamp epoch |
| `temperature_min_c` | number | |
| `temperature_max_c` | number | |
| `wind_speed_ms` | number | |
| `solar_radiation_mj_m2_day` | number | |
| `soil_humidity_pct` | number | |
| `air_humidity_pct` | number | |
| `rain_mm_day` | number | |
| `is_anomaly` | boolean (indexé) | Anomalie détectée |
| `anomaly_reasons` | string[] | Liste des raisons |
| `schema_version` | string | "sensor-ai-v2" |
| `received_at` | Date | Auto |

**Index :**
- `{ farm_id: 1, parcel_id: 1, ts: -1 }` (dashboard)
- `{ device_id: 1, ts: -1 }` (device monitoring)
- `{ received_at: 1 }` avec TTL 90 jours (7776000s)
- `{ is_anomaly: 1, ts: -1 }` (anomaly monitoring)

### 9.2 Collection : `et0`

**Schema** (Mongoose — `et0.schema.ts`) :

| Champ | Type | Description |
|-------|------|-------------|
| `farm_id` | string (indexé) | Identifiant ferme |
| `parcel_id` | string (indexé) | Identifiant parcelle |
| `ts` | number (indexé) | Timestamp epoch |
| `et0_mm_day` | number | Valeur ET0 calculée |
| `temperature_avg_c` | number | Température moyenne |
| `humidity_pct` | number | Humidité |
| `wind_speed_ms` | number | Vitesse vent |
| `solar_radiation_mj_m2_day` | number | Rayonnement solaire |
| `calculated_at` | Date | Auto |

**Index :**
- `{ farm_id: 1, parcel_id: 1, ts: -1 }`
- TTL 90 jours sur `calculated_at`

### 9.3 Collection : `irrigation_recommendations`

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

**Index :**
- `{ parcel_id: -1, created_at: -1 }`

---

## 10. MODÈLE DE DONNÉES PARTAGÉES (shared-types)

Package : `@alkatra/shared-types`

### 10.1 sensor.types.ts

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

MQTT_TOPIC_PATTERN = 'alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data'
```

### 10.2 shared-utils

Package : `@alkatra/shared-utils` — **actuellement vide** (contient uniquement `.gitkeep`)

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

**Métriques exposées par ml-inference-service (metrics.py) :**
```
ml_predictions_total{source, result} (counter) — HTTP ou Kafka
ml_missing_features_total{feature} (counter)
ml_prediction_latency_seconds (histogram)
ml_kafka_messages_total{status} (counter) — ok, missing_features, error, no_parcel
```

### 11.2 Grafana

**Provisioning** : `infra/grafana/provisioning/`
- Datasource : Prometheus (nommée "Prometheus", scrape interval 15s)
- Dashboard folder : "Al Katra IoT"

**Dashboards :**
- "Al Katra - IoT Pipeline" (`iot-pipeline.json`)
- "Al Katra - ML Inference" (`ml-inference.json`) — montre `ml_predictions_total`, taux de prédictions, `ml_kafka_messages_total`, latence, erreurs

**Plugins installés** : grafana-clock-panel (via `GF_INSTALL_PLUGINS`)

---

## 12. TESTS

### 12.1 iot-service (Jest)

**Fichiers (3) :**
- `tests/mqtt.service.spec.ts` (147L) — MQTT validation, anomalies, envoi Kafka
- `tests/kafka.service.spec.ts` (56L) — Kafka producer
- `src/kafka-consumer/sensor-data.consumer.spec.ts` (91L) — Consumer Kafka → MongoDB

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

**Résultat** : 12/12 tests pass (Jest) — 1 test suite échoue uniquement si dépendances Mongoose manquantes

### 12.2 ml-inference-service (pytest)

**Fichiers (2) :**
- `tests/test_model_service.py` (40L) — Mode DEMO
- `tests/test_predict_endpoint.py` (26L) — Endpoint HTTP /predict en mode DEMO

**Tests :**
- `test_demo_mode_response` : prédiction avec mode démo
- `test_feature_names_count` : vérification des 22 features
- `test_to_feature_dict_matches_feature_names` : cohérence dictionnaire
- `test_predict_demo` : endpoint HTTP /predict en mode démo

### 12.3 spark-jobs (pytest)

**Fichiers (2) :**
- `tests/test_feature_engineering.py`
- `tests/test_state_manager.py`

**Tests** : Fonctions pures (sans Spark cluster), utilisent `fakeredis`

### 12.4 Exécution

```bash
npm run test              # Tous les tests (via Turbo)
npm run test:cov          # Avec couverture
npm run test -w @alkatra/iot-service  # Tests iot-service seulement
cd apps/ml-inference-service && python -m pytest tests/ -v  # Tests ML
cd apps/spark-jobs && python -m pytest tests/ -v -k "not spark"  # Tests Spark
```

---

## 13. CI/CD

### 13.1 Workflows GitHub Actions (4 workflows)

| Workflow | Déclencheur | Actions |
|----------|-------------|---------|
| `ci-common.yml` | Push/PR sur main/develop | ESLint + Prettier + Build Docker + Validation K8s (kubeconform) |
| `ci-iot.yml` | Changements apps/iot-service/ ou shared-types/ | Tests Jest + coverage |
| `ci-ml.yml` | Changements apps/ml-inference/ ou spark-jobs/ | Tests pytest + ruff (ML + Spark) |
| `ci-spark.yml` | Changements apps/spark-jobs/ | Tests feature engineering (sans Spark) + build Docker Spark |

### 13.2 CI détaillé

**ci-common.yml :**
- Lint TypeScript + Format check Prettier
- Build Docker images (iot-service, spark-jobs, ml-inference-service)
- Validate Kubernetes manifests via kubeconform

**ci-iot.yml :**
- npm ci + lint
- Unit tests with mocked MQTT/Kafka
- Upload coverage to Codecov

**ci-ml.yml :**
- pip install + pytest (mode DEMO)
- Install + test spark-jobs (sans Spark)
- Ruff lint Python

**ci-spark.yml :**
- Tests fonctions pures (sans Spark cluster)
- Build Docker Spark image
- Verify image starts (continue-on-error)

---

## 14. SCRIPTS UTILES

### 14.1 Commandes npm (package.json racine)

| Commande | Description |
|----------|-------------|
| `npm run build` | Build tous les packages (turbo run build) |
| `npm run dev` | Démarre tous les services en dev (turbo run dev --parallel) |
| `npm run test` | Tous les tests (turbo run test) |
| `npm run test:cov` | Tests avec couverture (turbo run test:cov) |
| `npm run lint` | Lint TypeScript |
| `npm run format` | Formatage Prettier |
| `npm run docker:up` | Démarre stack Docker |
| `npm run docker:down` | Arrête stack Docker |
| `npm run docker:logs` | Logs en temps réel |
| `npm run docker:reset` | Reset complet (down -v + up) |
| `npm run simulate` | Simulateur capteur MQTT (intervalle 30s) |
| `npm run health` | Health check stack |
| `npm run setup` | Setup initial |
| `npm run models:register` | Enregistre modèles dans MLflow |
| `npm run validate:mongodb` | Valide index MongoDB |
| `npm run validate:pipeline` | Valide pipeline complet |

### 14.2 Scripts Python/Node

| Commande | Description |
|----------|-------------|
| `node scripts/simulate-sensor.js [interval_ms]` | Simulateur avec intervalle personnalisé |
| `python3 scripts/register-models.py --classifier ... --regressor ... --bias ...` | Enregistre les modèles XGBoost dans MLflow |
| `python3 scripts/test_load_models.py` | Teste le chargement des modèles depuis MLflow |
| `python3 scripts/final_test.py` | Test de chargement depuis S3 (MinIO) |
| `python3 scripts/smoke_ml_integration.py` | Test d'intégration ML |
| `bash scripts/smoke_test.sh` | Smoke test shell |
| `bash scripts/validate-pipeline.sh` | Validation pipeline IoT end-to-end |
| `node scripts/validate-mongodb-indexes.js` | Validation index MongoDB |
| `bash scripts/health-check.sh` | Vérification stack Docker |

---

## 15. VARIABLES D'ENVIRONNEMENT

### 15.1 Fichier .env

Copier `.env.example` → `.env`. Ne jamais committer `.env`.

### 15.2 PostgreSQL

| Variable | Défaut | Description |
|----------|--------|-------------|
| `POSTGRES_USER` | `alkatra` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `alkatra_dev_pass_change_me` | Mot de passe |
| `POSTGRES_DB` | `alkatra_db` | Nom de la base |
| `POSTGRES_PORT` | `5432` | Port |

### 15.3 MongoDB

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MONGO_USER` | `alkatra` | Utilisateur MongoDB |
| `MONGO_PASSWORD` | `alkatra_mongo_change_me` | Mot de passe |

### 15.4 Redis

| Variable | Défaut | Description |
|----------|--------|-------------|
| `REDIS_PASSWORD` | `alkatra_redis_change_me` | Mot de passe Redis |

### 15.5 MQTT

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MQTT_USER` | (vide) | Utilisateur MQTT (dev: vide = anonymous) |
| `MQTT_PASSWORD` | (vide) | Mot de passe MQTT |

### 15.6 Grafana

| Variable | Défaut | Description |
|----------|--------|-------------|
| `GRAFANA_USER` | `admin` | Utilisateur Grafana |
| `GRAFANA_PASSWORD` | `alkatra_grafana_change_me` | Mot de passe Grafana |

### 15.7 Keycloak

| Variable | Défaut | Description |
|----------|--------|-------------|
| `KEYCLOAK_ADMIN` | `admin` | Admin Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | `alkatra_keycloak_admin_change_me` | Mot de passe |

### 15.8 JWT (Phase 1)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `JWT_SECRET` | (vide) | Secret JWT |
| `JWT_REFRESH_SECRET` | (vide) | Refresh token secret |

### 15.9 Infobip SMS (Phase 1)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `INFOBIP_API_KEY` | (vide) | Clé API Infobip |
| `INFOBIP_BASE_URL` | `https://api.infobip.com` | URL API |

### 15.10 Firebase (Phase 1)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `FIREBASE_PROJECT_ID` | (vide) | Projet Firebase |
| `FIREBASE_PRIVATE_KEY` | (vide) | Clé privée |
| `FIREBASE_CLIENT_EMAIL` | (vide) | Email client |

### 15.11 MLflow

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MLFLOW_TRACKING_URI` | `http://localhost:5001` | URI du serveur MLflow |
| `MLFLOW_S3_ENDPOINT_URL` | `http://minio:9000` (Docker) | Endpoint S3 pour artifacts |
| `AWS_ACCESS_KEY_ID` | `minioadmin` | Credentials S3 |
| `AWS_SECRET_ACCESS_KEY` | `minioadmin` | Credentials S3 |
| `MLFLOW_ARTIFACT_BUCKET` | `mlflow-artifacts` | Bucket S3 |

### 15.12 Modèles ML

| Variable | Défaut | Description |
|----------|--------|-------------|
| `ALKATRA_CLASSIFIER_MODEL_PATH` | (chemin local) | Chemin du classifier XGBoost |
| `ALKATRA_REGRESSOR_MODEL_PATH` | (chemin local) | Chemin du regressor XGBoost |
| `ALKATRA_BIAS_MODEL_PATH` | (chemin local) | Chemin du bias dict |
| `MODEL_LOAD_RETRIES` | `6` | Tentatives chargement modèles |
| `MODEL_LOAD_DELAY` | `5` | Secondes entre tentatives |

### 15.13 ML Inference Service

| Variable | Défaut | Description |
|----------|--------|-------------|
| `ENVIRONMENT` | `development` | Environnement |
| `LOG_LEVEL` | `INFO` | Niveau de log |
| `ENABLE_KAFKA_CONSUMER` | `true` | Activer consumer Kafka |
| `KAFKA_INPUT_TOPIC` | `processed-sensor-data` | Topic Kafka entrant |
| `KAFKA_GROUP_ID` | `ml-inference-group` | Groupe Kafka |
| `KAFKA_AUTO_OFFSET_RESET` | `latest` | Offset reset policy |
| `CLASSIFICATION_THRESHOLD` | `0.35` | Seuil classification |
| `MONGO_DB` | `alkatra_iot` | Base MongoDB |
| `MONGO_RECO_COLLECTION` | `irrigation_recommendations` | Collection recommandations |

### 15.14 Spark Jobs

| Variable | Défaut | Description |
|----------|--------|-------------|
| `KAFKA_INPUT_TOPIC` | `raw-sensor-data` | Topic Kafka entrant |
| `KAFKA_OUTPUT_TOPIC` | `processed-sensor-data` | Topic Kafka sortant |
| `KAFKA_STARTING_OFFSETS` | `latest` | Offset de démarrage |
| `KAFKA_FAIL_ON_DATA_LOSS` | `false` | Échec si perte données |
| `SPARK_DRY_RUN` | `0` | Mode dry run (pas de write Kafka) |

### 15.15 Simulateur

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MQTT_HOST` | `localhost` | Hôte MQTT |
| `MQTT_PORT` | `1883` | Port MQTT |
| `FARM_ID` | `farm_test_001` | Ferme simulée |
| `PARCEL_ID` | `parcel_test_001` | Parcelle simulée |
| `DEVICE_ID` | `esp32-sim-001` | Capteur simulé |

### 15.16 Open-Meteo

| Variable | Défaut | Description |
|----------|--------|-------------|
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1` | API météo gratuite |

---

## 16. RÈGLES DE DÉVELOPPEMENT

### 16.1 Conventions
- Langue des commentaires : **Français**
- Langue du code : **Anglais** (variables, fonctions, types)
- Formatage : Prettier (single quote, trailing comma, tabWidth 2)
- TypeScript : ESLint + @typescript-eslint/recommended
- Python : ruff (linting)
- Commits : Pas de convention stricte imposée

### 16.2 Structure des PR
- Merge dans develop d'abord, puis main
- Template PR non encore implémenté (fichier à créer)

### 16.3 Gestion des dépendances
- npm workspaces (pas de package.json en double inutile)
- Turborepo pour orchestration (build, test, lint, dev)
- Python : requirements.txt (ml-inference-service, spark-jobs)

### 16.4 Variables d'environnement
- Copier `.env.example` → `.env`
- `.env` ne doit jamais être commité
- Docker Compose utilise `--env-file .env` explicitement

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
- Python 3.11 (pour ml-inference-service et scripts)

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
2. Vérifier l'état du service ML :
```bash
curl http://localhost:8000/health
# attendre: { "models_loaded": true, "demo_mode": false }
```
3. Vérifier les métriques :
```bash
curl http://localhost:8000/metrics | grep ml_predictions_total || true
```
4. Requête Prometheus :
```bash
curl -sG --data-urlencode "query=sum(rate(ml_predictions_total[1m]))*60" "http://localhost:9090/api/v1/query"
```
5. Contrôler les documents MongoDB :
```bash
docker compose -f infra/docker/docker-compose.yml exec -T mongodb \
  mongosh -u ${MONGO_USER:-alkatra} -p ${MONGO_PASSWORD:-123} --authenticationDatabase admin \
  --eval "db.getSiblingDB('alkatra_iot').irrigation_recommendations.find().sort({created_at:-1}).limit(5).pretty()"
```
6. Ouvrir Grafana → dossier "Al Katra IoT" → dashboards.

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

### 18.1 Ports utilisés

| Port | Service |
|------|---------|
| 3005 | iot-service |
| 3001 | auth-service |
| 8000 | ml-inference-service |
| 5432 | Postgres |
| 27017 | MongoDB |
| 6379 | Redis |
| 9092/9094 | Kafka |
| 1883/9010 | Mosquitto (MQTT/WebSocket) |
| 5001 | MLflow |
| 9000/9001 | MinIO (API/Console) |
| 1025/8025 | MailHog (SMTP/UI) |
| 8081 | Keycloak |
| 9090 | Prometheus |
| 3000 | Grafana |
| 8090 | Kafka UI |

### 18.2 Fichiers de référence critique

| Fichier | Contenu |
|---------|---------|
| `infra/docker/docker-compose.yml` | Stack complète (431 lignes, 15 services) |
| `infra/postgres/init.sql` | Schéma Postgres (407 lignes) |
| `infra/kafka/topics.sh` | Création des 6 topics Kafka |
| `apps/iot-service/src/mqtt/mqtt.service.ts` | Coeur du pipeline IoT (314 lignes) |
| `apps/ml-inference-service/app/services/model_service.py` | Coeur du modèle ML (242 lignes) |
| `apps/ml-inference-service/app/schemas/prediction.py` | Contrat 22 features Pydantic |
| `apps/spark-jobs/jobs/sensor_stream_processor.py` | Pipeline Spark Streaming (337 lignes) |
| `apps/spark-jobs/jobs/feature_engineering.py` | ETo Penman-Monteith + Kc (163 lignes) |
| `apps/spark-jobs/jobs/state_manager.py` | Gestion état Redis (139 lignes) |
| `packages/shared-types/src/sensor.types.ts` | Types TypeScript capteurs |
| `scripts/simulate-sensor.js` | Simulateur capteur MQTT |
| `scripts/register-models.py` | Enregistrement modèles MLflow |

---

## 19. ANNEXES

### 19.1 Problèmes connus / Limitations

| # | Problème | Sévérité | Statut |
|---|----------|----------|--------|
| 1 | **Merge conflict** dans `apps/spark-jobs/requirements.txt` | 🔴 Haute | À corriger |
| 2 | **CODEOWNERS et PR_TEMPLATE absents** du dossier `.github/` | 🟡 Moyenne | Documentés mais inexistants |
| 3 | **Mosquitto port 9010** (documenté 9001) | 🟡 Moyenne | Incohérence doc/code |
| 4 | **Notebook Jupyter** (`docs/model IA.ipynb`) absent du dépôt | 🟡 Moyenne | Mentionné mais inexistant |
| 5 | **Dataset** (`dataset_irrigation_FINAL.csv`) absent du dépôt | 🟡 Moyenne | Mentionné mais inexistant |
| 6 | **setup.sh** référence MLflow port 5000 (doit être 5001) | 🟡 Moyenne | Bug dans script |
| 7 | **Kubernetes jamais utilisé** → pas de déploiement prod | 🟡 Moyenne | Phase future |
| 8 | **Consumer ML écoute processed-sensor-data** mais Spark pas actif | 🟡 Moyenne | Blocage pipeline |
| 9 | **farm.types.ts** mentionné mais inexistant dans shared-types | 🟡 Moyenne | Documentation erronée |
| 10 | **shared-utils vide** | 🟢 Basse | À implémenter |
| 11 | **Services vides** (farm, user, recommendation, alert) | 🟢 Basse | Phase 1 |
| 12 | **Pas d'application mobile/front-end** | 🟢 Basse | Phase 0 |
| 13 | **Tokens JWT non configurés** | 🟢 Basse | Phase 1 |

### 19.2 Checklist de déploiement (quand prêt)
- [ ] Résoudre le merge conflict dans `apps/spark-jobs/requirements.txt`
- [ ] Corriger `setup.sh` (port MLflow 5000 → 5001)
- [ ] Ajouter CI/CD Kubernetes
- [ ] Configurer Mosquitto prod (auth + TLS)
- [ ] Remplacer les passwords par défaut
- [ ] Configurer domaines et certificats SSL
- [ ] Mettre en place la persistence Kafka
- [ ] Configurer les backups Postgres
- [ ] Activer auth Keycloak pour tous les services

### 19.3 Notes de version

**v2.0.0 (26/06/2026) — Audit complet**
- Correction de 49 incohérences entre documentation et code
- Ajout de la documentation spark-jobs complète (3 jobs + tests)
- Ajout de 18 variables d'environnement manquantes
- Correction du compte Docker (14 → 15 services)
- Ajout du workflow CI spark
- Suppression des références à des fichiers inexistants (notebook, dataset)
- Documentation de la collection MongoDB et0
- Mise à jour des ports Mosquitto (9001 → 9010)

---

*Fin du skill v2.0 — Audit basé sur le commit 208f167b7a2002e42c3ac0ff6f6ae15218638683 — Projet Al Katra Bel Qatra*