import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { PolicyLayout } from "@/components/site/legal/policy-layout";
import { JumpLink } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, visibleSections, type NoxSection } from "@/lib/marketing/legal/nox";
import { PrivacyDataCats, PrivacyPersonas, PrivacyRights, type PrivacyPersona, type PrivacyRegion } from "./privacy-view";

const ROUTE = "/legal/privacy";
export const metadata = legalMetadata(ROUTE);

export default function PrivacyPage() {
  const S = NOX.privacy.sections;
  const byNum = (n: number): NoxSection => S.find((x) => x.num === String(n)) ?? { num: String(n), title: "", id: "", blocks: [] };
  const pText = (n: number) => byNum(n).blocks.filter((b) => b.tier === "public").map((b) => (b.items ? b.items.join("; ") : (b.x ?? "")));

  const P: [string, string, string, string, number[]][] = [
    ["visitor", "Website visitor", "You browse noxtill.com or contact us.", "Noxtill is the controller of website, cookie and contact data. You can manage cookies and send requests to privacy@noxtill.com.", [3, 9, 15]],
    ["admin", "Customer admin", "You own or administer a Noxtill workspace.", "Noxtill is the controller of your account, billing-administration, support and security data. Customer Content in your workspace is processed under the DPA.", [3, 6, 10, 13]],
    ["user", "Authorized user", "Your employer gave you access to Noxtill.", "Noxtill processes your account and usage data to provide and secure the Service. Your employer controls workspace content.", [3, 7, 14, 15]],
    ["endcustomer", "Customer’s customer or staff", "A business using Noxtill holds your data.", "Data inside a business’s workspace is processed on that business’s instructions. Direct requests to that business first; Noxtill assists it under the DPA.", [2, 4, 8, 15]],
  ];
  const personas: PrivacyPersona[] = P.map(([key, label, desc, note, nums]) => ({
    key,
    label,
    desc,
    note,
    links: nums
      .map((n) => ({ label: `§${n} ${byNum(n).title}`, id: byNum(n).id }) as { label: string; id?: string; href?: string })
      .concat(key === "endcustomer" ? [{ label: "Data Processing Addendum", href: legalHref("dpa") }] : []),
  }));

  const split = (t: string) =>
    t
      .replace(/^Depending on the relationship, we may process /, "")
      .replace(/^Customer Content may include /, "")
      .replace(/\.$/, "")
      .split(/;\s*|,\s*(?:and\s+)?/)
      .map((x) => x.replace(/^and /, "").trim())
      .filter(Boolean);
  const dataCats = [
    { key: "controller", title: "Controller data Noxtill collects (§3)", role: "Noxtill decides how this data is used.", items: split(byNum(3).blocks[0]?.x ?? "") },
    { key: "content", title: "Customer Content processed for customers (§4)", role: "Processed on the customer’s documented instructions under the DPA.", items: split(byNum(4).blocks[0]?.x ?? "") },
  ];

  const basesRaw = byNum(6).blocks.find((b) => b.isUl)?.items ?? [];
  const bases = basesRaw.map((x) => {
    const t = x.replace(/;$|; and$|\.$/, "").replace(/ and$/, "");
    const m = t.match(/^(performance of a contract|legitimate interests|legal obligation|consent|another lawful basis)\s*(?:for\s+)?(.*)$/i);
    return m ? { basis: m[1][0].toUpperCase() + m[1].slice(1), use: (m[2] || "").trim() || "—" } : { basis: t, use: "" };
  });

  const callouts = [
    { kicker: "AI processing · §7", title: "Minimum-necessary context for AI", text: "AI features process only what an authorized user chooses or a configured workflow makes available, with permissions and audit controls.", id: byNum(7).id },
    { kicker: "Communications · §8", title: "WhatsApp, SMS, email and voice data", text: "Message content, delivery status and consent/opt-out evidence are processed to deliver messaging — on the customer’s instructions.", id: byNum(8).id },
    { kicker: "Sharing · §10", title: "Noxtill does not sell personal data for money", text: "Where a U.S. state law treats an activity as sale, sharing or targeted advertising, required opt-outs and universal signals are honored.", id: byNum(10).id },
  ];

  const R: [string, string, number][] = [
    ["us", "United States", 15],
    ["ca", "California & other states", 16],
    ["eea", "EEA", 17],
    ["uk", "United Kingdom", 17],
    ["canada", "Canada", 18],
    ["other", "Other regions", 18],
  ];
  const regions: PrivacyRegion[] = R.map(([key, label, n]) => {
    let text = pText(n);
    if (key === "eea" || key === "uk") text = text.concat(pText(12));
    if (key === "other") text = text.slice(1);
    if (key === "canada") text = text.slice(0, 1);
    return { key, label, title: `§${n} · ${byNum(n).title}`, text };
  });

  const related = [
    { href: legalHref("dpa"), label: "Data Processing Addendum", desc: "Processor terms for Customer Content." },
    { href: legalHref("subprocessors"), label: "Subprocessors", desc: "Providers that help deliver the Service." },
    { href: legalHref("cookies"), label: "Cookie Policy", desc: "Cookies, analytics and your choices." },
    { href: legalHref("messaging"), label: "Messaging & Consent", desc: "Consent evidence and opt-out rules." },
    { href: legalHref("ai"), label: "AI Transparency", desc: "How AI uses data and where humans approve." },
    { href: legalHref("security"), label: "Security", desc: "Safeguards that protect data." },
    { href: legalHref("contact", "privacy"), label: "Privacy request", desc: "Exercise your privacy rights." },
  ];
  const pill = "display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border-radius: 10px; font-weight: 700; font-size: 15px; text-decoration: none;";

  return (
    <LegalShell route={ROUTE} printTitle="Privacy Policy">
      <section aria-labelledby="privacy-h1" style={s("background: #FFFFFF; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 48px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Privacy Policy" }]} />
          <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 32px 56px; margin-top: 28px; align-items: end;")}>
            <div style={s("display: flex; flex-direction: column; gap: 18px; min-width: 0;")}>
              <span style={s("font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>Privacy center</span>
              <h1 id="privacy-h1" style={s("margin: 0; font-size: clamp(38px, 5vw, 58px); line-height: 1.05; font-weight: 800; letter-spacing: -0.03em;")}>
                Privacy Policy
              </h1>
              <p style={s("margin: 0; font-size: 22px; line-height: 1.45; font-weight: 600; color: #064F3B;")}>Privacy you can understand.</p>
              <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42; max-width: 58ch; text-wrap: pretty;")}>
                How Noxtill LLC handles personal data as a controller — and how Customer Content inside your workspace is handled under the Data Processing Addendum.
              </p>
            </div>
            <div style={s("display: flex; flex-direction: column; gap: 14px; padding: 22px; border-radius: 18px; background: #ECFBF4; border: 1px solid #BFE8D3;")}>
              <div style={s("display: flex; flex-direction: column; gap: 2px;")}>
                <span style={s("font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #064F3B;")}>Privacy contact</span>
                <a href="mailto:privacy@noxtill.com" className="h-ul" style={s("font-size: 22px; font-weight: 800; color: #043F31; text-decoration: none;")}>
                  privacy@noxtill.com
                </a>
              </div>
              <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")} data-noprint="true">
                <A href="/contact#privacy" style={s(`${pill} background: #064F3B; color: #FFFFFF;`)}>
                  Make a privacy request
                </A>
                <A href="/legal/cookies#preferences" style={s(`${pill} background: #FFFFFF; color: #064F3B; border: 1px solid #9FD9BD;`)}>
                  Privacy choices
                </A>
                <A href={legalHref("dns")} style={s(`${pill} background: #FFFFFF; color: #064F3B; border: 1px solid #9FD9BD;`)}>
                  Do Not Sell or Share
                </A>
              </div>
            </div>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="privacy" />
          </div>
        </div>
      </section>

      <PrivacyPersonas personas={personas} />

      <section aria-labelledby="data-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 28px;")}>
        <div style={s("min-width: 0;")}>
          <h2 id="data-h" style={s("margin: 0 0 4px; font-size: 22px; font-weight: 800;")}>
            Data we handle
          </h2>
          <p style={s("margin: 0 0 14px; font-size: 14px; color: #4C5B63;")}>Category lists from §3 and §4 of the Policy.</p>
          <PrivacyDataCats cats={dataCats} />
        </div>
        <div style={s("min-width: 0;")}>
          <h2 style={s("margin: 0 0 4px; font-size: 22px; font-weight: 800;")}>Purposes and legal bases</h2>
          <p style={s("margin: 0 0 14px; font-size: 14px; color: #4C5B63;")}>Where GDPR/UK GDPR or similar laws require a legal basis (§6).</p>
          <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 14px;")}>
            <table style={s("width: 100%; border-collapse: collapse; font-size: 15px; min-width: 380px;")}>
              <caption style={s("text-align: left; padding: 12px 16px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>
                Legal bases Noxtill may rely on, with the purposes stated in the Policy
              </caption>
              <thead>
                <tr style={s("background: #064F3B; color: #FFFFFF;")}>
                  <th scope="col" style={s("text-align: left; padding: 12px 16px; font-weight: 700;")}>
                    Legal basis
                  </th>
                  <th scope="col" style={s("text-align: left; padding: 12px 16px; font-weight: 700;")}>
                    Used for
                  </th>
                </tr>
              </thead>
              <tbody>
                {bases.map((b) => (
                  <tr key={b.basis} style={s("border-top: 1px solid #E3EEE8;")}>
                    <th scope="row" style={s("text-align: left; padding: 12px 16px; font-weight: 700; vertical-align: top; color: #043F31;")}>
                      {b.basis}
                    </th>
                    <td style={s("padding: 12px 16px; line-height: 1.5; color: #24343C;")}>{b.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-label="AI and communications" style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 14px;")}>
        {callouts.map((c) => (
          <JumpLink
            key={c.title}
            id={c.id}
            className="h-forest"
            style={s("display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: #043F31; color: #FFFFFF; text-decoration: none;")}
          >
            <span style={s("font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #44F0B0;")}>{c.kicker}</span>
            <span style={s("font-size: 18px; font-weight: 750;")}>{c.title}</span>
            <span style={s("font-size: 14px; line-height: 1.55; color: #D7EFE5;")}>{c.text}</span>
          </JumpLink>
        ))}
      </section>

      <PrivacyRights regions={regions} />

      <PolicyLayout items={S.map((x) => ({ id: x.id, num: x.num, title: x.title }))} variant="privacy" navLabel="Privacy Policy contents" heading="Policy contents" drawerId="pdrawer-h" padding="48px 24px 64px">
        <article aria-labelledby="privacy-h1" style={s("flex: 999 1 560px; min-width: 0;")}>
          <KickerH2 margin="0 0 4px">Full Privacy Policy</KickerH2>
          <PolicyBody sections={visibleSections(S)} />
        </article>
      </PolicyLayout>

      <CrossLinksBand heading="Related privacy resources" links={related} />
      <section aria-labelledby="pc-h" style={s("background: #043F31; color: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px; display: flex; flex-wrap: wrap; gap: 20px 40px; align-items: center; justify-content: space-between;")}>
          <div style={s("display: flex; flex-direction: column; gap: 6px;")}>
            <h2 id="pc-h" style={s("margin: 0; font-size: 24px; font-weight: 800;")}>
              Questions about your data?
            </h2>
            <p style={s("margin: 0; font-size: 15px; color: #D7EFE5;")}>
              Noxtill LLC, 4539 N 22ND ST STE R, Phoenix, AZ 85016, United States ·{" "}
              <a href="tel:+18089985302" style={s("color: #FFFFFF;")}>
                +1 808 998 5302
              </a>
            </p>
          </div>
          <a
            href="mailto:privacy@noxtill.com"
            style={s("display: inline-flex; align-items: center; height: 48px; padding: 0 22px; border-radius: 12px; background: #44F0B0; color: #043F31; font-weight: 800; font-size: 16px; text-decoration: none;")}
          >
            privacy@noxtill.com
          </a>
        </div>
      </section>
    </LegalShell>
  );
}
