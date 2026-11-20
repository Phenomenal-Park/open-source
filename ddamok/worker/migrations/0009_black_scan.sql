-- 흑 스캔(백 히든 판에서 한 판에 한 번): 기보에 언제·어디를 스캔했는지 남긴다. {"at":n,"row":r,"col":c} 또는 NULL
ALTER TABLE games ADD COLUMN scan TEXT;
