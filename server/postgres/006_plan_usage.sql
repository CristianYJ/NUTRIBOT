-- Keep the existing foreign keys and audit history; only the display name changes.
UPDATE plans SET name='NutriMax' WHERE code='nutripro_plus';

-- Reservations prevent concurrent requests from exceeding the account allowance.
-- Successful uses survive a profile reset; unused reservations expire after a crash.
CREATE TABLE plan_usage (
  id uuid PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature varchar(16) NOT NULL CHECK (feature IN ('recipes','vision')),
  period_start date NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX plan_usage_account_period ON plan_usage(profile_id,feature,period_start);
