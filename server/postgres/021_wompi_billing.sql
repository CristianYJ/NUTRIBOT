CREATE TABLE wompi_subscriptions (
  id uuid PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_code varchar(24) NOT NULL REFERENCES plans(code) CHECK (plan_code IN ('nutripro','nutripro_plus')),
  amount_cents integer NOT NULL CHECK (amount_cents IN (299,999)),
  link_id text NOT NULL UNIQUE,
  link_url text NOT NULL,
  productive boolean NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','ended','review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_paid_at timestamptz,
  paid_until timestamptz,
  UNIQUE (profile_id,link_id)
);
CREATE UNIQUE INDEX wompi_subscriptions_current ON wompi_subscriptions(profile_id) WHERE state IN ('pending','active','review');
CREATE INDEX wompi_subscriptions_profile ON wompi_subscriptions(profile_id,created_at DESC);

CREATE TABLE wompi_payments (
  transaction_id text PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES wompi_subscriptions(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wompi_payments_subscription ON wompi_payments(subscription_id,paid_at DESC);
