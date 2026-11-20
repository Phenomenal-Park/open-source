// 테스트용 로컬 Cloudflare 서버(wrangler dev): 임시 D1 + Durable Objects, 메일 대신 개발용 코드.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function startServer(vars = {}) {
  const state = mkdtempSync(join(tmpdir(), "ddamok-wr-"));
  const port = 8900 + Math.floor(Math.random() * 90);
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "ddamok", "--local", "--persist-to", state], { env, stdio: "ignore" });
  const all = { DEV_MAIL_LOG: "1", PBKDF2_ITERATIONS: "1000", ...vars };
  const args = ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", state];
  for (const [k, v] of Object.entries(all)) args.push("--var", `${k}:${v}`);
  const proc = spawn("npx", args, { env, stdio: "pipe", detached: true });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/api/stats")).ok) break; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return {
    base, port, log: () => log,
    /** 로컬 D1에 SQL 직접 실행(테스트 준비용 — 예: 관리자 지정) */
    sql(command) {
      execFileSync("npx", ["wrangler", "d1", "execute", "ddamok", "--local", "--persist-to", state, "--command", command], { env, stdio: "ignore" });
    },
    stop() {
      try { process.kill(-proc.pid); } catch { proc.kill(); }
      rmSync(state, { recursive: true, force: true });
    },
  };
}
