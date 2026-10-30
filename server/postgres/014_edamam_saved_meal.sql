ALTER TABLE edamam_favorites
  ADD COLUMN IF NOT EXISTS meal varchar(12) CHECK (meal IN ('Desayuno', 'Almuerzo', 'Cena')),
  ADD COLUMN IF NOT EXISTS nutrition_cache jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_cache_source varchar(30),
  ADD COLUMN IF NOT EXISTS nutrition_cache_updated_at timestamptz;

ALTER TABLE edamam_meal_log
  ADD COLUMN IF NOT EXISTS nutrition_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_source varchar(30),
  ADD COLUMN IF NOT EXISTS nutrition_recorded_at timestamptz;
