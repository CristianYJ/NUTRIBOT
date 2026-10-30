CREATE TABLE edamam_meal_log (
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  recipe_uri varchar(220) NOT NULL,
  recipe_title varchar(150) NOT NULL,
  meal_type varchar(20) NOT NULL CHECK (meal_type IN ('Desayuno','Almuerzo','Cena')),
  eaten_at timestamptz NOT NULL DEFAULT now(),
  meal_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')::date,
  PRIMARY KEY (profile_id,id)
);
CREATE INDEX edamam_meal_daily ON edamam_meal_log(profile_id,meal_date,eaten_at);
