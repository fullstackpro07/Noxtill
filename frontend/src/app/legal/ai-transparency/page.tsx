import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { JumpLink } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, paras, visibleSections } from "@/lib/marketing/legal/nox";
import { AiSystemMap } from "./ai-system-map";

const ROUTE = "/legal/ai-transparency";
export const metadata = legalMetadata(ROUTE);
const TIER_COLORS = ["#079A63", "#00C99D", "#B7791F", "#8A2A1E"];

export default function AiTransparencyPage() {
  const S = NOX.ai.sections;
  const sec = (n: string) => S.find((x) => x.num === n);
  const P = (n: string) => paras(sec(n));
  const card = (n: string, kicker: string, title: string, dark?: boolean) => ({
    kicker,
    title,
    text: P(n)[0] ?? "",
    id: sec(n)?.id ?? "",
    bg: dark ? "#043F31" : "#FFFFFF",
    fg: dark ? "#FFFFFF" : "#0B1822",
    bd: dark ? "#043F31" : "#D9E8E0",
    k: dark ? "#44F0B0" : "#067A50",
  });
  const cards = [
    card("9.6", "§9.6 Limits", "What AI is not", true),
    card("9.7", "§9.7 Evidence", "Evidence and uncertainty"),
    card("9.9", "§9.9 Data & models", "Customer data and model behavior"),
    card("9.10", "§9.10 Protected traits", "No inference of protected traits", true),
    card("9.11", "§9.11 Agents", "Agents cannot grant themselves permissions"),
    card("9.4", "§9.4 Identification", "AI identifies itself where required"),
  ];
  const msgVoice = NOX.messaging.sections.find((x) => x.num === "8.10");
  const phoneText = P("9.4")
    .concat([msgVoice?.blocks[2]?.x ?? ""])
    .filter(Boolean);
  const phoneQuote = msgVoice?.blocks.find((b) => b.isQuote)?.x ?? "";
  const related = [
    { href: legalHref("privacy", "p-7-ai-processing"), label: "Privacy Policy — AI processing", desc: "How AI context and prompts are handled." },
    { href: legalHref("security", "s-ai-security"), label: "AI security", desc: "Prompt-injection and tool-abuse defenses." },
    { href: legalHref("dpa"), label: "Data Processing Addendum", desc: "AI prompts/outputs as Customer Content." },
    { href: legalHref("aup"), label: "Acceptable Use", desc: "Prohibited AI uses." },
    { href: legalHref("legal", "module-ai-assistant"), label: "AI Assistant — legal schedule", desc: "Output limitations and permission boundaries." },
    { href: legalHref("legal", "module-ai-phone-receptionist"), label: "AI Phone Receptionist — legal schedule", desc: "Disclosure, recording consent and escalation." },
    { href: legalHref("legal", "module-business-intelligence"), label: "Business Intelligence — legal schedule", desc: "Evidence, assumptions and simulator limits." },
  ];

  return (
    <LegalShell route={ROUTE} printTitle="AI Transparency Policy">
      <section aria-labelledby="ai-h1" style={s("background: linear-gradient(160deg, #ECFBF4 0%, #FFFFFF 60%); border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 44px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "AI Transparency Policy" }]} />
          <div style={s("margin-top: 26px; display: flex; flex-direction: column; gap: 14px; max-width: 860px;")}>
            <h1 id="ai-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
              AI Transparency Policy
            </h1>
            <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); line-height: 1.35; font-weight: 700; color: #064F3B; text-wrap: balance;")}>AI that explains, drafts and acts within boundaries.</p>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42; max-width: 66ch;")}>{P("9.3")[0]}</p>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="ai" />
          </div>
        </div>
      </section>

      <AiSystemMap rows={NOX.aiRegister.table.rows} />

      <section id="ai-tiers" aria-labelledby="tiers-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
        <h2 id="tiers-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          §9.8 Human approval tiers
        </h2>
        <p style={s("margin: 0 0 18px; font-size: 15px; color: #3A4A52;")}>Binding table from the Policy.</p>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px;")}>
          {NOX.ai.tiers.rows.map((t, i) => (
            <div key={t[0]} style={s(`padding: 20px; border-radius: 16px; border: 1px solid #D9E8E0; border-top: 5px solid ${TIER_COLORS[i]}; background: #FFFFFF; display: flex; flex-direction: column; gap: 10px;`)}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #067A50;")}>Tier {i + 1}</span>
              <h3 style={s("margin: 0; font-size: 19px; font-weight: 800;")}>{t[0]}</h3>
              <p style={s("margin: 0; font-size: 14px; line-height: 1.5; color: #3A4A52;")}>
                <strong style={s("color: #0B1822;")}>Examples:</strong> {t[1]}
              </p>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.5; font-weight: 600; color: #043F31;")}>{t[2]}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="AI commitments" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 14px;")}>
        {cards.map((c) => (
          <JumpLink
            key={c.title}
            id={c.id}
            style={s(`display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: ${c.bg}; color: ${c.fg}; text-decoration: none; border: 1px solid ${c.bd};`)}
          >
            <span style={s(`font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${c.k};`)}>{c.kicker}</span>
            <span style={s("font-size: 18px; font-weight: 800;")}>{c.title}</span>
            <span style={s("font-size: 15px; line-height: 1.55;")}>{c.text}</span>
          </JumpLink>
        ))}
      </section>

      <section id="ai-phone" aria-labelledby="phone-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; scroll-margin-top: 90px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 24px; padding: 26px; border-radius: 20px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
          <div style={s("display: flex; flex-direction: column; gap: 12px;")}>
            <h2 id="phone-h" style={s("margin: 0; font-size: 24px; font-weight: 800;")}>
              AI Phone Receptionist disclosure
            </h2>
            {phoneText.map((p, i) => (
              <p key={i} style={s("margin: 0; font-size: 16px; line-height: 1.65;")}>
                {p}
              </p>
            ))}
          </div>
          <figure style={s("margin: 0; display: flex; flex-direction: column; gap: 10px; justify-content: center;")}>
            <figcaption style={s("font-size: 13px; font-weight: 700; color: #4C5B63;")}>Recommended opening pattern (Messaging &amp; Consent §8.10)</figcaption>
            <blockquote style={s("margin: 0; padding: 20px 22px; border-radius: 16px; background: #043F31; color: #FFFFFF; font-size: 19px; line-height: 1.5; font-weight: 600;")}>{phoneQuote}</blockquote>
          </figure>
        </div>
      </section>

      <section aria-labelledby="report-h" style={s("max-width: 1240px; margin: 0 auto; padding: 36px 24px 12px;")} data-noprint="true">
        <div style={s("display: flex; flex-wrap: wrap; gap: 16px 32px; align-items: center; justify-content: space-between; padding: 24px; border-radius: 18px; border: 2px solid #079A63;")}>
          <div style={s("flex: 1 1 420px;")}>
            <h2 id="report-h" style={s("margin: 0 0 6px; font-size: 20px; font-weight: 800;")}>
              Report an AI issue
            </h2>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>{P("9.12")[0]}</p>
          </div>
          <A
            href="/contact#support"
            style={s("display: inline-flex; align-items: center; height: 48px; padding: 0 20px; border-radius: 12px; background: #064F3B; color: #FFFFFF; font-weight: 800; font-size: 15px; text-decoration: none;")}
          >
            Report unsafe or inaccurate AI output
          </A>
        </div>
      </section>

      <section aria-labelledby="ai-full" style={s("max-width: 920px; margin: 0 auto; padding: 56px 24px 64px;")}>
        <KickerH2 id="ai-full">Full policy text</KickerH2>
        <PolicyBody sections={visibleSections(S)} />
      </section>
      <CrossLinksBand heading="Related policies and AI modules" links={related} />
    </LegalShell>
  );
}
