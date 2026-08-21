-- Create extensions as superuser (before switching to service user role)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Switch to notify_user role to make them the owner of all objects
SET ROLE notify_user;

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

CREATE TYPE alert_severity_enum AS ENUM ('info', 'warning', 'critical');

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID,
    parcel_id   UUID,
    alert_type  alert_type_enum NOT NULL,
    severity    alert_severity_enum NOT NULL DEFAULT 'info',
    status      alert_status_enum NOT NULL DEFAULT 'unread',
    title       VARCHAR(255),
    message     TEXT NOT NULL,
    -- Contexte structuré (deviceId, seuils, mesures…) exploitable par le
    -- frontend sans nouvelle requête inter-services.
    data        JSONB NOT NULL DEFAULT '{}',
    read_at     TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (read_at IS NULL OR status <> 'unread')
);

CREATE TRIGGER set_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Liste paginée par utilisateur (ordre created_at DESC) : GET /api/v1/alerts.
CREATE INDEX idx_alerts_user_created ON alerts(user_id, created_at DESC);
-- Compteur de non-lues : GET /api/v1/alerts/unread-count.
CREATE INDEX idx_alerts_user_status ON alerts(user_id, status);
CREATE INDEX idx_alerts_parcel_id ON alerts(parcel_id);
CREATE INDEX idx_alerts_type ON alerts(alert_type);

-- Tokens FCM enregistrés par les applications clientes (POST /api/v1/devices).
-- revoked_at NULL = token actif ; la révocation est logique (historique conservé).
CREATE TABLE device_tokens (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    token        VARCHAR(255) UNIQUE NOT NULL,
    platform     VARCHAR(20) NOT NULL DEFAULT 'android',
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMP WITH TIME ZONE,
    CHECK (platform IN ('android', 'ios', 'web'))
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_active ON device_tokens(user_id) WHERE revoked_at IS NULL;

-- Set default privileges for future objects created by notify_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO notify_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO notify_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO notify_user;

-- Return to admin role
SET ROLE admin;
