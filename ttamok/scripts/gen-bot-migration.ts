// AI 계정 시드 SQL 생성(rd 90: 확정 상태로 시작하되 사람과의 대국으로 점수가 맞춰진다): node scripts/gen-bot-migration.ts > worker/migrations/0002_bots.sql
import { AI_LEVELS } from "../src/ai/levels.ts";
const now = "2026-11-19T00:00:00.000Z";
console.log("-- AI 계정(레이팅매치 대체 상대). 점수는 사람과의 대국으로 저절로 맞춰진다. 이 파일은 scripts/gen-bot-migration.ts 로 생성.");
for (const l of AI_LEVELS) {
  console.log(
    `INSERT INTO users (id, username, username_key, password_hash, rating, mmr, rd, games, is_bot, bot_level, allow_ai, email_verified, created_at) VALUES ('bot-${l.id}', 'AI ${l.label}', 'bot:${l.id}', '!', ${l.rating}, ${l.rating}, 90, 100, 1, '${l.id}', 0, 1, '${now}');`,
  );
}
