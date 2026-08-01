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

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_parcel_id ON alerts(parcel_id);
CREATE INDEX idx_alerts_type ON alerts(alert_type);

-- Set default privileges for future objects created by notify_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO notify_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO notify_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT EXECUTE ON FUNCTIONS TO notify_user;

-- Return to admin role
SET ROLE admin;
