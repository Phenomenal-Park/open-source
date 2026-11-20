-- 백 히든 규칙: 기보에 그 판의 규칙(히든 판 여부, 따냄 목표 10/10)과 히든 수의 순번을 남긴다.
ALTER TABLE games ADD COLUMN hidden_move INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN hidden_index INTEGER;
