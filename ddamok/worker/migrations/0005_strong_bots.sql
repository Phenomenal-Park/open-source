-- 사람 시험 대국 결과: 챌린저·마스터가 AI끼리 측정한 추정보다 훨씬 강하다 → 출발 점수를 올린다.
-- (이후 점수는 사람과의 대국으로 저절로 맞춰진다.)
UPDATE users SET rating = 2150, mmr = 2150, max_rating = MAX(max_rating, 2150) WHERE id = 'bot-ai-7';
UPDATE users SET rating = 2400, mmr = 2400, max_rating = MAX(max_rating, 2400) WHERE id = 'bot-ai-8';
