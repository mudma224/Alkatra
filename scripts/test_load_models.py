#!/usr/bin/env python3
import os
from pathlib import Path

import mlflow
import mlflow.xgboost
from mlflow.tracking import MlflowClient


# Load environment variables from repo-level .env (if present).
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


_load_env_file()

# Prefer values from .env; otherwise fallback to local defaults for MinIO.
os.environ.setdefault("MLFLOW_S3_ENDPOINT_URL", os.getenv("MLFLOW_S3_ENDPOINT_URL", "http://localhost:9000"))
os.environ.setdefault("AWS_ACCESS_KEY_ID", os.getenv("AWS_ACCESS_KEY_ID", os.getenv("MINIO_ROOT_USER", "minioadmin")))
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")))

tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5001")
mlflow.set_tracking_uri(tracking_uri)
client = MlflowClient()


def print_production_source(model_name: str) -> None:
    versions = client.get_latest_versions(model_name, stages=["Production"])
    if not versions:
        print(f"! {model_name} has no Production version")
        return
    version = versions[0]
    print(f"{model_name} Production v{version.version} source: {version.source}")


print("Testing MLflow model loading from S3...")

try:
    print_production_source("AlKatra-Classifier")
    mlflow.xgboost.load_model("models:/AlKatra-Classifier/Production")
    print("OK AlKatra-Classifier loaded successfully from S3")
except Exception as e:
    print(f"FAIL AlKatra-Classifier: {e}")
    exit(1)

try:
    print_production_source("AlKatra-Regressor")
    mlflow.xgboost.load_model("models:/AlKatra-Regressor/Production")
    print("OK AlKatra-Regressor loaded successfully from S3")
except Exception as e:
    print(f"FAIL AlKatra-Regressor: {e}")
    exit(1)

print("\nAll models loaded successfully!")
