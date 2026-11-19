import { useState } from "react";
import { api, type PublicUser } from "../api.ts";
import { formatRating } from "../online/protocol.ts";

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
      <summary>순위</summary>
      {error && <p className="form-error">{error}</p>}
      {players && players.length === 0 && <p className="muted">아직 레이팅매치 기록이 없습니다.</p>}
      {players && players.length > 0 && (
        <ol>
          {players.map((u) => (
            <li key={u.id}>
              <a className="who" href={`/records?user=${encodeURIComponent(u.username)}`}>{u.username}</a>
              <span className="score-rank">{u.rank}</span>
              <span className="pts">{formatRating(u.rating, u.provisional)}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
