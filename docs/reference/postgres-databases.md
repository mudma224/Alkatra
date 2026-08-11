# PostgreSQL — Architecture multi-bases

> **Conteneur** : `alkatra-postgres`  
> **Image** : `postgis/postgis:16-3.4-alpine`  
> **Port** : 5432  
> **Principe** : Un microservice = une base de données. Chaque base a son propre utilisateur PostgreSQL avec des droits strictement limités à sa base.

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Bases de données](#2-bases-de-données)
3. [Utilisateurs et droits](#3-utilisateurs-et-droits)
4. [Fichiers d'initialisation](#4-fichiers-dinitialisation)
5. [Schémas par base](#5-schémas-par-base)
6. [Extensions PostgreSQL](#6-extensions-postgresql)
7. [ENUMs par base](#7-enums-par-base)
8. [Communication inter-bases](#8-communication-inter-bases)
9. [Commandes utiles](#9-commandes-utiles)
10. [Dépannage](#10-dépannage)

---

## 1. Architecture générale

### Principe

Chaque microservice possède **sa propre base de données** et **son propre utilisateur PostgreSQL**. Un service ne peut pas se connecter aux bases des autres services. Les échanges de données entre services passent exclusivement par des appels API REST (HTTP) ou Kafka, jamais par accès SQL direct.

### Schéma

```
┌─────────────────────────────────────────────────────────────┐
│                  1 instance PostgreSQL                       │
│                  (conteneur alkatra-postgres)                │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  auth_db  │  │ farm_db  │  │recommendation│  │notifica-│ │
│  │           │  │          │  │    _db       │  │tion_db  │ │
│  │  users    │  │  farms   │  │recommendations│  │ alerts  │ │
│  │           │  │  parcels │  │              │  │         │ │
│  │           │  │  sensors │  │              │  │         │ │
│  └────┬──────┘  └────┬─────┘  └──────┬───────┘  └────┬────┘ │
│       │              │               │               │      │
│  auth_user      farm_user     recommendation_user  notify   │
│                                                        _user│
│                                                              │
│  ┌──────────────┐  ┌──────────┐                              │
│  │ keycloak_db  │  │ mlflow_db│                              │
│  │              │  │          │                              │
│  │ schema       │  │ (géré    │                              │
│  │ keycloak     │  │  par     │                              │
│  │              │  │  MLflow) │                              │
│  └──────┬───────┘  └────┬─────┘                              │
│         │               │                                     │
│  keycloak_user     mlflow_user                                │
└─────────────────────────────────────────────────────────────┘
```

### Services et leurs bases

| Service | Base de données | Utilisateur | Tables |
|---------|----------------|-------------|--------|
| `auth-service` | `auth_db` | `auth_user` | `users` |
| `farm-service` | `farm_db` | `farm_user` | `farms`, `parcels`, `sensors` |
| `recommendation-service` | `recommendation_db` | `recommendation_user` | `recommendations` |
| `alert-service` | `notification_db` | `notify_user` | `alerts` |
| `keycloak` | `keycloak_db` | `keycloak_user` | schema `keycloak` (géré par Keycloak) |
| `mlflow` | `mlflow_db` | `mlflow_user` | Tables gérées par MLflow (Alembic) |

### Services qui n'utilisent PAS PostgreSQL

| Service | Technologie de stockage |
|---------|------------------------|
| `user-service` | Aucune (proxy HTTP vers auth-service) |
| `iot-service` | MongoDB (`ai_sensor_features`, `et0`) |
| `ml-inference-service` | MongoDB (`irrigation_recommendations`) |
| `spark-jobs` | Kafka + Redis |

---

## 2. Bases de données

### Liste des bases

| Base | Créée dans | Propriétaire du schema | Taille estimée |
|------|-----------|----------------------|----------------|
| `auth_db` | `00-create-databases.sh` | `auth_user` | Faible (une table) |
| `farm_db` | `00-create-databases.sh` | `farm_user` | Moyenne (3 tables + PostGIS) |
| `recommendation_db` | `00-create-databases.sh` | `recommendation_user` | Moyenne (1 table, beaucoup de lignes) |
| `notification_db` | `00-create-databases.sh` | `notify_user` | Faible (1 table) |
| `keycloak_db` | `00-create-databases.sh` | `keycloak_user` | Faible (schema géré par Keycloak) |
| `mlflow_db` | `00-create-databases.sh` | `mlflow_user` | Faible (géré par MLflow) |

### Connexion depuis les services

Chaque service se connecte à sa base via la variable d'environnement `DATABASE_URL` (ou équivalent) définie dans `docker-compose.yml` :

```yaml
# auth-service
DATABASE_URL: postgresql://auth_user:${AUTH_DB_PASSWORD}@postgres:5432/auth_db

# farm-service
DATABASE_URL: postgresql://farm_user:${FARM_DB_PASSWORD}@postgres:5432/farm_db

# recommendation-service
DATABASE_URL: postgresql://recommendation_user:${RECOMMENDATION_DB_PASSWORD}@postgres:5432/recommendation_db

# alert-service
DATABASE_URL: postgresql://notify_user:${NOTIFY_DB_PASSWORD}@postgres:5432/notification_db
```

---

## 3. Utilisateurs et droits

### Création des utilisateurs

Les utilisateurs sont créés dans `00-create-databases.sh` :

```bash
CREATE USER auth_user WITH PASSWORD '${AUTH_DB_PASSWORD}';
GRANT CONNECT ON DATABASE auth_db TO auth_user;
GRANT CREATE ON DATABASE auth_db TO auth_user;
GRANT USAGE ON SCHEMA public TO auth_user;
GRANT CREATE ON SCHEMA public TO auth_user;
```

### Isolation stricte

Chaque utilisateur ne peut se connecter qu'à **sa propre base**. L'isolation est assurée par 3 mécanismes :

#### Mécanisme 1 : Révocation de l'accès public (étape 3 du script)

```sql
REVOKE CONNECT ON DATABASE auth_db FROM public;
REVOKE CONNECT ON DATABASE farm_db FROM public;
-- ... pour toutes les bases
```

Par défaut, PostgreSQL donne le droit `CONNECT` à `public` sur toutes les bases. Cette commande le révoque.

#### Mécanisme 2 : Transfert de propriété du schema (étape 4 du script)

```sql
ALTER SCHEMA public OWNER TO auth_user;
```

Chaque schema `public` appartient à l'utilisateur du service. L'utilisateur admin (`admin`) n'est plus propriétaire.

#### Mécanisme 3 : Révocation de l'accès croisé (étape 5 du script)

```sql
-- auth_user ne peut PAS se connecter aux autres bases
REVOKE CONNECT ON DATABASE farm_db FROM auth_user;
REVOKE CONNECT ON DATABASE recommendation_db FROM auth_user;
REVOKE CONNECT ON DATABASE notification_db FROM auth_user;
REVOKE CONNECT ON DATABASE keycloak_db FROM auth_user;
REVOKE CONNECT ON DATABASE mlflow_db FROM auth_user;

-- Même chose pour chaque utilisateur (farm_user, recommendation_user, etc.)
```

### Tableau des droits

| Utilisateur | auth_db | farm_db | recommendation_db | notification_db | keycloak_db | mlflow_db |
|-------------|---------|---------|-------------------|-----------------|-------------|-----------|
| `admin` (root) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth_user` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `farm_user` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `recommendation_user` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `notify_user` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `keycloak_user` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `mlflow_user` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 4. Fichiers d'initialisation

### Structure

```
infra/postgres/
├── 00-create-databases.sh          # Script principal (création bases + users + droits)
├── 05-keycloak-db.sql              # Schema keycloak
├── 06-mlflow-db.sql                # Permissions mlflow
└── schemas/
    ├── auth-db.sql                 # auth_db : table users
    ├── farm-db.sql                 # farm_db : tables farms, parcels, sensors
    ├── recommendation-db.sql       # recommendation_db : table recommendations
    └── notification-db.sql         # notification_db : table alerts
```

### Ordre d'exécution

Le conteneur PostgreSQL exécute les fichiers dans l'ordre alphabétique. Le script `00-create-databases.sh` est exécuté en premier, puis les fichiers SQL.

### Montage dans docker-compose.yml

```yaml
postgres:
  image: postgis/postgis:16-3.4-alpine
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ../postgres/00-create-databases.sh:/docker-entrypoint-initdb.d/00-create-databases.sh
    - ../postgres/schemas:/scripts/schemas
```

- `00-create-databases.sh` est monté directement dans `/docker-entrypoint-initdb.d/` (exécuté automatiquement)
- Le dossier `schemas/` est monté dans `/scripts/schemas` (accessible par le script shell)

### Script `00-create-databases.sh`

Le script s'exécute en **6 étapes** :

| Étape | Action | Détail |
|-------|--------|--------|
| **Étape 1** | Création des bases | `CREATE DATABASE auth_db`, `farm_db`, `recommendation_db`, `notification_db`, `keycloak_db`, `mlflow_db` |
| **Étape 2** | Création des utilisateurs | `CREATE USER auth_user WITH PASSWORD ...`, etc. + droits de connexion et création |
| **Étape 3** | Révocation accès public | `REVOKE CONNECT ON DATABASE ... FROM public` |
| **Étape 4** | Transfert propriété schema | `ALTER SCHEMA public OWNER TO auth_user` (dans chaque base) |
| **Étape 5** | Révocation accès croisé | `REVOKE CONNECT ON DATABASE farm_db FROM auth_user`, etc. |
| **Étape 6** | Exécution des schemas | `psql --dbname auth_db < /scripts/schemas/auth-db.sql`, etc. |

### Fichiers de schema

Chaque fichier de schema suit le même pattern :

```sql
-- 1. Création des extensions (en tant que superuser)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Passage au rôle du service (les objets créés lui appartiendront)
SET ROLE auth_user;

-- 3. Création des ENUMs
CREATE TYPE user_language_enum AS ENUM ('darija', 'arabic', 'french');

-- 4. Création de la fonction trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at() ...

-- 5. Création des tables
CREATE TABLE users ( ... );

-- 6. Création des index
CREATE INDEX idx_users_phone ON users(phone);

-- 7. Création des triggers
CREATE TRIGGER set_users_updated_at ...

-- 8. Droits par défaut pour les objets futurs
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT EXECUTE ON FUNCTIONS TO auth_user;

-- 9. Retour au rôle admin
SET ROLE admin;
```

---

## 5. Schémas par base

### `auth_db` — Table `users`

**Fichier** : `infra/postgres/schemas/auth-db.sql`  
**Service propriétaire** : `auth-service`  
**Utilisateur** : `auth_user`

```sql
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone              VARCHAR(20) UNIQUE NOT NULL,
    name               VARCHAR(100),
    preferred_language  user_language_enum DEFAULT 'darija',
    otp_attempts       INT DEFAULT 0,
    otp_blocked_until   TIMESTAMP WITH TIME ZONE,
    last_login_at      TIMESTAMP WITH TIME ZONE,
    keycloak_id        VARCHAR(100) UNIQUE,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK, auto-généré | Identifiant unique de l'utilisateur |
| `phone` | VARCHAR(20) | UNIQUE, NOT NULL | Numéro de téléphone (format +212XXXXXXXXX) |
| `name` | VARCHAR(100) | nullable | Nom complet de l'utilisateur |
| `preferred_language` | ENUM | défaut `'darija'` | Langue préférée (`darija`, `arabic`, `french`) |
| `otp_attempts` | INT | défaut 0 | Nombre de tentatives OTP échouées |
| `otp_blocked_until` | TIMESTAMP | nullable | Date de fin de blocage OTP |
| `last_login_at` | TIMESTAMP | nullable | Dernière connexion |
| `keycloak_id` | VARCHAR(100) | UNIQUE, nullable | ID de l'utilisateur dans Keycloak |
| `created_at` | TIMESTAMP | NOT NULL, auto | Date de création |
| `updated_at` | TIMESTAMP | NOT NULL, auto | Date de dernière modification |

**Index** : `idx_users_phone` sur `phone`  
**Trigger** : `set_users_updated_at` (met à jour `updated_at` avant chaque UPDATE)

---

### `farm_db` — Tables `farms`, `parcels`, `sensors`

**Fichier** : `infra/postgres/schemas/farm-db.sql`  
**Service propriétaire** : `farm-service`  
**Utilisateur** : `farm_user`

#### Table `farms`

```sql
CREATE TABLE farms (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id       UUID NOT NULL,
    name           VARCHAR(150) NOT NULL,
    region         VARCHAR(100),
    location       GEOMETRY(POINT, 4326),
    total_area_ha  DECIMAL(10,2),
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (total_area_ha > 0)
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK, auto-généré | Identifiant unique de la ferme |
| `owner_id` | UUID | NOT NULL | Propriétaire de la ferme (dans auth_db, pas de FK) |
| `name` | VARCHAR(150) | NOT NULL | Nom de la ferme |
| `region` | VARCHAR(100) | nullable | Région géographique |
| `location` | GEOMETRY(POINT, 4326) | nullable | Coordonnées GPS (PostGIS) |
| `total_area_ha` | DECIMAL(10,2) | > 0 | Surface totale en hectares |
| `created_at` | TIMESTAMP | NOT NULL, auto | Date de création |
| `updated_at` | TIMESTAMP | NOT NULL, auto | Date de modification |

**Index** : `idx_farms_owner_id` (owner_id), `idx_farms_location` (GIST sur location)  
**Trigger** : `set_farms_updated_at`

#### Table `parcels`

```sql
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
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique de la parcelle |
| `farm_id` | UUID | FK → farms(id) CASCADE | Ferme parente |
| `name` | VARCHAR(150) | NOT NULL, UNIQUE(farm_id) | Nom de la parcelle |
| `area_ha` | DECIMAL(10,2) | > 0 | Surface en hectares |
| `crop_type` | ENUM | défaut `'olive'` | Type de culture |
| `crop_variety` | VARCHAR(100) | nullable | Variété de la culture |
| `soil_type` | ENUM | défaut `'mixed'` | Type de sol |
| `irrigation_method` | ENUM | défaut `'drip'` | Méthode d'irrigation |
| `flow_rate_m3h` | DECIMAL(8,2) | >= 0 | Débit d'irrigation (m³/h) |
| `tree_age_years` | INT | >= 0 | Âge des arbres (années) |
| `tree_density_per_ha` | INT | >= 0 | Densité d'arbres par hectare |
| `polygon` | GEOMETRY(POLYGON, 4326) | ST_IsValid | Polygone de la parcelle (PostGIS) |
| `centroid` | GEOMETRY(POINT, 4326) | nullable | Centre de la parcelle (PostGIS) |
| `is_active` | BOOLEAN | défaut TRUE | Parcelle active |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Date de modification |

**Index** : `idx_parcels_farm_id`, `idx_parcels_centroid` (GIST), `idx_parcels_active` (partiel)  
**Trigger** : `set_parcels_updated_at`

#### Table `sensors`

```sql
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
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique du capteur |
| `parcel_id` | UUID | FK → parcels(id) CASCADE | Parcelle associée |
| `device_id` | VARCHAR(100) | UNIQUE, NOT NULL | Identifiant matériel du capteur |
| `device_type` | VARCHAR(50) | défaut `'esp32-wroom-32'` | Type de capteur |
| `is_active` | BOOLEAN | défaut TRUE | Capteur actif |
| `last_seen_at` | TIMESTAMP | nullable | Dernière communication |
| `battery_pct` | INT | 0-100 | Niveau de batterie |
| `firmware_version` | VARCHAR(20) | nullable | Version du firmware |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Date de modification |

**Index** : `idx_sensors_parcel_id`, `idx_sensors_device_id`, `idx_sensors_active`  
**Trigger** : `set_sensors_updated_at`

---

### `recommendation_db` — Table `recommendations`

**Fichier** : `infra/postgres/schemas/recommendation-db.sql`  
**Service propriétaire** : `recommendation-service`  
**Utilisateur** : `recommendation_user`

```sql
CREATE TABLE recommendations (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id                UUID NOT NULL,
    generated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    irrigate                 BOOLEAN NOT NULL,
    confidence_score         DECIMAL(4,3),
    quantity_mm              DECIMAL(6,2),
    duration_minutes         INT,
    reason_code              VARCHAR(50),
    shap_factors             JSONB,
    explanation_text_fr      TEXT,
    explanation_text_darija  TEXT,
    soil_humidity_pct_at_gen DECIMAL(5,2),
    eto_at_gen               DECIMAL(6,2),
    model_version            VARCHAR(20),
    status                   recommendation_status_enum DEFAULT 'pending',
    user_feedback            recommendation_feedback_enum,
    feedback_at              TIMESTAMP WITH TIME ZONE,
    demo_mode                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Idempotence : un replay Kafka ne doit pas créer de doublon pour une même
    -- parcelle et un même instant de génération.
    UNIQUE (parcel_id, generated_at),
    CHECK (confidence_score BETWEEN 0 AND 1),
    CHECK (quantity_mm >= 0),
    CHECK (duration_minutes >= 0)
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `parcel_id` | UUID | NOT NULL | Parcelle concernée (dans farm_db, pas de FK) |
| `generated_at` | TIMESTAMP | NOT NULL, auto | Date de génération de la recommandation |
| `irrigate` | BOOLEAN | NOT NULL | Faut-il irriguer ? |
| `confidence_score` | DECIMAL(4,3) | 0-1 | Score de confiance du modèle |
| `quantity_mm` | DECIMAL(6,2) | >= 0 | Quantité d'eau recommandée (mm) |
| `duration_minutes` | INT | >= 0 | Durée d'irrigation recommandée |
| `reason_code` | VARCHAR(50) | nullable | Code de la raison |
| `shap_factors` | JSONB | nullable | Facteurs SHAP (explications ML) |
| `explanation_text_fr` | TEXT | nullable | Explication en français |
| `explanation_text_darija` | TEXT | nullable | Explication en darija |
| `soil_humidity_pct_at_gen` | DECIMAL(5,2) | nullable | Humidité du sol au moment de la génération |
| `eto_at_gen` | DECIMAL(6,2) | nullable | ETo au moment de la génération |
| `model_version` | VARCHAR(20) | nullable | Version du modèle ML |
| `status` | ENUM | défaut `'pending'` | Statut de la recommandation |
| `user_feedback` | ENUM | nullable | Feedback de l'utilisateur |
| `feedback_at` | TIMESTAMP | nullable | Date du feedback |
| `demo_mode` | BOOLEAN | NOT NULL, défaut `FALSE` | Indique si la recommandation a été générée en mode démo (sans capteur réel) |
| `created_at` | TIMESTAMP | auto | Date de création |

**Contrainte unique** : `UNIQUE (parcel_id, generated_at)` — garantit l'idempotence des replays Kafka (une seule recommandation par parcelle et par instant de génération).

**Index** : `idx_recommendations_parcel_id`, `idx_recommendations_generated_at` (DESC), `idx_recommendations_irrigate`, `idx_recommendations_parcel_generated` (composite `parcel_id`, `generated_at DESC`, optimise la requête de recherche par parcelle et par journée)

---

### `notification_db` — Table `alerts`

**Fichier** : `infra/postgres/schemas/notification-db.sql`  
**Service propriétaire** : `alert-service`  
**Utilisateur** : `notify_user`

```sql
CREATE TABLE alerts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID,
    parcel_id  UUID,
    alert_type alert_type_enum NOT NULL,
    status     alert_status_enum NOT NULL DEFAULT 'unread',
    title      VARCHAR(255),
    message    TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `user_id` | UUID | nullable | Utilisateur concerné (dans auth_db, pas de FK) |
| `parcel_id` | UUID | nullable | Parcelle concernée (dans farm_db, pas de FK) |
| `alert_type` | ENUM | NOT NULL | Type d'alerte |
| `status` | ENUM | défaut `'unread'` | Statut de l'alerte |
| `title` | VARCHAR(255) | nullable | Titre de l'alerte |
| `message` | TEXT | NOT NULL | Message de l'alerte |
| `created_at` | TIMESTAMP | auto | Date de création |

**Index** : `idx_alerts_user_id`, `idx_alerts_parcel_id`, `idx_alerts_type`

---

### `keycloak_db` — Schema keycloak

**Fichier** : `infra/postgres/05-keycloak-db.sql`  
**Service propriétaire** : `keycloak`  
**Utilisateur** : `keycloak_user`

```sql
CREATE SCHEMA IF NOT EXISTS keycloak;

GRANT ALL PRIVILEGES ON SCHEMA keycloak TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON TABLES TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON SEQUENCES TO keycloak_user;
```

Keycloak gère lui-même ses tables via son propre mécanisme de migration. Le fichier SQL crée uniquement le schema et donne les droits.

### `mlflow_db` — Base MLflow

**Fichier** : `infra/postgres/06-mlflow-db.sql`  
**Service propriétaire** : `mlflow`  
**Utilisateur** : `mlflow_user`

Le fichier est un commentaire : les droits sont gérés dans `00-create-databases.sh`. MLflow gère ses propres tables via Alembic.

---

## 6. Extensions PostgreSQL

| Extension | auth_db | farm_db | recommendation_db | notification_db |
|-----------|---------|---------|-------------------|-----------------|
| `uuid-ossp` | ✅ | ✅ | ✅ | ✅ |
| `postgis` | ❌ | ✅ | ❌ | ❌ |

- **`uuid-ossp`** : Génération d'UUID v4 via `uuid_generate_v4()`. Installée dans toutes les bases métier.
- **`postgis`** : Extension spatiale. Installée uniquement dans `farm_db` car seules les tables `farms` et `parcels` utilisent des types géométriques (`GEOMETRY(POINT, 4326)`, `GEOMETRY(POLYGON, 4326)`).

---

## 7. ENUMs par base

### `auth_db`

```sql
CREATE TYPE user_language_enum AS ENUM ('darija', 'arabic', 'french');
```

Utilisé par : `users.preferred_language`

### `farm_db`

```sql
CREATE TYPE crop_type_enum AS ENUM ('olive', 'citrus', 'cereal', 'vegetable', 'other');
CREATE TYPE soil_type_enum AS ENUM ('clay', 'silt', 'sandy', 'calcareous', 'mixed');
CREATE TYPE irrigation_method_enum AS ENUM ('drip', 'sprinkler', 'gravity');
```

Utilisé par : `parcels.crop_type`, `parcels.soil_type`, `parcels.irrigation_method`

### `recommendation_db`

```sql
CREATE TYPE recommendation_feedback_enum AS ENUM ('accepted', 'rejected', 'ignored');
CREATE TYPE recommendation_status_enum AS ENUM ('pending', 'seen', 'accepted', 'rejected', 'executed', 'expired');
```

Utilisé par : `recommendations.user_feedback`, `recommendations.status`

### `notification_db`

```sql
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

CREATE TYPE alert_status_enum AS ENUM ('unread', 'read', 'resolved');
```

Utilisé par : `alerts.alert_type`, `alerts.status`

---

## 8. Communication inter-bases

### Principe

Les bases de données sont **strictement isolées**. Aucun service ne peut lire ou écrire directement dans la base d'un autre service. Les échanges de données se font exclusivement via :

1. **API REST (HTTP)** : pour les requêtes synchrones (ex: `user-service` appelle `auth-service:3001/internal/user/:userId`)
2. **Kafka** : pour les événements asynchrones (ex: double-write MongoDB → PostgreSQL)

### Cas concrets

| Besoin | Service appelant | Service appelé | Méthode |
|--------|-----------------|----------------|---------|
| Lire le profil d'un utilisateur | `user-service` | `auth-service` | `GET /internal/user/:userId` |
| Vérifier qu'un utilisateur existe | `farm-service` | `auth-service` | `GET /internal/user/:userId` |
| Récupérer les parcelles d'une ferme | `recommendation-service` | `farm-service` | `GET /api/v1/parcels?farmId=...` |
| Envoyer une notification | `alert-service` | `auth-service` | `GET /internal/user/:userId` (pour récupérer le téléphone) |

### Conséquences sur les foreign keys

Les colonnes qui référençaient des tables d'autres services ne peuvent plus avoir de contrainte `REFERENCES` (PostgreSQL ne supporte pas les foreign keys entre bases différentes).

| Table | Colonne | Cible logique | Contrainte SQL |
|-------|---------|---------------|----------------|
| `farms` | `owner_id` | `users(id)` (base `auth_db`) | Pas de FK. L'intégrité est gérée par l'application |
| `recommendations` | `parcel_id` | `parcels(id)` (base `farm_db`) | Pas de FK. L'intégrité est gérée par l'application |
| `alerts` | `user_id` | `users(id)` (base `auth_db`) | Pas de FK |
| `alerts` | `parcel_id` | `parcels(id)` (base `farm_db`) | Pas de FK |

Les foreign keys **internes à une même base** sont conservées :
- `parcels.farm_id → farms(id)` ✅ (même base `farm_db`)
- `sensors.parcel_id → parcels(id)` ✅ (même base `farm_db`)

---

## 9. Commandes utiles

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

### Lister les utilisateurs et leurs droits

```bash
docker exec alkatra-postgres psql -U admin -d postgres -c "\du"
```

### Vérifier les droits d'accès d'un utilisateur

```bash
# auth_user doit pouvoir se connecter à auth_db
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "SELECT current_database();"
# → auth_db

# auth_user ne doit PAS pouvoir se connecter à farm_db
docker exec alkatra-postgres psql -U auth_user -d farm_db -c "SELECT current_database();"
# → ERROR: permission denied for database "farm_db"
```

### Voir les ENUMs d'une base

```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\dT+"
```

### Voir les index d'une table

```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\di users*"
```

### Se connecter en interactif

```bash
docker exec -it alkatra-postgres psql -U auth_user -d auth_db
```

### Voir les logs PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.yml logs postgres
```

---

## 10. Dépannage

### Problème : `FATAL: database "auth_db" does not exist`

**Cause** : Les scripts d'initialisation n'ont pas été exécutés (le volume a été créé sans les scripts d'init, ou avec un jeu de scripts différent).

**Solution** : Supprimer le volume et redémarrer :
```bash
docker compose --profile phase1 -f infra/docker/docker-compose.yml down -v
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d
```

### Problème : `FATAL: permission denied for database "farm_db"`

**Cause** : L'utilisateur `auth_user` essaie de se connecter à `farm_db`.

**Solution** : C'est un comportement normal et voulu. Chaque utilisateur ne doit se connecter qu'à sa propre base.

### Problème : `ERROR: relation "users" does not exist`

**Cause** : Le service essaie d'accéder à une table qui n'existe pas dans sa base.

**Solution** : Vérifier que le fichier SQL correspondant a bien été exécuté :
```bash
docker exec alkatra-postgres psql -U auth_user -d auth_db -c "\dt"
```

### Problème : `ERROR: type "user_language_enum" does not exist`

**Cause** : L'ENUM n'a pas été créé dans la base (fichier SQL mal ordonné).

**Solution** : Vérifier que la création de l'ENUM précède la création de la table qui l'utilise dans le fichier SQL.

### Problème : `ERROR: column "phone_number" of relation "users" does not exist`

**Cause** : La colonne s'appelle `phone` dans le schéma `auth-db.sql`. Le nom `phone_number` correspond à une autre convention de nommage.

**Solution** : Utiliser `phone` dans les requêtes et les entités (conforme à l'entité TypeORM `UserEntity`).

### Problème : `ERROR: must be owner of schema public`

**Cause** : Le script tente de créer des objets avec un utilisateur qui n'est pas propriétaire du schema.

**Solution** : Vérifier que `SET ROLE auth_user;` est exécuté avant les commandes `CREATE TABLE`. Vérifier que `ALTER SCHEMA public OWNER TO auth_user;` a bien été exécuté à l'étape 4 du script.