# `apps/ml-inference-service` — Documentation factuelle

> **Mise à jour : août 2026** — Cette documentation reflète l'état réel du code source, de la configuration et des tests. Elle est basée uniquement sur le code implémenté, pas sur les commentaires.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complète)
4. [Démarrage](#4-démarrage)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Routes HTTP](#6-routes-http)
7. [Fonctionnement interne par fichier](#7-fonctionnement-interne-par-fichier)
8. [Chargement du modèle (MLflow)](#8-chargement-du-modèle-mlflow)
9. [Logique de prédiction (régression conditionnelle)](#9-logique-de-prédiction-régression-conditionnelle)
10. [Pipeline Kafka (consumer + producer)](#10-pipeline-kafka-consumer--producer)
11. [Persistance MongoDB](#11-persistance-mongodb)
12. [Observabilité (métriques Prometheus)](#12-observabilité-métriques-prometheus)
13. [Gestion des erreurs et demo_mode](#13-gestion-des-erreurs-et-demo_mode)
14. [Health checks](#14-health-checks)
15. [Tests](#15-tests)
16. [Docker](#16-docker)
17. [Ce que le service NE fait PAS](#17-ce-que-le-service-ne-fait-pas)
18. [Limites constatées](#18-limites-constatées)
19. [Résumé opérationnel](#19-résumé-opérationnel)

---

## 1. Rôle du service

`ml-inference-service` est un microservice FastAPI (Python 3.11, port 8000) qui constitue le **cœur prédictif** de la plateforme. Il reçoit des données capteurs (22 features), exécute deux modèles XGBoost (classifieur + régresseur) pour prédire s'il faut irriguer et quelle quantité d'eau apporter, puis publie les recommandations vers Kafka et MongoDB.

**Ce qu'il fait :**

- Il consomme le topic Kafka `processed-sensor-data` (messages 22 features issues du pipeline Spark)
- Il valide strictement la présence des 22 features (rejette les messages incomplets)
- Il charge deux modèles XGBoost depuis MLflow Model Registry (stage `Production`)
- Il applique une **régression conditionnelle** : classification → si irrigation, régression pour la quantité
- Il applique un **biais Digital Twin** par parcelle (ajustement spécifique au champ)
- Il génère des **explications SHAP** (top 5 facteurs) avec labels FR/AR
- Il sauvegarde chaque recommandation dans MongoDB (`irrigation_recommendations`)
- Il publie chaque recommandation sur le topic Kafka `recommendations-generated`
- Il expose un endpoint HTTP `POST /predict` pour des prédictions à la demande
- Il expose des métriques Prometheus (`/metrics`)
- Il gère un **mode démo** (fallback si les modèles ne se chargent pas)

**Ce qu'il ne fait PAS :**

- ❌ Il ne consomme pas directement MQTT (rôle de l'`iot-service`)
- ❌ Il ne fait pas le feature engineering (rôle des `spark-jobs` — il reçoit les 22 features prêtes)
- ❌ Il ne persiste pas dans PostgreSQL (rôle du `recommendation-service` en aval)
- ❌ Il ne calcule pas `duration_minutes` (le débit/surface ne sont pas des features d'entrée)

---

## 2. Architecture et flux

### Flux principal (Kafka → prédiction → Kafka + MongoDB)

```
spark-jobs
  └→ publie 22 features sur Kafka "processed-sensor-data"
                                              │
                                              ▼
ml-inference-service
  ├── Kafka consumer (thread daemon)
  │     ├── validation stricte des 22 features
  │     ├── model_service.predict(req)
  │     │     ├── classification (should_irrigate ?)
  │     │     ├── régression conditionnelle (water_amount_mm)
  │     │     ├── biais Digital Twin
  │     │     └── explications SHAP (top 5)
  │     ├── MongoWriter.save() → MongoDB "irrigation_recommendations"
  │     └── KafkaRecommendationProducer.publish() → Kafka "recommendations-generated"
  │
  └── HTTP POST /predict (même logique, sans MongoDB)
```

### Flux HTTP (prédiction à la demande)

```
Client ──POST /predict (22 features)──▶ ml-inference-service
                                          ├── model_service.predict()
                                          ├── (pas de MongoDB)
                                          └── KafkaRecommendationProducer.publish()
                                                   │
                                                   ▼
                                        Kafka "recommendations-generated"
                                                   │
                                                   ▼
                                        recommendation-service (consumer)
```

### Architecture des dépendances

```
ml-inference-service (port 8000)
│
├── MLflow (Model Registry, port 5001)
│   ├── models:/AlKatra-Classifier/Production
│   ├── models:/AlKatra-Regressor/Production
│   └── artefact bias : bias/champ_bias_dict.joblib
│       (stockage S3 via MinIO, port 9000)
│
├── Kafka
│   ├── Consumer : topic "processed-sensor-data" (group: ml-inference-group)
│   └── Producer : topic "recommendations-generated"
│
└── MongoDB — alkatra_iot.irrigation_recommendations
```

---

## 3. Arborescence complète

```
apps/ml-inference-service/
├── Dockerfile                            # Image single-stage (python:3.11-slim)
├── requirements.txt                      # Dépendances Python (versions pinées)
│
├── app/
│   ├── config.py                         # Configuration centralisée (Settings)
│   ├── main.py                           # Point d'entrée FastAPI (lifespan, endpoints)
│   │
│   ├── core/
│   │   └── metrics.py                    # Métriques Prometheus (4 métriques)
│   │
│   ├── schemas/
│   │   └── prediction.py                 # Schémas Pydantic (PredictionRequest, PredictionResponse)
│   │
│   └── services/
│       ├── model_service.py              # Service de prédiction (classifieur + régresseur + biais)
│       ├── kafka_consumer.py             # Consumer Kafka (thread daemon)
│       ├── kafka_producer.py             # Producer Kafka (publication recommandations)
│       └── mongo_writer.py               # Écriture MongoDB
│
└── tests/
    ├── test_model_service.py             # Tests du service de prédiction
    └── test_predict_endpoint.py          # Test de l'endpoint /predict
```

> **Note :** Aucun fichier `__init__.py` n'existe — les packages reposent sur les **namespace packages implicites** (PEP 420). Aucun routeur FastAPI séparé : les 3 endpoints sont définis directement dans `app/main.py`.

---

## 4. Démarrage

### En local (développement)

```bash
cd apps/ml-inference-service

# Installer les dépendances
pip install -r requirements.txt

# Démarrer le serveur (avec reload)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Lancer les tests
pytest tests/
```

### Dans Docker

```bash
# Depuis la racine du monorepo
npm run docker:up    # Démarre toute la stack (incluant ml-inference-service)
```

### Prérequis

- **MLflow** accessible à `MLFLOW_TRACKING_URI` (défaut : `http://mlflow:5001`)
- **Modèles entraînés** enregistrés dans le Model Registry :
  - `AlKatra-Classifier` (stage `Production`)
  - `AlKatra-Regressor` (stage `Production`)
  - Run `digital-twin-bias-registration` avec l'artefact `bias/champ_bias_dict.joblib`
- **MinIO** (S3) pour le stockage des artefacts MLflow (`MLFLOW_S3_ENDPOINT_URL`)
- **Kafka** accessible avec le topic `processed-sensor-data`
- **MongoDB** accessible pour la persistance des recommandations

> ⚠️ Si MLflow ou les modèles sont indisponibles au démarrage, le service bascule en **`demo_mode`** après `MODEL_LOAD_RETRIES` tentatives (voir [section 13](#13-gestion-des-erreurs-et-demo_mode)).

---

## 5. Variables d'environnement

### Configuration centralisée (`app/config.py`)

La configuration est une classe `Settings` simple qui lit les variables d'environnement via `os.getenv`.

### Tableau récapitulatif

| Variable | Défaut | Utilisation |
|----------|--------|-------------|
| `ENVIRONMENT` | `development` | Environnement |
| `LOG_LEVEL` | `INFO` | Niveau de logging |
| `MLFLOW_TRACKING_URI` | `http://mlflow:5001` | URI du serveur MLflow |
| `MLFLOW_CLASSIFIER_NAME` | `AlKatra-Classifier` | Nom du modèle classifieur dans le Registry |
| `MLFLOW_REGRESSOR_NAME` | `AlKatra-Regressor` | Nom du modèle régresseur dans le Registry |
| `MLFLOW_MODEL_STAGE` | `Production` | Stage du modèle (⚠️ non utilisé — codé en dur à `Production` dans l'URI) |
| `KAFKA_BROKERS` | `kafka:9092` | Brokers Kafka |
| `KAFKA_INPUT_TOPIC` | `processed-sensor-data` | Topic source (consumer) |
| `KAFKA_OUTPUT_TOPIC` | `recommendations-generated` | Topic destination (producer) |
| `KAFKA_GROUP_ID` | `ml-inference-group` | Group ID du consumer |
| `KAFKA_AUTO_OFFSET_RESET` | `latest` | Offset de démarrage du consumer |
| `ENABLE_KAFKA_CONSUMER` | `true` | Active/désactive le consumer Kafka |
| `ENABLE_KAFKA_PRODUCER` | `true` | Active/désactive le producer Kafka |
| `MONGODB_URI` | `mongodb://...` | URI MongoDB |
| `MONGO_DB` | `alkatra_iot` | Base MongoDB |
| `MONGO_RECO_COLLECTION` | `irrigation_recommendations` | Collection des recommandations |
| `CLASSIFICATION_THRESHOLD` | `0.35` | Seuil de classification (≥ → irriguer) |
| `MODEL_LOAD_RETRIES` | `6` | Tentatives de chargement avant demo_mode |
| `MODEL_LOAD_DELAY` | `5` | Délai entre tentatives (secondes) |
| `AWS_ACCESS_KEY_ID` | — | Accès MinIO (artefacts MLflow) |
| `AWS_SECRET_ACCESS_KEY` | — | Accès MinIO |
| `MLFLOW_S3_ENDPOINT_URL` | `http://minio:9000` | Endpoint S3 (MinIO) |

---

## 6. Routes HTTP

### Endpoints définis dans `app/main.py`

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/health` | État du service : `status` (`ok`/`degraded`), `demo_mode`, `models_loaded`, `mlflow_uri`. |
| `POST` | `/predict` | Prédiction à la demande. Reçoit `PredictionRequest` (22 features), retourne `PredictionResponse`. Publie sur Kafka si producer activé. |
| `GET` | `/metrics` | Métriques Prometheus au format texte (`prometheus_client.generate_latest`). |

### `POST /predict` — Corps de requête

Les 22 features dans l'ordre exact attendu par le modèle :

```json
{
  "parcel_id": "parcel_test_001",
  "temp_max": 34.7,
  "temp_min": 13.2,
  "temp_moy": 24.0,
  "delta_temp": 21.5,
  "humidite_air": 61.3,
  "vent": 4.1,
  "rayonnement": 22.8,
  "pluie": 3.4,
  "ET0_mm": 5.2,
  "ETc": 4.1,
  "humidite_sol_avant_%": 46.5,
  "humidite_sol_rolling3": 48.0,
  "jour_annee": 180,
  "mois": 6,
  "jour_semaine": 3,
  "humidite_sol_j-1": 49.0,
  "pluie_j-1": 0.0,
  "ETc_j-1": 3.9,
  "pluie_3j": 3.4,
  "eto_hum_ratio": 0.11,
  "deficit_hydrique": -2.5,
  "regime_sol": 1
}
```

> 4 features ont des noms non valides en Python (`humidite_sol_avant_%`, `humidite_sol_j-1`, `pluie_j-1`, `ETc_j-1`). Pydantic les accepte via des **alias** et les expose sous des noms Python valides (`humidite_sol_avant_pct`, `humidite_sol_j1`, etc.).

### `POST /predict` — Réponse

```json
{
  "parcel_id": "parcel_test_001",
  "should_irrigate": true,
  "irrigation_probability": 0.82,
  "water_amount_mm": 6.5,
  "water_amount_raw_mm": 6.3,
  "bias_applied_mm": 0.2,
  "top_factors": [
    { "feature": "humidite_sol_avant_%", "label_fr": "Humidité sol actuelle", "label_ar": "رطوبة التربة الحالية", "contribution": 1.23 },
    ...
  ],
  "demo_mode": false,
  "model_version": "1.0.0",
  "duration_minutes": null,
  "soil_humidity_pct": 46.5,
  "eto": 5.2,
  "generated_at": "2026-08-06T14:00:00.000000+00:00"
}
```

---

## 7. Fonctionnement interne par fichier

### Détail par fichier source

| Fichier | Rôle réel |
|---------|-----------|
| `app/main.py` | Point d'entrée FastAPI. `lifespan` : charge les modèles (`model_service.load()`), initialise le Producer Kafka, puis le Consumer Kafka + MongoWriter (sauf en demo_mode). 3 endpoints : `/health`, `/predict`, `/metrics`. Le shutdown ferme le consumer, MongoWriter et Producer. |
| `app/config.py` | Classe `Settings`. Lit toutes les variables d'environnement avec valeurs par défaut. Instance globale `settings`. |
| `app/core/metrics.py` | Définit 4 métriques Prometheus (voir [section 12](#12-observabilité-métriques-prometheus)). |
| `app/schemas/prediction.py` | Schémas Pydantic. `FEATURE_NAMES` (22 features, ordre exact). `PredictionRequest` (22 features + `parcel_id`, avec alias pour les caractères spéciaux). `to_feature_dict()` reconstruit le dict avec les noms bruts du modèle. `PredictionResponse` avec champs de projection PostgreSQL (`duration_minutes`, `soil_humidity_pct`, `eto`, `generated_at`). |
| `app/services/model_service.py` | Service de prédiction. Charge 2 Boosters XGBoost + le biais depuis MLflow. `predict()` : classification → régression conditionnelle → biais → SHAP. Fonction `load()` avec retry + fallback demo_mode. Voir [sections 8 et 9](#8-chargement-du-modèle-mlflow). |
| `app/services/kafka_consumer.py` | Consumer Kafka (`MLKafkaConsumer`). Tourne dans un **thread daemon**. `_process()` : valide les 22 features → `predict()` → `mongo_writer.save()` → `kafka_producer.publish()`. |
| `app/services/kafka_producer.py` | Producer Kafka (`KafkaRecommendationProducer`). `publish()` : sérialise `PredictionResponse` en JSON, clé = `parcel_id`, publie sur `KAFKA_OUTPUT_TOPIC`. Connexion immédiate à l'init. |
| `app/services/mongo_writer.py` | Écriture MongoDB (`MongoWriter`). Crée un index `(parcel_id, created_at)`. `save()` : insère un document avec tous les champs de la recommandation + `source` + `created_at`. |

---

## 8. Chargement du modèle (MLflow)

### Constantes de registre (`model_service.py`)

```python
CLASSIFIER_MODEL_NAME = "AlKatra-Classifier"
REGRESSOR_MODEL_NAME = "AlKatra-Regressor"
CLASSIFICATION_THRESHOLD = 0.35   # ≥ 0.35 → irriguer
TOP_N_FACTORS = 5                 # top 5 facteurs SHAP
```

> ⚠️ Le stage est **codé en dur à `Production`** dans l'URI (`models:/AlKatra-Classifier/Production`). La variable `MLFLOW_MODEL_STAGE` existe dans la config mais **n'est pas utilisée** par `_load_booster`.

### Chargement des Boosters (`_load_booster`)

```python
model_uri = f"models:/{model_name}/Production"
model = mlflow.xgboost.load_model(model_uri)
if isinstance(model, xgb.XGBModel):
    model = model.get_booster()   # conversion défensive
```

Chargé deux fois : classifieur + régresseur. Conversion défensive si MLflow retourne un `XGBModel` au lieu d'un `Booster`.

### Chargement du biais Digital Twin (`_load_bias`)

Le biais est un dictionnaire `{parcel_id: correction_mm}` stocké comme artefact MLflow. Mécanisme en 4 étapes, **entièrement wrappé dans un try/except qui ne lève jamais** :

1. **Recherche du run** : itère sur tous les experiments MLflow, cherche le run nommé `digital-twin-bias-registration` (le plus récent).
2. **Téléchargement** : `client.download_artifacts(run_id, "bias/champ_bias_dict.joblib")` → `joblib.load()`.
3. **Normalisation** : conversion en `pd.Series`, bornage `clip(-5.0, 5.0)` (sécurité contre les valeurs aberrantes).
4. **Fallback** : en cas d'erreur (MLflow injoignable, artefact absent, etc.) → `pd.Series` vide → biais = 0.0 partout.

Le biais n'est appliqué **que si `should_irrigate` est vrai** (régression conditionnelle).

### Liste des 22 features (ordre canonique)

```
temp_max, temp_min, temp_moy, delta_temp,
humidite_air, vent, rayonnement, pluie,
ET0_mm, ETc, humidite_sol_avant_%, humidite_sol_rolling3,
jour_annee, mois, jour_semaine,
humidite_sol_j-1, pluie_j-1, ETc_j-1, pluie_3j,
eto_hum_ratio, deficit_hydrique, regime_sol
```

`FEATURE_NAMES` est défini **deux fois** de manière identique (`model_service.py` + `prediction.py`) — source unique de vérité pour l'ordre, mais **aucun test ne vérifie l'égalité** entre les deux.

`FEATURE_LABELS` (`model_service.py`) mappe chaque feature à `(label_fr, label_ar)` pour les explications SHAP.

---

## 9. Logique de prédiction (régression conditionnelle)

### Pipeline de `predict()`

```
1. Construction du DataFrame (22 features, ordre FEATURE_NAMES)
2. Classification
   proba = classifier.predict(dmatrix)
   should_irrigate = (proba >= 0.35)
3. Régression conditionnelle (uniquement si should_irrigate)
   pred_log = regressor.predict(dmatrix)
   q_pred = expm1(pred_log)              # inverse du log1p
   water_amount_raw = q_pred
   bias = bias_series.get(parcel_id, 0.0)
   water_amount = max(0, q_pred + bias)
   water_amount = round(water_amount * 2) / 2   # arrondi au 0.5 mm
4. Explications SHAP (top 5)
   contribs = regressor.predict(dmatrix, pred_contribs=True)
   tri par |contribution| décroissante → top 5
   labels FR/AR depuis FEATURE_LABELS
5. Construction de PredictionResponse
   + champs de projection : soil_humidity_pct, eto, generated_at
```

### Parité avec le notebook d'entraînement

Le service maintient une **parité stricte** avec `model_IA.ipynb` : régression conditionnelle, biais uniquement si irrigation, arrondi au 0.5 mm. L'objectif est que les prédictions en production soient identiques à celles du notebook.

---

## 10. Pipeline Kafka (consumer + producer)

### Consumer — `MLKafkaConsumer`

- Topic : `processed-sensor-data` (group : `ml-inference-group`)
- **Thread daemon** : la consommation est asynchrone par rapport à l'event loop uvicorn
- **Auto-commit activé** (`enable_auto_commit=True`) — pas de garantie at-least-once stricte
- `auto_offset_reset` : `latest`

#### Logique de `_process(payload)`

```
1. Extraire parcel_id (rejeter si absent → métrique "no_parcel")
2. Validation stricte des 22 features
   missing = [f for f in FEATURE_NAMES if f not in payload]
   si missing → rejeter + métrique "missing_features" (une par feature manquante)
3. Construire PredictionRequest (22 features + parcel_id)
4. response = model_service.predict(req)
5. Incrémenter PREDICTIONS_TOTAL (source="kafka")
6. MongoWriter.save(response, source="kafka")   ← persistance MongoDB
7. KafkaRecommendationProducer.publish(response) ← publication Kafka (si activé)
8. Incrémenter KAFKA_MESSAGES_TOTAL (status="ok")
```

> Le consumer n'est démarré que si `ENABLE_KAFKA_CONSUMER=true` **et** `not model_service.demo_mode`.

### Producer — `KafkaRecommendationProducer`

- Topic : `recommendations-generated` (`KAFKA_OUTPUT_TOPIC`)
- **Clé du message** : `parcel_id` (pour le partitioning — même parcelle = même partition)
- Connexion **immédiate** à l'instanciation (pas de lazy init)
- `publish()` : sérialise la `PredictionResponse` complète (y compris `duration_minutes`, `soil_humidity_pct`, `eto`, `generated_at`) en JSON, publie avec `flush(timeout=5)`
- En cas d'échec de publication → log erreur et **raise** (bloquant pour l'appelant)

#### Message publié

```json
{
  "parcel_id": "...",
  "should_irrigate": true,
  "irrigation_probability": 0.82,
  "water_amount_mm": 6.5,
  "water_amount_raw_mm": 6.3,
  "bias_applied_mm": 0.2,
  "top_factors": [...],
  "model_version": "1.0.0",
  "demo_mode": false,
  "duration_minutes": null,
  "soil_humidity_pct": 46.5,
  "eto": 5.2,
  "generated_at": "2026-08-06T14:00:00+00:00"
}
```

---

## 11. Persistance MongoDB

### Collection

`alkatra_iot.irrigation_recommendations` (`MONGO_DB` + `MONGO_RECO_COLLECTION`).

### Index

```python
self.col.create_index([("parcel_id", DESCENDING), ("created_at", DESCENDING)])
```

### Document inséré par `MongoWriter.save()`

| Champ | Source | Type |
|-------|--------|------|
| `parcel_id` | `response.parcel_id` | str |
| `should_irrigate` | `response.should_irrigate` | bool |
| `irrigation_probability` | `response.irrigation_probability` | float |
| `water_amount_mm` | `response.water_amount_mm` | float |
| `water_amount_raw_mm` | `response.water_amount_raw_mm` | float |
| `bias_applied_mm` | `response.bias_applied_mm` | float |
| `top_factors` | `[f.model_dump() for f in response.top_factors]` | list[dict] |
| `model_version` | `response.model_version` | str |
| `source` | argument (toujours `"kafka"`) | str |
| `created_at` | `datetime.now(timezone.utc)` | datetime UTC |

> ⚠️ Les prédictions via `/predict` (HTTP) **ne sont pas écrites dans MongoDB**. Seules les prédictions issues du consumer Kafka sont persistées (`source="kafka"`). Les prédictions HTTP sont uniquement publiées sur Kafka.

---

## 12. Observabilité (métriques Prometheus)

### Endpoint `/metrics`

```python
return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

Utilise `prometheus_client` (contrairement au recommendation-service qui génère le format à la main).

### Métriques définies (`app/core/metrics.py`)

| Nom Prometheus | Type | Labels | Description | Incrémenté depuis |
|----------------|------|--------|-------------|-------------------|
| `ml_predictions_total` | Counter | `source` (`http`/`kafka`), `result` (`irrigate`/`no_irrigate`) | Nombre total de prédictions | `main.py` (HTTP), `kafka_consumer.py` (Kafka) |
| `ml_missing_features_total` | Counter | `feature` | Messages rejetés (features manquantes) | `kafka_consumer.py` |
| `ml_prediction_latency_seconds` | Histogram | — | Latence d'une prédiction | `main.py` (HTTP uniquement) |
| `ml_kafka_messages_total` | Counter | `status` (`ok`/`error`/`no_parcel`/`missing_features`) | Messages Kafka traités | `kafka_consumer.py` |

> ⚠️ Aucune métrique de latence n'est exposée pour le chemin Kafka (seuls les appels HTTP `/predict` sont chronométrés). Aucune métrique de type `Gauge`. Les buckets de l'histogramme ne sont pas personnalisés (valeurs par défaut).

---

## 13. Gestion des erreurs et demo_mode

### Politique de retry (`load()`)

```python
for attempt in range(1, MODEL_LOAD_RETRIES + 1):   # défaut : 6 tentatives
    try:
        model_service.load_models()
        model_service.demo_mode = False
        return
    except Exception:
        sleep(MODEL_LOAD_DELAY)                      # défaut : 5 s

model_service.demo_mode = True   # fallback après épuisement des retries
```

Soit jusqu'à ~30 secondes de tentatives avant abandon.

### Comportement en `demo_mode`

| Composant | Comportement |
|-----------|-------------|
| Modèles | Non chargés (`_classifier` et `_regressor` sont `None`) |
| `/predict` | Lève `RuntimeError("Modèles non chargés...")` → HTTP 500 |
| `/health` | `status: "degraded"`, `demo_mode: true`, `models_loaded: false` |
| Consumer Kafka | **Non démarré** (`if ENABLE_KAFKA_CONSUMER and not demo_mode`) |
| MongoWriter | **Non démarré** |
| Producer Kafka | Démarré si `ENABLE_KAFKA_PRODUCER=true` (mais `publish()` échouera car `predict()` lève) |

> Le service démarre **même en demo_mode** — aucune exception n'est propagée au lifespan FastAPI. Cela permet au endpoint `/health` de signaler l'état dégradé.

### Gestion des erreurs dans `_process` (consumer)

Toute exception dans `_process` est capturée :
```python
except Exception as exc:
    logger.exception("Erreur traitement message: %s", exc)
    KAFKA_MESSAGES_TOTAL.labels(status="error").inc()
```
Le consumer **continue** à consommer après une erreur (pas de crash).

### Gestion des erreurs dans `/predict`

```python
except KeyError as exc:
    raise HTTPException(422, f"Feature manquante: {exc}")
except Exception as exc:
    raise HTTPException(500, str(exc))
```

---

## 14. Health checks

### `GET /health`

```json
// Modèles chargés
{
  "status": "ok",
  "demo_mode": false,
  "models_loaded": true,
  "mlflow_uri": "http://mlflow:5001"
}

// demo_mode (modèles non chargés)
{
  "status": "degraded",
  "demo_mode": true,
  "models_loaded": false,
  "mlflow_uri": "http://mlflow:5001"
}
```

`models_loaded` = `_classifier is not None and _regressor is not None`.

### Healthcheck Docker

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

---

## 15. Tests

### Fichiers de test

| Fichier | Ce qu'il teste |
|---------|----------------|
| `tests/test_model_service.py` | `FEATURE_NAMES` contient 22 éléments ; `to_feature_dict()` produit les bonnes clés ; comportement en mode démo |
| `tests/test_predict_endpoint.py` | Appel à `/predict` via `TestClient` en mode démo |

### Caractéristiques

- **Pas de `conftest.py`**, pas de fixtures partagées
- **Pas de configuration pytest** (`pytest.ini` / `pyproject.toml` absent)
- **Tests limités** : ne couvrent pas le consumer Kafka, le producer, le MongoWriter, le biais, la régression conditionnelle avec de vrais modèles
- Aucun test d'intégration contre MLflow/MongoDB/Kafka

### Commandes

```bash
pytest tests/ -v
```

---

## 16. Docker

### Dockerfile (single-stage)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Points clés du Dockerfile

| Élément | Valeur |
|---------|--------|
| Image de base | `python:3.11-slim` |
| Stages | **Single-stage** (pas de multi-stage) |
| Paquets système | `libgomp1` (OpenMP pour XGBoost), `curl` (healthcheck) |
| Ordre de copie | `requirements.txt` copié avant `app/` (cache couche pip) |
| Port exposé | 8000 |
| Healthcheck | `curl -f http://localhost:8000/health` (start-period 40s) |
| Commande | `uvicorn app.main:app --host 0.0.0.0 --port 8000` (1 worker, pas de reload) |
| Utilisateur | **root** (⚠️ pas d'utilisateur non-root) |

### docker-compose (section `ml-inference-service`)

| Élément | Valeur |
|---------|--------|
| `container_name` | `alkatra-ml` |
| `restart` | `unless-stopped` |
| `depends_on` | `kafka`, `mongodb`, `mlflow` (chacun `condition: service_healthy`) |
| Ports | `8000:8000` |
| Volumes | `mlflow_data:/mlruns` (partage filesystem artefacts MLflow) |
| Réseau | `alkatra-net` |

---

## 17. Ce que le service NE fait PAS

- ❌ Il ne consomme pas directement MQTT (rôle de l'`iot-service`)
- ❌ Il ne fait pas le feature engineering (rôle des `spark-jobs`)
- ❌ Il ne persiste pas dans PostgreSQL (rôle du `recommendation-service` en aval)
- ❌ Il ne calcule pas `duration_minutes` (le débit/surface ne sont pas des features d'entrée — laissé à `null`)
- ❌ Il ne persiste pas les prédictions HTTP dans MongoDB (seul le chemin Kafka persiste)
- ❌ Il n'utilise pas `MLFLOW_MODEL_STAGE` (le stage `Production` est codé en dur)
- ❌ Il n'a pas d'utilisateur non-root dans le Dockerfile
- ❌ Il n'a pas de test d'intégration (MLflow/MongoDB/Kafka réels)

---

## 18. Limites constatées

1. **`duration_minutes` toujours `None`** : Le débit d'irrigation et la surface de la parcelle ne sont pas des features d'entrée. Ce champ est publié à `null` sur Kafka. Pour l'alimenter, il faudrait enrichir le `PredictionRequest` ou récupérer ces données depuis le farm-service.

2. **Stage MLflow codé en dur** : `_load_booster` utilise `models:/{model_name}/Production` en dur, ignorant `settings.MLFLOW_MODEL_STAGE`. Si on veut utiliser un autre stage (ex: `Staging`), il faut modifier le code.

3. **`FEATURE_NAMES` dupliqué** : Défini à l'identique dans `model_service.py` et `prediction.py`. Aucun test ne vérifie l'égalité — risque de divergence silencieuse si une liste est modifiée sans l'autre.

4. **Auto-commit Kafka** : `enable_auto_commit=True` → en cas de crash après consommation mais avant traitement, un message peut être perdu (at-most-once). Pas de garantie at-least-once.

5. **Pas de latence mesurée sur le chemin Kafka** : L'histogramme `ml_prediction_latency_seconds` n'est incrémenté que pour `/predict` (HTTP), pas pour les prédictions issues du consumer Kafka.

6. **Dockerfile en root** : Contrairement au recommendation-service, le conteneur tourne en root (pas d'utilisateur non-root). Moins sécurisé.

7. **Producer Kafka bloquant en cas d'échec** : `kafka_producer.publish()` lève une exception si la publication échoue, ce qui remonte dans `_process` et est capturé par le try/except global → métrique `error`. Mais la recommandation a déjà été écrite dans MongoDB → risque d'incohérence (en MongoDB sans être sur Kafka).

8. **`joblib` non listé dans requirements.txt** : Utilisé dans `model_service.py` mais tiré indirectement comme dépendance transitive de scikit-learn (lui-même dépendance de MLflow). Fragile si MLflow change ses dépendances.

---

## 19. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice d'inférence ML (prédiction d'irrigation) |
| **Framework** | FastAPI 0.111 |
| **Langage** | Python 3.11 |
| **Port** | 8000 |
| **Modèles** | XGBoost 2.0.3 (classifieur + régresseur, chargés depuis MLflow Registry) |
| **Feature engineering** | Externe (spark-jobs) — reçoit 22 features prêtes |
| **Seuil de classification** | 0.35 (≥ → irriguer) |
| **Biais** | Digital Twin par parcelle (borné ±5 mm) |
| **Explications** | SHAP top 5 avec labels FR/AR |
| **Source modèle** | MLflow (`models:/AlKatra-*/Production`) |
| **Stockage artefacts** | MinIO (S3) |
| **Consumer Kafka** | kafka-python (topic `processed-sensor-data`, group `ml-inference-group`) |
| **Producer Kafka** | kafka-python (topic `recommendations-generated`) |
| **Persistance** | MongoDB `alkatra_iot.irrigation_recommendations` |
| **Métriques** | Prometheus `/metrics` (4 métriques via `prometheus_client`) |
| **Health checks** | `/health` (modèles chargés + demo_mode) |
| **Mode dégradé** | `demo_mode` (fallback après échec de chargement) |
| **Tests** | pytest (2 fichiers, couverture limitée) |
| **Docker** | Single-stage `python:3.11-slim`, healthcheck sur `/health` |

### Commandes essentielles

```bash
# Démarrer en développement
cd apps/ml-inference-service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Vérifier la santé
curl http://localhost:8000/health

# Métriques Prometheus
curl http://localhost:8000/metrics

# Prédiction à la demande
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_id": "parcel_test_001",
    "temp_max": 34.7, "temp_min": 13.2, "temp_moy": 24.0, "delta_temp": 21.5,
    "humidite_air": 61.3, "vent": 4.1, "rayonnement": 22.8, "pluie": 3.4,
    "ET0_mm": 5.2, "ETc": 4.1,
    "humidite_sol_avant_%": 46.5, "humidite_sol_rolling3": 48.0,
    "jour_annee": 180, "mois": 6, "jour_semaine": 3,
    "humidite_sol_j-1": 49.0, "pluie_j-1": 0.0, "ETc_j-1": 3.9, "pluie_3j": 3.4,
    "eto_hum_ratio": 0.11, "deficit_hydrique": -2.5, "regime_sol": 1
  }'

# Lancer les tests
cd apps/ml-inference-service && pytest tests/ -v
```
