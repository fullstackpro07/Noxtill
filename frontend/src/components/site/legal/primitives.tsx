import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { s } from "./s";

/** Internal route → next/link; hash, mailto, tel and external → plain anchor (external opens a new tab only when asked). */
export function A({
  href,
  style,
  className,
  children,
  target,
  onClick,
  ...rest
}: {
  href: string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
  target?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  "aria-current"?: "page" | "step" | "true" | undefined;
  "aria-label"?: string;
}) {
  if (href.startsWith("/") && !target) {
    return (
      <Link href={href} style={style} className={className} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a href={href} style={style} className={className} onClick={onClick} target={target} rel={external || target ? "noopener" : undefined} {...rest}>
      {children}
    </a>
  );
}

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail; `tone` follows the hero it sits on. */
export function Breadcrumb({
  items,
  tone = "light",
  noprint,
  fontSize = 14,
}: {
  items: Crumb[];
  tone?: "light" | "dark" | "contrast";
  noprint?: boolean;
  fontSize?: number;
}) {
  const link = tone === "dark" ? "color: #CFE8DD; text-decoration: none;" : tone === "contrast" ? "color: #FFFFFF;" : "color: #4C5B63; text-decoration: none;";
  const current =
    tone === "dark" ? "color: #FFFFFF; font-weight: 600;" : tone === "contrast" ? "font-weight: 700;" : "color: #0B1822; font-weight: 600;";
  const nav = tone === "dark" ? `font-size: ${fontSize}px; color: #CFE8DD;` : tone === "contrast" ? `font-size: ${fontSize}px;` : `font-size: ${fontSize}px; color: #4C5B63;`;
  return (
    <nav aria-label="Breadcrumb" style={s(nav)} data-noprint={noprint ? "true" : undefined}>
      <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")}>
        {items.map((c, i) => (
          <BreadcrumbItem key={c.label} crumb={c} last={i === items.length - 1} linkStyle={link} currentStyle={current} />
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbItem({ crumb, last, linkStyle, currentStyle }: { crumb: Crumb; last: boolean; linkStyle: string; currentStyle: string }) {
  if (last)
    return (
      <li>
        <span aria-current="page" style={s(currentStyle)}>
          {crumb.label}
        </span>
      </li>
    );
  return (
    <>
      <li>
        <A href={crumb.href ?? "/"} className="h-ul" style={s(linkStyle)}>
          {crumb.label}
        </A>
      </li>
      <li aria-hidden="true">›</li>
    </>
  );
}

export const HOME: Crumb = { label: "Home", href: "/" };
export const LEGAL: Crumb = { label: "Legal", href: "/trust" };
export const TRUST: Crumb = { label: "Trust Center", href: "/trust" };

export interface CrossLink {
  href: string;
  label: string;
  desc: string;
}

/** docs/Legal pages/CrossLinks.dc.html */
export function CrossLinks({ heading = "Related policies", links }: { heading?: string; links: CrossLink[] }) {
  return (
    <nav aria-label={heading} style={s("font-family: 'Plus Jakarta Sans', system-ui, sans-serif;")} data-noprint="true">
      <h2 style={s("margin: 0 0 18px; font-size: 22px; font-weight: 750; letter-spacing: -0.01em; color: #0B1822;")}>{heading}</h2>
      <div style={s("display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px;")}>
        {links.map((l) => (
          <A
            key={l.label}
            href={l.href}
            className="h-card-sm"
            style={s(
              "display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 16px; border: 1px solid #D9E8E0; border-radius: 14px; background: #FFFFFF; text-decoration: none; color: #0B1822; min-height: 104px; transition: border-color .15s, box-shadow .15s;",
            )}
          >
            <span style={s("font-size: 16px; font-weight: 700; color: #064F3B;")}>{l.label} →</span>
            <span style={s("font-size: 14px; line-height: 1.5; color: #4C5B63; text-wrap: pretty;")}>{l.desc}</span>
          </A>
        ))}
      </div>
    </nav>
  );
}

/** Light grey band that hosts CrossLinks at the bottom of most policy pages. */
export function CrossLinksBand(props: { heading?: string; links: CrossLink[] }) {
  return (
    <section style={s("background: #F7FAF8; border-top: 1px solid #E3EEE8;")}>
      <div style={s("max-width: 1240px; margin: 0 auto; padding: 56px 24px;")}>
        <CrossLinks {...props} />
      </div>
    </section>
  );
}

/** Small uppercase "Full policy text" style label. */
export function KickerH2({ id, children, margin = "0 0 8px", color = "#067A50" }: { id?: string; children: ReactNode; margin?: string; color?: string }) {
  return (
    <h2 id={id} style={s(`margin: ${margin}; font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${color};`)}>
      {children}
    </h2>
  );
}
