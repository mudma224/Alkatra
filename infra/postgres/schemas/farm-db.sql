-- Create extensions as superuser (before switching to service user role)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Switch to farm_user role to make them the owner of all objects
SET ROLE farm_user;

CREATE TYPE crop_type_enum AS ENUM ('olive', 'citrus', 'cereal', 'vegetable', 'other');
CREATE TYPE soil_type_enum AS ENUM ('clay', 'silt', 'sandy', 'calcareous', 'mixed');
CREATE TYPE irrigation_method_enum AS ENUM ('drip', 'sprinkler', 'gravity');

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE INDEX idx_farms_owner_id ON farms(owner_id);
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

CREATE INDEX idx_parcels_farm_id ON parcels(farm_id);
CREATE INDEX idx_parcels_centroid ON parcels USING GIST(centroid);
CREATE INDEX idx_parcels_active ON parcels(is_active) WHERE is_active = TRUE;

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
CREATE INDEX idx_sensors_active ON sensors(is_active);

CREATE TRIGGER set_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Set default privileges for future objects created by farm_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO farm_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO farm_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT EXECUTE ON FUNCTIONS TO farm_user;

-- Return to admin role
SET ROLE admin;
