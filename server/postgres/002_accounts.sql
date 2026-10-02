ALTER TABLE profiles ADD COLUMN email varchar(254);
ALTER TABLE profiles ADD COLUMN password_hash text;
ALTER TABLE profiles ADD COLUMN birth_date date;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_normalized CHECK (email IS NULL OR email = lower(btrim(email)));
ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE(email);
ALTER TABLE profiles ADD CONSTRAINT profiles_auth_complete CHECK ((email IS NULL) = (password_hash IS NULL));
ALTER TABLE profiles ADD CONSTRAINT profiles_password_format CHECK (password_hash IS NULL OR password_hash ~ '^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$');
ALTER TABLE profiles ADD CONSTRAINT profiles_birth_date_range CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1900-01-01' AND CURRENT_DATE);

ALTER TABLE ingredients ADD COLUMN profile_id bigint REFERENCES profiles(id) ON DELETE CASCADE;
UPDATE ingredients SET profile_id=1 WHERE id LIKE 'food-%';
CREATE INDEX ingredients_profile ON ingredients(profile_id);

CREATE TABLE auth_sessions (
  token_hash char(64) PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  CHECK(expires_at > created_at)
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_profile ON auth_sessions(profile_id);
CREATE TABLE conversations (
  profile_id bigint PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  messages jsonb NOT NULL DEFAULT '[]', draft varchar(500) NOT NULL DEFAULT '',
  max_time integer NOT NULL DEFAULT 30 CHECK(max_time IN (15,30,60)),
  busy boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO conversations(profile_id) SELECT id FROM profiles;

-- Age is derived from date of birth, so birthdays do not leave a stale integer.
CREATE VIEW profile_summary AS
SELECT id,name,email,birth_date,EXTRACT(YEAR FROM age(CURRENT_DATE,birth_date))::integer AS age,created_at
FROM profiles;
