// 브라우저 Web Worker: AI 계산이 화면을 멈추지 않게 별도 스레드에서 돌린다.
// 백 히든 규칙이 켜진 판: 흑 AI는 흑에게 보이는 판만 받고(숨은 돌 모름), 백 AI는 숨겨 둘지도 정한다.
import type { GameState } from "../game/types.ts";
import { chooseMove } from "./search.ts";
import { levelById } from "./levels.ts";
import { chooseBlackMove, chooseWhiteMove } from "./hidden.ts";

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; levelId: string }>) => {
  const { id, state, levelId } = e.data;
  const level = levelById(levelId);
  if (!level || state.isFinished) return;
  if (!state.config.hiddenMove) { self.postMessage({ id, move: chooseMove(state, level), hidden: false }); return; }
  if (state.currentPlayer === "white") { self.postMessage({ id, ...chooseWhiteMove(state, level) }); return; }
  self.postMessage({ id, move: chooseBlackMove(state, level), hidden: false });
};
