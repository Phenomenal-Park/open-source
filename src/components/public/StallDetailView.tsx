"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt, type Messages } from "@/lib/i18n";
import { pick } from "@/lib/i18n/config";
import type { MenuEntry, Reference, Review, StallDetail } from "@/lib/domain/types";
import { effectiveHours, isOpenNow } from "@/lib/domain/hours";
import { directionsUrl, hintText, hoursLines, itemName, photoUrl, priceText, spiceLabel, stallTitle, timeAgo } from "@/lib/domain/display";
import { Chilis } from "@/components/ui/Chili";
import { IconDirections, IconMap, Star } from "@/components/ui/icons";
import { AdSlot } from "./AdSlot";
import { ApiError, postJson } from "./api";

type Tab = "menu" | "reviews" | "photos";
const INITIAL_MENU = 4;

export function StallDetailView({ s, locale, t, reference }: { s: StallDetail; locale: string; t: Messages; reference: Reference }) {
  const [tab, setTab] = useState<Tab>("menu");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [reviews, setReviews] = useState<Review[]>(s.reviews);
  const [showForm, setShowForm] = useState(false);
  const [reporting, setReporting] = useState(false);
  const days = effectiveHours(s.hours_mode, s.hours, reference.default_hours);
  const open = isOpenNow(days);
  const hero = photoUrl(s.photo);
  const hint = hintText(s.hint, locale, t);
  const cat = reference.categories.find((c) => c.code === s.category_code);

  useEffect(() => {
    if (window.location.hash === "#review") { setTab("reviews"); setShowForm(true); }
  }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3000); return () => clearTimeout(id); }, [toast]);
  const fail = (e: unknown) => setToast({ text: e instanceof ApiError && e.status === 429 ? t.common.tooMany : t.common.error, error: true });

  return (
    <main className="page" style={{ paddingTop: 0 }}>
      {hero && <img className="hero" src={hero} alt="" />}
      <h2 className="detail__title">{stallTitle(s, locale)}</h2>
      {hint && <div className="detail__hint">{hint}</div>}
      <div className="detail__meta">
        <span className={open ? "sel__open--on" : "sel__open--off"} style={{ fontWeight: 700 }}>{open ? t.stall.openNow : t.stall.closedNow}</span>
        {s.review_summary.count > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
            <Star size={16} />{s.review_summary.avg?.toFixed(1)} <span className="muted" style={{ fontWeight: 400 }}>({s.review_summary.count})</span>
          </span>
        )}
        {cat && <span className="muted">{pick(cat.name_i18n, locale)}{s.tags.includes("seafood") ? ` · ${t.stall.seafood}` : ""}</span>}
        {s.last_verified_at && <span className="muted small">{fmt(t.stall.lastVerified, { date: new Date(s.last_verified_at).toLocaleDateString(locale === "zh-cn" ? "zh-CN" : locale) })}</span>}
      </div>
      {!s.is_active && <p className="card small" style={{ marginTop: 12 }}>{t.stall.notActive}</p>}
      <div className="detail__actions">
        <a className="btn btn--outline" href={directionsUrl(s.raw_lat ?? s.lat, s.raw_lng ?? s.lng)} target="_blank" rel="noopener"><IconDirections size={18} />{t.stall.directions}</a>
        <Link className="btn btn--outline" href={`/${locale}?s=${s.slug}`}><IconMap size={18} />{t.stall.showOnMap}</Link>
      </div>

      <div className="tabs" role="tablist">
        {(["menu", "reviews", "photos"] as const).map((k) => (
          <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {k === "menu" ? t.stall.tabMenu : k === "reviews" ? `${t.stall.tabReviews}${s.review_summary.count ? ` ${s.review_summary.count}` : ""}` : t.stall.tabPhotos}
          </button>
        ))}
      </div>

      {tab === "menu" && (
        <>
          <MenuList menu={s.menu} locale={locale} t={t} onError={fail} categoryCode={s.category_code} />
          <section className="section">
            <h3 className="section__title">{s.hours_mode === "CUSTOM" ? t.stall.verifiedHours : t.stall.usualHours}</h3>
            {hoursLines(days, t).map((l) => <div key={l}>{l}</div>)}
            {s.hours_mode !== "CUSTOM" && <p className="muted small" style={{ margin: "4px 0 0" }}>{t.stall.usualHoursNote}</p>}
          </section>
          <section className="section">
            <dl className="kv">
              <dt>{t.stall.payment}</dt>
              <dd>
                {s.payments.card_worked + s.payments.card_failed + s.payments.cash_used === 0 ? <span className="muted">{t.stall.paymentUnknown}</span> : (
                  [s.payments.card_worked > 0 && fmt(t.stall.cardWorked, { n: s.payments.card_worked }),
                   s.payments.card_failed > 0 && fmt(t.stall.cardFailed, { n: s.payments.card_failed }),
                   s.payments.cash_used > 0 && fmt(t.stall.cashUsed, { n: s.payments.cash_used })].filter(Boolean).join(" · ")
                )}
              </dd>
              {s.kind === "food" && (<>
                <dt>{t.stall.dietary}</dt>
                <dd>{s.dietary.length ? s.dietary.map((d) => t.claims[d.claim] ?? d.claim).join(" · ") : <span className="muted">{t.stall.dietaryUnknown}</span>}</dd>
              </>)}
            </dl>
          </section>
          <p style={{ marginTop: 22 }}><button className="linkbtn" onClick={() => setReporting(true)}>{t.stall.report}</button></p>
          <AdSlot position="stall-lower" t={t} />
        </>
      )}

      {tab === "reviews" && (
        <section className="section" id="review">
          {!showForm ? (
            <button className="btn btn--outline btn--block" onClick={() => setShowForm(true)}>{t.review.write}</button>
          ) : (
            <ReviewForm stallId={s.id} locale={locale} t={t} onDone={(r) => { setReviews((x) => [r, ...x]); setShowForm(false); setToast({ text: t.review.thanks }); }} onError={fail} />
          )}
          <div style={{ marginTop: 8 }}>
            {reviews.length === 0 && <p className="muted">{t.review.none}</p>}
            {reviews.map((r, i) => (
              <div key={r.id}>
                <ReviewCard r={r} locale={locale} t={t} />
                {i === 5 && reviews.length > 8 && <AdSlot position="reviews-mid" t={t} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "photos" && <Photos s={s} t={t} onError={fail} />}

      {reporting && <ReportSheet stallId={s.id} t={t} onClose={() => setReporting(false)} onDone={() => { setReporting(false); setToast({ text: t.report.thanks }); }} onError={fail} />}
      {toast && <div className={`toast ${toast.error ? "toast--error" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}

function MenuList({ menu, locale, t, onError, categoryCode }: { menu: MenuEntry[]; locale: string; t: Messages; onError: (e: unknown) => void; categoryCode: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? menu : menu.slice(0, INITIAL_MENU);
  return (
    <div>
      {shown.map((m) => <MenuRow key={m.id} m={m} locale={locale} t={t} onError={onError} categoryCode={categoryCode} />)}
      {menu.length > INITIAL_MENU && (
        <button className="btn btn--ghost btn--block" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t.stall.lessMenu : fmt(t.stall.moreMenu, { n: menu.length - INITIAL_MENU })}
        </button>
      )}
    </div>
  );
}

function MenuRow({ m, locale, t, onError, categoryCode }: { m: MenuEntry; locale: string; t: Messages; onError: (e: unknown) => void; categoryCode: string }) {
  const [community, setCommunity] = useState(m.community_spice);
  const [mine, setMine] = useState<number | null>(m.my_spice);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Spice is meaningful for savoury food; desserts/fruit only show it when actually marked spicy.
  const isFood = m.kind === "food" && !(categoryCode === "dessert_fruit" && !(m.spice && m.spice > 0) && community.count === 0);
  const op = m.spice;
  const cm = community.count > 0 ? community.level : null;
  const differs = op != null && cm != null && Math.abs(op - cm) >= 2;

  const vote = async (level: number) => {
    if (busy) return;
    setBusy(true);
    const next = mine === level ? null : level; // same choice again removes the opinion
    try {
      const r = await postJson<{ count: number; level: number | null; mine: number | null }>("/api/public/spice", { item_id: m.id, level: next });
      setCommunity({ count: r.count, level: r.level });
      setMine(next);
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <div className="menuitem">
      <div className="menuitem__name">
        <span className="ellipsis">{itemName(m, locale)}</span>
        {isFood && op != null && op > 0 && <Chilis level={op} label={spiceLabel(op, t)} />}
      </div>
      <div className="menuitem__price">{priceText(m.price, t)}</div>
      {isFood && (
        <div className="menuitem__spice">
          {op === 0 && <span>{t.spice.notSpicy}</span>}
          {op != null && op > 0 && <span>{spiceLabel(op, t)}</span>}
          {(differs || (op == null && cm != null)) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {t.spice.community} {cm ? <Chilis level={cm} size={12} label={spiceLabel(cm, t)} /> : t.spice.notSpicy} · {fmt(t.spice.votes, { n: community.count })}
            </span>
          )}
          <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setAsking((v) => !v)} aria-expanded={asking}>{t.spice.ask}</button>
          {asking && (
            <div style={{ flexBasis: "100%" }}>
              <div className="spicevote" role="group" aria-label={t.spice.ask}>
                {[0, 1, 2, 3].map((lv) => (
                  <button key={lv} aria-pressed={mine === lv} disabled={busy} onClick={() => vote(lv)} aria-label={spiceLabel(lv, t)}>
                    {lv === 0 ? t.spice.notSpicy : <Chilis level={lv} size={13} />}
                  </button>
                ))}
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                {cm != null && <>{t.spice.community}: {cm ? <Chilis level={cm} size={12} /> : t.spice.notSpicy} · {fmt(t.spice.votes, { n: community.count })} · </>}
                {t.spice.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r, locale, t }: { r: Review; locale: string; t: Messages }) {
  const translated = r.original_language && r.original_language !== locale ? r.translations?.[locale] : null;
  const [original, setOriginal] = useState(false);
  return (
    <div className="review">
      <div className="review__head">
        <b>{r.nickname || t.review.defaultNickname}</b>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Star size={13} />{r.rating.toFixed(1)}</span>
        <span>· {timeAgo(r.created_at, t)}</span>
      </div>
      {r.original_text && <p className="review__text">{translated && !original ? translated : r.original_text}</p>}
      {translated && (
        <button className="linkbtn small" style={{ marginTop: 4, fontSize: 12.5 }} onClick={() => setOriginal((v) => !v)}>
          {original ? t.review.viewTranslation : t.review.viewOriginal}
        </button>
      )}
    </div>
  );
}

function StarInput({ value, onChange, small, label }: { value: number; onChange: (v: number) => void; small?: boolean; label: string }) {
  return (
    <div className={`stars ${small ? "stars--sm" : ""}`} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-pressed={n <= value} aria-label={`${n}`} onClick={() => onChange(value === n && small ? 0 : n)}>★</button>
      ))}
    </div>
  );
}

function ReviewForm({ stallId, locale, t, onDone, onError }: { stallId: string; locale: string; t: Messages; onDone: (r: Review) => void; onError: (e: unknown) => void }) {
  const [rating, setRating] = useState(0);
  const [taste, setTaste] = useState(0);
  const [value, setValue] = useState(0);
  const [kindness, setKindness] = useState(0);
  const [price, setPrice] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<"card_worked" | "cash_used" | null>(null);
  const [openNow, setOpenNow] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [nick, setNick] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!rating) { setErr(true); return; }
    setBusy(true);
    try {
      const r = await postJson<{ review_id: string }>("/api/public/review", {
        stall_id: stallId, rating, taste: taste || null, value: value || null, kindness: kindness || null,
        price_matched: price, payment, open_now: openNow, text: text.trim() || null, nickname: nick.trim() || null, language: locale,
      });
      onDone({ id: r.review_id, nickname: nick.trim() || null, rating, original_language: locale, original_text: text.trim() || null, price_matched: price, created_at: new Date().toISOString(), translations: {} });
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{t.review.helpNext}</p>
      <div className="field__label">{t.review.overall}</div>
      <StarInput value={rating} onChange={(v) => { setRating(v); setErr(false); }} label={t.review.overall} />
      {err && <p className="small" style={{ color: "var(--danger)", margin: "4px 0 0" }}>{t.review.ratingRequired}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", alignItems: "center", marginTop: 12 }}>
        <span className="small">{t.review.taste}</span><StarInput small value={taste} onChange={setTaste} label={t.review.taste} />
        <span className="small">{t.review.value}</span><StarInput small value={value} onChange={setValue} label={t.review.value} />
        <span className="small">{t.review.kindness}</span><StarInput small value={kindness} onChange={setKindness} label={t.review.kindness} />
      </div>
      <div className="field__label" style={{ marginTop: 14 }}>{t.review.facts} <span className="muted small">({t.review.optional})</span></div>
      <div className="chiprow" style={{ padding: 0, flexWrap: "wrap", marginTop: 6 }}>
        <button type="button" className="chip chip--sm" aria-pressed={price === true} onClick={() => setPrice(price === true ? null : true)}>{t.review.priceMatched}</button>
        <button type="button" className="chip chip--sm" aria-pressed={price === false} onClick={() => setPrice(price === false ? null : false)}>{t.review.priceDifferent}</button>
        <button type="button" className="chip chip--sm" aria-pressed={payment === "card_worked"} onClick={() => setPayment(payment === "card_worked" ? null : "card_worked")}>{t.review.cardOk}</button>
        <button type="button" className="chip chip--sm" aria-pressed={payment === "cash_used"} onClick={() => setPayment(payment === "cash_used" ? null : "cash_used")}>{t.review.cashUsed}</button>
        <button type="button" className="chip chip--sm" aria-pressed={openNow === true} onClick={() => setOpenNow(openNow ? null : true)}>{t.review.openNow}</button>
      </div>
      <textarea className="input" style={{ marginTop: 12 }} maxLength={1000} placeholder={t.review.textPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
      <input className="input" style={{ marginTop: 8 }} maxLength={30} placeholder={t.review.nicknamePlaceholder} value={nick} onChange={(e) => setNick(e.target.value)} />
      <button className="btn btn--primary btn--block" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{t.review.submit}</button>
    </div>
  );
}

function Photos({ s, t, onError }: { s: StallDetail; t: Messages; onError: (e: unknown) => void }) {
  const [photos, setPhotos] = useState(s.photos);
  const vote = async (id: string, v: 1 | -1) => {
    try {
      const r = await postJson<{ up: number; down: number; mine: number | null }>("/api/public/photo-vote", { photo_id: id, vote: v });
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, up: r.up, down: r.down, my_vote: r.mine } : p)));
    } catch (e) { onError(e); }
  };
  const list = photos.filter((p) => photoUrl(p.storage_path));
  if (!list.length) return <p className="muted section">{t.stall.noPhotos}</p>;
  return (
    <div className="photogrid section">
      {list.map((p) => (
        <div className="photo" key={p.id}>
          <img src={photoUrl(p.storage_path)!} alt="" loading="lazy" />
          <div className="photo__votes">
            <button aria-pressed={p.my_vote === 1} onClick={() => vote(p.id, 1)} aria-label="helpful">👍 {p.up}</button>
            <button aria-pressed={p.my_vote === -1} onClick={() => vote(p.id, -1)} aria-label="not helpful">👎 {p.down}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportSheet({ stallId, t, onClose, onDone, onError }: { stallId: string; t: Messages; onClose: () => void; onDone: () => void; onError: (e: unknown) => void }) {
  const kinds = ["closed", "price_changed", "menu_changed", "moved", "other"] as const;
  const [kind, setKind] = useState<(typeof kinds)[number] | null>(null);
  const [text, setText] = useState("");
  const send = async () => {
    if (!kind) return;
    try { await postJson("/api/public/report", { stall_id: stallId, kind, text: text.trim() || null }); onDone(); } catch (e) { onError(e); }
  };
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet sheet--overlay" role="dialog" aria-modal="true" aria-label={t.report.title}>
        <span className="sheet__handle" aria-hidden />
        <h3 className="section__title">{t.report.title}</h3>
        <div className="chiprow" style={{ padding: 0, flexWrap: "wrap" }}>
          {kinds.map((k) => <button key={k} className="chip chip--sm" aria-pressed={kind === k} onClick={() => setKind(k)}>{t.report[k]}</button>)}
        </div>
        <textarea className="input" style={{ marginTop: 12 }} maxLength={500} placeholder={t.report.text} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn--outline" style={{ flex: 1 }} onClick={onClose}>{t.common.cancel}</button>
          <button className="btn btn--primary" style={{ flex: 2 }} disabled={!kind} onClick={send}>{t.report.send}</button>
        </div>
      </div>
    </>
  );
}
