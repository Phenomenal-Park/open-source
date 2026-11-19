-- 따목 계정·점수·대국 기록
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  -- 이메일(소문자). AI 계정은 NULL
  email TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 500,
  mmr INTEGER NOT NULL DEFAULT 1500,
  -- 실력 점수 불확실도(글리코 RD). 95 초과면 확정 전("?")
  rd INTEGER NOT NULL DEFAULT 350,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  active_game TEXT,
  -- 레이팅매치에서 사람이 없을 때 AI와 붙어도 되는가(프로필에서 설정)
  allow_ai INTEGER NOT NULL DEFAULT 1,
  -- AI 계정(서버가 대신 둔다). bot_level = src/ai/levels.ts 의 id
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_level TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX users_rating ON users (rating DESC);

-- 이메일 인증 코드(6자리, 10분, 5회까지 시도). 코드는 해시만 저장
CREATE TABLE email_codes (
  user_id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  rated INTEGER NOT NULL,
  black_id TEXT NOT NULL,
  white_id TEXT NOT NULL,
  winner_id TEXT,
  win_reason TEXT,
  moves TEXT NOT NULL,
  black_before INTEGER,
  black_after INTEGER,
  white_before INTEGER,
  white_after INTEGER,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

-- 사람별 기보 목록(최근 100판). 100판을 넘으면 오래된 것부터 지운다.
-- 점수는 users 에만 있으므로 기보를 지워도 점수에는 영향이 없다.
CREATE TABLE user_games (
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX user_games_recent ON user_games (user_id, finished_at DESC);

CREATE TABLE calibrations (
  at TEXT NOT NULL,
  factor REAL NOT NULL,
  players INTEGER NOT NULL
);
