import type { RecordSummary } from "../api.ts";
import { formatRating } from "../online/protocol.ts";
import { colorName, displayName, formatDate, outcomeLabel, t } from "../i18n/index.ts";

/** 기보 목록 한 줄: 승/패/무 · 상대(당시 점수) · "흑번 57수끝 오목승" · 점수 변화 · 날짜 */
export function RecordItem({ g, href, current }: { g: RecordSummary; href: string; current?: boolean }) {
  const d = g.ratingAfter !== null && g.ratingBefore !== null ? g.ratingAfter - g.ratingBefore : null;
  const opp = g.opponent ? displayName(g.opponent) : "?";
  return (
    <li className={current ? "current" : ""}>
      <a href={href}>
        <span className={`wl ${g.result}`}>{t(g.result === "win" ? "rec.win" : g.result === "loss" ? "rec.loss" : "rec.draw")}</span>
        <span className={`dot ${g.color}`} aria-label={colorName(g.color)} />
        <span className="who">
          {g.opponentRating !== null ? t("rec.vs", { name: opp, rating: formatRating(g.opponentRating, g.opponentProvisional) }) : opp}
        </span>
        <span className="meta">
          <span className={`mode-tag ${g.mode}`}>{t(`rec.mode.${g.mode}`)}</span>
          <span className={`mode-tag rule-${g.rule ?? (g.hiddenMove ? "hidden13" : "plain")}`}>{t(`rule.${g.rule ?? (g.hiddenMove ? "hidden13" : "plain")}`)}</span>
          {outcomeLabel(g.color, g.moveCount, g.result, g.reason)}
        </span>
        <span className={`delta ${d && d > 0 ? "up" : d && d < 0 ? "down" : ""}`}>{d === null ? "" : d > 0 ? `+${d}` : d}</span>
        <span className="meta when">{formatDate(g.finishedAt)}</span>
      </a>
    </li>
  );
}

export const recordHref = (username: string, gameId: string) => `/records?user=${encodeURIComponent(username)}&game=${gameId}`;
