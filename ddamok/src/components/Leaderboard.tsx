import { useState } from "react";
import { api, type PublicUser } from "../api.ts";
import { formatRating } from "../online/protocol.ts";
import { rankName, t } from "../i18n/index.ts";
import { Chevron } from "./Fold.tsx";

export function Leaderboard() {
  const [players, setPlayers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details
      className="panel leaderboard"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) api.leaderboard().then((r) => setPlayers(r.players), (err) => setError(err.message));
      }}
    >
      <summary>{t("lb.title")}<Chevron /></summary>
      {error && <p className="form-error">{error}</p>}
      {players && players.length === 0 && <p className="muted">{t("lb.empty")}</p>}
      {players && players.length > 0 && (
        <ol>
          {players.map((u) => (
            <li key={u.id}>
              <a className="who" href={`/profile?user=${encodeURIComponent(u.username)}`}>{u.username}</a>
              <span className="score-rank">{rankName(u.rating)}</span>
              <span className="pts">{formatRating(u.rating, u.provisional)}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
