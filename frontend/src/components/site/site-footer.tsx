import Link from "next/link";
import { ChatWidget } from "@/components/site/chat-widget";
import { FooterNewsletter } from "@/components/site/footer-newsletter";
import { LanguageSelector } from "@/components/site/language-selector";
import {
  AI_AGENTS_LIST,
  BUSINESS_NEEDS_CLUSTERS,
  FOOTER_BOTTOM,
  FOOTER_COLUMNS,
} from "@/lib/marketing/footer-links";
import { legalFontVars } from "@/components/site/legal/fonts";
import "@/components/site/legal/legal.css";

/**
 * Site-wide footer — redesigned pixel-accurate against the master theme.
 * Includes 6 comprehensive link columns, 12 business tool clusters,
 * 7 specialized AI agents, updates newsletter card, and bottom legal bar.
 */
export function SiteFooter() {
  return (
    <>
      <footer className={`${legalFontVars} nl-noprint nl-footer`}>
        {/* Background ambient lighting and vector curves */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 1672 941"
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: -1,
            pointerEvents: "none",
          }}
        >
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
          <path
            d="M60 -120 C 420 -60 520 60 380 120 C 300 150 120 120 -40 160 L -80 -120 Z"
            fill="#0B5A44"
            opacity="0.35"
          />
          <path d="M0 585 C 70 640 110 720 300 820 L 0 820 Z" fill="url(#nxf-b)" opacity="0.75" />
          <path d="M0 690 C 120 700 230 760 300 820 L 0 820 Z" fill="#3BEFB4" opacity="0.55" />
          <path
            d="M1672 320 C 1580 420 1530 520 1545 640 C 1560 740 1620 790 1672 820 Z"
            fill="url(#nxf-c)"
          />
          <path
            d="M1672 230 C 1560 300 1500 420 1505 560 C 1510 680 1570 760 1672 820 L 1672 820 C 1610 770 1560 700 1555 600 C 1550 480 1600 380 1672 320 Z"
            fill="url(#nxf-d)"
            opacity="0.6"
          />
          <path d="M1560 -40 C 1640 40 1680 120 1700 200 L 1700 -40 Z" fill="#0FA77A" opacity="0.35" />
        </svg>

        <div className="nxf-container">
          {/* Top Brand Identity and Newsletter Subscription Card */}
          <div className="nxf-top-row">
            <div className="nxf-brand-col">
              <Link href="/" aria-label="Noxtill home" className="nxf-logo-link">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/noxtill-logowhite.png"
                  alt="Noxtill"
                  width={2047}
                  height={461}
                  className="nxf-logo-wordmark"
                />
              </Link>
              <p className="nxf-tagline">One platform. A more capable business.</p>
              <p className="nxf-subtagline">AI-powered Business Operating System</p>
            </div>

            <FooterNewsletter />
          </div>

          {/* Six Main Link Columns */}
          <div className="nxf-cols-grid">
            {FOOTER_COLUMNS.map((col, idx) => (
              <nav key={col.title} aria-labelledby={`nxf-col-${idx}`}>
                <h2 id={`nxf-col-${idx}`} className="nxf-col-title">
                  {col.title}
                </h2>
                <ul className="nxf-col-list">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="nxf-col-link">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* Everything Your Business Needs Box */}
          <section aria-labelledby="nxf-needs-h" className="nxf-needs-box">
            <h2 id="nxf-needs-h" className="nxf-needs-title">
              Everything Your Business Needs
            </h2>
            <p className="nxf-needs-sub">
              Powerful tools to manage, automate and grow your business — all in one place.
            </p>
            <div className="nxf-needs-grid">
              {BUSINESS_NEEDS_CLUSTERS.map((cluster) => (
                <div key={cluster.title}>
                  <h3 className="nxf-cluster-title">
                    <Link href={cluster.href}>{cluster.title}</Link>
                  </h3>
                  <ul className="nxf-cluster-list">
                    {cluster.links.map((item) => (
                      <li key={item.label}>
                        <Link href={item.href} className="nxf-cluster-link">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Meet Your AI Agents Section */}
          <section aria-labelledby="nxf-agents-h" className="nxf-agents-section">
            <h2 id="nxf-agents-h" className="nxf-agents-title">
              Meet Your AI Agents
            </h2>
            <p className="nxf-agents-sub">
              Specialized AI agents to help you automate, communicate and grow.
            </p>
            <div className="nxf-agents-grid">
              {AI_AGENTS_LIST.map((agent) => (
                <Link key={agent.title} href={agent.href} className="nxf-agent-card">
                  <div className="nxf-agent-name">{agent.title}</div>
                  <div className="nxf-agent-desc">{agent.subtitle}</div>
                </Link>
              ))}
            </div>
          </section>

          {/* Bottom Bar: Brand lockup, Copyright + Legal shortcuts, Language Selector */}
          <div className="nxf-bottom-bar">
            <div className="nxf-bottom-brand">
              <Link href="/" aria-label="Noxtill home" className="nxf-bottom-brand-link">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/noxtill-logowhite.png"
                  alt="Noxtill"
                  width={2047}
                  height={461}
                  className="nxf-bottom-brand-wordmark"
                />
              </Link>
              <p className="nxf-bottom-brand-sub">One platform. A more capable business.</p>
            </div>

            <div className="nxf-bottom-center">
              <p className="nxf-copyright">© 2026 Noxtill LLC. All rights reserved.</p>
              <nav aria-label="Legal shortcuts" className="nxf-legal-nav">
                {FOOTER_BOTTOM.map((b, i) => (
                  <span key={b.label} style={{ display: "inline-flex", alignItems: "center" }}>
                    {i > 0 && (
                      <span aria-hidden="true" className="nxf-legal-sep">
                        |
                      </span>
                    )}
                    <Link href={b.href} className="nxf-legal-link">
                      {b.label}
                    </Link>
                  </span>
                ))}
              </nav>
            </div>

            <LanguageSelector />
          </div>
        </div>
      </footer>
      <ChatWidget />
    </>
  );
}
