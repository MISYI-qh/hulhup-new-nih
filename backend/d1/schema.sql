-- Hulhup: skema D1 (akun, teks, relasi, moderasi). Semua aturan izin ditegakkan di server (Worker),
-- tidak pernah dipercayakan ke aplikasi. Peran admin dan centang hanya bisa diubah dari sisi server.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 20),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  bio         TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 300),
  birth       TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,            -- hash lambat + salt acak
  pass_salt   TEXT NOT NULL,
  pvis        TEXT NOT NULL DEFAULT 'public',
  has_avatar  INTEGER NOT NULL DEFAULT 0,
  has_cover   INTEGER NOT NULL DEFAULT 0,
  taps        INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  days        INTEGER NOT NULL DEFAULT 0,
  last_day    TEXT,
  role        TEXT NOT NULL DEFAULT 'user'   CHECK (role IN ('user','admin')),
  verified    INTEGER NOT NULL DEFAULT 0,        -- centang
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  followers   INTEGER NOT NULL DEFAULT 0,        -- penghitung diringkas
  following   INTEGER NOT NULL DEFAULT 0,
  created     INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,          -- hash token; token asli tidak disimpan
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created     INTEGER NOT NULL,
  expires     INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE audios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  owner     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  descr     TEXT NOT NULL DEFAULT '' CHECK (length(descr) <= 200),
  secs      INTEGER NOT NULL CHECK (secs BETWEEN 1 AND 30),
  store     TEXT NOT NULL CHECK (store IN ('mongo','supabase')),  -- 1-20 dtk mongo, 21-30 dtk supabase
  blob_key  TEXT NOT NULL,
  rand      TEXT NOT NULL DEFAULT 'public',
  pprof     INTEGER NOT NULL DEFAULT 1,
  hidden    INTEGER NOT NULL DEFAULT 0,  -- disembunyikan moderasi
  likes     INTEGER NOT NULL DEFAULT 0,
  created   INTEGER NOT NULL
);
CREATE INDEX audios_owner ON audios(owner);
CREATE INDEX audios_rand ON audios(rand, hidden);

CREATE TABLE audio_to (                  -- "pilih akun"
  audio_id INTEGER NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (audio_id, user_id)
);
CREATE INDEX audio_to_user ON audio_to(user_id);

CREATE TABLE likes (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_id INTEGER NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, audio_id)
);

CREATE TABLE follows (
  src INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dst INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (src, dst)
);
CREATE INDEX follows_dst ON follows(dst);

CREATE TABLE rels (                      -- hubungan dua pihak
  a      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type   TEXT NOT NULL CHECK (type IN ('friend','best','partner','family')),
  status TEXT NOT NULL CHECK (status IN ('pending','active')),
  created INTEGER NOT NULL,
  since   INTEGER,
  PRIMARY KEY (a, b)
);
CREATE INDEX rels_b ON rels(b);

CREATE TABLE notifs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type    TEXT NOT NULL,
  actor   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  audio   INTEGER REFERENCES audios(id) ON DELETE CASCADE,
  extra   TEXT NOT NULL DEFAULT '',
  n       INTEGER,
  seen    INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX notifs_to ON notifs(to_user, seen);

-- Moderasi (diisi dan dibaca hanya oleh Worker setelah memeriksa role = 'admin' dari database):
CREATE TABLE reports (                   -- dibuat sekarang, dipakai saat fitur lapor jadi
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_audio INTEGER REFERENCES audios(id) ON DELETE CASCADE,
  reason   TEXT NOT NULL DEFAULT '',
  status   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created  INTEGER NOT NULL
);

CREATE TABLE admin_log (                 -- jejak semua tindakan admin
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  admin   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action  TEXT NOT NULL,                 -- delete_audio, hide_audio, suspend, ban, verify, unverify, ...
  target_user  INTEGER,
  target_audio INTEGER,
  reason  TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);

CREATE TABLE rate_hits (                 -- pembatasan laju (kunci: aksi + akun/IP)
  k       TEXT NOT NULL,
  window  INTEGER NOT NULL,
  n       INTEGER NOT NULL,
  PRIMARY KEY (k, window)
);
