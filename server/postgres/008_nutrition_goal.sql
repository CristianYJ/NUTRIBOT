CREATE TABLE nutrition_goals (
  profile_id bigint PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  kcal integer NOT NULL CHECK (kcal BETWEEN 1 AND 20000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN calorie_sex text NOT NULL DEFAULT '' CHECK (calorie_sex IN ('','male','female'));
ALTER TABLE profiles ADD COLUMN calorie_activity text NOT NULL DEFAULT '' CHECK (calorie_activity IN ('','low','light','moderate','high'));
ALTER TABLE profiles ADD COLUMN calorie_estimate_eligible boolean NOT NULL DEFAULT false;
