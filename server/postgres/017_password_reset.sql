CREATE TABLE password_reset_tokens (
  token_hash char(64) PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by_admin_id bigint REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_tokens_profile ON password_reset_tokens(profile_id,created_at DESC);
