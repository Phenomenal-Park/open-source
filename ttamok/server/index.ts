import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = createApp({
  dataDir: process.env.TTAMOK_DATA_DIR ?? join(here, "data"),
  staticDir: join(here, "..", "dist"),
});

const factor = app.calibrate();
if (factor !== null) console.log(`점수 보정 적용: ×${factor.toFixed(3)}`);
setInterval(() => {
  const f = app.calibrate();
  if (f !== null) console.log(`점수 보정 적용: ×${f.toFixed(3)}`);
}, 24 * 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => void app.handle(req, res)).listen(port, () => {
  console.log(`따목 서버: http://localhost:${port}`);
});
