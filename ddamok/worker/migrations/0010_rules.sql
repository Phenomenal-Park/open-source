-- 대국 규칙(plain 따목 / hidden 히든따목 / mine 지뢰따목, 예전 판은 NULL)과 백 지뢰 기록
ALTER TABLE games ADD COLUMN rule TEXT;
ALTER TABLE games ADD COLUMN mine TEXT;
