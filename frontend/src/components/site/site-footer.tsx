import Link from "next/link";
import type { ReactNode } from "react";
import { ChatWidget } from "@/components/site/chat-widget";
import { FooterNewsletter } from "@/components/site/footer-newsletter";
import { FOOTER_BOTTOM, FOOTER_COLUMNS, FOOTER_SOCIALS } from "@/lib/marketing/footer-links";
import { legalFontVars } from "@/components/site/legal/fonts";
import { s } from "@/components/site/legal/s";
import "@/components/site/legal/legal.css";

const SOCIAL_ICONS: Record<(typeof FOOTER_SOCIALS)[number]["name"], ReactNode> = {
  LinkedIn: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.6h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.6 4.78 6v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-4z" />
    </svg>
  ),
  X: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.75 3h3.05l-6.66 7.61L22 21h-6.13l-4.8-6.28L5.57 21H2.5l7.12-8.14L2 3h6.28l4.34 5.74zm-1.07 16.17h1.69L7.4 4.74H5.59z" />
    </svg>
  ),
  YouTube: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9c.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15.2V8.8l5.2 3.2z" />
    </svg>
  ),
  Instagram: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Facebook: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-1.56 19.88v-7H7.9V12h2.54V9.8c0-2.5 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.88h-2.34v7A10 10 0 0 0 12 2z" />
    </svg>
  ),
};

const SOCIAL_TILE = "width: 50px; height: 50px; border-radius: 10px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; color: #E6F2EC;";

/** Site-wide footer — docs/Legal pages/SiteFooter.dc.html. */
export function SiteFooter() {
  return (
    <>
      <footer
        className={`${legalFontVars} nl-noprint nl-footer`}
        style={s(
          "position: relative; overflow: hidden; isolation: isolate; background: radial-gradient(120% 90% at 18% 0%, #0A5A44 0%, #063F31 38%, #04291F 75%, #032019 100%); color: #E6F2EC; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;",
        )}
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" style={s("position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none;")}>
          <defs>
            <linearGradient id="nxf-a" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0E7A5A" stopOpacity="0.55" />
              <stop offset="1" stopColor="#063F31" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="nxf-b" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2FE3A6" />
              <stop offset="0.55" stopColor="#14B886" />
              <stop offset="1" stopColor="#0B7A58" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="nxf-c" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1FD69C" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#0E8F69" stopOpacity="0.75" />
              <stop offset="1" stopColor="#05352A" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="nxf-d" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0C6B50" stopOpacity="0" />
              <stop offset="1" stopColor="#0FA77A" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path d="M-80 -60 C 260 -40 430 40 510 -20 L 520 -80 Z" fill="url(#nxf-a)" />
          <path d="M60 -120 C 420 -60 520 60 380 120 C 300 150 120 120 -40 160 L -80 -120 Z" fill="#0B5A44" opacity="0.35" />
          <path d="M0 585 C 70 640 110 720 300 820 L 0 820 Z" fill="url(#nxf-b)" opacity="0.75" />
          <path d="M0 690 C 120 700 230 760 300 820 L 0 820 Z" fill="#3BEFB4" opacity="0.55" />
          <path d="M1672 320 C 1580 420 1530 520 1545 640 C 1560 740 1620 790 1672 820 Z" fill="url(#nxf-c)" />
          <path d="M1672 230 C 1560 300 1500 420 1505 560 C 1510 680 1570 760 1672 820 L 1672 820 C 1610 770 1560 700 1555 600 C 1550 480 1600 380 1672 320 Z" fill="url(#nxf-d)" opacity="0.6" />
          <path d="M1560 -40 C 1640 40 1680 120 1700 200 L 1700 -40 Z" fill="#0FA77A" opacity="0.35" />
        </svg>

        <div style={s("max-width: 1500px; margin: 0 auto; padding: clamp(40px, 6vw, 60px) clamp(20px, 5.5vw, 92px) 0;")}>
          <div style={s("display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 40px 48px; padding-bottom: clamp(28px, 3.2vw, 32px);")}>
            <div style={s("flex: 1 1 420px; min-width: 0; padding-top: clamp(0px, 3vw, 52px); display: flex; flex-direction: column; gap: 10px;")}>
              <Link
                href="/"
                aria-label="Noxtill home"
                style={s("display: inline-flex; align-items: center; gap: clamp(12px, 1.6vw, 24px); text-decoration: none; color: #FFFFFF; align-self: flex-start; border-radius: 12px;")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/noxtill-logo1.png" alt="" width={106} height={106} style={s("width: clamp(64px, 6.4vw, 106px); height: auto; display: block;")} />
                <span style={s("font-size: clamp(48px, 5.4vw, 88px); font-weight: 700; letter-spacing: -0.035em; line-height: 1;")}>Noxtill</span>
              </Link>
              <p style={s("margin: 10px 0 0; font-size: clamp(22px, 2vw, 31px); font-weight: 500; line-height: 1.25; color: #FFFFFF; letter-spacing: -0.01em;")}>One platform. A more capable business.</p>
              <p style={s("margin: 0; font-size: clamp(17px, 1.35vw, 21px); line-height: 1.4; color: #B9CCC3;")}>AI-powered Business Operating System</p>
            </div>

            <section
              aria-labelledby="nxf-news-h"
              style={s(
                "flex: 0 1 622px; min-width: 0; box-sizing: border-box; padding: clamp(22px, 2.4vw, 30px) clamp(20px, 2.4vw, 38px) clamp(22px, 2.4vw, 30px); border-radius: 22px; border: 1px solid rgba(47,227,166,0.42); background: linear-gradient(160deg, rgba(10,88,66,0.55) 0%, rgba(4,44,34,0.78) 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px -30px rgba(0,0,0,0.6);",
              )}
            >
              <h2 id="nxf-news-h" style={s("margin: 0; font-size: clamp(24px, 2vw, 30px); font-weight: 700; color: #FFFFFF; letter-spacing: -0.015em;")}>
                Get Noxtill updates
              </h2>
              <p style={s("margin: 6px 0 22px; font-size: clamp(16px, 1.25vw, 19px); line-height: 1.45; color: #C9D9D1;")}>Product updates, new capabilities and business insights.</p>
              <FooterNewsletter />
              <ul aria-label="Noxtill on social media" style={s("list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: clamp(10px, 2.5vw, 20px);")}>
                {FOOTER_SOCIALS.map((so) => (
                  <li key={so.name}>
                    {so.url ? (
                      <a href={so.url} target="_blank" rel="noopener" aria-label={`Noxtill on ${so.name}`} className="h-social" style={s(SOCIAL_TILE)}>
                        <span aria-hidden="true" style={s("display: flex;")}>
                          {SOCIAL_ICONS[so.name]}
                        </span>
                      </a>
                    ) : (
                      <span role="img" aria-label={`${so.name} (profile link not configured)`} title={`${so.name} (profile link not configured)`} style={s(SOCIAL_TILE)}>
                        {SOCIAL_ICONS[so.name]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div aria-hidden="true" style={s("height: 1px; background: rgba(255,255,255,0.14);")} />

          <div className="nxf-cols" style={s("display: grid; gap: 36px 24px; padding: clamp(32px, 3.4vw, 38px) 6px clamp(40px, 4vw, 46px);")}>
            {FOOTER_COLUMNS.map((g, i) => (
              <nav key={g.title} aria-labelledby={`nxf-col-${i}`} style={s("min-width: 0;")}>
                <h2 id={`nxf-col-${i}`} style={s("margin: 0 0 22px; font-size: 16px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #2EE6B0;")}>
                  {g.title}
                </h2>
                <ul style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px;")}>
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="h-neon" style={s("font-size: 18px; line-height: 1.25; color: #ECF4F0; text-decoration: none; text-shadow: 0 1px 2px rgba(0,0,0,0.25); border-radius: 4px;")}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div style={s("border-top: 1px solid rgba(255,255,255,0.12); background: rgba(2,22,17,0.55);")}>
          <div style={s("max-width: 1500px; margin: 0 auto; padding: 26px clamp(20px, 5.5vw, 92px) 30px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px;")}>
            <p style={s("margin: 0; font-size: 16px; font-weight: 700; color: #FFFFFF;")}>© 2026 Noxtill LLC. All rights reserved.</p>
            <nav aria-label="Legal shortcuts" style={s("display: flex; flex-wrap: wrap; align-items: center; justify-content: center; row-gap: 8px;")}>
              {FOOTER_BOTTOM.map((b, i) => (
                <span key={b.label} style={s("display: inline-flex; align-items: center;")}>
                  {i > 0 ? (
                    <span aria-hidden="true" style={s("color: rgba(255,255,255,0.32); padding: 0 clamp(8px, 1vw, 14px);")}>
                      |
                    </span>
                  ) : null}
                  <Link href={b.href} className="h-white-ul" style={s("font-size: 15px; font-weight: 400; color: #B9CCC3; text-decoration: none; border-radius: 4px;")}>
                    {b.label}
                  </Link>
                </span>
              ))}
            </nav>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </>
  );
}
