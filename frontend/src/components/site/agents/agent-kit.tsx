import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AI_AGENTS_LIST } from "@/lib/marketing/footer-links";

/**
 * Shared frame for the seven /agents/* pages: header/footer, breadcrumb, heading styles, the closing
 * call to action and "meet the other agents". Each page builds its own sections and layout — only
 * these small pieces are shared.
 */
export function AgentPage({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="flex min-h-screen flex-col bg-bg text-fg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Crumb({ name, onDeep = false }: { name: string; onDeep?: boolean }) {
  const c = onDeep ? "text-fg-on-deep-muted" : "text-fg-muted";
  return (
    <nav aria-label="Breadcrumb" className={`mb-6 flex flex-wrap items-center gap-1.5 text-[13px] ${c}`}>
      <Link href="/" className="hover:underline">Home</Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      <Link href="/agents" className="hover:underline">AI Agents</Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      <span className={onDeep ? "font-medium text-fg-on-deep" : "font-medium text-fg"}>{name}</span>
    </nav>
  );
}

export function Eyebrow({ children, onDeep = false }: { children: ReactNode; onDeep?: boolean }) {
  return <p className={`mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] ${onDeep ? "text-accent-on-deep" : "text-primary"}`}>{children}</p>;
}

export function H2({ children, onDeep = false, className = "" }: { children: ReactNode; onDeep?: boolean; className?: string }) {
  return <h2 className={`font-display text-[30px] font-bold leading-[1.12] tracking-tight sm:text-[38px] ${onDeep ? "text-fg-on-deep" : "text-fg"} ${className}`}>{children}</h2>;
}

export function Lead({ children, onDeep = false, className = "" }: { children: ReactNode; onDeep?: boolean; className?: string }) {
  return <p className={`mt-4 text-[16px] leading-relaxed sm:text-[17px] ${onDeep ? "text-fg-on-deep-muted" : "text-fg-muted"} ${className}`}>{children}</p>;
}

export function Ctas({ primary, onDeep = false }: { primary: string; onDeep?: boolean }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/signup"
        className={`inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold transition ${onDeep ? "bg-accent-on-deep text-surface-deep hover:bg-white" : "bg-primary text-primary-foreground hover:bg-primary-hover"}`}
      >
        {primary} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <Link
        href="/book-a-demo"
        className={`inline-flex items-center rounded-full border px-6 py-3.5 text-[15px] font-semibold transition ${onDeep ? "border-border-on-deep text-fg-on-deep hover:border-fg-on-deep" : "border-border-strong text-fg hover:border-primary hover:text-primary"}`}
      >
        Book a Demo
      </Link>
    </div>
  );
}

/** A picture from public/marketing in a rounded frame that shows the whole image. */
export function Pic({ src, alt, className = "", ratio = "4 / 3", priority = false, cover = true }: { src: string; alt: string; className?: string; ratio?: string; priority?: boolean; cover?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[22px] bg-surface-tint ${className}`} style={{ aspectRatio: ratio }}>
      <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 1024px) 100vw, 50vw" className={cover ? "object-cover" : "object-contain"} />
    </div>
  );
}

/** White card used for the coded mock-ups. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] border border-border bg-surface p-5 shadow-[0_24px_60px_-40px_rgba(5,59,42,.45)] ${className}`}>{children}</div>;
}

export function Pill({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "warn" | "info" | "mute" }) {
  const t = { good: "bg-surface-tint text-primary", warn: "bg-[#fff4dc] text-[#8a5a00]", info: "bg-[#e6f0fb] text-[#1d5fa8]", mute: "bg-[#eef1ef] text-fg-muted" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap ${t}`}>{children}</span>;
}

export function Wrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1240px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

/** Closing band + links to the other six agents. */
export function AgentClosing({ current, title, sub }: { current: string; title: ReactNode; sub: string }) {
  const others = AI_AGENTS_LIST.filter((a) => !a.href.endsWith("/" + current));
  return (
    <>
      <section className="bg-surface-tint py-16">
        <Wrap>
          <Eyebrow>Meet the other agents</Eyebrow>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((a) => (
              <Link key={a.href} href={a.href} className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition hover:border-primary">
                <span>
                  <span className="block font-display text-[16px] font-semibold text-fg">{a.title}</span>
                  <span className="text-[13px] text-fg-muted">{a.subtitle}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </Link>
            ))}
          </div>
        </Wrap>
      </section>
      <section className="bg-surface-deep py-20 text-center">
        <Wrap>
          <h2 className="mx-auto max-w-[760px] font-display text-[32px] font-bold leading-tight tracking-tight text-fg-on-deep sm:text-[42px]">{title}</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[16px] text-fg-on-deep-muted">{sub}</p>
          <div className="flex justify-center">
            <Ctas primary="Start Free Trial" onDeep />
          </div>
        </Wrap>
      </section>
    </>
  );
}
