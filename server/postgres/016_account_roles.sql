ALTER TABLE profiles ADD COLUMN role_code text NOT NULL DEFAULT 'user'
  CONSTRAINT profiles_role_code_valid CHECK (role_code IN ('user', 'admin'));

CREATE TABLE profile_role_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_role text NOT NULL,
  to_role text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user,
  CHECK (from_role IN ('user', 'admin') AND to_role IN ('user', 'admin') AND from_role <> to_role)
);
CREATE INDEX profile_role_history_profile ON profile_role_history(profile_id,changed_at DESC);

CREATE FUNCTION record_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profile_role_history(profile_id,from_role,to_role)
    VALUES (NEW.id,OLD.role_code,NEW.role_code);
  RETURN NEW;
END;
$$;
CREATE TRIGGER profile_role_audit AFTER UPDATE OF role_code ON profiles
  FOR EACH ROW WHEN (OLD.role_code IS DISTINCT FROM NEW.role_code)
  EXECUTE FUNCTION record_profile_role();
