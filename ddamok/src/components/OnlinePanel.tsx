import { useState } from "react";
import type { Session } from "../api.ts";
import { FRIEND_CODE_RE, type MatchMode } from "../online/protocol.ts";

interface OnlinePanelProps {
  session: Session | null;
  waiting: { mode: MatchMode; code: string | null } | null;
  error: string | null;
  onFind: (mode: MatchMode, code: string | null) => void;
  onCancel: () => void;
}

const LABEL: Record<MatchMode, string> = { rated: "레이팅매치", casual: "친선매치", friend: "친구매치" };

export function OnlinePanel({ session, waiting, error, onFind, onCancel }: OnlinePanelProps) {
  const [code, setCode] = useState("");
  const ready = session?.verified;
  return (
    <section className="panel" aria-label="온라인 대국">
      <h2>온라인 대국</h2>
      {!session && <p className="muted">로그인하면 온라인 대국을 둘 수 있습니다.</p>}
      {session && !session.verified && <p className="muted">이메일 인증을 마치면 온라인 대국을 둘 수 있습니다.</p>}
      {waiting ? (
        <div className="waiting">
          <p className="waiting-text" aria-live="polite">
            <span className="spinner" aria-hidden /> {LABEL[waiting.mode]}{waiting.code ? ` (${waiting.code})` : ""} 상대를 찾는 중…
          </p>
          <button className="btn small ghost" onClick={onCancel}>취소</button>
        </div>
      ) : (
        <>
          <div className="match-buttons">
            <button className="btn primary" disabled={!ready} onClick={() => onFind("rated", null)}>레이팅매치</button>
            <button className="btn" disabled={!ready} onClick={() => onFind("casual", null)}>친선매치</button>
          </div>
          <form
            className="friend-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (FRIEND_CODE_RE.test(code)) onFind("friend", code);
            }}
          >
            <input
              aria-label="친구매치 코드" placeholder="코드 (숫자 8자리까지)" inputMode="numeric" pattern="\d{1,8}" maxLength={8}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!ready}
            />
            <button className="btn" type="submit" disabled={!ready || !FRIEND_CODE_RE.test(code)}>친구매치</button>
          </form>
          <p className="muted small-note">레이팅매치만 점수에 반영됩니다. 친구매치는 같은 코드를 입력한 사람과 둡니다.</p>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
