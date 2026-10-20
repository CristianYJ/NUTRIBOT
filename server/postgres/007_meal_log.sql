CREATE TABLE meal_log (
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  recipe_id varchar(100) NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  recipe_title text NOT NULL,
  eaten_at timestamptz NOT NULL DEFAULT now(),
  meal_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')::date,
  servings integer NOT NULL DEFAULT 1 CHECK (servings = 1),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  nutrition_snapshot jsonb NOT NULL,
  PRIMARY KEY(profile_id,id)
);
CREATE INDEX meal_log_daily ON meal_log(profile_id,meal_date,eaten_at);
