-- ==========================================================
-- AL KATRA BEL QATRA
-- Database Initialization Script
-- PostgreSQL + PostGIS
-- ==========================================================

-- ==========================================================
-- CREATE APPLICATION USER (if it does not already exist)
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT
        FROM pg_catalog.pg_user
        WHERE usename = 'alkatra'
    ) THEN
        CREATE USER alkatra WITH PASSWORD 'alkatra_postgres_pass';
    END IF;
END
$$;

-- ==========================================================
-- DATABASE PRIVILEGES
-- ==========================================================

GRANT ALL PRIVILEGES ON DATABASE alkatra_db TO alkatra;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO alkatra;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO alkatra;

-- ==========================================================
-- REQUIRED EXTENSIONS
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================================================
-- SCHEMAS
-- ==========================================================

CREATE SCHEMA IF NOT EXISTS keycloak;

-- ==========================================================
-- ENUM TYPES
-- ==========================================================

CREATE TYPE user_language_enum AS ENUM (
    'darija',
    'arabic',
    'french'
);

CREATE TYPE user_role_enum AS ENUM (
    'farmer',
    'cooperative',
    'technician',
    'admin'
);

CREATE TYPE crop_type_enum AS ENUM (
    'olive',
    'citrus',
    'cereal',
    'vegetable',
    'other'
);

CREATE TYPE soil_type_enum AS ENUM (
    'clay',
    'silt',
    'sandy',
    'calcareous',
    'mixed'
);

CREATE TYPE irrigation_method_enum AS ENUM (
    'drip',
    'sprinkler',
    'gravity'
);

CREATE TYPE recommendation_feedback_enum AS ENUM (
    'accepted',
    'rejected',
    'ignored'
);

CREATE TYPE subscription_status_enum AS ENUM (
    'active',
    'expired',
    'cancelled',
    'freemium'
);

CREATE TYPE payment_method_enum AS ENUM (
    'cmi',
    'mcash',
    'orange_money',
    'virement',
    'cash'
);

CREATE TYPE recommendation_status_enum AS ENUM (
    'pending',
    'seen',
    'accepted',
    'rejected',
    'executed',
    'expired'
);

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
    'unread',
    'read',
    'resolved'
);

-- ==========================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ==========================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

-- ==========================================================
-- USERS
-- ==========================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),

    preferred_language user_language_enum
        DEFAULT 'darija',

    otp_attempts INT
        DEFAULT 0,

    otp_blocked_until TIMESTAMP WITH TIME ZONE,

    last_login_at TIMESTAMP WITH TIME ZONE,

    keycloak_id VARCHAR(100)
        UNIQUE,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- USERS INDEXES
-- ==========================================================

CREATE INDEX idx_users_phone
ON users(phone);

CREATE INDEX idx_users_keycloak
ON users(keycloak_id);

-- ==========================================================
-- USERS TRIGGER
-- ==========================================================

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ==========================================================
-- FARMS
-- ==========================================================

CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    name VARCHAR(150) NOT NULL,

    region VARCHAR(100),

    location GEOMETRY(POINT, 4326),

    total_area_ha DECIMAL(10,2),

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (total_area_ha > 0)
);

-- ==========================================================
-- FARMS INDEXES
-- ==========================================================

CREATE INDEX idx_farms_user_id
ON farms(user_id);

CREATE INDEX idx_farms_location
ON farms
USING GIST(location);

-- ==========================================================
-- FARMS TRIGGER
-- ==========================================================

CREATE TRIGGER set_farms_updated_at
BEFORE UPDATE ON farms
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ==========================================================
-- PARCELS
-- ==========================================================

CREATE TABLE parcels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    farm_id UUID NOT NULL
        REFERENCES farms(id)
        ON DELETE CASCADE,

    name VARCHAR(150) NOT NULL,

    area_ha DECIMAL(10,2) NOT NULL,

    crop_type crop_type_enum
        NOT NULL DEFAULT 'olive',

    crop_variety VARCHAR(100),

    soil_type soil_type_enum
        NOT NULL DEFAULT 'mixed',

    irrigation_method irrigation_method_enum
        NOT NULL DEFAULT 'drip',

    flow_rate_m3h DECIMAL(8,2),

    tree_age_years INT,

    tree_density_per_ha INT,

    polygon GEOMETRY(POLYGON, 4326),

    centroid GEOMETRY(POINT, 4326),

    is_active BOOLEAN
        NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (area_ha > 0),
    CHECK (flow_rate_m3h IS NULL OR flow_rate_m3h >= 0),
    CHECK (tree_age_years IS NULL OR tree_age_years >= 0),
    CHECK (tree_density_per_ha IS NULL OR tree_density_per_ha >= 0),
    CHECK (polygon IS NULL OR ST_IsValid(polygon)),

    CONSTRAINT uq_parcel_name_per_farm
        UNIQUE (farm_id, name)
);

-- ==========================================================
-- PARCELS INDEXES
-- ==========================================================

CREATE INDEX idx_parcels_farm_id
ON parcels(farm_id);

CREATE INDEX idx_parcels_centroid
ON parcels
USING GIST(centroid);

CREATE INDEX idx_parcels_polygon
ON parcels
USING GIST(polygon);

CREATE INDEX idx_parcels_active
ON parcels(is_active)
WHERE is_active = TRUE;

-- ==========================================================
-- PARCELS TRIGGER
-- ==========================================================

CREATE TRIGGER set_parcels_updated_at
BEFORE UPDATE ON parcels
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ==========================================================
-- SENSORS
-- ==========================================================

CREATE TABLE sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    parcel_id UUID NOT NULL
        REFERENCES parcels(id)
        ON DELETE CASCADE,

    device_id VARCHAR(100)
        UNIQUE NOT NULL,

    device_type VARCHAR(50)
        NOT NULL DEFAULT 'esp32-wroom-32',

    is_active BOOLEAN
        NOT NULL DEFAULT TRUE,

    last_seen_at TIMESTAMP WITH TIME ZONE,

    battery_pct INT,

    firmware_version VARCHAR(20),

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (
        battery_pct IS NULL
        OR battery_pct BETWEEN 0 AND 100
    )
);

-- ==========================================================
-- SENSORS INDEXES
-- ==========================================================

CREATE INDEX idx_sensors_parcel_id
ON sensors(parcel_id);

CREATE INDEX idx_sensors_device_id
ON sensors(device_id);

CREATE INDEX idx_sensors_active
ON sensors(is_active);

CREATE INDEX idx_sensors_last_seen
ON sensors(last_seen_at);

-- ==========================================================
-- SENSORS TRIGGER
-- ==========================================================

CREATE TRIGGER set_sensors_updated_at
BEFORE UPDATE ON sensors
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ==========================================================
-- RECOMMENDATIONS
-- ==========================================================

CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    parcel_id UUID NOT NULL
        REFERENCES parcels(id)
        ON DELETE CASCADE,

    generated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    irrigate BOOLEAN NOT NULL,

    confidence_score DECIMAL(4,3),

    quantity_mm DECIMAL(6,2),

    duration_minutes INT,

    reason_code VARCHAR(50),

    shap_factors JSONB,

    explanation_text_fr TEXT,

    explanation_text_darija TEXT,

    soil_humidity_pct_at_gen DECIMAL(5,2),

    eto_at_gen DECIMAL(6,2),

    model_version VARCHAR(20),

    status recommendation_status_enum
        NOT NULL DEFAULT 'pending',

    user_feedback recommendation_feedback_enum,

    feedback_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (
        confidence_score IS NULL
        OR confidence_score BETWEEN 0 AND 1
    ),

    CHECK (
        quantity_mm IS NULL
        OR quantity_mm >= 0
    ),

    CHECK (
        duration_minutes IS NULL
        OR duration_minutes >= 0
    )
);

-- ==========================================================
-- RECOMMENDATIONS INDEXES
-- ==========================================================

CREATE INDEX idx_recommendations_parcel_id
ON recommendations(parcel_id);

CREATE INDEX idx_recommendations_generated_at
ON recommendations(generated_at DESC);

CREATE INDEX idx_recommendations_status
ON recommendations(status);

CREATE INDEX idx_recommendations_irrigate
ON recommendations(irrigate);

-- ==========================================================
-- SUBSCRIPTION PLANS
-- ==========================================================

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(50)
        UNIQUE NOT NULL,

    max_parcels INT NOT NULL,

    max_area_ha DECIMAL(10,2),

    price_mad DECIMAL(10,2)
        NOT NULL DEFAULT 0,

    features JSONB,

    is_active BOOLEAN
        NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (max_parcels > 0),

    CHECK (
        max_area_ha IS NULL
        OR max_area_ha > 0
    ),

    CHECK (price_mad >= 0)
);

-- ==========================================================
-- SUBSCRIPTIONS
-- ==========================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    plan_id UUID NOT NULL
        REFERENCES subscription_plans(id),

    status subscription_status_enum
        NOT NULL DEFAULT 'freemium',

    start_date DATE NOT NULL,

    end_date DATE NOT NULL,

    parcels_limit INT
        NOT NULL DEFAULT 2,

    total_area_ha DECIMAL(10,2),

    amount_mad DECIMAL(10,2)
        NOT NULL DEFAULT 0,

    payment_method payment_method_enum,

    payment_ref VARCHAR(100),

    paid_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW(),

    CHECK (end_date >= start_date),

    CHECK (parcels_limit > 0),

    CHECK (
        total_area_ha IS NULL
        OR total_area_ha >= 0
    ),

    CHECK (amount_mad >= 0)
);

-- ==========================================================
-- SUBSCRIPTIONS INDEXES
-- ==========================================================

CREATE INDEX idx_subscriptions_user_id
ON subscriptions(user_id);

CREATE INDEX idx_subscriptions_status
ON subscriptions(status);

CREATE INDEX idx_subscriptions_end_date
ON subscriptions(end_date);

-- ==========================================================
-- SUBSCRIPTIONS TRIGGER
-- ==========================================================

CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ==========================================================
-- ALERTS
-- ==========================================================

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID
        REFERENCES users(id)
        ON DELETE CASCADE,

    parcel_id UUID
        REFERENCES parcels(id)
        ON DELETE CASCADE,

    alert_type alert_type_enum
        NOT NULL,

    status alert_status_enum
        NOT NULL DEFAULT 'unread',

    title VARCHAR(255),

    message TEXT NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- ALERTS INDEXES
-- ==========================================================

CREATE INDEX idx_alerts_user_id
ON alerts(user_id);

CREATE INDEX idx_alerts_parcel_id
ON alerts(parcel_id);

CREATE INDEX idx_alerts_type
ON alerts(alert_type);

CREATE INDEX idx_alerts_status
ON alerts(status);

CREATE INDEX idx_alerts_created_at
ON alerts(created_at DESC);

-- ==========================================================
-- INITIAL DATA
-- ==========================================================

-- ==========================================================
-- SUBSCRIPTION PLANS
-- ==========================================================

INSERT INTO subscription_plans (
    name,
    max_parcels,
    max_area_ha,
    price_mad,
    features
)
VALUES
(
    'freemium',
    2,
    NULL,
    0,
    '{
        "vocal_darija": false,
        "digital_twin": false,
        "shap": false,
        "export_pdf": false,
        "trial_months": 3
    }'
),
(
    'starter',
    5,
    5,
    350,
    '{
        "vocal_darija": true,
        "digital_twin": false,
        "shap": false,
        "export_pdf": false,
        "history_months": 12
    }'
),
(
    'farmer',
    15,
    20,
    750,
    '{
        "vocal_darija": true,
        "digital_twin": true,
        "shap": true,
        "export_pdf": true,
        "history_months": 24
    }'
),
(
    'pro',
    50,
    100,
    1800,
    '{
        "vocal_darija": true,
        "digital_twin": true,
        "shap": true,
        "export_pdf": true,
        "api_access": true,
        "multi_users": true
    }'
);

-- ==========================================================
-- DEVELOPMENT TEST USER
-- ==========================================================

INSERT INTO users (
    phone,
    name,
    preferred_language
)
VALUES (
    '+212600000001',
    'Hamid Test Dev',
    'darija'
);

-- ==========================================================
-- DEVELOPMENT TEST FARM
-- ==========================================================

INSERT INTO farms (
    user_id,
    name,
    region,
    location,
    total_area_ha
)
SELECT
    u.id,
    'Ferme Test - Beni Mellal',
    'Beni Mellal-Khenifra',
    ST_SetSRID(
        ST_MakePoint(-6.3498, 32.3373),
        4326
    ),
    8.0
FROM users u
WHERE u.phone = '+212600000001';

-- ==========================================================
-- DEVELOPMENT TEST PARCEL
-- ==========================================================

INSERT INTO parcels (
    farm_id,
    name,
    area_ha,
    crop_type,
    crop_variety,
    soil_type,
    irrigation_method,
    flow_rate_m3h,
    tree_age_years,
    tree_density_per_ha,
    centroid
)
SELECT
    f.id,
    'Parcelle Nord - Oliviers',
    4.0,
    'olive',
    'Picholine Marocaine',
    'clay',
    'drip',
    12.5,
    18,
    280,
    ST_SetSRID(
        ST_MakePoint(-6.3495, 32.3370),
        4326
    )
FROM farms f
WHERE f.name = 'Ferme Test - Beni Mellal';

-- ==========================================================
-- DEVELOPMENT TEST SENSOR
-- ==========================================================

INSERT INTO sensors (
    parcel_id,
    device_id,
    device_type,
    firmware_version,
    battery_pct
)
SELECT
    p.id,
    'ESP32-0001',
    'esp32-wroom-32',
    'v1.0.0',
    100
FROM parcels p
WHERE p.name = 'Parcelle Nord - Oliviers';

-- ==========================================================
-- DEVELOPMENT TEST SUBSCRIPTION
-- ==========================================================

INSERT INTO subscriptions (
    user_id,
    plan_id,
    status,
    start_date,
    end_date,
    parcels_limit,
    total_area_ha,
    amount_mad
)
SELECT
    u.id,
    sp.id,
    'freemium',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '90 days',
    2,
    8.0,
    0
FROM users u
CROSS JOIN subscription_plans sp
WHERE u.phone = '+212600000001'
AND sp.name = 'freemium';