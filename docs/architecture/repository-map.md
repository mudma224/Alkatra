# Carte du repository

## Racine

| Chemin | Role |
| --- | --- |
| `package.json` | scripts racine, workspaces npm, Turbo |
| `package-lock.json` | lockfile npm |
| `turbo.json` | orchestration build/test/dev |
| `.env.example` | modele des variables locales |
| `.gitattributes` | normalisation LF pour scripts shell |

## Applications

### apps/iot-service

Service NestJS qui reçoit MQTT et publie Kafka.

| Chemin | Rôle |
|--------|------|
| `src/mqtt` | Réception MQTT, validation payload IA |
| `src/kafka` | Producer Kafka |
| `src/health` | Endpoint de santé |
| `tests` | Tests Jest |

### apps/auth-service *(Sprint S2 — scaffold Phase 1)*

Service NestJS d'authentification. Placeholder fonctionnel avec `/health`.
Le code métier (OTP SMS, JWT, Keycloak) sera écrit en Phase 1 S1-S2.
Activé via profil Docker `phase1`.

| Chemin | Rôle |
|--------|------|
| `src/main.ts` | Entrypoint NestJS |
| `src/app.module.ts` | Module racine |
| `src/app.controller.ts` | Endpoint `/health` |
| `Dockerfile` | Multi-stage (development / build / production) |

### apps/spark-jobs *(Sprint S2 — scaffold S3)*

Jobs PySpark pour le feature engineering (ETo Penman-Monteith, Kc phénologique, cumul pluie).
Le code des jobs sera écrit par Dev2 en S3.

| Chemin | Rôle |
|--------|------|
| `jobs/` | Scripts Python (vide — Dev2 S3) |
| `tests/` | Tests pytest (vide — Dev2 S3) |
| `Dockerfile` | Bitnami Spark 3.5, Python deps |
| `requirements.txt` | httpx, kafka-python, pytest |

### apps/ml-inference-service *(Sprint S2 — scaffold S4)*

Service FastAPI pour les prédictions XGBoost via MLflow.
FastAPI minimal fonctionnel avec `/health`. Le code de prédiction sera écrit par Dev2 en S4.

| Chemin | Rôle |
|--------|------|
| `app/main.py` | FastAPI entrypoint, endpoint `/health` |
| `app/api/v1/` | Endpoints predict (vide — Dev2 S4) |
| `app/schemas/` | Modèles Pydantic (vide — Dev2 S4) |
| `app/services/` | model_service.py (vide — Dev2 S4) |
| `Dockerfile` | Python 3.11-slim |
| `requirements.txt` | FastAPI, XGBoost, MLflow, SHAP, pandas |

---

## CI/CD *(Sprint S2 — Dev1)*

| Chemin | Rôle |
|--------|------|
| `.github/workflows/ci-common.yml` | Lint + build Docker + validation K8s |
| `.github/workflows/ci-iot.yml` | Tests Jest iot-service |
| `.github/workflows/ci-ml.yml` | Tests pytest ML + Spark |
| `.github/CODEOWNERS` | Propriétaires par dossier |
| `.github/PULL_REQUEST_TEMPLATE.md` | Template PR obligatoire |

---

## Configuration qualité racine *(Sprint S2 — Dev1)*

| Chemin | Rôle |
|--------|------|
| `.eslintrc.js` | Règles ESLint TypeScript partagées |
| `tsconfig.json` | Config TypeScript racine |
| `.prettierrc` | Formatage unifié (single quote, trailing comma) |
| `.editorconfig` | Conventions éditeur (LF, indentation 2) |


## Infrastructure

```text
infra/docker/docker-compose.yml
```

Stack Docker locale.

```text
infra/postgres/init.sql
```

Schema initial Postgres.

```text
infra/grafana
```

Provisioning Grafana et dashboards.

```text
infra/prometheus/prometheus.yml
```

Configuration Prometheus.

```text
infra/mlflow
```

Image et script de demarrage MLflow.

```text
infra/kafka/topics.sh
```

Creation des topics Kafka.

```text
infra/mosquitto
```

Configurations MQTT dev/prod.

## Scripts

| Chemin | Role |
| --- | --- |
| `scripts/simulate-sensor.js` | simulateur MQTT du capteur IA v1 |
| `scripts/health-check.sh` | verification rapide de la stack locale |

## Documentation

| Chemin | Role |
| --- | --- |
| `docs/README.md` | point d'entree |
| `docs/architecture` | architecture et flux |
| `docs/guides` | guides pratiques |
| `docs/reference` | contrats et tables de reference |
| `docs/runbooks` | resolution d'incidents |
| `docs/adr` | decisions d'architecture |
