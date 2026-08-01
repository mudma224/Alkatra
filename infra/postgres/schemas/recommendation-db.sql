-- Create extensions as superuser (before switching to service user role)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Switch to recommendation_user role to make them the owner of all objects
SET ROLE recommendation_user;

CREATE TYPE recommendation_feedback_enum AS ENUM ('accepted', 'rejected', 'ignored');
CREATE TYPE recommendation_status_enum AS ENUM ('pending', 'seen', 'accepted', 'rejected', 'executed', 'expired');

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
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (confidence_score BETWEEN 0 AND 1),
    CHECK (quantity_mm >= 0),
    CHECK (duration_minutes >= 0)
);

CREATE INDEX idx_recommendations_parcel_id ON recommendations(parcel_id);
CREATE INDEX idx_recommendations_generated_at ON recommendations(generated_at DESC);
CREATE INDEX idx_recommendations_irrigate ON recommendations(irrigate);

-- Set default privileges for future objects created by recommendation_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO recommendation_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO recommendation_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT EXECUTE ON FUNCTIONS TO recommendation_user;

-- Return to admin role
SET ROLE admin;
