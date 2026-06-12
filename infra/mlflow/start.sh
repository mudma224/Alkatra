#!/bin/sh
set -eu

TRY=0
MAX_TRIES=60
SLEEP=2

ENCODED_PASSWORD=$(printf '%s' "${POSTGRES_PASSWORD}" | sed 's/@/%40/g')

until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h postgres -p 5432 -U "${POSTGRES_USER}"; do
  TRY=$((TRY+1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "Postgres not ready after $((MAX_TRIES * SLEEP))s, exiting"
    exit 1
  fi
  echo "Waiting for Postgres... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

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

exec mlflow server \
  --backend-store-uri "postgresql://${POSTGRES_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB:-alkatra_db}" \
  --default-artifact-root /mlruns \
  --host 0.0.0.0 \
  --port 5000