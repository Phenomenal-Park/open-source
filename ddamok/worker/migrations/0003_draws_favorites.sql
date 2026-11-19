-- 무승부·최고 점수, 기보 목록용 요약(착수 데이터 없이), 대국 당시 닉네임·점수 스냅샷, 명승부(박제)
ALTER TABLE users ADD COLUMN draws INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN max_rating INTEGER NOT NULL DEFAULT 500;
UPDATE users SET max_rating = MAX(max_rating, rating);

-- 목록은 이 칸들만 읽고, 착수 데이터(moves)는 기보 상세에서만 읽는다
ALTER TABLE games ADD COLUMN move_count INTEGER NOT NULL DEFAULT 0;
-- 대국 당시 스냅샷(닉네임·점수·확정 여부) — 명승부는 평생 보관되므로 계정 상태와 무관하게 남긴다
ALTER TABLE games ADD COLUMN black_name TEXT;
ALTER TABLE games ADD COLUMN white_name TEXT;
ALTER TABLE games ADD COLUMN black_rating INTEGER;
ALTER TABLE games ADD COLUMN white_rating INTEGER;
ALTER TABLE games ADD COLUMN black_provisional INTEGER;
ALTER TABLE games ADD COLUMN white_provisional INTEGER;

-- 명승부: 사람이 직접 박제한 기보(1인 3판). 박제된 동안은 기보 정리에서 절대 지우지 않는다(평생 보관).
CREATE TABLE favorites (
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX favorites_game ON favorites (game_id);
