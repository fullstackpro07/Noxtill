import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { JumpLink } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { EFFECTIVE_LABEL, META_DOC, NOX, legalHref, legalMetadata, pad2, visibleSections } from "@/lib/marketing/legal/nox";
import { ScheduleFinder, ScheduleNav } from "./schedule-nav";

const ROUTE = "/legal/product-terms";
export const metadata = legalMetadata(ROUTE);

export default function ProductTermsPage() {
  const S = NOX.productSchedules;
  const G = NOX.legal;
  const stack = [
    { sym: "", name: "General Terms of Service", desc: "The platform agreement", href: legalHref("terms"), bg: "#043F31", fg: "#FFFFFF", bd: "#043F31", op: "#44F0B0" },
    { sym: "+", name: "Product & Service-Specific Terms", desc: "For the modules you enable", href: "#platform", bg: "#ECFBF4", fg: "#043F31", bd: "#079A63", op: "#067A50" },
    { sym: "+", name: "Regional Addenda", desc: "Where your location adds rights or obligations", href: legalHref("regional"), bg: "#FFFFFF", fg: "#0B1822", bd: "#D9E8E0", op: "#067A50" },
    { sym: "+", name: "DPA and Acceptable Use Policy", desc: "Where applicable", href: legalHref("dpa"), bg: "#FFFFFF", fg: "#0B1822", bd: "#D9E8E0", op: "#067A50" },
  ];
  const short = Object.fromEntries(S.map((x) => [x.key, x.short]));

  return (
    <LegalShell route={ROUTE}>
      <div data-printonly="true" style={s("padding: 0 0 12px; border-bottom: 2px solid #064F3B; margin-bottom: 16px; font-size: 11pt;")}>
        <strong>Noxtill LLC</strong> · Product &amp; Service-Specific Terms · https://noxtill.com/legal/product-terms · Version {NOX.doc.version} · Effective {EFFECTIVE_LABEL}
      </div>
      <section aria-labelledby="pt-h1" style={s("background: linear-gradient(180deg, #ECFBF4 0%, #FFFFFF 100%); border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 44px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Product & Service-Specific Terms" }]} noprint />
          <div style={s("margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 28px 56px; align-items: center;")}>
            <div style={s("display: flex; flex-direction: column; gap: 14px; min-width: 0;")}>
              <span style={s("font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>Contract layer · 9 schedules · 40 modules</span>
              <h1 id="pt-h1" style={s("margin: 0; font-size: clamp(34px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance;")}>
                Product &amp; Service-Specific Terms
              </h1>
              <p style={s("margin: 0; font-size: 18px; line-height: 1.6; color: #2A3A42; max-width: 60ch;")}>
                Additional terms apply to the Noxtill products, modules and capabilities your organization enables. These Product-Specific Terms supplement the Noxtill Terms of Service.
              </p>
            </div>
            <figure role="group" aria-labelledby="stack-cap" style={s("margin: 0; display: flex; flex-direction: column; gap: 6px;")}>
              <figcaption id="stack-cap" style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #4C5B63; margin-bottom: 4px;")}>
                Your agreement with Noxtill
              </figcaption>
              {stack.map((st) => (
                <A
                  key={st.name}
                  href={st.href}
                  style={s(`display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; background: ${st.bg}; color: ${st.fg}; text-decoration: none; border: 1px solid ${st.bd};`)}
                >
                  <span aria-hidden="true" style={s(`font-size: 18px; font-weight: 800; width: 18px; text-align: center; color: ${st.op};`)}>
                    {st.sym}
                  </span>
                  <span style={s("display: flex; flex-direction: column; gap: 2px; min-width: 0;")}>
                    <strong style={s("font-size: 16px;")}>{st.name}</strong>
                    <span style={s("font-size: 13px; opacity: 0.85;")}>{st.desc}</span>
                  </span>
                </A>
              ))}
            </figure>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="product-terms" />
          </div>
        </div>
      </section>

      <section aria-labelledby="prec-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 8px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px 48px;")}>
          <div style={s("display: flex; flex-direction: column; gap: 10px;")}>
            <h2 id="prec-h" style={s("margin: 0; font-size: 22px; font-weight: 800;")}>
              Order of precedence
            </h2>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #3A4A52;")}>{G.agreementStatement}</p>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6; font-weight: 700; color: #043F31;")}>{G.precedenceNote}</p>
          </div>
          <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px;")}>
            {G.precedence.map(([name, desc], i) => (
              <li key={name} style={s(`display: flex; gap: 14px; align-items: baseline; padding: 12px 14px; border-radius: 12px; background: ${i === 3 ? "#ECFBF4" : "#FFFFFF"}; border: 1px solid #E3EEE8;`)}>
                <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: #067A50; min-width: 18px;")}>{i + 1}</span>
                <span style={s("min-width: 0;")}>
                  <strong style={s("font-size: 15px;")}>{name}</strong>
                  <span style={s("display: block; font-size: 13px; color: #3A4A52;")}>{desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="sched-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 8px;")} data-noprint="true">
        <ScheduleFinder modules={NOX.moduleMap} />
        <div style={s("display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 14px;")}>
          {S.map((c) => (
            <article key={c.key} style={s("display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 16px; border: 1px solid #D9E8E0; background: #FFFFFF; min-width: 0;")}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #067A50;")}>Schedule {c.n}</span>
              <h3 style={s("margin: 0; font-size: 18px; font-weight: 800; line-height: 1.3;")}>{c.short}</h3>
              <p style={s("margin: 0; font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{c.purpose}</p>
              <ul style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px;")}>
                {c.modules.map((m) => (
                  <li key={m.n} style={s("font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: #ECFBF4; color: #043F31;")}>
                    {m.n} {m.name}
                  </li>
                ))}
              </ul>
              <div style={s("margin-top: auto; padding-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 12px; border-top: 1px solid #EEF4F1; font-size: 12px; color: #4C5B63;")}>
                <span>Effective: {EFFECTIVE_LABEL}</span>
                <JumpLink id={c.key} style={s("font-size: 14px; font-weight: 800; white-space: nowrap;")}>
                  View terms →
                </JumpLink>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 64px; display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start;")}>
        <ScheduleNav items={S.map((x) => ({ key: x.key, n: x.n, short: x.short }))} />
        <div style={s("flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 56px;")}>
          {S.map((sc) => (
            <article key={sc.key} id={sc.key} aria-labelledby={`${sc.key}-h`} style={s("scroll-margin-top: 120px;")}>
              <header style={s("padding: 22px 24px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 12px;")}>
                <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #44F0B0;")}>Schedule {sc.n}</span>
                <h2 id={`${sc.key}-h`} style={s("margin: 0; font-size: clamp(22px, 2.6vw, 28px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.2;")}>
                  {sc.title}
                </h2>
                <p style={s("margin: 0; font-size: 14px; line-height: 1.6; color: #D7EFE5;")}>
                  <strong style={s("color: #FFFFFF;")}>Modules:</strong> {sc.modules.map((m) => `${m.n} ${m.name}`).join(" · ")}
                </p>
                {sc.also.length > 0 ? (
                  <p style={s("margin: 0; font-size: 14px; line-height: 1.6; color: #D7EFE5;")}>
                    <strong style={s("color: #FFFFFF;")}>Also governs AI functions in:</strong> {sc.also.join(", ")}
                  </p>
                ) : null}
                <div style={s("display: flex; flex-wrap: wrap; gap: 6px;")} data-noprint="true">
                  <span style={s("font-size: 13px; font-weight: 700; color: #FFFFFF;")}>Read with:</span>
                  {sc.policies.map((p) => (
                    <A key={p.key} href={legalHref(p.key)} style={s("font-size: 13px; font-weight: 700; color: #44F0B0;")}>
                      {p.name}
                    </A>
                  ))}
                </div>
              </header>
              <PolicyBody sections={visibleSections(sc.clauses)} compact />
            </article>
          ))}
        </div>
      </div>

      <section aria-labelledby="map-h" style={s("background: #F7FAF8; border-top: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 56px;")}>
          <h2 id="map-h" style={s("margin: 0 0 6px; font-size: 22px; font-weight: 800;")}>
            Module-to-terms map
          </h2>
          <p style={s("margin: 0 0 16px; font-size: 14px; color: #3A4A52;")}>Each of the 40 Noxtill modules is governed by exactly one Product Schedule.</p>
          <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 14px; background: #FFFFFF;")}>
            <table style={s("width: 100%; border-collapse: collapse; font-size: 14px; min-width: 720px;")}>
              <caption style={s("text-align: left; padding: 12px 16px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>
                Noxtill modules, their Product Schedule, primary policies and regional considerations
              </caption>
              <thead>
                <tr style={s("background: #064F3B; color: #FFFFFF;")}>
                  {["#", "Module", "Schedule", "Primary policies", "Regional considerations"].map((h) => (
                    <th key={h} scope="col" style={s("text-align: left; padding: 10px 14px;")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOX.moduleMap.map((m) => (
                  <tr key={m.id} style={s("border-top: 1px solid #E3EEE8;")}>
                    <td style={s("padding: 10px 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067A50;")}>{pad2(m.n)}</td>
                    <th scope="row" style={s("text-align: left; padding: 10px 14px;")}>
                      {m.name}
                    </th>
                    <td style={s("padding: 10px 14px;")}>
                      <JumpLink id={m.schedule}>
                        {m.scheduleNum} · {short[m.schedule]}
                      </JumpLink>
                    </td>
                    <td style={s("padding: 10px 14px;")}>{m.policies}</td>
                    <td style={s("padding: 10px 14px; color: #3A4A52;")}>{m.regional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </LegalShell>
  );
}
