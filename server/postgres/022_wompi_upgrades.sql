CREATE TABLE wompi_upgrades (
  id uuid PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_subscription_id uuid NOT NULL REFERENCES wompi_subscriptions(id),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 700),
  paid_until timestamptz NOT NULL,
  source_paid_at timestamptz NOT NULL,
  link_id text NOT NULL UNIQUE,
  link_url text NOT NULL,
  link_expires_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','review','expired')),
  transaction_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wompi_upgrades_current ON wompi_upgrades(profile_id)
  WHERE state IN ('pending','active','review');
CREATE INDEX wompi_upgrades_profile ON wompi_upgrades(profile_id,created_at DESC);
