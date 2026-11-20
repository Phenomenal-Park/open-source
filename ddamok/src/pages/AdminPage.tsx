import { useEffect, useState } from "react";
import { api, loadSession, type AdminReport } from "../api.ts";
import { displayName, formatDate, t } from "../i18n/index.ts";

/** 관리자 화면(/admin): 열린 신고 보기, 이용 제한·해제, 점수 초기화. 자동 제재는 없다 — 사람이 보고 결정한다. */
export function AdminPage() {
  const session = loadSession();
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = () => {
    if (!session) return;
    api.adminReports(session.token).then((r) => setReports(r.reports), (e) => setError(e.message));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(user: string, action: "ban" | "unban" | "reset", days?: number) {
    if (!session || !window.confirm(t("admin.confirm"))) return;
    setError(null);
    try {
      await api.adminUser(session.token, user, action, { days });
      setNotice(t("admin.ok"));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const actions = (user: string) => (
    <div className="admin-actions">
      <button className="btn small" onClick={() => act(user, "ban", 7)}>{t("admin.ban7")}</button>
      <button className="btn small" onClick={() => act(user, "ban", 30)}>{t("admin.ban30")}</button>
      <button className="btn small danger" onClick={() => act(user, "ban")}>{t("admin.banForever")}</button>
      <button className="btn small" onClick={() => act(user, "unban")}>{t("admin.unban")}</button>
      <button className="btn small" onClick={() => act(user, "reset")}>{t("admin.reset")}</button>
    </div>
  );

  if (!session) return <main className="page narrow"><p className="muted">{t("admin.notAdmin")}</p></main>;
  return (
    <main className="page narrow">
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      <section className="panel">
        <h2>{t("admin.user")}</h2>
        <div className="search">
          <input aria-label={t("admin.user")} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </div>
        {name.trim() && actions(name.trim())}
      </section>
      <section className="panel">
        <h2>{t("admin.reports")}</h2>
        {reports && reports.length === 0 && <p className="muted">{t("admin.none")}</p>}
        {reports && reports.length > 0 && (
          <ul className="admin-list">
            {reports.map((r) => (
              <li key={r.id}>
                <div>
                  <b><a href={`/profile?user=${encodeURIComponent(r.target_name)}`}>{displayName(r.target_name)}</a></b>{" "}
                  <span className="muted-inline">{t("admin.count", { n: r.target_reports })}{r.target_banned_until && r.target_banned_until > Date.now() ? ` · ${t("admin.banned")}` : ""}</span>
                </div>
                <div className="muted">{t(`report.cat.${r.category}`)} · {displayName(r.reporter_name)} · {formatDate(r.created_at)}</div>
                <div>{r.reason}</div>
                <div className="admin-actions">
                  <a className="btn small" href={`/records?user=${encodeURIComponent(r.target_name)}&game=${r.game_id}`}>{t("admin.viewGame")}</a>
                  <button className="btn small" onClick={async () => { await api.adminCloseReport(session.token, r.id); load(); }}>{t("admin.close")}</button>
                </div>
                {actions(r.target_id)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
