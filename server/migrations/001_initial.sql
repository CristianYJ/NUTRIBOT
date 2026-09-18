CREATE TABLE profiles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  weight TEXT NOT NULL,
  height TEXT NOT NULL,
  goal TEXT NOT NULL,
  diet TEXT NOT NULL,
  exclusions TEXT NOT NULL,
  medical_notes TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE profile_allergies (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  allergy TEXT NOT NULL,
  PRIMARY KEY(profile_id, allergy)
) STRICT;
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  emoji TEXT NOT NULL,
  position INTEGER NOT NULL
) STRICT;
CREATE TABLE pantry_items (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  position INTEGER NOT NULL,
  PRIMARY KEY(profile_id, ingredient_id)
) STRICT;
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('catalog', 'gemini')),
  title TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  amount TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(recipe_id, ingredient_id)
) STRICT;
CREATE TABLE favorites (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY(profile_id, recipe_id)
) STRICT;
CREATE TABLE recipe_feedback (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  liked INTEGER NOT NULL CHECK(liked IN (0,1)),
  PRIMARY KEY(profile_id, recipe_id)
) STRICT;
CREATE INDEX recipes_source_created ON recipes(source, created_at DESC);
