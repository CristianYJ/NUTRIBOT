ALTER TABLE conversations ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE conversations DROP CONSTRAINT conversations_pkey;
ALTER TABLE conversations ADD PRIMARY KEY(id);
ALTER TABLE conversations ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE conversations SET created_at=updated_at;
CREATE INDEX conversations_profile_updated ON conversations(profile_id,updated_at DESC,id);

-- Keep existing pantry rows (and their dates) when reordering or selecting foods.
ALTER TABLE pantry_items DROP CONSTRAINT pantry_items_profile_id_position_key;
ALTER TABLE pantry_items ADD CONSTRAINT pantry_items_profile_id_position_key
  UNIQUE(profile_id,position) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE pantry_dates (
  profile_id bigint NOT NULL,
  ingredient_id varchar(60) NOT NULL,
  start_date date,
  estimate_rule varchar(30) NOT NULL DEFAULT '',
  custom_days integer CHECK(custom_days BETWEEN 1 AND 3650),
  label_date date,
  PRIMARY KEY(profile_id,ingredient_id),
  FOREIGN KEY(profile_id,ingredient_id) REFERENCES pantry_items(profile_id,ingredient_id) ON DELETE CASCADE,
  CHECK(start_date IS NULL OR start_date BETWEEN DATE '1900-01-01' AND DATE '2200-12-31'),
  CHECK(label_date IS NULL OR label_date BETWEEN DATE '1900-01-01' AND DATE '2200-12-31')
);
