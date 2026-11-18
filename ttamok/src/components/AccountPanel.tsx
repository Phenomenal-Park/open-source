import { useState, type FormEvent } from "react";
import { api, ApiError, type PublicUser, type Session } from "../api.ts";
import type { Player } from "../game/index.ts";

interface AccountPanelProps {
  seats: Record<Player, Session | null>;
  onSeat: (p: Player, s: Session | null) => void;
  onSwap: () => void;
  onStartRated: () => void;
  ratedActive: boolean;
  startError: string | null;
}

const LABEL: Record<Player, string> = { black: "흑", white: "백" };

function SeatForm({ player, onDone }: { player: Player; onDone: (s: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent, mode: "login" | "signup") {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await (mode === "login" ? api.login(username, password) : api.signup(username, password)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "오류가 났습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="seat-form" onSubmit={(e) => submit(e, "login")}>
      <input
        aria-label={`${LABEL[player]} 아이디`} placeholder="아이디" autoComplete="username"
        value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} required
      />
      <input
        aria-label={`${LABEL[player]} 비밀번호`} placeholder="비밀번호" type="password" autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={72} required
      />
      <div className="seat-buttons">
        <button className="btn small primary" type="submit" disabled={busy}>로그인</button>
        <button className="btn small" type="button" disabled={busy} onClick={(e) => submit(e, "signup")}>가입</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function SeatCard({ player, session, onSeat, locked }: { player: Player; session: Session | null; onSeat: AccountPanelProps["onSeat"]; locked: boolean }) {
  return (
    <div className="seat">
      <div className="seat-title"><span className={`dot ${player}`} aria-hidden /> {LABEL[player]}</div>
      {session ? (
        <div className="seat-user">
          <strong>{session.user.username}</strong>
          <span className="score-rank">{session.user.rank}</span>
          <span className="seat-rating">{session.user.rating}점 · {session.user.wins}승 {session.user.losses}패</span>
          {!locked && (
            <button
              className="btn small ghost"
              onClick={() => {
                void api.logout(session.token).catch(() => undefined);
                onSeat(player, null);
              }}
            >
              로그아웃
            </button>
          )}
        </div>
      ) : (
        <SeatForm player={player} onDone={(s) => onSeat(player, s)} />
      )}
    </div>
  );
}

function Leaderboard() {
  const [players, setPlayers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details
      className="leaderboard"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) {
          api.leaderboard().then((r) => setPlayers(r.players), (err) => setError(err.message));
        }
      }}
    >
      <summary>순위</summary>
      {error && <p className="form-error">{error}</p>}
      {players && players.length === 0 && <p className="muted">아직 랭크 대국이 없습니다.</p>}
      {players && players.length > 0 && (
        <ol>
          {players.map((u) => (
            <li key={u.id}>
              <span className="who">{u.username}</span>
              <span className="score-rank">{u.rank}</span>
              <span className="pts">{u.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export function AccountPanel({ seats, onSeat, onSwap, onStartRated, ratedActive, startError }: AccountPanelProps) {
  const bothIn = seats.black && seats.white;
  return (
    <section className="panel account-panel" aria-label="랭크 대국">
      <div className="panel-head">
        <h2>랭크 대국</h2>
        {!ratedActive && <button className="btn small ghost" onClick={onSwap}>흑백 바꾸기</button>}
      </div>
      <p className="muted">두 사람이 각자 로그인하면 점수가 걸린 대국을 둘 수 있습니다.</p>
      <div className="seats">
        <SeatCard player="black" session={seats.black} onSeat={onSeat} locked={ratedActive} />
        <SeatCard player="white" session={seats.white} onSeat={onSeat} locked={ratedActive} />
      </div>
      {!ratedActive && (
        <button className="btn primary wide" disabled={!bothIn} onClick={onStartRated}>
          랭크 대국 시작
        </button>
      )}
      {ratedActive && <p className="rated-tag">랭크 대국 중 · 무르기 불가</p>}
      {startError && <p className="form-error">{startError}</p>}
      <Leaderboard />
    </section>
  );
}
