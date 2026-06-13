# Développement ML local — Al Katra

Ce guide décrit comment lancer la stack ML localement, enregistrer des modèles
dans MLflow, et vérifier le pipeline Spark → Kafka → ML.

1) Prérequis
- Docker & Docker Compose
- Node.js (pour `scripts/simulate-sensor.js`)
- Python 3.8+ (optionnellement conda/venv)

2) Installer dépendances ML (optionnel, pour exécuter `scripts/register-models.py`)

```bash
python -m pip install -r requirements-ml.txt
```

Si vous êtes sur Windows et que vos chemins contiennent des espaces (ex: `C:\Users\E L I T E B O O K\Desktop\olive_project`), entourez toujours les chemins par des guillemets.

Exemple d'appel `register-models.py` sur Windows:

```powershell
# Exemples de chemins avec espaces
python scripts/register-models.py \
  --classifier "C:\Users\E L I T E B O O K\Desktop\olive_project\model_classification_xgb.json" \
  --regressor  "C:\Users\E L I T E B O O K\Desktop\olive_project\model_regression_xgb.json" \
  --bias       "C:\Users\E L I T E B O O K\Desktop\olive_project\champ_bias_dict.joblib"
```

Remarques:
- Le script `scripts/register-models.py` a été mis à jour pour utiliser des URIs `runs:/<run_id>/...` lors de l'enregistrement dans MLflow, ce qui évite la majorité des problèmes liés aux espaces dans les chemins.
- Assurez-vous que `MLFLOW_TRACKING_URI` pointe bien vers `http://localhost:5000` si MLflow tourne en conteneur Docker.

3) Démarrer la stack (dans le répertoire racine du repo)

```bash
npm run docker:up
# ou
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d
```

4) Vérifier MLflow

```bash
curl http://localhost:5000/health || curl http://localhost:5000/
```

5) Smoke test manuel

- Lancer le simulateur (envoie un message immédiatement puis périodiquement):

```bash
node scripts/simulate-sensor.js 60000
```

- Vérifier l'endpoint health de `iot-service`: `http://localhost:3005/health`
- Vérifier les topics Kafka via `kafka-topics.sh` dans le conteneur `alkatra-kafka`.

6) Smoke test automatisé

Le projet contient `scripts/smoke_ml_integration.py` qui automatise ces vérifications: il démarre (si nécessaire) la stack, lance un message simulateur, vérifie les metrics `iot-service`, la présence des topics Kafka et les logs du job Spark.

Exécuter:

```bash
python scripts/smoke_ml_integration.py
```

7) Problèmes courants
- `pyspark` local non compatible → exécuter Spark dans Docker (voir section 3).
- MLflow inaccessible → vérifier que `postgres` est healthy et que `alkatra-mlflow` a démarré.
- Chemins Windows avec espaces → entourer les chemins par des guillemets.

---
Fait par l'audit: `scripts/register-models.py` mis à jour pour gérer proprement les chemins hôtes.

