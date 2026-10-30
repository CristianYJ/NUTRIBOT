CREATE TABLE admin_api_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id bigint REFERENCES profiles(id) ON DELETE SET NULL,
  provider varchar(16) NOT NULL CHECK (provider IN ('gemini','edamam','usda')),
  operation varchar(32) NOT NULL,
  model varchar(80),
  outcome varchar(16) NOT NULL CHECK (outcome IN ('success','http_error','network_error')),
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_api_calls_created ON admin_api_calls(created_at DESC);
CREATE INDEX admin_api_calls_provider_created ON admin_api_calls(provider,created_at DESC);

CREATE TABLE admin_http_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id bigint REFERENCES profiles(id) ON DELETE SET NULL,
  feature varchar(24) NOT NULL,
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_http_requests_created ON admin_http_requests(created_at DESC);
CREATE INDEX admin_http_requests_profile_created ON admin_http_requests(profile_id,created_at DESC);
