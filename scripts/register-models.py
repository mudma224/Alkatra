r"""
Al Katra Bel Qatra — Enregistrement des modèles XGBoost dans MLflow.
Usage :
    python scripts/register-models.py \
        --classifier "C:\Users\PC\Downloads\olive_project_v2\model_classification_xgb.json" \
        --regressor  "C:\Users\PC\Downloads\olive_project_v2\model_regression_xgb.json" \
        --bias       "C:\Users\PC\Downloads\olive_project_v2\champ_bias_dict.joblib"

Les modèles sont des fichiers XGBoost natifs (.json).
Le bias dict est enregistré comme artifact MLflow.
r"""
import argparse
import json
import logging
import os
import sys
import tempfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
import joblib
import mlflow
import mlflow.xgboost
import numpy as np
import pandas as pd
import xgboost as xgb

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file(env_path: Path = REPO_ROOT / ".env") -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _env_path(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return str(Path(value).expanduser())
    return None


_load_env_file()

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5001")
MLFLOW_S3_ENDPOINT_URL = os.getenv("MLFLOW_S3_ENDPOINT_URL", "http://localhost:9000")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", os.getenv("MINIO_ROOT_USER", "minio"))
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", os.getenv("MINIO_ROOT_PASSWORD", "minio123"))
MLFLOW_ARTIFACT_BUCKET = os.getenv("MLFLOW_ARTIFACT_BUCKET", "mlflow-artifacts")
DEFAULT_CLASSIFIER_PATH = _env_path("ALKATRA_CLASSIFIER_MODEL_PATH", "CLASSIFIER_MODEL_PATH")
DEFAULT_REGRESSOR_PATH = _env_path("ALKATRA_REGRESSOR_MODEL_PATH", "REGRESSOR_MODEL_PATH")
DEFAULT_BIAS_PATH = _env_path("ALKATRA_BIAS_MODEL_PATH", "BIAS_MODEL_PATH")
CLASSIFIER_MODEL_NAME = "AlKatra-Classifier"
REGRESSOR_MODEL_NAME = "AlKatra-Regressor"
EXPERIMENT_NAME = "AlKatra-IrrigationModels"

# ─────────────────────────────────────────────────────────
# Features dans le même ordre que le dataset d'entraînement
# (model_IA.ipynb)
# ─────────────────────────────────────────────────────────
FEATURE_NAMES = [
    "temp_max", "temp_min", "temp_moy", "delta_temp",
    "humidite_air", "vent", "rayonnement", "pluie",
    "ET0_mm", "ETc",
    "humidite_sol_avant_%", "humidite_sol_rolling3",
    "jour_annee", "mois", "jour_semaine",
    "humidite_sol_j-1", "pluie_j-1", "ETc_j-1", "pluie_3j",
    "eto_hum_ratio", "deficit_hydrique", "regime_sol",
]

# Données de validation synthétiques (plausibles pour Maroc/olivier)
SAMPLE_X = np.array([
    # max  min  moy  delta  hum  vent  ray   pluie  ETo  ETc  sol  sol_r3  j_an  mois  j_sem  sol_j1  pl_j1  etc_j1  pl3j  ratio  deficit  regime
    [34.7, 13.2, 24.0, 21.5, 61.3, 4.1, 22.8, 3.4, 6.2, 4.0, 46.5, 45.0, 160, 6, 2, 48.0, 0.0, 3.8, 3.4, 0.10, 0.6, 1],
    [38.0, 18.0, 28.0, 20.0, 35.0, 5.5, 26.0, 0.0, 8.5, 6.0, 28.0, 30.0, 200, 7, 4, 31.0, 0.0, 5.5, 0.0, 0.24, 6.0, 0],
    [22.0, 8.0, 15.0, 14.0, 75.0, 2.0, 12.0, 8.0, 2.8, 1.5, 68.0, 65.0, 300, 11, 0, 64.0, 5.0, 1.8, 15.0, 0.04, -13.5, 2],
    [30.0, 14.0, 22.0, 16.0, 55.0, 3.5, 20.0, 0.0, 5.8, 3.8, 42.0, 44.0, 120, 5, 1, 45.0, 0.0, 3.5, 0.0, 0.11, 3.8, 1],
    [40.0, 22.0, 31.0, 18.0, 28.0, 6.0, 28.0, 0.0, 10.2, 7.1, 22.0, 24.0, 220, 8, 3, 25.0, 0.0, 6.8, 0.0, 0.36, 7.1, 0],
], dtype=np.float32)

SAMPLE_Y_CLASSIFIER = np.array([1, 1, 0, 1, 1])
SAMPLE_Y_REGRESSOR = np.array([
    np.log1p(8.0),
    np.log1p(14.0),
    np.log1p(0.0),
    np.log1p(6.0),
    np.log1p(18.0),
])


def _sample_frame() -> pd.DataFrame:
    return pd.DataFrame(SAMPLE_X, columns=FEATURE_NAMES)


def _configure_s3_environment() -> None:
    os.environ["MLFLOW_S3_ENDPOINT_URL"] = MLFLOW_S3_ENDPOINT_URL
    os.environ["AWS_ACCESS_KEY_ID"] = AWS_ACCESS_KEY_ID
    os.environ["AWS_SECRET_ACCESS_KEY"] = AWS_SECRET_ACCESS_KEY
    os.environ["AWS_S3_ADDRESSING_STYLE"] = "path"


def _ensure_artifact_bucket() -> None:
    s3 = boto3.client(
        "s3",
        endpoint_url=MLFLOW_S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    try:
        s3.head_bucket(Bucket=MLFLOW_ARTIFACT_BUCKET)
        logger.info(f"Bucket MinIO OK ({MLFLOW_ARTIFACT_BUCKET})")
    except ClientError as e:
        status_code = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        error_code = e.response.get("Error", {}).get("Code")
        if status_code == 404 or error_code in {"404", "NoSuchBucket"}:
            s3.create_bucket(Bucket=MLFLOW_ARTIFACT_BUCKET)
            logger.info(f"Bucket MinIO cree ({MLFLOW_ARTIFACT_BUCKET})")
            return
        logger.error(f"MinIO inaccessible ou credentials invalides : {e}")
        sys.exit(1)


def _check_mlflow_connection() -> None:
    try:
        client = mlflow.tracking.MlflowClient()
        client.search_experiments()
        logger.info(f"✅ Connexion MLflow OK ({MLFLOW_TRACKING_URI})")
    except Exception as e:
        logger.error(f"❌ MLflow inaccessible : {e}")
        logger.error("Assurez-vous que la stack tourne : npm run docker:up")
        sys.exit(1)


def _transition_to_production(model_name: str, version: str) -> None:
    client = mlflow.tracking.MlflowClient()
    client.transition_model_version_stage(
        name=model_name,
        version=version,
        stage="Production",
        archive_existing_versions=True,
    )
    logger.info(f"  → {model_name} v{version} passé en Production")


def _ensure_registered_model(model_name: str) -> None:
    client = mlflow.tracking.MlflowClient()
    try:
        client.create_registered_model(model_name)
    except Exception:
        pass


def _register_model_version(model_name: str, run_id: str, source_uri: str) -> str:
    _ensure_registered_model(model_name)
    client = mlflow.tracking.MlflowClient()
    mv = client.create_model_version(name=model_name, source=source_uri, run_id=run_id)
    _transition_to_production(model_name, mv.version)
    return mv.version


def register_classifier(classifier_path: str) -> None:
    logger.info(f"\n📦 Enregistrement classificateur : {classifier_path}")

    clf = xgb.Booster()
    clf.load_model(classifier_path)
    logger.info(f"  Modèle chargé : XGBoost Booster ({type(clf).__name__})")

    with mlflow.start_run(run_name="classifier-xgb-registration"):
        # Métriques sur l'échantillon de validation
        # Fournir les noms de features explicites : certains boosters XGBoost
        # conservent les noms de colonnes et exigent leur présence à la prédiction.
        dmatrix = xgb.DMatrix(SAMPLE_X, label=SAMPLE_Y_CLASSIFIER, feature_names=FEATURE_NAMES)
        pred_proba = clf.predict(dmatrix)
        pred_class = (pred_proba >= 0.35).astype(int)

        correct = int(np.sum(pred_class == SAMPLE_Y_CLASSIFIER))
        accuracy = correct / len(SAMPLE_Y_CLASSIFIER)
        mlflow.log_metric("sample_accuracy", accuracy)
        mlflow.log_metric("classification_threshold", 0.35)
        mlflow.log_param("model_type", "XGBoostBooster-Classifier")
        mlflow.log_param("task", "irrigation_binary_classification")
        mlflow.log_param("crop", "olive")
        mlflow.log_param("source_file", os.path.basename(classifier_path))
        mlflow.log_param("n_features", len(FEATURE_NAMES))
        mlflow.log_param("features", json.dumps(FEATURE_NAMES))

        # Log du fichier modèle natif comme artifact
        artifact_path = "classifier_model"
        with tempfile.TemporaryDirectory() as tmp:
            model_dir = os.path.join(tmp, artifact_path)
            mlflow.xgboost.save_model(
                xgb_model=clf,
                path=model_dir,
                input_example=_sample_frame().head(1),
            )
            mlflow.log_artifacts(model_dir, artifact_path=artifact_path)

        # Enregistrement dans le Model Registry.
        # On utilise une URI de la forme `runs:/<run_id>/xgb_model/<file>` afin
        # d'éviter les problèmes liés aux chemins contenant des espaces sur
        # l'hôte (Windows). Le client MLflow upload l'artifact au serveur
        # et registration via `runs:/` fonctionne de manière robuste.
        run_id = mlflow.active_run().info.run_id
        # Register model version directly to avoid using the logged-models/search
        # endpoint which may not be available in some server setups. This creates
        # a model version pointing to the artifact we just logged.
        source_uri = mlflow.get_artifact_uri(artifact_path)
        _register_model_version(CLASSIFIER_MODEL_NAME, run_id, source_uri)

    logger.info(f"✅ {CLASSIFIER_MODEL_NAME} enregistré (accuracy échantillon : {accuracy:.2f})")


def register_regressor(regressor_path: str) -> None:
    logger.info(f"\n📦 Enregistrement régresseur : {regressor_path}")

    reg = xgb.Booster()
    reg.load_model(regressor_path)
    logger.info(f"  Modèle chargé : XGBoost Booster ({type(reg).__name__})")

    with mlflow.start_run(run_name="regressor-xgb-registration"):
        # Fournir les noms de features pour cohérence avec le booster.
        dmatrix = xgb.DMatrix(SAMPLE_X, feature_names=FEATURE_NAMES)
        pred_log = reg.predict(dmatrix)
        pred_mm = np.expm1(pred_log)

        real_mm = np.expm1(SAMPLE_Y_REGRESSOR)
        mae = float(np.mean(np.abs(pred_mm - real_mm)))
        mlflow.log_metric("sample_mae_mm", mae)
        mlflow.log_param("model_type", "XGBoostBooster-Regressor")
        mlflow.log_param("task", "irrigation_quantity_log1p_mm")
        mlflow.log_param("target", "log1p(besoin_brut_mm_rolling3)")
        mlflow.log_param("postprocessing", "expm1(prediction)")
        mlflow.log_param("crop", "olive")
        mlflow.log_param("source_file", os.path.basename(regressor_path))
        mlflow.log_param("n_features", len(FEATURE_NAMES))
        mlflow.log_param("features", json.dumps(FEATURE_NAMES))

        artifact_path = "regressor_model"
        with tempfile.TemporaryDirectory() as tmp:
            model_dir = os.path.join(tmp, artifact_path)
            mlflow.xgboost.save_model(
                xgb_model=reg,
                path=model_dir,
                input_example=_sample_frame().head(1),
            )
            mlflow.log_artifacts(model_dir, artifact_path=artifact_path)

        run_id = mlflow.active_run().info.run_id
        source_uri = mlflow.get_artifact_uri(artifact_path)
        _register_model_version(REGRESSOR_MODEL_NAME, run_id, source_uri)

    logger.info(f"✅ {REGRESSOR_MODEL_NAME} enregistré (MAE échantillon : {mae:.2f}mm)")


def register_bias_dict(bias_path: str) -> None:
    logger.info(f"\n📦 Enregistrement biais Digital Twin : {bias_path}")

    bias_dict = joblib.load(bias_path)
    logger.info(f"  {len(bias_dict)} parcelles dans le dictionnaire de biais")

    with mlflow.start_run(run_name="digital-twin-bias-registration"):
        mlflow.log_param("artifact_type", "digital_twin_bias_dict")
        mlflow.log_param("n_parcels", len(bias_dict))
        mlflow.log_param("bias_clip_min", -5.0)
        mlflow.log_param("bias_clip_max", 5.0)
        mlflow.log_param(
            "usage",
            "pred_final = max(0, pred_global + bias.get(parcel_id, 0))"
        )
        mlflow.log_artifact(bias_path, artifact_path="bias")

    logger.info(f"✅ champ_bias_dict enregistré dans MLflow")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enregistrer les modèles XGBoost Al Katra dans MLflow"
    )
    parser.add_argument(
        "--classifier",
        required=(DEFAULT_CLASSIFIER_PATH is None),
        default=DEFAULT_CLASSIFIER_PATH,
        help=(
            "Chemin vers model_classification_xgb.json "
            "(ou définir ALKATRA_CLASSIFIER_MODEL_PATH dans .env)"
        ),
    )
    parser.add_argument(
        "--regressor",
        required=(DEFAULT_REGRESSOR_PATH is None),
        default=DEFAULT_REGRESSOR_PATH,
        help=(
            "Chemin vers model_regression_xgb.json "
            "(ou définir ALKATRA_REGRESSOR_MODEL_PATH dans .env)"
        ),
    )
    parser.add_argument(
        "--bias",
        required=(DEFAULT_BIAS_PATH is None),
        default=DEFAULT_BIAS_PATH,
        help=(
            "Chemin vers champ_bias_dict.joblib "
            "(ou définir ALKATRA_BIAS_MODEL_PATH dans .env)"
        ),
    )
    args = parser.parse_args()

    # Vérifications
    for path in [args.classifier, args.regressor, args.bias]:
        if not os.path.exists(path):
            logger.error(f"Fichier introuvable : {path}")
            sys.exit(1)

    _configure_s3_environment()
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    _check_mlflow_connection()
    _ensure_artifact_bucket()

    # Créer l'expérience
    try:
        mlflow.create_experiment(EXPERIMENT_NAME,artifact_location="s3://mlflow-artifacts")
    except Exception:
        pass
    mlflow.set_experiment(EXPERIMENT_NAME)

    register_classifier(args.classifier)
    register_regressor(args.regressor)
    register_bias_dict(args.bias)

    print()
    print("🎉 Tous les artifacts sont enregistrés dans MLflow !")
    print(f"   → MLflow UI : {MLFLOW_TRACKING_URI}")
    print(f"   → {CLASSIFIER_MODEL_NAME} : Production ✅")
    print(f"   → {REGRESSOR_MODEL_NAME} : Production ✅")
    print(f"   → champ_bias_dict : artifact ✅")
    print()



if __name__ == "__main__":
    main()
