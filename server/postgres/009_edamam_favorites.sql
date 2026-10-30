CREATE TABLE edamam_favorites (
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_uri varchar(220) NOT NULL,
  title varchar(150) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, recipe_uri)
);
