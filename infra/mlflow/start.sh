#!/bin/sh
set -eu

ENCODED_PASSWORD=$(printf '%s' "${POSTGRES_PASSWORD}" | sed 's/@/%40/g')

exec mlflow server \
  --backend-store-uri "postgresql://${POSTGRES_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB:-alkatra_db}" \
  --default-artifact-root /mlruns \
  --host 0.0.0.0 \
  --port 5000
