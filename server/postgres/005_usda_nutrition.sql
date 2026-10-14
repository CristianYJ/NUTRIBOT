ALTER TABLE profiles ADD COLUMN max_saturated_fat_g numeric(7,2) CHECK(max_saturated_fat_g > 0 AND max_saturated_fat_g <= 100);
ALTER TABLE profiles ADD COLUMN max_sodium_mg numeric(8,2) CHECK(max_sodium_mg > 0 AND max_sodium_mg <= 10000);
ALTER TABLE profiles ADD COLUMN max_sugar_g numeric(7,2) CHECK(max_sugar_g > 0 AND max_sugar_g <= 200);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS grams_per_person numeric(8,2) CHECK(grams_per_person > 0 AND grams_per_person <= 5000);

CREATE TABLE ingredient_usda_links (
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_id varchar(60) NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  fdc_id bigint NOT NULL CHECK(fdc_id > 0),
  description varchar(300) NOT NULL,
  data_type varchar(60) NOT NULL,
  nutrients jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id, ingredient_id)
);

CREATE TABLE recipe_gram_overrides (
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id varchar(100) NOT NULL,
  ingredient_id varchar(60) NOT NULL,
  grams_per_person numeric(8,2) NOT NULL CHECK(grams_per_person > 0 AND grams_per_person <= 5000),
  PRIMARY KEY(profile_id, recipe_id, ingredient_id),
  FOREIGN KEY(recipe_id, ingredient_id) REFERENCES recipe_ingredients(recipe_id, ingredient_id) ON DELETE CASCADE
);
