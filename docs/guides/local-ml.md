# Developpement ML local - Al Katra

Ce guide decrit comment lancer la stack ML localement, enregistrer les modeles
dans MLflow, puis verifier le pipeline Spark -> Kafka -> ML.

## 1) Prerequis

- Docker & Docker Compose
- Node.js, pour `scripts/simulate-sensor.js`
- Python 3.8+ avec pip

## 2) Installer les dependances ML

```bash
python -m pip install -r requirements-ml.txt
```

## 3) Demarrer la stack

Depuis la racine du repo:

```bash
npm run docker:up
# ou
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d
```

MLflow doit etre disponible sur:

```bash
curl http://localhost:5001/
```

MinIO doit etre disponible sur:

```text
http://localhost:9001
```

## 4) Enregistrer les modeles manuellement

Si vos chemins Windows contiennent des espaces, gardez toujours les guillemets.

```powershell
python scripts/register-models.py `
  --classifier "C:\Users\E L I T E B O O K\Desktop\olive_project\model_classification_xgb.json" `
  --regressor  "C:\Users\E L I T E B O O K\Desktop\olive_project\model_regression_xgb.json" `
  --bias       "C:\Users\E L I T E B O O K\Desktop\olive_project\champ_bias_dict.joblib"
```

Le script reste manuel. Il fait cependant tout le necessaire pour l'inference:

- configure l'acces local a MinIO via `http://localhost:9000`;
- cree/verifie le bucket `mlflow-artifacts`;
- log les deux modeles avec `mlflow.xgboost.log_model`;
- cree les versions MLflow Registry `AlKatra-Classifier` et `AlKatra-Regressor`;
- passe ces versions au stage `Production`;
- log `champ_bias_dict.joblib` dans le run `digital-twin-bias-registration`.

Variables optionnelles:

```powershell
$env:MLFLOW_TRACKING_URI="http://localhost:5001"
$env:MLFLOW_S3_ENDPOINT_URL="http://localhost:9000"
$env:AWS_ACCESS_KEY_ID="minioadmin"
$env:AWS_SECRET_ACCESS_KEY="minioadmin"
```

## 5) Verifier le chargement des modeles

```bash
python scripts/test_load_models.py
```

## 6) Smoke test manuel

Lancer le simulateur:

```bash
node scripts/simulate-sensor.js 60000
```

Puis verifier:

- `iot-service`: `http://localhost:3005/health`
- Kafka UI: `http://localhost:8090`
- MLflow UI: `http://localhost:5001`

## 7) Problemes courants

- MLflow inaccessible: verifier que `postgres`, `minio` et `alkatra-mlflow` sont demarres.
- Upload S3 impossible: verifier `MLFLOW_S3_ENDPOINT_URL=http://localhost:9000`.
- Chemins Windows avec espaces: entourer les chemins avec des guillemets.
