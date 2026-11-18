// 아주 단순한 JSON 파일 저장소(프로토타입용). 온라인 대전 단계에서 실제 DB로 교체한다.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Position } from "../src/game/types.ts";

export interface UserRecord {
  id: string;
  username: string;
  usernameKey: string; // 대소문자 무시 중복 검사용
  passwordHash: string;
  rating: number;
  mmr: number;
  games: number;
  wins: number;
  losses: number;
  winStreak: number;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

export interface RatedGameRecord {
  id: string;
  blackId: string;
  whiteId: string;
  boardSize: number;
  status: "playing" | "finished";
  createdAt: string;
  finishedAt?: string;
  moves?: Position[];
  winnerId?: string;
  winReason?: "five" | "capture";
  ratingChanges?: Record<string, { before: number; after: number; bonus: number }>;
  upset?: boolean;
}

export interface CalibrationRecord {
  at: string;
  factor: number;
  players: number;
}

export interface Db {
  version: 1;
  users: UserRecord[];
  sessions: SessionRecord[];
  games: RatedGameRecord[];
  calibrations: CalibrationRecord[];
}

export class Store {
  readonly file: string;
  db: Db;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "db.json");
    this.db = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, "utf8")) as Db)
      : { version: 1, users: [], sessions: [], games: [], calibrations: [] };
  }

  /** 원자적 저장: 임시 파일에 쓰고 이름을 바꾼다. */
  save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db));
    renameSync(tmp, this.file);
  }

  userById(id: string): UserRecord | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  userByName(username: string): UserRecord | undefined {
    const key = username.normalize("NFC").toLowerCase();
    return this.db.users.find((u) => u.usernameKey === key);
  }
}
