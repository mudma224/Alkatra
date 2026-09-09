#!/bin/sh
set -eu

TRY=0
MAX_TRIES=60
SLEEP=2

# Proper RFC 3986 URL encoding for PostgreSQL connection string (POSIX sh compatible)
urlencode() {
    local string="${1}"
    local encoded=""
    local i=1
    local char
    local charcode
    
    while [ $i -le ${#string} ]; do
        char=$(printf '%s' "${string}" | cut -c $i)
        
        case "${char}" in
            [-_.~a-zA-Z0-9] )
                encoded="${encoded}${char}"
                ;;
            * )
                charcode=$(printf '%d' "'${char}")
                encoded="${encoded}$(printf '%%%02x' "${charcode}")"
                ;;
        esac
        
        i=$((i + 1))
    done
    
    echo "${encoded}"
}

# Encode mlflow_user credentials for safe URI construction
ENCODED_USER=$(urlencode "${POSTGRES_USER}")
ENCODED_PASSWORD=$(urlencode "${POSTGRES_PASSWORD}")

# Validate required environment variables
if [ -z "${POSTGRES_DB}" ]; then
    echo "ERROR: POSTGRES_DB is not set"
    exit 1
fi

if [ -z "${POSTGRES_USER}" ]; then
    echo "ERROR: POSTGRES_USER is not set"
    exit 1
fi

if [ -z "${POSTGRES_PASSWORD}" ]; then
    echo "ERROR: POSTGRES_PASSWORD is not set"
    exit 1
fi

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
TRY=0
until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  TRY=$((TRY + 1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "ERROR: PostgreSQL not ready after $((MAX_TRIES * SLEEP))s"
    exit 1
  fi
  echo "Waiting for PostgreSQL... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

echo "PostgreSQL is ready"

# Verify mlflow_user can connect to mlflow_db (isolation check)
echo "Verifying ${POSTGRES_USER} access to ${POSTGRES_DB}..."
TRY=0
until PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    -c "SELECT 1;" >/dev/null 2>&1; do
  TRY=$((TRY + 1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "ERROR: Cannot connect to ${POSTGRES_DB} as ${POSTGRES_USER} after $((MAX_TRIES * SLEEP))s"
    exit 1
  fi
  echo "Waiting for ${POSTGRES_DB} to be accessible... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

echo "${POSTGRES_DB} is accessible as ${POSTGRES_USER}"

# Wait for MinIO
echo "Waiting for MinIO..."
TRY=0
until curl -s http://minio:9000/minio/health/live >/dev/null 2>&1; do
  TRY=$((TRY + 1))
  if [ "$TRY" -gt "$MAX_TRIES" ]; then
    echo "ERROR: MinIO not ready after $((MAX_TRIES * SLEEP))s"
    exit 1
  fi
  echo "Waiting for MinIO... ($TRY/$MAX_TRIES)"
  sleep "$SLEEP"
done

echo "MinIO is ready"

# Construct PostgreSQL backend store URI with mlflow_user credentials
BACKEND_STORE_URI="postgresql://${ENCODED_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB}"

echo "Starting MLflow server as ${POSTGRES_USER}..."
exec mlflow server \
  --backend-store-uri "${BACKEND_STORE_URI}" \
  --default-artifact-root "s3://mlflow-artifacts" \
  --host 0.0.0.0 \
  --port 5001
