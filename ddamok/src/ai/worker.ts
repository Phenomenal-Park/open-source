// 브라우저 Web Worker: AI 계산이 화면을 멈추지 않게 별도 스레드에서 돌린다.
import type { GameState } from "../game/types.ts";
import { chooseMove } from "./search.ts";
import { levelById } from "./levels.ts";

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; levelId: string }>) => {
  const { id, state, levelId } = e.data;
  const level = levelById(levelId);
  if (!level || state.isFinished) return;
  self.postMessage({ id, move: chooseMove(state, level) });
};
