#!/bin/sh
set -eu

# Wait-for-Postgres wrapper to avoid race conditions when MLflow starts before DB is ready
TRY=0
MAX_TRIES=60
SLEEP=2

ENCODED_PASSWORD=$(printf '%s' "${POSTGRES_PASSWORD}" | sed 's/@/%40/g')

until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h postgres -p 5432 -U "${POSTGRES_USER}" >/dev/null 2>&1; do
  TRY=$((TRY+1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "Postgres not ready after $((MAX_TRIES * SLEEP))s, exiting"
    exit 1
  fi
  echo "Waiting for Postgres... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

# Wait for MinIO to be ready
echo "Waiting for MinIO..."
TRY=0
until curl -s http://minio:9000/minio/health/live >/dev/null 2>&1; do
  TRY=$((TRY+1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "MinIO not ready after $((MAX_TRIES * SLEEP))s, exiting"
    exit 1
  fi
  echo "Waiting for MinIO... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

echo "Starting MLflow server with S3 backend (MinIO)..."
exec mlflow server \
  --backend-store-uri "postgresql://${POSTGRES_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB:-alkatra_db}" \
  --default-artifact-root "s3://mlflow-artifacts" \
  --host 0.0.0.0 \
  --port 5001
