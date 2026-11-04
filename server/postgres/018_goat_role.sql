ALTER TABLE profiles DROP CONSTRAINT profiles_role_code_valid;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_code_valid
  CHECK (role_code IN ('user', 'admin', 'goat'));

ALTER TABLE profile_role_history DROP CONSTRAINT profile_role_history_check;
ALTER TABLE profile_role_history ADD CONSTRAINT profile_role_history_valid
  CHECK (from_role IN ('user', 'admin', 'goat') AND to_role IN ('user', 'admin', 'goat') AND from_role <> to_role);

CREATE OR REPLACE FUNCTION record_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profile_role_history(profile_id,from_role,to_role,changed_by)
    VALUES (NEW.id,OLD.role_code,NEW.role_code,
      COALESCE(NULLIF(current_setting('nutribot.actor_id',true),''),current_user));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_profile_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO profile_plan_history(profile_id,to_plan,reason)
      VALUES (NEW.id,NEW.plan_code,'Registro de cuenta');
  ELSIF OLD.plan_code IS DISTINCT FROM NEW.plan_code THEN
    INSERT INTO profile_plan_history(profile_id,from_plan,to_plan,reason,changed_by)
      VALUES (NEW.id,OLD.plan_code,NEW.plan_code,
        COALESCE(NULLIF(btrim(current_setting('nutribot.plan_change_reason',true)),''),'Cambio administrativo'),
        COALESCE(NULLIF(current_setting('nutribot.actor_id',true),''),current_user));
  END IF;
  RETURN NEW;
END;
$$;
