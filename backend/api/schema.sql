-- Hulhup: skema Postgres (Neon). Semua aturan izin ditegakkan di server (API), tidak pernah dipercayakan ke aplikasi.
-- Peran admin, centang, dan status akun hanya bisa diubah langsung di database (tidak ada endpoint admin publik).

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  bio         TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 300),
  birth       TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  pvis        TEXT NOT NULL DEFAULT 'public',
  av_ver      BIGINT NOT NULL DEFAULT 0,         -- 0 = tanpa foto
  cv_ver      BIGINT NOT NULL DEFAULT 0,
  taps        BIGINT NOT NULL DEFAULT 0,
  streak      INT NOT NULL DEFAULT 0,
  days        INT NOT NULL DEFAULT 0,
  last_day    TEXT,
  rem         TEXT,
  role        TEXT NOT NULL DEFAULT 'user'   CHECK (role IN ('user','admin')),
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  followers   INT NOT NULL DEFAULT 0,
  following   INT NOT NULL DEFAULT 0,
  created     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created     BIGINT NOT NULL,
  expires     BIGINT NOT NULL,
  device      TEXT NOT NULL DEFAULT '',
  last_seen   BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS logins (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS photos (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL CHECK (kind IN ('avatar','cover')),
  mime    TEXT NOT NULL,
  data    BYTEA NOT NULL,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS audios (
  id        BIGSERIAL PRIMARY KEY,
  owner     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  descr     TEXT NOT NULL DEFAULT '' CHECK (length(descr) <= 200),
  secs      INT NOT NULL CHECK (secs BETWEEN 1 AND 30),
  store     TEXT NOT NULL CHECK (store IN ('mongo','supabase')),   -- 1-20 dtk mongo, 21-30 dtk supabase
  blob_key  TEXT NOT NULL,
  mime      TEXT NOT NULL,
  rand      TEXT NOT NULL DEFAULT 'public',
  pprof     BOOLEAN NOT NULL DEFAULT TRUE,
  hidden    BOOLEAN NOT NULL DEFAULT FALSE,
  likes     INT NOT NULL DEFAULT 0,
  created   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS audios_owner ON audios(owner);
CREATE INDEX IF NOT EXISTS audios_rand ON audios(rand) WHERE NOT hidden;

CREATE TABLE IF NOT EXISTS audio_to (
  audio_id BIGINT NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (audio_id, user_id)
);
CREATE INDEX IF NOT EXISTS audio_to_user ON audio_to(user_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_id BIGINT NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, audio_id)
);
CREATE INDEX IF NOT EXISTS likes_audio ON likes(audio_id);

CREATE TABLE IF NOT EXISTS follows (
  src BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dst BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (src, dst)
);
CREATE INDEX IF NOT EXISTS follows_dst ON follows(dst);

CREATE TABLE IF NOT EXISTS rels (
  a       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type    TEXT NOT NULL CHECK (type IN ('friend','best','partner','family')),
  status  TEXT NOT NULL CHECK (status IN ('pending','active')),
  created BIGINT NOT NULL,
  since   BIGINT,
  PRIMARY KEY (a, b),
  CHECK (a <> b)
);
CREATE UNIQUE INDEX IF NOT EXISTS rels_pair ON rels (LEAST(a, b), GREATEST(a, b));
CREATE INDEX IF NOT EXISTS rels_b ON rels(b);

CREATE TABLE IF NOT EXISTS notifs (
  id      BIGSERIAL PRIMARY KEY,
  to_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type    TEXT NOT NULL,
  actor   BIGINT REFERENCES users(id) ON DELETE CASCADE,
  audio   BIGINT REFERENCES audios(id) ON DELETE CASCADE,
  extra   TEXT NOT NULL DEFAULT '',
  n       INT,
  seen    BOOLEAN NOT NULL DEFAULT FALSE,
  created BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifs_to ON notifs(to_user, created DESC);

-- Moderasi: diisi/dibaca hanya lewat database (tidak ada endpoint publik).
CREATE TABLE IF NOT EXISTS reports (
  id           BIGSERIAL PRIMARY KEY,
  reporter     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user  BIGINT REFERENCES users(id) ON DELETE CASCADE,
  target_audio BIGINT REFERENCES audios(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_log (
  id           BIGSERIAL PRIMARY KEY,
  admin        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_user  BIGINT,
  target_audio BIGINT,
  reason       TEXT NOT NULL DEFAULT '',
  created      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hits (
  k      TEXT NOT NULL,
  win    BIGINT NOT NULL,
  n      INT NOT NULL,
  PRIMARY KEY (k, win)
);

-- Saat akun dihapus, hitungan pengikut/mengikuti/suka milik akun lain ikut dikurangi.
create or replace function users_before_delete() returns trigger language plpgsql as $$
begin
  update users set followers = greatest(0, followers - 1) where id in (select dst from follows where src = old.id);
  update users set following = greatest(0, following - 1) where id in (select src from follows where dst = old.id);
  update audios set likes = greatest(0, likes - 1) where id in (select audio_id from likes where user_id = old.id);
  return old;
end $$;
drop trigger if exists users_before_delete on users;
create trigger users_before_delete before delete on users for each row execute function users_before_delete();

ALTER TABLE users ADD COLUMN IF NOT EXISTS tapf JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS push_tokens (
  token   TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang    TEXT DEFAULT 'id',
  created BIGINT
);
CREATE INDEX IF NOT EXISTS push_tokens_user ON push_tokens(user_id);
