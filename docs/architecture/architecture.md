# Architecture technique

Ce document présente la vue technique d'ensemble de la plateforme Al Katra Bel Qatra : les services, leurs interactions, le pipeline de données, la persistance et l'observabilité. Il sert de point d'entrée pour comprendre comment les composants s'articulent.

Pour le détail d'un service précis, se reporter au guide correspondant dans `docs/guides/`. Pour une vue produit, voir [`project-overview.md`](project-overview.md). Pour la carte exhaustive du dépôt, voir [`repository-map.md`](repository-map.md).

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Pipeline de données IoT vers IA](#2-pipeline-de-données-iot-vers-ia)
3. [Stack technologique](#3-stack-technologique)
4. [Communication inter-services](#4-communication-inter-services)
5. [Persistance](#5-persistance)
6. [Observabilité](#6-observabilité)
7. [Sécurité](#7-sécurité)

---

## 1. Vue d'ensemble

La plateforme est un monorepo de 8 services applicatifs soutenus par une stack d'infrastructure Docker locale. Les services se répartissent en trois catégories :

- **Services métier** (NestJS, profil Docker `phase1`) : `auth-service`, `user-service`, `farm-service`, `recommendation-service`, `alert-service`. Ces services exposent des API REST consommées par les clients à travers l'API Gateway Nginx.
- **Services de données** : `iot-service` (NestJS, ingestion MQTT), `spark-jobs` (PySpark, feature engineering), `ml-inference-service` (FastAPI, inférence). Ces services forment le pipeline asynchrone qui transforme les mesures capteur en recommandations.
- `alert-service` (NestJS, port 3006) centralise les notifications : alertes in-app (PostgreSQL), push FCM et traçabilité Kafka ; il consomme `recommendations-generated` (stress hydrique critique) et reçoit les événements capteurs de farm-service (silencieux > 2 h, défaillant > 24 h, batterie faible — seuils configurables).

```
                      Clients (web/PWA)
                            │
                            ▼
                     ┌──────────────┐
                     │ API Gateway  │  (Nginx, port 8080)
                     │   Nginx      │  rate limiting + headers OWASP
                     └──────┬───────┘
            ┌───────────────┼───────────────┬──────────────┐
            ▼               ▼               ▼              ▼
       auth-service    user-service    farm-service   recommendation
        (3001)           (3002)          (3003)       -service (3004)
            │               │               │              │
            │  HTTP interne │               │ HTTP interne │
            └───────────────┘               └──────────────┘
                                                (verifyUserExists,
                                                 assertParcelOwnership)

                      ┌──────────────────────────────────────┐
                      │     Pipeline asynchrone (Kafka)       │
                      │                                       │
   ESP32 ──MQTT──▶ iot-service ──raw-sensor-data──▶ spark-jobs
                     │  (3005)                          │
                     │                                  ▼
                     │                          processed-sensor-data
                     │                                  │
                     │                                  ▼
                     │                          ml-inference-service
                     │                                  (8000)
                     │                                  │
                     │                          recommendations-generated
                     │                                  │
                     │                                  ▼
                     │                          recommendation-service
                     │                                  (3004)
                     │                                  │
                     ▼                                  ▼
                  MongoDB                         PostgreSQL
              (ai_sensor_features)            (recommendation_db)
```

---

## 2. Pipeline de données IoT vers IA

Le pipeline est le cœur fonctionnel de la plateforme. Il transforme les mesures capteur brutes en recommandations d'irrigation consultables par l'agriculteur.

### Étape 1 — Ingestion (iot-service)

Le capteur (ESP32 physique ou simulateur `scripts/simulate-sensor.js`) publie sur le topic MQTT :

```
alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
```

Le `iot-service` (NestJS, port 3005) :
- Souscrit au wildcard `alkatra/farm/+/parcel/+/sensor/+/data` via Mosquitto
- Valide la présence des 7 variables IA (voir [`../reference/iot-sensor-payload.md`](../reference/iot-sensor-payload.md))
- Applique les alias de champs (ex. `tmin` → `temperature_min_c`)
- Détecte les anomalies (température, humidité, vent, rayonnement, pluie)
- Publie le message validé sur le topic Kafka `raw-sensor-data` avec la clé `{farm_id}:{parcel_id}`

### Étape 2 — Persistance brute (iot-service consumer)

Un consumer du même `iot-service` (group `iot-service-mongodb-persister`) lit `raw-sensor-data` et persiste chaque lecture dans MongoDB, collection `ai_sensor_features` (TTL 90 jours).

### Étape 3 — Feature engineering (spark-jobs)

Le job `sensor_stream_processor.py` (PySpark Structured Streaming, trigger 30 s) :
- Lit `raw-sensor-data`
- Pour chaque batch :
  - Calcule l'évapotranspiration ETo (Penman-Monteith FAO-56 simplifié)
  - Applique le coefficient cultural Kc de l'olivier (phénologique, variable par mois)
  - Récupère l'état journalier de la parcelle depuis Redis (clés `day0..day3`, rotation à J)
  - Produit 22 features dérivées dans l'ordre canonique attendu par le modèle
- Publie sur le topic Kafka `processed-sensor-data`

### Étape 4 — Inférence (ml-inference-service)

Le `ml-inference-service` (FastAPI, port 8000) consomme `processed-sensor-data` (group `ml-inference-group`) :
- Charge deux Boosters XGBoost depuis MLflow (`AlKatra-Classifier/Production` et `AlKatra-Regressor/Production`)
- Applique la classification (seuil 0.35) pour décider d'irriguer ou non
- Si irrigation : régression log1p inversée → quantité en mm, puis biais Digital Twin (borné ±5 mm)
- Calcule les facteurs SHAP (top 5) avec labels FR/AR
- Génère un `reason_code` et des explications en français et darija
- Persiste dans MongoDB (`irrigation_recommendations`)
- Publie sur le topic Kafka `recommendations-generated` (clé = `parcel_id`)

Un mode démo (`demo_mode`) prend le relais après 6 échecs de chargement du modèle (30 s) : le service répond mais marque les prédictions comme `demo_mode: true`.

### Étape 5 — Projection vers PostgreSQL (recommendation-service)

Le `recommendation-service` (NestJS, port 3004) consomme `recommendations-generated` :
- Applique l'idempotence via la contrainte `UNIQUE (parcel_id, generated_at)`
- En cas d'erreur, publie sur la dead letter queue `recommendations-generated-dlq`
- Persiste dans PostgreSQL (`recommendation_db`)
- Expose l'API REST consultée par l'agriculteur

### Les 22 features du modèle

L'ordre canonique est partagé entre `feature_engineering.py` (Spark) et `prediction.py` (ml-inference) :

```
temperature_min_c, temperature_max_c, wind_speed_ms,
solar_radiation_mj_m2_day, soil_humidity_pct, air_humidity_pct,
rain_mm_day, et0, kc, cumulated_rain_1d, cumulated_rain_2d,
cumulated_rain_3d, cumulated_rain_4d, soil_humidity_yesterday,
soil_humidity_d2, soil_humidity_d3, air_humidity_yesterday,
air_humidity_d2, air_humidity_d3, temperature_yesterday_min_c,
temperature_yesterday_max_c, temperature_d2_max_c
```

(La liste exacte est définie dans `apps/ml-inference-service/app/schemas/prediction.py`.)

---

## 3. Stack technologique

| Catégorie | Technologie | Version |
|---|---|---|
| Services backend | NestJS, TypeScript | NestJS 11, Node 20+ |
| Service ML | FastAPI, Python | Python 3.11 |
| Jobs Spark | PySpark | 3.5.1 (image apache/spark) |
| ORM | TypeORM | NestJS-compatible |
| Authentification | Passport + passport-jwt | HS256, secret partagé |
| Base relationnelle | PostgreSQL + PostGIS | 16 + 3.4 |
| Base documents | MongoDB | 7.0 |
| Cache / état | Redis | 7.2 |
| Streaming | Apache Kafka (KRaft) | 3.7.0 |
| IoT | MQTT | Mosquitto 2.0 |
| MLOps | MLflow + MinIO (S3) | — |
| Observabilité | Prometheus + Alertmanager + Grafana + Loki | — |
| API Gateway | Nginx (envsubst) | alpine |
| Orchestration | Docker Compose + Turborepo | — |
| CI/CD | GitHub Actions | Node 20, Python 3.11 |

---

## 4. Communication inter-services

### Synchrone (HTTP)

| Depuis | Vers | Endpoint | Usage |
|---|---|---|---|
| Client → gateway → auth-service | — | `/api/v1/auth/*`, `/api/v1/user/profile` | Authentification et profil |
| Client → gateway → user-service | — | `/api/v1/user/profile` | Proxy public vers auth-service |
| Client → gateway → farm-service | — | `/api/v1/farms`, `/parcels`, `/sensors` | Gestion fermes |
| user-service → auth-service | interne | `GET/PATCH /internal/user/:userId` | Profil utilisateur (proxy) |
| farm-service → auth-service | interne | `GET /internal/user/:userId` | Vérification existence utilisateur |
| recommendation-service → farm-service | interne | Vérification propriété parcelle | `assertParcelOwnership` via circuit breaker |

Les endpoints `/internal/*` ne sont pas protégés par guard : ils sont réservés au réseau interne Docker et ne sont pas exposés via la gateway.

### Asynchrone (Kafka)

Voir [`../AL-KATRA-SKILL.md`](../AL-KATRA-SKILL.md) §8 pour la table exhaustive des topics. Le flux principal :

```
raw-sensor-data → processed-sensor-data → recommendations-generated
                                                         │
                                                         └─ (erreurs) → recommendations-generated-dlq
```

---

## 5. Persistance

### Principe : un service = une base

Chaque service métier possède sa propre base PostgreSQL avec un utilisateur dédié et des droits restreints. Les connexions cross-base sont interdites (pas de schéma `public` partagé). La décision relève de l'architecture micro-services : un service ne connaît que sa base.

### PostgreSQL (multi-bases)

| Base | Service | Tables principales |
|---|---|---|
| `auth_db` | auth-service | `users` |
| `farm_db` | farm-service | `farms`, `parcels`, `sensors` (avec PostGIS pour la géométrie ; `health_status` = machine à états santé capteurs) |
| `recommendation_db` | recommendation-service | `recommendations` |
| `notification_db` | alert-service | `alerts`, `device_tokens` |
| `keycloak_db` | Keycloak | (gérée par Keycloak) |
| `mlflow_db` | MLflow | (gérée par MLflow Alembic) |

Initialisation : `infra/postgres/00-create-databases.sh` crée les bases et utilisateurs, applique les `REVOKE` sur `public`, puis exécute les schémas SQL de `infra/postgres/schemas/`. Schéma complet dans [`../reference/postgres-databases.md`](../reference/postgres-databases.md).

### MongoDB (base `alkatra_iot`)

| Collection | Service | Usage |
|---|---|---|
| `ai_sensor_features` | iot-service | Lectures capteur brutes (TTL 90 j) |
| `irrigation_recommendations` | ml-inference-service | Recommandations produites par le modèle |

### Redis

- **auth-service** : stockage OTP (clés `otp:*`, `otp:attempts:*`, `otp:blocked:*`) avec TTL configurable
- **spark-jobs** : état journalier par parcelle (clés `alkatra:state:<parcel_id>:day0..day3`, TTL 5 j, rotation à J)

---

## 6. Observabilité

### Prometheus

Le serveur Prometheus (port 9090, `scrape_interval` global 15 s, `evaluation_interval` 15 s) scrape les endpoints `/metrics` de l'ensemble des services applicatifs et des exporters d'infrastructure :

| Job | Cible | Rythme |
|---|---|---|
| `prometheus` | `localhost:9090` | Self-monitoring |
| `alertmanager` / `pushgateway` | `alertmanager:9093` / `pushgateway:9091` | Chaîne d'alerting / métriques Spark |
| `iot-service` | `iot-service:3005` | **5 s** (temps réel) |
| `ml-inference-service` | `ml-inference-service:8000` | **5 s** (temps réel) |
| `auth-service`, `user-service`, `farm-service`, `recommendation-service`, `alert-service` | ports 3001–3006 | 15 s |
| `postgres-exporter`, `mongodb-exporter`, `redis-exporter`, `kafka-exporter` | 9187 / 9216 / 9121 / 9308 | Infrastructure |
| `blackbox-core` | via `blackbox-exporter:9115` | Probes stack de base — **alertées** |
| `blackbox-phase1` | via `blackbox-exporter:9115` | Probes services métier — dashboards uniquement |

Tous les services (y compris `farm-service`, `recommendation-service` et `alert-service`) sont scrapés. Les règles de `infra/prometheus/rules/` (`recording.yml`, `alerts-infra.yml`, `alerts-pipeline.yml`, `alerts-services.yml`) sont évaluées toutes les 15 s ; les alertes sont routées vers **Alertmanager** puis envoyées par email (SMTP MailHog en dev). Voir [ADR-0005](../adr/0005-alerting-prometheus-alertmanager.md) et [guides/observability.md](../guides/observability.md).

### Grafana

14 dashboards provisionnés automatiquement (`infra/grafana/dashboards/`), organisés en dossiers par domaine : `00-overview`, `10-infrastructure`, `20-pipeline`, `30-services`, `40-ml`, `50-alerting`. Les datasources Prometheus et Loki sont référencées par nom (pas d'UID forcé), voir [ADR-0003](../adr/0003-grafana-dashboard-provisioning.md).

### Loki + Promtail

Les logs de tous les conteneurs sont collectés par Promtail et centralisés dans Loki (rétention 7 j), explorables dans Grafana → Explore (datasource `Loki`). Les logs JSON de la gateway Nginx sont directement structurés.

### MLflow

MLflow écoute sur le port **5001** et utilise :
- **Backend store** : PostgreSQL (`mlflow_db`)
- **Artifact store** : MinIO (`s3://mlflow-artifacts`)

Les modèles sont enregistrés dans le registry sous les noms `AlKatra-Classifier` et `AlKatra-Regressor`, stage `Production`. Le runtime local est documenté dans [ADR-0004](../adr/0004-mlflow-local-runtime.md).

### Health checks

Chaque service NestJS expose `GET /api/v1/health/live` (liveness) et `GET /api/v1/health/ready` (readiness avec vérification de la DB et des dépendances externes). Le ml-inference-service expose `GET /health`. Ces endpoints sont consommés par les healthchecks Docker et par la readiness du gateway.

---

## 7. Sécurité

### Authentification

- **JWT HS256** signé par `auth-service` avec un secret partagé (`JWT_SECRET`)
- Tokens : access (1 h par défaut) + refresh (30 j par défaut)
- Les autres services NestJS valident les tokens via Passport + passport-jwt en lecture seule (pas d'émission)
- Stratégie : `JwtStrategy.validate()` extrait `payload.sub` → `{ userId, phone }`

### OTP

- Inscription par numéro de téléphone (format E.164)
- OTP à 6 chiffres, TTL configurable (`OTP_TTL_SECONDS`, défaut 300 s)
- Anti-bruteforce : blocage après `OTP_MAX_ATTEMPTS` tentatives, pendant `OTP_BLOCK_DURATION_SECONDS` (défaut 1800 s)
- Stockage Redis avec namespaces séparés (`otp:`, `otp:attempts:`, `otp:blocked:`)

### Keycloak

Keycloak est déployé (port 8081) mais n'est pas l'authentificateur produit. Le module `keycloak` d'`auth-service` expose des fonctions de diagnostic (`getAdminToken`, `realmExists`, `clientExists`) pour vérifier la configuration du realm. L'intégration OIDC complète est reservée à une phase ultérieure.

### API Gateway

- Rate limiting : `auth_limit` (10 r/s) sur `/api/v1/auth/`, `api_limit` (30 r/s) sur `/api/v1/farms`, `/parcels`, `/sensors`
- Headers de sécurité OWASP (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.)
- Logs au format JSON
- `client_max_body_size 10M`

### Isolation des données

- Chaque ressource métier (ferme, parcelle, capteur, recommandation) est filtrée par `userId` (issu du JWT) au niveau du service
- Les endpoints `/internal/*` contournent cette isolation (réseau interne uniquement)
- La base PostgreSQL est strictement isolée par service (droits REVOKE sur `public`)
