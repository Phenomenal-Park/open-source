import type { FastLevel } from "./fastSearch.ts";

// AI 기력 단계. label·rating은 임시 표시다.
//  - 단계 사이 간격: AI끼리 흑백 번갈아 40판씩 둔 승률을 실력 점수 공식(SCALE 350)으로 바꾼 실측값
//    (18→16급 +188, 16→12급 +211, 12→10급 +167, 10→7급 +188, 7→3급 +236; 측정 오차 단계당 약 ±80점)
//  - 출발점: 가장 약한 단계를 18급(500점)으로 놓은 것은 추정이다.
//  사람과의 대국 결과가 쌓이면 실측값으로 고친다. 측정: node scripts/calibrate-ai.ts <약한> <강한> [판 수]
//    마스터·챌린저(고속 엔진): 다이아→마스터 +129(40판 70%), 마스터→챌린저 +167(40판 75%),
//    다이아→챌린저 직접 +380(40판 92.5%) — 두 값의 평균으로 챌린저 약 1830(2단) 추정
//    형세 가중치 자동 조정 후 재측정: 다이아→마스터 +236(40판 82.5%), 마스터→챌린저 +236(40판 82.5%)
//    → 마스터 약 1730(1단), 챌린저 약 1960(3단)
//    2026-11-20 사람(개발자) 시험 대국: 챌린저는 흑·백 모두 이기기 어려움 → AI끼리 측정이 위쪽을 낮게 잡았다고 보고
//    챌린저 2400(8단), 마스터 2150(5단)으로 올린다. 실제 점수는 사람과의 대국으로 저절로 맞춰진다.
//  주의: 잡음 없는 단계끼리의 측정은 무작위 시작 수를 깔아야 한다(calibrate-ai.ts가 그렇게 한다).
//  1단~7단을 위한 강화 작업 중(threats.ts 연속 위협 탐색, EXPERIMENTAL 단계).

export interface AiLevel {
  id: string;
  /** 표시 이름(급수 없음 — 급수는 점수에서 자동으로 나온다). 아이언<브론즈<실버<골드<플래티넘<다이아(<마스터<챌린저: 엔진 강화 후) */
  name: string;
  /** 출시 전 추정 급수(AI끼리 측정). 서버 점수가 있으면 그쪽을 쓴다 */
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
  /** 연속 위협 탐색 깊이(0 = 안 씀). 내 필승 수순을 찾고, 상대의 필승 수순을 허용하는 수를 피한다. */
  vcfDepth?: number;
  vcfBudget?: number;
  /** 상대 연속 위협을 확인할 뿌리 후보 수 */
  vcfDefend?: number;
  /** 있으면 고속 엔진(fastSearch.ts)으로 둔다 */
  fast?: FastLevel;
}

export const AI_LEVELS: readonly AiLevel[] = Object.freeze([
  { id: "ai-1", name: "AI 아이언", label: "18급", rating: 500, depth: 2, width: 8, nodeBudget: 4_000, noise: 300, randomPick: 0.35, randomPool: 8, missWin: 0.3, focus: 0.2 },
  { id: "ai-2", name: "AI 브론즈", label: "16급", rating: 690, depth: 2, width: 8, nodeBudget: 5_000, noise: 160, randomPick: 0.15, randomPool: 6, missWin: 0.1, focus: 0.5 },
  { id: "ai-3", name: "AI 실버", label: "12급", rating: 900, depth: 2, width: 9, nodeBudget: 8_000, noise: 90, randomPick: 0.05, randomPool: 5, missWin: 0.03, focus: 0.8 },
  { id: "ai-4", name: "AI 골드", label: "10급", rating: 1070, depth: 2, width: 12, nodeBudget: 12_000, noise: 25, randomPick: 0.01, randomPool: 4, missWin: 0, focus: 1 },
  { id: "ai-5", name: "AI 플래티넘", label: "7급", rating: 1250, depth: 3, width: 10, nodeBudget: 30_000, noise: 25, randomPick: 0, randomPool: 1, missWin: 0, focus: 0.5 },
  { id: "ai-6", name: "AI 다이아", label: "3급", rating: 1490, depth: 4, width: 9, nodeBudget: 80_000, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 },
  // 마스터·챌린저: 고속 엔진(fast.ts·fastSearch.ts — 놓기/되돌리기, 같은 판 기억, 강제수 연장)
  { id: "ai-7", name: "AI 마스터", label: "5단", rating: 2150, depth: 0, width: 0, nodeBudget: 0, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1,
    fast: { depth: 6, timeMs: 200, width: 10, noise: 15, randomPick: 0, randomPool: 1, missWin: 0, focus: 0.9 } },
  { id: "ai-8", name: "AI 챌린저", label: "8단", rating: 2400, depth: 0, width: 0, nodeBudget: 0, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1,
    fast: { depth: 14, timeMs: 400, width: 12, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 } },
]);

export function levelById(id: string): AiLevel | undefined {
  return AI_LEVELS.find((l) => l.id === id);
}

/** 실험용: 기존 최강 단계 + 연속 위협 탐색 */
export const EXPERIMENTAL: readonly AiLevel[] = Object.freeze([
  // 다음 실험의 기준: 챌린저와 같은 설정
  { id: "x-fast", name: "실험-고속", label: "실험", rating: 0, depth: 0, width: 0, nodeBudget: 0, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1,
    fast: { depth: 14, timeMs: 400, width: 12, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 } },
]);
