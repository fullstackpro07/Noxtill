import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, bullets, legalHref, legalMetadata, paras, visibleSections } from "@/lib/marketing/legal/nox";
import { ChannelTabs, type Channel } from "./channel-tabs";

const ROUTE = "/legal/messaging-consent";
export const metadata = legalMetadata(ROUTE);

export default function MessagingConsentPage() {
  const S = NOX.messaging.sections;
  const sec = (n: string) => S.find((x) => x.num === n);
  const P = (n: string) => paras(sec(n));
  const UL = (n: string) => bullets(sec(n));
  const t12 = NOX.terms.sections.find((x) => x.num === "12");
  const ch = (key: string, label: string, n: string, text: string[], listTitle: string, list: string[], quote?: string): Channel => {
    const tc = sec(n);
    return { key, label, text, quote, listTitle, list, refLabel: `§${n} ${tc?.title ?? ""}`, refId: tc?.id ?? "" };
  };
  const channels: Channel[] = [
    ch("whatsapp", "WhatsApp", "8.7", P("8.7").slice(0, 2).concat(P("8.7").slice(3)), "Intended WhatsApp workflows", UL("8.7")),
    ch("sms", "SMS", "8.8", P("8.8").slice(0, 1), "Noxtill should", UL("8.8")),
    ch("email", "Email", "8.9", P("8.9"), "Commercial email essentials", [
      "Truthful routing and subject information",
      "Sender identified as required",
      "Valid postal address where required",
      "Functioning opt-out",
      "Transactional messages kept genuinely transactional",
    ]),
    ch(
      "voice",
      "Voice & AI calls",
      "8.10",
      P("8.10"),
      "The business determines",
      ["Whether one-party or all-party consent applies", "Sector-specific recording rules", "Retention limits", "Voice/biometric restrictions"],
      sec("8.10")?.blocks.find((b) => b.isQuote)?.x,
    ),
    ch("social", "Social messaging", "8.3", [t12?.blocks[0]?.x ?? ""].concat(P("8.3")), "Applies across channels", [
      "Lawful consent or other lawful basis",
      "Sender identity",
      "Suppression and opt-out handling",
      "Message content, timing and templates",
      "Recipient lists",
    ]),
  ];
  const ex = (txt: string, lead: string) =>
    txt
      .replace(lead, "")
      .replace(/\.$/, "")
      .split(/,\s*(?:and\s+)?/)
      .map((x) => x.trim())
      .filter(Boolean);
  const p86 = P("8.6");
  const pick = ["subject_id", "business_display_name", "purpose_code", "channel", "text_version_id", "granted_at", "source_type", "source_reference", "evidence_metadata", "status", "withdrawn_at", "jurisdiction_rule_set"];
  const schema = pick.map((k) => ({ k, v: NOX.consentSchema.table.rows.find((r) => r[0] === k)?.[1] ?? "" }));
  const lifecycle = [
    { n: "Capture", t: "Collected with evidence", d: "Purpose, channel, business identity and exact text/version recorded at the source.", c: "#079A63" },
    { n: "Execute", t: "Re-checked at send time", d: `${NOX.consentSchema.rule.split(". ")[0]}.`, c: "#00C99D" },
    { n: "Withdraw", t: "Withdrawn or superseded", d: "Withdrawal invalidates future queued marketing sends where technically feasible. AI agents cannot override consent.", c: "#B7791F" },
    { n: "Evidence", t: "History preserved", d: "Fresh consent creates a new versioned evidence event rather than overwriting withdrawal history.", c: "#4C5B63" },
  ];
  const flow = [
    { kind: "Try", title: "WhatsApp", text: "Template / reply-window rules checked first.", bg: "#043F31", fg: "#FFFFFF", bd: "#043F31" },
    { kind: "Check", title: "Eligible for SMS?", text: "Same purpose must be lawful on SMS. If not — stop.", bg: "#FFF1D6", fg: "#5A3800", bd: "#F2D49B" },
    { kind: "Then", title: "SMS", text: "Only if the contact is eligible.", bg: "#ECFBF4", fg: "#043F31", bd: "#BFE8D3" },
    { kind: "Check", title: "Eligible for email?", text: "Same purpose must be lawful on email. If not — stop.", bg: "#FFF1D6", fg: "#5A3800", bd: "#F2D49B" },
    { kind: "Then", title: "Email", text: "Audit stores provider result, reason, consent check, channel and final status.", bg: "#ECFBF4", fg: "#043F31", bd: "#BFE8D3" },
  ];
  const related = [
    { href: legalHref("privacy", "p-8-whatsapp-sms-email-voice-and-communications-data"), label: "Privacy Policy", desc: "How communications data is handled (§8)." },
    { href: legalHref("aup"), label: "Acceptable Use", desc: "Spam and messaging abuse rules." },
    { href: legalHref("ai"), label: "AI Transparency", desc: "AI reply drafting and AI Phone disclosure." },
    { href: legalHref("legal", "module-unified-inbox"), label: "Unified Inbox — legal schedule", desc: "Canonical conversations and reply windows." },
    { href: legalHref("legal", "module-integrations"), label: "Integrations — legal schedule", desc: "WhatsApp and channel connections." },
  ];
  const chip = "padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 600;";

  return (
    <LegalShell route={ROUTE} printTitle="Messaging & Consent Policy">
      <section aria-labelledby="msg-h1" style={s("background: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 36px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Messaging & Consent Policy" }]} />
          <div style={s("margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 24px 56px; align-items: end;")}>
            <div style={s("display: flex; flex-direction: column; gap: 14px;")}>
              <h1 id="msg-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
                Messaging &amp; Consent Policy
              </h1>
              <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); line-height: 1.35; font-weight: 700; color: #064F3B; text-wrap: balance;")}>
                Every message has a reason, a sender and an audit trail.
              </p>
            </div>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42;")}>
              WhatsApp is a core Noxtill delivery layer — Nightly Close, booking confirmations and reminders, receipts, review requests, credit reminders, stock and aftercare messages and owner alerts. Replies land in Unified Inbox with customer context.
            </p>
          </div>
        </div>
        <div style={s("background: #043F31; color: #FFFFFF;")}>
          <div style={s("max-width: 1240px; margin: 0 auto; padding: 14px 24px;")}>
            <PolicyMeta doc={META_DOC} policy="messaging" dark />
          </div>
        </div>
      </section>

      <ChannelTabs channels={channels} />

      <section aria-labelledby="ut-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
        <h2 id="ut-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Utility vs marketing
        </h2>
        <p style={s("margin: 0 0 18px; font-size: 15px; color: #3A4A52; max-width: 72ch;")}>{p86[0]}</p>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px;")}>
          <div style={s("padding: 22px; border-radius: 18px; border: 1px solid #BFE8D3; background: #FFFFFF;")}>
            <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #067A50;")}>Operational / utility</span>
            <ul style={s("list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")}>
              {ex(p86[1] ?? "", "Typical operational/utility examples: ").map((u) => (
                <li key={u} style={s(`${chip} background: #ECFBF4; color: #043F31;`)}>
                  {u}
                </li>
              ))}
            </ul>
          </div>
          <div style={s("padding: 22px; border-radius: 18px; border: 1px solid #F2D49B; background: #FFFFFF;")}>
            <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #7A4B00;")}>Marketing — consent rules apply</span>
            <ul style={s("list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")}>
              {ex(p86[2] ?? "", "Typical marketing examples: ").map((u) => (
                <li key={u} style={s(`${chip} background: #FFF4E0; color: #5A3800;`)}>
                  {u}
                </li>
              ))}
            </ul>
          </div>
          <div style={s("padding: 22px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 8px;")}>
            <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #44F0B0;")}>Never</span>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.5; font-weight: 600;")}>{p86[3]}</p>
          </div>
        </div>
      </section>

      <section id="evidence" aria-labelledby="ev-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
        <div style={s("border-radius: 22px; background: #043F31; color: #FFFFFF; padding: 30px 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 28px;")}>
          <div style={s("display: flex; flex-direction: column; gap: 14px;")}>
            <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #44F0B0;")}>§8.4</span>
            <h2 id="ev-h" style={s("margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;")}>
              Consent is a record, not a boolean
            </h2>
            <p style={s("margin: 0; font-size: 16px; line-height: 1.6; color: #D7EFE5;")}>For consent-dependent communication, the evidence answers:</p>
            <ol style={s("margin: 0; padding-left: 22px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 20px; font-size: 15px; line-height: 1.5;")}>
              {UL("8.4").map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <p style={s("margin: 6px 0 0; font-size: 15px; line-height: 1.6; color: #FFFFFF; font-weight: 600;")}>{P("8.4").slice(-1)[0]}</p>
          </div>
          <div
            aria-label="Example consent record structure"
            role="figure"
            style={s("border-radius: 16px; background: #062F25; border: 1px solid rgba(68,240,176,0.25); padding: 18px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.75; overflow-x: auto;")}
          >
            <div style={s("color: #44F0B0; margin-bottom: 8px; font-weight: 600;")}>consent_record · versioned · immutable</div>
            {schema.map((f) => (
              <div key={f.k} style={s("display: flex; gap: 14px; flex-wrap: wrap;")}>
                <span style={s("color: #9FF5D3; min-width: 190px;")}>{f.k}</span>
                <span style={s("color: #D7EFE5; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px;")}>{f.v}</span>
              </div>
            ))}
          </div>
        </div>
        <ol style={s("list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;")}>
          {lifecycle.map((l) => (
            <li key={l.n} style={s(`padding: 16px; border-radius: 14px; background: #ECFBF4; border-top: 4px solid ${l.c}; display: flex; flex-direction: column; gap: 6px;`)}>
              <span style={s("font-size: 12px; font-weight: 700; color: #4C5B63; text-transform: uppercase; letter-spacing: 0.06em;")}>{l.n}</span>
              <span style={s("font-size: 16px; font-weight: 800;")}>{l.t}</span>
              <span style={s("font-size: 14px; line-height: 1.5; color: #24343C;")}>{l.d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="imp-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px;")}>
        <div style={s("padding: 22px; border-radius: 18px; border: 1px solid #D9E8E0;")}>
          <h2 id="imp-h" style={s("margin: 0 0 10px; font-size: 20px; font-weight: 800;")}>
            Imported contacts
          </h2>
          {P("8.5").map((p, i) => (
            <p key={i} style={s("margin: 0 0 10px; font-size: 15px; line-height: 1.6;")}>
              {p}
            </p>
          ))}
        </div>
        <div style={s("padding: 22px; border-radius: 18px; border: 1px solid #F2C3BC; background: #FFFBFA;")}>
          <h2 style={s("margin: 0 0 10px; font-size: 20px; font-weight: 800;")}>
            <span aria-hidden="true" style={s("color: #B4362A;")}>
              ⛔
            </span>{" "}
            Opt-out and suppression
          </h2>
          {P("8.12").map((p, i) => (
            <p key={i} style={s("margin: 0 0 10px; font-size: 15px; line-height: 1.6;")}>
              {p}
            </p>
          ))}
        </div>
      </section>

      <section id="fallback" aria-labelledby="fb-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
        <h2 id="fb-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Channel fallback
        </h2>
        <p style={s("margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #24343C; max-width: 76ch;")}>{P("8.11")[0]}</p>
        <ol aria-label="Fallback sequence" style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px;")}>
          {flow.map((f, i) => (
            <li key={i} style={s(`flex: 1 1 120px; display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 14px; background: ${f.bg}; color: ${f.fg}; border: 1px solid ${f.bd};`)}>
              <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85;")}>{f.kind}</span>
              <span style={s("font-size: 16px; font-weight: 800;")}>{f.title}</span>
              <span style={s("font-size: 13px; line-height: 1.5;")}>{f.text}</span>
            </li>
          ))}
        </ol>
        <p style={s("margin: 16px 0 0; padding: 14px 16px; border-radius: 12px; background: #FDE7E4; color: #6E1E15; font-size: 15px; line-height: 1.55; font-weight: 600;")}>
          <span aria-hidden="true">✕ </span>
          {P("8.11")[1]}
        </p>
      </section>

      <section aria-label="Owner summaries and reviews" style={s("max-width: 1240px; margin: 0 auto; padding: 36px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px;")}>
        <div style={s("padding: 22px; border-radius: 18px; background: #ECFBF4;")}>
          <h2 style={s("margin: 0 0 10px; font-size: 19px; font-weight: 800;")}>Owner-facing Nightly Close</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>{P("8.14")[0]}</p>
        </div>
        <div style={s("padding: 22px; border-radius: 18px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
          <h2 style={s("margin: 0 0 10px; font-size: 19px; font-weight: 800;")}>Review requests</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>{P("8.13")[0]}</p>
        </div>
      </section>

      <section aria-labelledby="msg-full" style={s("max-width: 920px; margin: 0 auto; padding: 56px 24px 64px;")}>
        <KickerH2 id="msg-full">Full policy text</KickerH2>
        <PolicyBody sections={visibleSections(S)} />
      </section>
      <CrossLinksBand heading="Related policies and modules" links={related} />
    </LegalShell>
  );
}
