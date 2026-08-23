#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${POSTGRES_PASSWORD}"

# Phase 1: Create all databases
echo "Phase 1: Creating all databases..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<SQL
CREATE DATABASE auth_db;
CREATE DATABASE farm_db;
CREATE DATABASE recommendation_db;
CREATE DATABASE notification_db;
CREATE DATABASE keycloak_db;
CREATE DATABASE mlflow_db;
SQL

# Phase 2: Create all users and grant full privileges to their own databases only
echo "Phase 2: Creating users and granting privileges to their own databases..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<SQL
-- Create auth_user with full privileges on auth_db only
CREATE USER auth_user WITH PASSWORD '${AUTH_DB_PASSWORD}';
GRANT CONNECT ON DATABASE auth_db TO auth_user;
GRANT CREATE ON DATABASE auth_db TO auth_user;
GRANT USAGE ON SCHEMA public TO auth_user;
GRANT CREATE ON SCHEMA public TO auth_user;

-- Create farm_user with full privileges on farm_db only
CREATE USER farm_user WITH PASSWORD '${FARM_DB_PASSWORD}';
GRANT CONNECT ON DATABASE farm_db TO farm_user;
GRANT CREATE ON DATABASE farm_db TO farm_user;
GRANT USAGE ON SCHEMA public TO farm_user;
GRANT CREATE ON SCHEMA public TO farm_user;

-- Create recommendation_user with full privileges on recommendation_db only
CREATE USER recommendation_user WITH PASSWORD '${RECOMMENDATION_DB_PASSWORD}';
GRANT CONNECT ON DATABASE recommendation_db TO recommendation_user;
GRANT CREATE ON DATABASE recommendation_db TO recommendation_user;
GRANT USAGE ON SCHEMA public TO recommendation_user;
GRANT CREATE ON SCHEMA public TO recommendation_user;

-- Create notify_user with full privileges on notification_db only
CREATE USER notify_user WITH PASSWORD '${NOTIFY_DB_PASSWORD}';
GRANT CONNECT ON DATABASE notification_db TO notify_user;
GRANT CREATE ON DATABASE notification_db TO notify_user;
GRANT USAGE ON SCHEMA public TO notify_user;
GRANT CREATE ON SCHEMA public TO notify_user;

-- Create keycloak_user with full privileges on keycloak_db only
CREATE USER keycloak_user WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';
GRANT CONNECT ON DATABASE keycloak_db TO keycloak_user;
GRANT CREATE ON DATABASE keycloak_db TO keycloak_user;
GRANT USAGE ON SCHEMA public TO keycloak_user;
GRANT CREATE ON SCHEMA public TO keycloak_user;

-- Create mlflow_user with full privileges on mlflow_db only
CREATE USER mlflow_user WITH PASSWORD '${MLFLOW_DB_PASSWORD}';
GRANT CONNECT ON DATABASE mlflow_db TO mlflow_user;
GRANT CREATE ON DATABASE mlflow_db TO mlflow_user;
GRANT USAGE ON SCHEMA public TO mlflow_user;
GRANT CREATE ON SCHEMA public TO mlflow_user;
SQL

# Phase 3: Revoke default public access to all databases (isolation enforcement)
echo "Phase 3: Revoking public access to all databases..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<SQL
-- Revoke default public CONNECT privilege on all databases
REVOKE CONNECT ON DATABASE auth_db FROM public;
REVOKE CONNECT ON DATABASE farm_db FROM public;
REVOKE CONNECT ON DATABASE recommendation_db FROM public;
REVOKE CONNECT ON DATABASE notification_db FROM public;
REVOKE CONNECT ON DATABASE keycloak_db FROM public;
REVOKE CONNECT ON DATABASE mlflow_db FROM public;
SQL

# Phase 4: Transfer schema public ownership to each service user
echo "Phase 4: Transferring schema public ownership to service users..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname auth_db <<SQL
ALTER SCHEMA public OWNER TO auth_user;
SQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname farm_db <<SQL
ALTER SCHEMA public OWNER TO farm_user;
SQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname recommendation_db <<SQL
ALTER SCHEMA public OWNER TO recommendation_user;
SQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname notification_db <<SQL
ALTER SCHEMA public OWNER TO notify_user;
SQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname keycloak_db <<SQL
ALTER SCHEMA public OWNER TO keycloak_user;
SQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname mlflow_db <<SQL
ALTER SCHEMA public OWNER TO mlflow_user;
SQL

# Phase 5: Revoke cross-database access (isolation enforcement)
echo "Phase 5: Revoking cross-database access..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<SQL
-- auth_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE farm_db FROM auth_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM auth_user;
REVOKE CONNECT ON DATABASE notification_db FROM auth_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM auth_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM auth_user;

-- farm_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE auth_db FROM farm_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM farm_user;
REVOKE CONNECT ON DATABASE notification_db FROM farm_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM farm_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM farm_user;

-- recommendation_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE auth_db FROM recommendation_user;
REVOKE CONNECT ON DATABASE farm_db FROM recommendation_user;
REVOKE CONNECT ON DATABASE notification_db FROM recommendation_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM recommendation_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM recommendation_user;

-- notify_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE auth_db FROM notify_user;
REVOKE CONNECT ON DATABASE farm_db FROM notify_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM notify_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM notify_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM notify_user;

-- keycloak_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE auth_db FROM keycloak_user;
REVOKE CONNECT ON DATABASE farm_db FROM keycloak_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM keycloak_user;
REVOKE CONNECT ON DATABASE notification_db FROM keycloak_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM keycloak_user;

-- mlflow_user: revoke access to all other databases
REVOKE CONNECT ON DATABASE auth_db FROM mlflow_user;
REVOKE CONNECT ON DATABASE farm_db FROM mlflow_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM mlflow_user;
REVOKE CONNECT ON DATABASE notification_db FROM mlflow_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM mlflow_user;

-- postgres_exporter: lecture seule des statistiques cluster (pg_monitor),
-- utilisée par postgres-exporter pour Prometheus. Aucun accès aux données.
CREATE USER postgres_exporter WITH PASSWORD '${POSTGRES_EXPORTER_PASSWORD:-postgres_exporter_pass}';
GRANT pg_monitor TO postgres_exporter;
SQL

# Phase 6: Execute schema SQL files in their respective databases
echo "Phase 6: Initializing database schemas..."
echo "  - Initializing auth_db schema..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname auth_db < /scripts/schemas/auth-db.sql

echo "  - Initializing farm_db schema..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname farm_db < /scripts/schemas/farm-db.sql

echo "  - Initializing recommendation_db schema..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname recommendation_db < /scripts/schemas/recommendation-db.sql

echo "  - Initializing notification_db schema..."
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname notification_db < /scripts/schemas/notification-db.sql

echo "✓ PostgreSQL initialization complete"
