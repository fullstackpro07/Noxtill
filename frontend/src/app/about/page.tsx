import { existsSync } from "node:fs";
import path from "node:path";
import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinks, HOME } from "@/components/site/legal/primitives";
import { s } from "@/components/site/legal/s";
import { NOX, legalHref, legalMetadata } from "@/lib/marketing/legal/nox";

const ROUTE = "/about";
export const metadata = legalMetadata(ROUTE);

/**
 * The design's two image slots take real product screenshots. They render from
 * public/legal/about-dashboard.png and public/legal/about-nightly-close.png when those files exist;
 * until then a neutral branded frame is shown — never a mocked-up screen with invented figures.
 */
function Screenshot({ file, alt, dark }: { file: string; alt: string; dark?: boolean }) {
  const exists = existsSync(path.join(process.cwd(), "public", "legal", file));
  if (exists)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/legal/${file}`} alt={alt} style={s("width: 100%; height: 100%; object-fit: cover; border-radius: 16px; display: block;")} />
    );
  return (
    <div
      role="img"
      aria-label={alt}
      style={s(
        `width: 100%; height: 100%; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: ${dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)"}; border: 1px dashed ${dark ? "rgba(68,240,176,0.35)" : "#9FD9BD"};`,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/legal/noxtill-logo.png" alt="" width={72} height={72} style={s("width: 72px; height: 72px; border-radius: 18px; opacity: 0.9;")} />
      <span style={s(`font-size: 14px; font-weight: 700; color: ${dark ? "#CFE8DD" : "#064F3B"};`)}>{alt}</span>
    </div>
  );
}

const GROUPS: [string, string, number[]][] = [
  ["Sell & get paid", "#079A63", [2, 3, 4, 6, 37, 40]],
  ["Customers & conversations", "#00C99D", [7, 25, 5, 8, 33, 34]],
  ["Grow", "#44C98F", [9, 17, 18, 19, 29, 20]],
  ["Operate", "#067A50", [13, 38, 30, 23, 32, 36, 26, 35]],
  ["Team & money", "#0A6B4E", [11, 39, 12, 31, 10, 15, 28]],
  ["AI & automation", "#043F31", [14, 21, 22, 27, 1, 24, 16]],
];

export default function AboutPage() {
  const name = (n: number) => NOX.modules.find((m) => m.n === n)?.name ?? "";
  const C = NOX.company;
  const facts = [
    ["Legal name", "Noxtill LLC"],
    ["Jurisdiction", C.jurisdiction],
    ["Arizona ACC Business ID", C.accId],
    ["Principal business address", C.address],
    ["Phone", C.phone],
    ["Contact", C.contact],
  ];
  const related = [
    { href: "/", label: "Product", desc: "The Noxtill Business Operating System." },
    { href: legalHref("legal", "module-integrations"), label: "Integrations", desc: "How connected providers and credentials are governed." },
    { href: legalHref("trust"), label: "Trust Center", desc: "Security, privacy, responsible AI and legal." },
    { href: legalHref("company"), label: "Company information", desc: "Verified Noxtill LLC facts." },
    { href: legalHref("contact"), label: "Contact", desc: "Talk to the right team." },
  ];
  const btn = "display: inline-flex; align-items: center; height: 50px; padding: 0 24px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none;";
  const h2big = "font-size: clamp(28px, 3.4vw, 40px); font-weight: 800; letter-spacing: -0.025em;";

  return (
    <LegalShell route={ROUTE} pageType="AboutPage">
      <section aria-labelledby="ab-h1" style={s("background: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 56px;")}>
          <Breadcrumb items={[HOME, { label: "About" }]} />
          <div style={s("margin-top: 40px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 40px 56px; align-items: center;")}>
            <div style={s("display: flex; flex-direction: column; gap: 20px;")}>
              <h1 id="ab-h1" style={s("margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>
                About Noxtill
              </h1>
              <p style={s("margin: 0; font-size: clamp(36px, 4.8vw, 60px); line-height: 1.04; font-weight: 800; letter-spacing: -0.035em; text-wrap: balance;")}>
                One <span style={s("color: #079A63;")}>connected system</span> for the way small businesses actually work.
              </p>
              <p style={s("margin: 0; font-size: 18px; line-height: 1.6; color: #2A3A42; max-width: 56ch;")}>{NOX.about.copy[0]}</p>
              <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")} data-noprint="true">
                <A href="/contact#sales" style={s(`${btn} background: #064F3B; color: #FFFFFF;`)}>
                  Book a demo
                </A>
                <A href="/" style={s(`${btn} border: 1px solid #9FD9BD; color: #064F3B;`)}>
                  Explore the product
                </A>
              </div>
            </div>
            <div style={s("position: relative; aspect-ratio: 4 / 3; width: 100%; border-radius: 24px; background: linear-gradient(140deg, #ECFBF4, #D7F5E8); padding: 14px; box-sizing: border-box;")}>
              <Screenshot file="about-dashboard.png" alt="Noxtill Dashboard" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="why-h" style={s("background: #F7FAF8; border-top: 1px solid #E3EEE8; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 64px 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 32px 56px; align-items: start;")}>
          <h2 id="why-h" style={s(`margin: 0; ${h2big} line-height: 1.12; text-wrap: balance;`)}>
            Stop reconciling disconnected apps.
          </h2>
          <p style={s("margin: 0; font-size: 18px; line-height: 1.7; color: #24343C;")}>{NOX.about.copy[1]}</p>
        </div>
      </section>

      <section id="system" aria-labelledby="sys-h" style={s("max-width: 1240px; margin: 0 auto; padding: 64px 24px 24px; scroll-margin-top: 90px;")}>
        <h2 id="sys-h" style={s(`margin: 0 0 8px; ${h2big}`)}>
          40 modules. One set of business records.
        </h2>
        <p style={s("margin: 0 0 28px; font-size: 16px; color: #3A4A52; max-width: 70ch;")}>
          Customer identity lives in CRM, messages in Unified Inbox, payments in Payments &amp; Billing, stock in Inventory — and every module works from those same canonical records.
        </p>
        <div style={s("position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px;")}>
          {GROUPS.map(([n, c, ids]) => (
            <div key={n} style={s("padding: 20px; border-radius: 18px; border: 1px solid #D9E8E0; background: #FFFFFF; display: flex; flex-direction: column; gap: 12px;")}>
              <div style={s("display: flex; align-items: center; gap: 10px;")}>
                <span aria-hidden="true" style={s(`width: 10px; height: 10px; border-radius: 3px; background: ${c};`)} />
                <h3 style={s("margin: 0; font-size: 18px; font-weight: 800;")}>{n}</h3>
                <span style={s("margin-left: auto; font-size: 12px; font-weight: 700; color: #4C5B63;")}>{ids.length} modules</span>
              </div>
              <ul style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px;")}>
                {ids.map((id) => (
                  <li key={id} style={s("font-size: 13px; font-weight: 600; padding: 5px 9px; border-radius: 8px; background: #F3F8F5; color: #24343C;")}>
                    {name(id)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          style={s(
            "margin-top: 14px; padding: 18px 22px; border-radius: 16px; background: #043F31; color: #FFFFFF; display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; justify-content: center; text-align: center;",
          )}
        >
          <span style={s("font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #44F0B0;")}>Shared core</span>
          <span style={s("font-size: 16px; font-weight: 600;")}>Customers · Orders · Payments · Inventory · Messages · Documents · Staff · Finance</span>
        </div>
      </section>

      <section aria-labelledby="nc-h" style={s("max-width: 1240px; margin: 0 auto; padding: 64px 24px 24px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 40px 56px; align-items: center;")}>
          <div style={s("position: relative; aspect-ratio: 9 / 10; max-width: 460px; width: 100%; border-radius: 24px; background: #043F31; padding: 16px; box-sizing: border-box;")}>
            <Screenshot file="about-nightly-close.png" alt="Nightly Close on WhatsApp" dark />
          </div>
          <div style={s("display: flex; flex-direction: column; gap: 16px;")}>
            <span style={s("font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>Nightly Close</span>
            <h2 id="nc-h" style={s(`margin: 0; ${h2big} line-height: 1.12; text-wrap: balance;`)}>
              The information reaches the owner — not the other way around.
            </h2>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.7; color: #24343C;")}>{NOX.about.copy[2]}</p>
            <ul style={s("list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")}>
              {["Today’s sales", "Profit", "Tomorrow’s bookings", "Outstanding credit", "Low stock"].map((i) => (
                <li key={i} style={s("padding: 8px 12px; border-radius: 10px; background: #ECFBF4; font-size: 14px; font-weight: 700; color: #043F31;")}>
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="pp-h" style={s("max-width: 1240px; margin: 0 auto; padding: 64px 24px 24px;")}>
        <h2 id="pp-h" style={s("margin: 0 0 20px; font-size: clamp(26px, 3vw, 34px); font-weight: 800; letter-spacing: -0.02em;")}>
          How we build
        </h2>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px;")}>
          {NOX.trustPrinciples.slice(0, 4).map((p) => (
            <div key={p.k} style={s("padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
              <h3 style={s("margin: 0 0 6px; font-size: 17px; font-weight: 800; color: #043F31;")}>{p.k}</h3>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #24343C;")}>{p.v}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="co-h" style={s("max-width: 1240px; margin: 0 auto; padding: 64px 24px 24px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px; padding: 28px; border-radius: 22px; border: 1px solid #D9E8E0;")}>
          <div style={s("display: flex; flex-direction: column; gap: 12px;")}>
            <div style={s("display: flex; align-items: center; gap: 12px;")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/legal/noxtill-logo.png" alt="" width={44} height={44} style={s("width: 44px; height: 44px; border-radius: 12px;")} />
              <h2 id="co-h" style={s("margin: 0; font-size: 24px; font-weight: 800;")}>
                Noxtill LLC
              </h2>
            </div>
            <p style={s("margin: 0; font-size: 16px; line-height: 1.6; color: #24343C;")}>A Domestic Limited Liability Company organized in Arizona, United States.</p>
            <A href={legalHref("company")} style={s("font-weight: 700; font-size: 15px;")}>
              Legal &amp; company information →
            </A>
          </div>
          <dl style={s("margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px 24px; font-size: 15px;")}>
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5B63;")}>{k}</dt>
                <dd style={s("margin: 4px 0 0; line-height: 1.5;")}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-label="Explore" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 24px;")}>
        <CrossLinks heading="Explore Noxtill" links={related} />
      </section>

      <section aria-labelledby="cta-h" style={s("background: #064F3B; color: #FFFFFF; margin-top: 40px;")} data-noprint="true">
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 56px 24px; display: flex; flex-wrap: wrap; gap: 20px 40px; align-items: center; justify-content: space-between;")}>
          <h2 id="cta-h" style={s("margin: 0; font-size: clamp(26px, 3vw, 36px); font-weight: 800; letter-spacing: -0.02em; max-width: 620px;")}>
            See how one connected system runs your business.
          </h2>
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
            <A href="/contact#sales" style={s("display: inline-flex; align-items: center; height: 52px; padding: 0 26px; border-radius: 12px; background: #44F0B0; color: #043F31; font-weight: 800; font-size: 16px; text-decoration: none;")}>
              Book a demo
            </A>
            <A href="/" style={s("display: inline-flex; align-items: center; height: 52px; padding: 0 26px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.5); color: #FFFFFF; font-weight: 800; font-size: 16px; text-decoration: none;")}>
              Explore the product
            </A>
          </div>
        </div>
      </section>
    </LegalShell>
  );
}
