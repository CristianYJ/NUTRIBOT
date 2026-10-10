-- One current plan per account. Existing and new profiles start on Basico.
CREATE TABLE plans (
  code varchar(24) PRIMARY KEY CHECK (code IN ('basico', 'nutripro', 'nutripro_plus')),
  name varchar(40) NOT NULL UNIQUE
);
INSERT INTO plans(code,name) VALUES
  ('basico','Básico'), ('nutripro','NutriPro'), ('nutripro_plus','NutriPro+');

ALTER TABLE profiles ADD COLUMN plan_code varchar(24) NOT NULL DEFAULT 'basico'
  REFERENCES plans(code);
CREATE INDEX profiles_plan ON profiles(plan_code);

CREATE TABLE profile_plan_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_plan varchar(24) REFERENCES plans(code),
  to_plan varchar(24) NOT NULL REFERENCES plans(code),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user,
  reason varchar(300) NOT NULL CHECK (length(btrim(reason)) > 0),
  CHECK (from_plan IS NULL OR from_plan <> to_plan)
);
CREATE INDEX profile_plan_history_profile ON profile_plan_history(profile_id,changed_at DESC);
INSERT INTO profile_plan_history(profile_id,to_plan,reason)
  SELECT id,plan_code,'Asignación inicial al preparar los planes' FROM profiles;

-- Invoker privileges and the configured application schema; no elevated function.
CREATE FUNCTION record_profile_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO profile_plan_history(profile_id,to_plan,reason)
      VALUES (NEW.id,NEW.plan_code,'Registro de cuenta');
  ELSIF OLD.plan_code IS DISTINCT FROM NEW.plan_code THEN
    INSERT INTO profile_plan_history(profile_id,from_plan,to_plan,reason)
      VALUES (NEW.id,OLD.plan_code,NEW.plan_code,
        COALESCE(NULLIF(btrim(current_setting('nutribot.plan_change_reason',true)),''),'Cambio administrativo'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profile_plan_audit AFTER INSERT OR UPDATE OF plan_code ON profiles
  FOR EACH ROW EXECUTE FUNCTION record_profile_plan();
