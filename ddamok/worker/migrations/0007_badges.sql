-- 업적 뱃지: 사람마다 받은 뱃지 id 목록(JSON 배열). 어떤 업적에 어떤 뱃지를 줄지는 정해지면 채운다.
ALTER TABLE users ADD COLUMN badges TEXT NOT NULL DEFAULT '[]';
