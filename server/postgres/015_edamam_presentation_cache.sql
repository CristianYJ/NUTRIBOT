CREATE TABLE edamam_presentation_cache (
  recipe_uri varchar(220) NOT NULL,
  recipe_title varchar(150) NOT NULL,
  kind varchar(12) NOT NULL CHECK (kind IN ('detail', 'choice', 'shopping')),
  input_hash char(64) NOT NULL,
  title_es varchar(150) NOT NULL,
  ingredient_lines_es jsonb,
  difficulty varchar(12) CHECK (difficulty IN ('Fácil', 'Intermedia', 'Difícil')),
  meal varchar(12) CHECK (meal IN ('Desayuno', 'Almuerzo', 'Cena')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_uri, kind, input_hash)
);
