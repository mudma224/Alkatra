# Développement ML local — Al Katra

Ce guide décrit comment lancer la stack ML localement, enregistrer les modèles dans MLflow, puis vérifier le pipeline Spark → Kafka → ML.

## 1) Prérequis

- Docker & Docker Compose
- Node.js, pour `scripts/simulate-sensor.js`
- Python 3.11+ avec pip

## 2) Installer les dépendances ML

```bash
python -m pip install -r requirements-ml.txt
```

## 3) Démarrer la stack

Depuis la racine du repo :

```bash
npm run docker:up
# ou
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d
```

MLflow est disponible sur le port **5001** :

```bash
curl http://localhost:5001/
```

MinIO Console est disponible sur :

```text
http://localhost:9001
```

## 4) Enregistrer les modèles manuellement

Si vos chemins contiennent des espaces, conservez les guillemets. Remplacez `<chemin-vers-olive_project>` par le chemin absolu du dossier contenant les fichiers modèle.

```powershell
python scripts/register-models.py `
  --classifier "<chemin-vers-olive_project>/model_classification_xgb.json" `
  --regressor  "<chemin-vers-olive_project>/model_regression_xgb.json" `
  --bias       "<chemin-vers-olive_project>/champ_bias_dict.joblib"
```

Le script réalise l'ensemble des opérations nécessaires à l'inférence :

- configure l'accès local à MinIO via `http://localhost:9000` ;
- crée/vérifie le bucket `mlflow-artifacts` ;
- log les deux modèles avec `mlflow.xgboost.log_model` ;
- crée les versions MLflow Registry `AlKatra-Classifier` et `AlKatra-Regressor` ;
- passe ces versions au stage `Production` ;
- log `champ_bias_dict.joblib` dans le run `digital-twin-bias-registration`.

Variables optionnelles :

```powershell
$env:MLFLOW_TRACKING_URI="http://localhost:5001"
$env:MLFLOW_S3_ENDPOINT_URL="http://localhost:9000"
$env:AWS_ACCESS_KEY_ID="minioadmin"
$env:AWS_SECRET_ACCESS_KEY="minioadmin"
```

## 5) Vérifier le chargement des modèles

```bash
python scripts/test_load_models.py
```

## 6) Smoke test manuel

Lancer le simulateur :

```bash
node scripts/simulate-sensor.js 60000
```

Puis vérifier :

- `iot-service` : `http://localhost:3005/health`
- Kafka UI : `http://localhost:8090`
- MLflow UI : `http://localhost:5001`

## 7) Problèmes courants

- **MLflow inaccessible** : vérifier que `postgres`, `minio` et `alkatra-mlflow` sont démarrés.
- **Upload S3 impossible** : vérifier `MLFLOW_S3_ENDPOINT_URL=http://localhost:9000` et les identifiants MinIO.
- **Chemins avec espaces** : entourer les chemins avec des guillemets.
