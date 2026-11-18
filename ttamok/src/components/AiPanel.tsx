import { useState } from "react";
import { AI_LEVELS } from "../ai/levels.ts";
import type { Player } from "../game/index.ts";

interface AiPanelProps {
  active: { levelId: string; aiColor: Player } | null;
  onStart: (levelId: string, humanColor: Player) => void;
  onStop: () => void;
}

export function AiPanel({ active, onStart, onStop }: AiPanelProps) {
  const [levelId, setLevelId] = useState(AI_LEVELS[2].id);
  const level = AI_LEVELS.find((l) => l.id === (active?.levelId ?? levelId))!;
  return (
    <section className="panel" aria-label="AI 대국">
      <div className="panel-head">
        <h2>AI 대국</h2>
        {active && <button className="btn small ghost" onClick={onStop}>그만두기</button>}
      </div>
      {active ? (
        <p className="muted">AI {level.label}와 두는 중 · 나는 {active.aiColor === "white" ? "흑" : "백"}</p>
      ) : (
        <>
          <label className="size-picker ai-level">
            기력
            <select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              {AI_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>AI {l.label}</option>
              ))}
            </select>
          </label>
          <div className="seat-buttons">
            <button className="btn small primary" onClick={() => onStart(levelId, "black")}>흑으로 두기</button>
            <button className="btn small" onClick={() => onStart(levelId, "white")}>백으로 두기</button>
          </div>
          <p className="muted small-note">AI 기력은 임시 추정입니다. 점수에는 반영되지 않습니다.</p>
        </>
      )}
    </section>
  );
}
