-- Shared-build payloads stay compressed. Expiry is checked on every read, independently of cleanup.
CREATE TABLE IF NOT EXISTS loa_shared_simulations (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{8}$'),
  character text NOT NULL,
  payload text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS loa_shared_simulations_expiry ON loa_shared_simulations(expires_at);
CREATE TABLE IF NOT EXISTS loa_share_limits (
  subject_hash text PRIMARY KEY,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS loa_share_limits_expiry ON loa_share_limits(expires_at);
