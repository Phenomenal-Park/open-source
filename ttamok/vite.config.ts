import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 개발: `npm run dev:api`(wrangler, 8787)와 함께 띄우면 /api 와 실시간 연결(WebSocket)을 넘겨준다
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } } },
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts"] },
});
