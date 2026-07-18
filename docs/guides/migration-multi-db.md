# Migration : Architecture multi-bases PostgreSQL

> **Objectif** : Passer d'une instance PostgreSQL monolithique (tout dans `public`) à une architecture où chaque microservice possède sa propre base de données avec son propre utilisateur dédié.
>
> **Prérequis** : Aucune donnée en production à préserver. Un `docker compose down -v` (reset complet) est possible sans perte.
>
> **Principe** : Un microservice = une base de données. Les communications inter-services passent par REST (HTTP) ou Kafka, jamais par accès SQL direct à la base d'un autre service.

---

## Table des matières

1. [Architecture cible](#1-architecture-cible)
2. [Fichiers à créer](#2-fichiers-à-créer)
3. [Fichiers à modifier](#3-fichiers-à-modifier)
4. [Fichiers à supprimer](#4-fichiers-à-supprimer)
5. [Procédure de déploiement](#5-procédure-de-déploiement)
6. [Vérification](#6-vérification)
7. [Annexe : Contenu détaillé des fichiers](#7-annexe--contenu-détaillé-des-fichiers)

---

## 1. Architecture cible

### Bases de données

```
1 instance PostgreSQL (même conteneur, port 5432)
│
├── auth_db              → users                      auth-service (auth_user)
├── farm_db              → farms, parcels, sensors    farm-service (farm_user)
├── recommendation_db     → recommendations         recommendation-service (recommendation_user)
├── notification_db      → alerts                     alert-service (notify_user)
├── keycloak_db          → schema keycloak            keycloak
└── mlflow_db            → MLflow metadata            mlflow
```

### Utilisateurs PostgreSQL dédiés

| Base | Utilisateur | Mot de passe (variable .env) | Droits |
|------|-------------|------------------------------|--------|
| `auth_db` | `auth_user` | `AUTH_DB_PASSWORD` | Tous droits sur `auth_db` uniquement |
| `farm_db` | `farm_user` | `FARM_DB_PASSWORD` | Tous droits sur `farm_db` uniquement |
| `recommendation_db` | `recommendation_user` | `RECOMMENDATION_DB_PASSWORD` | Tous droits sur `recommendation_db` uniquement |
| `notification_db` | `notify_user` | `NOTIFY_DB_PASSWORD` | Tous droits sur `notification_db` uniquement |
| `keycloak_db` | `keycloak_user` | `KEYCLOAK_DB_PASSWORD` | Tous droits sur `keycloak_db` uniquement |
| `mlflow_db` | `mlflow_user` | `MLFLOW_DB_PASSWORD` | Tous droits sur `mlflow_db` uniquement |

### Répartition des ENUMs par base

| Base | ENUMs | Tables concernées |
|------|-------|-------------------|
| **auth_db** | `user_language_enum` | `users.preferred_language` |
| **farm_db** | `crop_type_enum`, `soil_type_enum`, `irrigation_method_enum` | `parcels.crop_type`, `parcels.soil_type`, `parcels.irrigation_method` |
| **recommendation_db** | `recommendation_feedback_enum`, `recommendation_status_enum` | `recommendations.user_feedback`, `recommendations.status` |
| **notification_db** | `alert_type_enum`, `alert_status_enum` | `alerts.alert_type`, `alerts.status` |

### Extensions PostgreSQL par base

| Extension | auth_db | farm_db | recommendation_db | notification_db | keycloak_db | mlflow_db |
|-----------|---------|---------|---------------|-----------------|-------------|-----------|
| `uuid-ossp` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `postgis` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Fonction `trigger_set_updated_at()`

À créer dans chaque base qui a des tables avec une colonne `updated_at` :
- **auth_db** : table `users`
- **farm_db** : tables `farms`, `parcels`, `sensors`
- **recommendation_db** : non nécessaire (pas de trigger dans l'init.sql actuel)
- **notification_db** : non nécessaire (pas de trigger dans l'init.sql actuel)

---

## 2. Fichiers à créer

### Structure des nouveaux fichiers

```
infra/postgres/
├── 01-auth-db.sql             # auth_db : users
├── 02-farm-db.sql              # farm_db : farms, parcels, sensors
├── 03-recommendation-db.sql    # recommendation_db : recommendations
├── 04-notification-db.sql      # notification_db : alerts
├── 05-keycloak-db.sql          # keycloak_db : schema keycloak
├── 06-mlflow-db.sql            # mlflow_db : MLflow metadata
└── 00-create-databases.sh        # Création des bases + utilisateurs + droits via variables .env
```

### Ordre d'exécution dans `docker-entrypoint-initdb.d/`

Le conteneur PostgreSQL officiel exécute les scripts présents dans `docker-entrypoint-initdb.d/` dans l'ordre alphabétique. Les fichiers sont préfixés numériquement :

```
00-create-databases.sh     # 1er : crée les bases et les utilisateurs à partir des variables .env
01-auth-db.sql             # 2e : auth_db
02-farm-db.sql             # 3e : farm_db
03-recommendation-db.sql   # 4e : recommendation_db
04-notification-db.sql     # 5e : notification_db
05-keycloak-db.sql         # 6e : keycloak_db
06-mlflow-db.sql           # 7e : mlflow_db
```

### Contenu de chaque fichier

#### `00-create-databases.sh`

Ce fichier crée les bases de données, les utilisateurs et accorde les droits. Il est exécuté dans la base par défaut (`alkatra_db` ou `postgres`) et lit directement les variables injectées par `docker-compose` depuis le fichier `.env`.

```bash
#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE DATABASE auth_db;
CREATE USER auth_user WITH PASSWORD '${AUTH_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;

CREATE DATABASE farm_db;
CREATE USER farm_user WITH PASSWORD '${FARM_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE farm_db TO farm_user;

CREATE DATABASE recommendation_db;
CREATE USER recommendation_user WITH PASSWORD '${RECOMMENDATION_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE recommendation_db TO recommendation_user;

CREATE DATABASE notification_db;
CREATE USER notify_user WITH PASSWORD '${NOTIFY_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE notification_db TO notify_user;

CREATE DATABASE keycloak_db;
CREATE USER keycloak_user WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak_user;

CREATE DATABASE mlflow_db;
CREATE USER mlflow_user WITH PASSWORD '${MLFLOW_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE mlflow_db TO mlflow_user;
SQL
```

> **Note** : les mots de passe ne sont pas passés en dur dans les scripts SQL. Ils sont fournis par le fichier `.env`, injectés dans le conteneur PostgreSQL via `docker-compose`, puis consommés par le script d'initialisation.

#### `01-auth-db.sql`

```sql
-- =============================================================================
-- auth_db : users
-- Propriétaire : auth-service
-- =============================================================================

\connect auth_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMs
CREATE TYPE user_language_enum AS ENUM ('darija', 'arabic', 'french');

-- Fonction trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone                 VARCHAR(20) UNIQUE NOT NULL,
    name                  VARCHAR(100),
    preferred_language    user_language_enum DEFAULT 'darija',
    otp_attempts          INT DEFAULT 0,
    otp_blocked_until     TIMESTAMP WITH TIME ZONE,
    last_login_at         TIMESTAMP WITH TIME ZONE,
    keycloak_id           VARCHAR(100) UNIQUE,
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX idx_users_phone ON users(phone);

-- Trigger
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Droits (l'utilisateur auth_user doit pouvoir tout faire sur auth_db)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auth_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auth_user;
```

#### `02-farm-db.sql`

```sql
-- =============================================================================
-- farm_db : farms, parcels, sensors
-- Propriétaire : farm-service
-- =============================================================================

\connect farm_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ENUMs
CREATE TYPE crop_type_enum AS ENUM ('olive', 'citrus', 'cereal', 'vegetable', 'other');
CREATE TYPE soil_type_enum AS ENUM ('clay', 'silt', 'sandy', 'calcareous', 'mixed');
CREATE TYPE irrigation_method_enum AS ENUM ('drip', 'sprinkler', 'gravity');

-- Fonction trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables
CREATE TABLE farms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL,  -- Pas de FK : l'utilisateur est dans auth_db
    name            VARCHAR(150) NOT NULL,
    region          VARCHAR(100),
    location        GEOMETRY(POINT, 4326),
    total_area_ha   DECIMAL(10,2),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (total_area_ha > 0)
);

CREATE INDEX idx_farms_user_id  ON farms(user_id);
CREATE INDEX idx_farms_location ON farms USING GIST(location);

CREATE TRIGGER set_farms_updated_at
    BEFORE UPDATE ON farms
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE parcels (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id             UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    area_ha             DECIMAL(10,2) NOT NULL,
    crop_type           crop_type_enum NOT NULL DEFAULT 'olive',
    crop_variety        VARCHAR(100),
    soil_type           soil_type_enum NOT NULL DEFAULT 'mixed',
    irrigation_method   irrigation_method_enum NOT NULL DEFAULT 'drip',
    flow_rate_m3h       DECIMAL(8,2),
    tree_age_years      INT,
    tree_density_per_ha INT,
    polygon             GEOMETRY(POLYGON, 4326),
    centroid            GEOMETRY(POINT, 4326),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (area_ha > 0),
    CHECK (flow_rate_m3h >= 0),
    CHECK (tree_age_years >= 0),
    CHECK (tree_density_per_ha >= 0),
    CHECK (polygon IS NULL OR ST_IsValid(polygon)),
    UNIQUE(farm_id, name)
);

CREATE INDEX idx_parcels_farm_id  ON parcels(farm_id);
CREATE INDEX idx_parcels_centroid ON parcels USING GIST(centroid);
CREATE INDEX idx_parcels_active   ON parcels(is_active) WHERE is_active = TRUE;

CREATE TRIGGER set_parcels_updated_at
    BEFORE UPDATE ON parcels
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE sensors (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id        UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    device_id        VARCHAR(100) UNIQUE NOT NULL,
    device_type      VARCHAR(50) NOT NULL DEFAULT 'esp32-wroom-32',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at     TIMESTAMP WITH TIME ZONE,
    battery_pct      INT,
    firmware_version VARCHAR(20),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (battery_pct BETWEEN 0 AND 100)
);

CREATE INDEX idx_sensors_parcel_id ON sensors(parcel_id);
CREATE INDEX idx_sensors_device_id ON sensors(device_id);
CREATE INDEX idx_sensors_active    ON sensors(is_active);

CREATE TRIGGER set_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Droits
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO farm_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO farm_user;
```

#### `03-recommendation-db.sql`

```sql
-- =============================================================================
-- recommendation_db : recommendations
-- Propriétaire : recommendation-service
-- =============================================================================

\connect recommendation_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMs
CREATE TYPE recommendation_feedback_enum AS ENUM ('accepted', 'rejected', 'ignored');
CREATE TYPE recommendation_status_enum AS ENUM (
  'pending', 'seen', 'accepted', 'rejected', 'executed', 'expired'
);

-- Tables
CREATE TABLE recommendations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id               UUID NOT NULL,  -- Pas de FK : la parcelle est dans farm_db
    generated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    irrigate                BOOLEAN NOT NULL,
    confidence_score        DECIMAL(4,3),
    quantity_mm             DECIMAL(6,2),
    duration_minutes        INT,
    reason_code             VARCHAR(50),
    shap_factors            JSONB,
    explanation_text_fr     TEXT,
    explanation_text_darija TEXT,
    soil_humidity_pct_at_gen DECIMAL(5,2),
    eto_at_gen              DECIMAL(6,2),
    model_version           VARCHAR(20),
    status                  recommendation_status_enum DEFAULT 'pending',
    user_feedback           recommendation_feedback_enum,
    feedback_at             TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (confidence_score BETWEEN 0 AND 1),
    CHECK (quantity_mm >= 0),
    CHECK (duration_minutes >= 0)
);

CREATE INDEX idx_recommendations_parcel_id    ON recommendations(parcel_id);
CREATE INDEX idx_recommendations_generated_at ON recommendations(generated_at DESC);
CREATE INDEX idx_recommendations_irrigate     ON recommendations(irrigate);

-- Droits
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO recommendation_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO recommendation_user;
```

#### `04-notification-db.sql`

```sql
-- =============================================================================
-- notification_db : alerts
-- Propriétaire : alert-service
-- =============================================================================

\connect notification_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMs
CREATE TYPE alert_type_enum AS ENUM (
  'hydric_stress_critical',
  'daily_recommendation',
  'sensor_offline',
  'low_battery',
  'rain_detected',
  'frost_risk',
  'sensor_anomaly',
  'subscription_expiring'
);

CREATE TYPE alert_status_enum AS ENUM (
  'unread', 'read', 'resolved'
);

-- Tables
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID,  -- Pas de FK : l'utilisateur est dans auth_db
    parcel_id       UUID,  -- Pas de FK : la parcelle est dans farm_db
    alert_type      alert_type_enum NOT NULL,
    status          alert_status_enum NOT NULL DEFAULT 'unread',
    title           VARCHAR(255),
    message         TEXT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id   ON alerts(user_id);
CREATE INDEX idx_alerts_parcel_id ON alerts(parcel_id);
CREATE INDEX idx_alerts_type      ON alerts(alert_type);

-- Droits
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO notify_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO notify_user;
```

#### `05-keycloak-db.sql`

```sql
-- =============================================================================
-- keycloak_db : schema keycloak
-- Propriétaire : keycloak
-- =============================================================================

\connect keycloak_db

CREATE SCHEMA IF NOT EXISTS keycloak;

-- Keycloak gère lui-même ses tables via son propre mécanisme de migration.
-- On crée uniquement le schema et on donne les droits à l'utilisateur keycloak.

GRANT ALL PRIVILEGES ON SCHEMA keycloak TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON TABLES TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON SEQUENCES TO keycloak_user;
```

#### `06-mlflow-db.sql`

```sql
-- =============================================================================
-- mlflow_db : MLflow metadata
-- Propriétaire : mlflow
-- =============================================================================

\connect mlflow_db

-- MLflow gère lui-même ses tables via ses propres migrations Alembic.
-- On crée uniquement la base et on donne les droits à l'utilisateur mlflow.

GRANT ALL PRIVILEGES ON DATABASE mlflow_db TO mlflow_user;
```

---

## 3. Fichiers à modifier

### 3.1 `infra/docker/docker-compose.yml`

#### Service `postgres`

Ajouter un volume pour monter les nouveaux scripts d'initialisation :

```yaml
postgres:
  image: postgis/postgis:16-3.4-alpine
  container_name: alkatra-postgres
  restart: unless-stopped
  environment:
    POSTGRES_USER: ${POSTGRES_USER:-admin}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-alkatra_postgres_pass}
    POSTGRES_DB: ${POSTGRES_DB:-alkatra_db}
    # Variables pour les mots de passe des bases dédiées
    AUTH_DB_PASSWORD: ${AUTH_DB_PASSWORD:-auth_dev_pass}
    FARM_DB_PASSWORD: ${FARM_DB_PASSWORD:-farm_dev_pass}
    RECOMMENDATION_DB_PASSWORD: ${RECOMMENDATION_DB_PASSWORD:-recommendation_dev_pass}
    NOTIFY_DB_PASSWORD: ${NOTIFY_DB_PASSWORD:-notify_dev_pass}
    KEYCLOAK_DB_PASSWORD: ${KEYCLOAK_DB_PASSWORD:-keycloak_dev_pass}
    MLFLOW_DB_PASSWORD: ${MLFLOW_DB_PASSWORD:-mlflow_dev_pass}
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ../postgres/00-create-databases.sh:/docker-entrypoint-initdb.d/00-create-databases.sh
    - ../postgres/01-auth-db.sql:/docker-entrypoint-initdb.d/01-auth-db.sql
    - ../postgres/02-farm-db.sql:/docker-entrypoint-initdb.d/02-farm-db.sql
    - ../postgres/03-recommendation-db.sql:/docker-entrypoint-initdb.d/03-recommendation-db.sql
    - ../postgres/04-notification-db.sql:/docker-entrypoint-initdb.d/04-notification-db.sql
    - ../postgres/05-keycloak-db.sql:/docker-entrypoint-initdb.d/05-keycloak-db.sql
    - ../postgres/06-mlflow-db.sql:/docker-entrypoint-initdb.d/06-mlflow-db.sql
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-admin} -d ${POSTGRES_DB:-alkatra_db}"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 60s
  networks:
    - alkatra-net
```

#### Service `auth-service`

Modifier la variable `DATABASE_URL` pour pointer vers `auth_db` :

```yaml
auth-service:
  build:
    context: ./../../apps/auth-service
    dockerfile: Dockerfile
    target: development
  container_name: alkatra-auth
  restart: unless-stopped
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    keycloak:
      condition: service_started
  environment:
    NODE_ENV: development
    AUTH_SERVICE_PORT: 3001
    DATABASE_URL: postgresql://auth_user:${AUTH_DB_PASSWORD:-auth_dev_pass}@postgres:5432/auth_db
    REDIS_HOST: redis
    REDIS_PORT: 6379
    REDIS_PASSWORD: ${REDIS_PASSWORD:-alkatra_redis_pass}
    JWT_SECRET: ${JWT_SECRET:-CHANGE_ME_JWT_SECRET_32_CHARS}
    JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-CHANGE_ME_REFRESH_SECRET_32_CHARS}
    JWT_ACCESS_EXPIRATION: 3600
    JWT_REFRESH_EXPIRATION: 2592000
    OTP_TTL_SECONDS: 300
    OTP_MAX_ATTEMPTS: 3
    OTP_BLOCK_DURATION_SECONDS: 1800
    INFOBIP_API_KEY: ${INFOBIP_API_KEY:-}
    INFOBIP_BASE_URL: ${INFOBIP_BASE_URL:-https://api.infobip.com}
    INFOBIP_SENDER: ${INFOBIP_SENDER:-AlKatra}
    KEYCLOAK_URL: http://keycloak:8080
    KEYCLOAK_REALM: alkatra
    KEYCLOAK_CLIENT_ID: alkatra-web
    KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-}
  ports:
    - "3001:3001"
  volumes:
    - ./../../apps/auth-service/src:/app/src
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/health"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 40s
  networks:
    - alkatra-net
  profiles:
    - phase1
```

#### Service `keycloak`

Modifier la variable `KC_DB_URL` pour pointer vers `keycloak_db` :

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:24.0
  container_name: alkatra-keycloak
  restart: unless-stopped
  command: start-dev
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak_db
    KC_DB_USERNAME: keycloak_user
    KC_DB_PASSWORD: ${KEYCLOAK_DB_PASSWORD:-keycloak_dev_pass}
    KC_DB_SCHEMA: keycloak
    KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
    KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-123}
    KC_HOSTNAME_STRICT: "false"
    KC_HTTP_ENABLED: "true"
  ports:
    - "8081:8080"
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "nc -z localhost 8080"]
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 45s
  networks:
    - alkatra-net
  profiles:
    - phase1
```

#### Service `mlflow`

Modifier les variables pour pointer vers `mlflow_db` :

```yaml
mlflow:
  build:
    context: ../../infra/mlflow
    dockerfile: Dockerfile
  container_name: alkatra-mlflow
  restart: unless-stopped
  depends_on:
    - postgres
    - minio
  volumes:
    - mlflow_data:/mlruns
  environment:
    POSTGRES_USER: mlflow_user
    POSTGRES_PASSWORD: ${MLFLOW_DB_PASSWORD:-mlflow_dev_pass}
    POSTGRES_DB: mlflow_db
    AWS_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-minio}
    AWS_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD:-minio123}
    MLFLOW_S3_ENDPOINT_URL: http://minio:9000
  ports:
    - "5001:5001"
  healthcheck:
    test: ["CMD-SHELL", "python -c \"import urllib.request, sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:5001/', timeout=5).getcode()==200 else sys.exit(1)\""]
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 60s
  networks:
    - alkatra-net
```

### 3.2 `.env.example`

Ajouter les mots de passe pour les nouvelles bases :

```env
# =============================================================================
# PostgreSQL — Multi-database architecture
# =============================================================================
POSTGRES_USER=admin
POSTGRES_PASSWORD=alkatra_postgres_pass
POSTGRES_DB=alkatra_db

# Mots de passe des bases dédiées (un par microservice)
AUTH_DB_PASSWORD=auth_dev_pass
FARM_DB_PASSWORD=farm_dev_pass
RECOMMENDATION_DB_PASSWORD=recommendation_dev_pass
NOTIFY_DB_PASSWORD=notify_dev_pass
KEYCLOAK_DB_PASSWORD=keycloak_dev_pass
MLFLOW_DB_PASSWORD=mlflow_dev_pass
```

### 3.3 `apps/auth-service/src/app.module.ts`

**Aucun changement nécessaire.** Le fichier utilise déjà `ConfigService` pour lire `DATABASE_URL` et ne charge que `UserEntity` :

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    url: configService.get<string>('database.url'),  // ← lit DATABASE_URL
    entities: [UserEntity],                           // ← ne charge que UserEntity
    synchronize: false,
    autoLoadEntities: true,
  }),
}),
```

### 3.4 `apps/auth-service/src/config/configuration.ts`

**Aucun changement nécessaire.** Le fichier lit `process.env.DATABASE_URL` :

```typescript
export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  // ... autres configurations
});
```

---

## 4. Fichiers à supprimer

| Fichier | Raison |
|---------|--------|
| `infra/postgres/init.sql` | Remplacé par les nouveaux scripts d'initialisation (`00-create-databases.sh`, `01-auth-db.sql`, etc.) |

---

## 5. Procédure de déploiement

### Étape 1 : Créer les fichiers d'initialisation

Créer le script `00-create-databases.sh` et les 6 fichiers SQL par base dans `infra/postgres/` selon le contenu décrit dans la section 2.

### Étape 2 : Modifier `docker-compose.yml`

Appliquer les modifications décrites dans la section 3.1 :
- Ajouter les volumes pour les nouveaux scripts init dans le service `postgres`
- Modifier `DATABASE_URL` de `auth-service` pour pointer vers `auth_db`
- Modifier `KC_DB_URL` de `keycloak` pour pointer vers `keycloak_db`
- Modifier les variables de `mlflow` pour pointer vers `mlflow_db`

### Étape 3 : Mettre à jour `.env.example`

Ajouter les mots de passe des bases dédiées.

### Étape 4 : Supprimer l'ancien fichier

```bash
rm infra/postgres/init.sql
```

### Étape 5 : Reset complet et redémarrage

```bash
# Arrêter la stack et supprimer TOUS les volumes (⚠️ perte de toutes les données)
docker compose --profile phase1 -f infra/docker/docker-compose.yml down -v

# Reconstruire les images (optionnel, pour prendre en compte les changements)
docker compose --profile phase1 -f infra/docker/docker-compose.yml build

# Démarrer la stack
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d
```

### Étape 6 : Vérifier que tout est opérationnel

Voir la section 6.

---

## 6. Vérification

### 6.1 Vérifier que PostgreSQL a créé les bases

```bash
docker exec alkatra-postgres psql -U admin -d postgres -c "\l"
```

La sortie doit montrer les bases suivantes :
```
auth_db
farm_db
recommendation_db
notification_db
keycloak_db
mlflow_db
alkatra_db (base par défaut, peut être supprimée ou conservée)
```

### 6.2 Vérifier que les tables existent dans chaque base

```bash
# auth_db
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\dt"

# farm_db
docker exec alkatra-postgres psql -U farm_user -d farm_db -c "\dt"

# recommendation_db
docker exec alkatra-postgres psql -U recommendation_user -d recommendation_db -c "\dt"

# notification_db
docker exec alkatra-postgres psql -U notify_user -d notification_db -c "\dt"
```

### 6.3 Vérifier que les utilisateurs n'ont accès qu'à leur base

```bash
# auth_user ne doit PAS pouvoir lister les tables de farm_db
docker exec alkatra-postgres psql -U auth_user -d farm_db -c "\dt"
# → Erreur : permission denied
```

### 6.4 Vérifier que auth-service est opérationnel

```bash
# Healthcheck
curl http://localhost:3001/health

# Inscription (test)
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "+212612345678"}'
# → {"success":true,"message":"OTP envoyé","expiresAt":"..."}
```

### 6.5 Vérifier que keycloak est opérationnel

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081
# → 200 (ou 302, selon la configuration)
```

### 6.6 Vérifier que mlflow est opérationnel

```bash
curl -s http://localhost:5001/health
# → {"status":"OK"}
```

---

## 7. Annexe : Conséquences architecturales

### 7.1 Pas de foreign keys cross-base

Les colonnes qui référençaient des tables d'autres services ne peuvent plus avoir de contrainte `REFERENCES` (foreign key) car PostgreSQL ne supporte pas les foreign keys entre bases différentes.

**Colonnes concernées :**

| Table | Colonne | Référence (avant) | Nouveau comportement |
|-------|---------|-------------------|----------------------|
| `farms` | `user_id` | `REFERENCES users(id)` | Pas de FK. L'intégrité est gérée par l'application (farm-service appelle auth-service pour vérifier que l'utilisateur existe) |
| `recommendations` | `parcel_id` | `REFERENCES parcels(id)` | Pas de FK. L'intégrité est gérée par l'application |
| `alerts` | `user_id` | `REFERENCES users(id)` | Pas de FK |
| `alerts` | `parcel_id` | `REFERENCES parcels(id)` | Pas de FK |

### 7.2 Communication inter-services

Quand un service a besoin de données d'un autre service, il doit utiliser l'API REST (ou Kafka), pas un accès SQL direct.

**Exemples :**

| Besoin | Service appelant | Service appelé | Méthode |
|--------|-----------------|----------------|---------|
| Vérifier qu'un utilisateur existe | `farm-service` | `auth-service` | `GET /internal/user/:userId` |
| Récupérer le profil d'un utilisateur | `user-service` | `auth-service` | `GET /internal/user/:userId` (déjà implémenté) |
| Récupérer les parcelles d'une ferme | `recommendation-service` | `farm-service` | `GET /api/v1/parcels?farmId=...` |
| Envoyer une notification à un utilisateur | `alert-service` | `auth-service` | `GET /internal/user/:userId` (pour récupérer le numéro de téléphone) |

### 7.3 Données de test

Les données de test ne sont plus insérées via SQL. Chaque service doit exposer un endpoint ou un script pour créer ses données de test via son API.

**Pour auth-service** : l'endpoint `POST /api/v1/auth/register` crée un utilisateur (en développement, l'OTP est loggé dans la console).

**Pour farm-service** (quand il sera implémenté) : l'endpoint `POST /api/v1/farms` créera une ferme après authentification JWT.

---

## 8. Annexe : Commandes utiles

### Lister les bases de données

```bash
docker exec alkatra-postgres psql -U admin -d postgres -c "\l"
```

### Lister les tables d'une base spécifique

```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\dt"
docker exec alkatra-postgres psql -U farm_user -d farm_db -c "\dt"
docker exec alkatra-postgres psql -U recommendation_user -d recommendation_db -c "\dt"
docker exec alkatra-postgres psql -U notify_user -d notification_db -c "\dt"
```

### Décrire une table

```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\d users"
```

### Vérifier les droits d'un utilisateur

```bash
docker exec alkatra-postgres psql -U admin -d postgres -c "\du"
```

### Se connecter à une base avec un utilisateur spécifique

```bash
docker exec -it alkatra-postgres psql -U auth_user -d auth_db
```

### Vérifier les logs PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.yml logs postgres
```

---

## 9. Annexe : Résolution des problèmes courants

### Problème : `psql: error: FATAL: database "auth_db" does not exist`

**Cause** : Les scripts d'initialisation n'ont pas été exécutés (volume existant avec des données précédentes).

**Solution** : Supprimer le volume et redémarrer :
```bash
docker compose --profile phase1 -f infra/docker/docker-compose.yml down -v
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d
```

### Problème : `psql: error: FATAL: permission denied for database "farm_db"`

**Cause** : L'utilisateur `auth_user` essaie de se connecter à `farm_db`.

**Solution** : C'est un comportement normal. Chaque utilisateur ne doit se connecter qu'à sa propre base.

### Problème : `ERROR: relation "users" does not exist`

**Cause** : Le service essaie d'accéder à une table qui n'existe pas dans sa base.

**Solution** : Vérifier que le fichier SQL correspondant a bien été exécuté :
```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\dt"
```

### Problème : `ERROR: type "user_language_enum" does not exist`

**Cause** : L'ENUM n'a pas été créé dans la base.

**Solution** : Vérifier que le fichier SQL contient bien la création de l'ENUM avant la création de la table qui l'utilise.

### Problème : `ERROR: column "phone_number" of relation "users" does not exist`

**Cause** : L'ancien `init.sql` référençait `phone_number` mais la table a été recréée avec `phone`.

**Solution** : C'est normal. La nouvelle table utilise `phone` (conforme à l'entité TypeORM `UserEntity`).