import { useEffect, useState } from "react";
import { AI_LEVELS } from "../ai/levels.ts";
import { api } from "../api.ts";
import type { Player } from "../game/index.ts";
import { colorName, rankLabel, rankName, lang, t, type MessageKey } from "../i18n/index.ts";

interface AiPanelProps {
  active: { levelId: string; aiColor: Player } | null;
  onStart: (levelId: string, humanColor: Player) => void;
  onStop: () => void;
}

/** 출시 전 추정 급수(한국어 표기 "18급")를 현재 언어로 */
function estimateRank(label: string): string {
  const m = label.match(/^(\d+)(급|단)$/);
  if (!m) return label;
  const n = Number(m[1]);
  return rankLabel(lang, m[2] === "급" ? 500 + 65 * (18 - n) : 1700 + 100 * (n - 1));
}

export function AiPanel({ active, onStart, onStop }: AiPanelProps) {
  const [levelId, setLevelId] = useState(AI_LEVELS[2].id);
  // 각 AI의 현재 급수: 서버의 AI 계정 점수(사람과의 레이팅매치로 바뀜). 서버가 없으면 출시 전 추정치.
  const [ranks, setRanks] = useState<Record<string, string>>({});
  useEffect(() => {
    api.bots().then((r) => setRanks(Object.fromEntries(r.bots.map((b) => [b.level, rankName(b.rating)]))), () => undefined);
  }, []);
  const rankOf = (id: string) => ranks[id] ?? t("ai.about", { rank: estimateRank(AI_LEVELS.find((l) => l.id === id)!.label) });
  const nameOf = (id: string) => t(`ai.name.${id}` as MessageKey);
  const level = AI_LEVELS.find((l) => l.id === (active?.levelId ?? levelId))!;
  return (
    <section className="panel" aria-label={t("ai.title")}>
      <div className="panel-head">
        <h2>{t("ai.title")}</h2>
        {active && <button className="btn small ghost" onClick={onStop}>{t("btn.stop")}</button>}
      </div>
      {active ? (
        <p className="muted">{t("ai.playing", { name: nameOf(level.id), rank: rankOf(level.id), color: colorName(active.aiColor === "white" ? "black" : "white") })}</p>
      ) : (
        <>
          <label className="size-picker ai-level">
            {t("ai.level")}
            <select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              {AI_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>{nameOf(l.id)} · {rankOf(l.id)}</option>
              ))}
            </select>
          </label>
          <div className="seat-buttons">
            <button className="btn small primary" onClick={() => onStart(levelId, "black")}>{t("ai.asBlack")}</button>
            <button className="btn small" onClick={() => onStart(levelId, "white")}>{t("ai.asWhite")}</button>
          </div>
          <p className="muted small-note">{t("ai.note")}</p>
        </>
      )}
    </section>
  );
}
