// AI 기력 단계. label·rating은 임시 표시다.
//  - 단계 사이 간격: AI끼리 흑백 번갈아 40판씩 둔 승률을 실력 점수 공식(SCALE 350)으로 바꾼 실측값
//    (18→16급 +188, 16→12급 +211, 12→10급 +167, 10→7급 +188, 7→3급 +236; 측정 오차 단계당 약 ±80점)
//  - 출발점: 가장 약한 단계를 18급(500점)으로 놓은 것은 추정이다.
//  사람과의 대국 결과가 쌓이면 실측값으로 고친다. 측정: node scripts/calibrate-ai.ts <약한> <강한> [판 수]
//  depth 5로 늘린 단계는 depth 4와 승률 50%로 차이가 없었다 → 더 세지려면 형세 판단/위협 탐색 개선이 필요.

export interface AiLevel {
  id: string;
  label: string;
  /** 임시 추정 점수 */
  rating: number;
  /** 수읽기 깊이(내 수 포함) */
  depth: number;
  /** 한 수마다 살펴볼 후보 수 */
  width: number;
  /** 계산량 한도(노드 수) */
  nodeBudget: number;
  /** 최종 점수에 더하는 잡음의 크기 */
  noise: number;
  /** 후보 중 아무거나 둘 확률 */
  randomPick: number;
  randomPool: number;
  /** 바로 이기는 수를 놓칠 확률 */
  missWin: number;
  /** 매 수마다 끝까지(depth) 읽을 확률. 아니면 한 수 덜 읽고 급한 자리도 놓칠 수 있다. */
  focus: number;
}

export const AI_LEVELS: readonly AiLevel[] = Object.freeze([
  { id: "ai-1", label: "18급", rating: 500, depth: 2, width: 8, nodeBudget: 4_000, noise: 300, randomPick: 0.35, randomPool: 8, missWin: 0.3, focus: 0.2 },
  { id: "ai-2", label: "16급", rating: 690, depth: 2, width: 8, nodeBudget: 5_000, noise: 160, randomPick: 0.15, randomPool: 6, missWin: 0.1, focus: 0.5 },
  { id: "ai-3", label: "12급", rating: 900, depth: 2, width: 9, nodeBudget: 8_000, noise: 90, randomPick: 0.05, randomPool: 5, missWin: 0.03, focus: 0.8 },
  { id: "ai-4", label: "10급", rating: 1070, depth: 2, width: 12, nodeBudget: 12_000, noise: 25, randomPick: 0.01, randomPool: 4, missWin: 0, focus: 1 },
  { id: "ai-5", label: "7급", rating: 1250, depth: 3, width: 10, nodeBudget: 30_000, noise: 25, randomPick: 0, randomPool: 1, missWin: 0, focus: 0.5 },
  { id: "ai-6", label: "3급", rating: 1490, depth: 4, width: 9, nodeBudget: 80_000, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 },
]);

export function levelById(id: string): AiLevel | undefined {
  return AI_LEVELS.find((l) => l.id === id);
}
