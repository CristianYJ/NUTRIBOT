ALTER TABLE edamam_presentation_cache
  ADD COLUMN estimated_minutes integer CHECK (estimated_minutes BETWEEN 5 AND 240);
