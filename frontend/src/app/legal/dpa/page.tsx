import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { JumpLink, PrintButton } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, capitalize, legalHref, legalMetadata, pad2, visibleSections } from "@/lib/marketing/legal/nox";
import { DpaTabs } from "./dpa-tabs";

const ROUTE = "/legal/dpa";
export const metadata = legalMetadata(ROUTE);

export default function DpaPage() {
  const S = NOX.dpa.sections;
  const isT = (x: { title: string }) => x.title === "International transfers";
  const mainSecs = S.filter((x) => !isT(x)).map((x, i) => ({ ...x, num: String(i + 1) }));
  const transferSecs = S.filter(isT)
    .map((x) => ({ ...x, num: "" }))
    .concat(NOX.privacy.sections.filter((x) => x.num === "12").map((x) => ({ ...x, num: "", title: "From the Privacy Policy (§12)" })));
  const related = [
    { href: legalHref("privacy"), label: "Privacy Policy", desc: "Noxtill’s controller processing." },
    { href: legalHref("security"), label: "Security", desc: "Controls behind Annex II." },
    { href: legalHref("subprocessors"), label: "Subprocessors", desc: "The register incorporated as Annex III." },
    { href: legalHref("terms"), label: "Terms of Service", desc: "The agreement this DPA forms part of." },
  ];
  const h2 = s("margin: 0 0 16px; font-size: 24px; font-weight: 800;");

  const panels = {
    main: (
      <div style={s("display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start;")}>
        <nav aria-label="Main DPA clauses" style={s("flex: 1 1 220px; max-width: 280px; position: sticky; top: 170px;")} data-noprint="true">
          <p style={s("margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5B63;")}>Clauses</p>
          <ol style={s("margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.4;")}>
            {mainSecs.map((c) => (
              <li key={c.id}>
                <JumpLink id={c.id} className="h-ink-ul" style={s("color: #24343C; text-decoration: none;")}>
                  {c.title}
                </JumpLink>
              </li>
            ))}
          </ol>
        </nav>
        <article aria-label="Main DPA" style={s("flex: 999 1 560px; min-width: 0;")}>
          <h2 style={s("margin: 0 0 4px; font-size: 24px; font-weight: 800;")}>Main DPA</h2>
          <PolicyBody sections={visibleSections(mainSecs)} compact />
        </article>
      </div>
    ),
    a1: (
      <>
        <h2 style={h2}>Annex I — Processing details</h2>
        <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 14px;")}>
          <table style={s("width: 100%; border-collapse: collapse; font-size: 15px;")}>
            <caption style={s("text-align: left; padding: 12px 18px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>Description of processing under this DPA</caption>
            <thead>
              <tr style={s("background: #064F3B; color: #FFFFFF;")}>
                <th scope="col" style={s("text-align: left; padding: 12px 18px; width: 200px;")}>
                  Field
                </th>
                <th scope="col" style={s("text-align: left; padding: 12px 18px;")}>
                  Specification
                </th>
              </tr>
            </thead>
            <tbody>
              {NOX.dpa.annex1.rows.map(([k, v]) => (
                <tr key={k} style={s("border-top: 1px solid #E3EEE8;")}>
                  <th scope="row" style={s("text-align: left; padding: 14px 18px; vertical-align: top; color: #043F31;")}>
                    {k}
                  </th>
                  <td style={s("padding: 14px 18px; line-height: 1.6;")}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
    a2: (
      <>
        <h2 style={h2}>Annex II — Technical and organisational measures</h2>
        <ol style={s("margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 10px;")}>
          {NOX.dpa.annex2.map((t, i) => (
            <li key={i} style={s("display: flex; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid #D9E8E0; font-size: 15px; line-height: 1.5;")}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067A50; padding-top: 2px;")}>{pad2(i + 1)}</span>
              <span>{capitalize(t.replace(/;$|; and$|\.$/, ""))}</span>
            </li>
          ))}
        </ol>
        <p style={s("margin: 16px 0 0; font-size: 14px;")}>
          Detailed descriptions: <A href="/trust/security#controls">Security controls</A>.
        </p>
      </>
    ),
    a3: (
      <>
        <h2 style={h2}>Annex III — Subprocessors</h2>
        <p style={s("margin: 0 0 14px; font-size: 17px; line-height: 1.7;")}>{NOX.dpa.annex3}</p>
        <A
          href={legalHref("subprocessors")}
          style={s("display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; background: #064F3B; color: #FFFFFF; font-weight: 700; font-size: 14px; text-decoration: none;")}
        >
          View the Subprocessors register
        </A>
      </>
    ),
    tr: (
      <>
        <h2 style={s("margin: 0 0 4px; font-size: 24px; font-weight: 800;")}>International transfers</h2>
        <PolicyBody sections={visibleSections(transferSecs)} compact />
        <p style={s("margin: 18px 0 0; font-size: 15px;")}>
          Source:{" "}
          <A href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32021D0914" target="_blank">
            Commission Implementing Decision (EU) 2021/914 — Standard Contractual Clauses (EUR-Lex)
          </A>
        </p>
      </>
    ),
  };

  return (
    <LegalShell route={ROUTE} printTitle="Data Processing Addendum">
      <section aria-labelledby="dpa-h1" style={s("border-bottom: 3px solid #064F3B;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 40px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Data Processing Addendum" }]} />
          <div style={s("margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 28px 56px; align-items: center;")}>
            <div style={s("display: flex; flex-direction: column; gap: 14px;")}>
              <span style={s("font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>Processor agreement</span>
              <h1 id="dpa-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
                Data Processing Addendum
              </h1>
              <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42; max-width: 60ch;")}>{S[0]?.blocks[0]?.x}</p>
              <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")} data-noprint="true">
                <PrintButton style={s("height: 46px; padding: 0 20px; border-radius: 11px; border: 0; background: #064F3B; color: #FFFFFF; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}>
                  Download DPA (PDF)
                </PrintButton>
                <a
                  href="mailto:contact@noxtill.com?subject=Signed%20DPA%20request"
                  style={s("display: inline-flex; align-items: center; height: 46px; padding: 0 20px; border-radius: 11px; border: 1px solid #9FD9BD; color: #064F3B; font-weight: 700; font-size: 15px; text-decoration: none;")}
                >
                  Request a signed copy
                </a>
              </div>
            </div>
            <figure role="group" aria-label="Controller and processor roles" style={s("margin: 0; display: flex; align-items: stretch; gap: 0; flex-wrap: wrap;")}>
              <div style={s("flex: 1 1 160px; padding: 20px; border-radius: 16px 0 0 16px; background: #ECFBF4; border: 1px solid #BFE8D3; display: flex; flex-direction: column; gap: 6px;")}>
                <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #067A50;")}>Controller / business</span>
                <strong style={s("font-size: 18px;")}>The customer</strong>
                <span style={s("font-size: 14px; line-height: 1.5; color: #24343C;")}>Determines why Customer Personal Data is processed and gives documented instructions.</span>
              </div>
              <div
                aria-hidden="true"
                style={s("flex: 0 0 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #F7FAF8; border-top: 1px solid #D9E8E0; border-bottom: 1px solid #D9E8E0; font-size: 20px; color: #064F3B; font-weight: 800;")}
              >
                ⇄
              </div>
              <div style={s("flex: 1 1 160px; padding: 20px; border-radius: 0 16px 16px 0; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 6px;")}>
                <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #44F0B0;")}>Processor / service provider</span>
                <strong style={s("font-size: 18px;")}>Noxtill LLC</strong>
                <span style={s("font-size: 14px; line-height: 1.5; color: #D7EFE5;")}>Processes only on documented instructions, with security, confidentiality and subprocessor duties.</span>
              </div>
            </figure>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="dpa" />
          </div>
        </div>
      </section>

      <DpaTabs panels={panels} />
      <CrossLinksBand heading="Related documents" links={related} />
    </LegalShell>
  );
}
