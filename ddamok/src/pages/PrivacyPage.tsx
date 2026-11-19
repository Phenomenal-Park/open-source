import { lang } from "../i18n/index.ts";
import { PRIVACY } from "../i18n/privacy.ts";

export function PrivacyPage() {
  const p = PRIVACY[lang];
  return (
    <main className="page narrow">
      <article className="panel prose">
        <h2>{p.title}</h2>
        <p className="muted">{p.draft}</p>
        {p.sections.map((s) => (
          <section key={s.h}>
            <h3>{s.h}</h3>
            <ul>{s.items.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
      </article>
    </main>
  );
}
