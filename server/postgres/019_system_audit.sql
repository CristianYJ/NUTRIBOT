CREATE TABLE admin_system_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind varchar(40) NOT NULL,
  severity varchar(12) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_system_events_created ON admin_system_events(created_at DESC, id DESC);
