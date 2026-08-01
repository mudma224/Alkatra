-- Create extensions as superuser (before switching to service user role)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Switch to auth_user role to make them the owner of all objects
SET ROLE auth_user;

CREATE TYPE user_language_enum AS ENUM ('darija', 'arabic', 'french');

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE INDEX idx_users_phone ON users(phone);

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Set default privileges for future objects created by auth_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO auth_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO auth_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT EXECUTE ON FUNCTIONS TO auth_user;

-- Return to admin role
SET ROLE admin;
