CREATE TABLE admin_diagnostics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  profile_id bigint REFERENCES profiles(id) ON DELETE SET NULL,
  feature varchar(24) NOT NULL CHECK (feature IN ('recipe', 'vision')),
  provider varchar(24) NOT NULL,
  outcome varchar(24) NOT NULL CHECK (outcome IN ('success', 'empty', 'conversation', 'review', 'error')),
  stage varchar(40) NOT NULL,
  error_code varchar(80),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_excerpt varchar(300),
  previous_excerpt varchar(300),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_diagnostics_created ON admin_diagnostics(created_at DESC, id DESC);
CREATE INDEX admin_diagnostics_outcome_created ON admin_diagnostics(outcome, created_at DESC);
