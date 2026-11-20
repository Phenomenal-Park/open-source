-- 신고(대국 뒤, 사유 입력)와 관리자 기능(이용 제한·점수 초기화). 자동 제재는 하지 않는다 — 관리자가 보고 결정한다.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users (id),
  target_id TEXT NOT NULL REFERENCES users (id),
  -- ai | proxy | multi | throw | manner | other
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  -- open | done
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  UNIQUE (game_id, reporter_id)
);
CREATE INDEX reports_status ON reports (status, created_at);
CREATE INDEX reports_target ON reports (target_id);

-- 관리자 표시(직접 SQL로 켠다: UPDATE users SET is_admin = 1 WHERE username_key = '...')
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
-- 이용 제한: 이 시각(ms)까지 온라인 대국 불가. NULL = 제한 없음
ALTER TABLE users ADD COLUMN banned_until INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
