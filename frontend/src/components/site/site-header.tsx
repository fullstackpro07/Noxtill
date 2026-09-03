"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Menu, PlayCircle, X } from "lucide-react";
import {
  PRODUCT_GROUPS,
  PRODUCT_DRAWER_LINKS,
  RESOURCES_LEARN,
  RESOURCES_READ,
  RESOURCES_TOOLS,
  RESOURCES_SUPPORT,
  RESOURCES_DRAWER_LINKS,
  SOLUTIONS_BUSINESS_TYPES,
  SOLUTIONS_MORE_BUSINESS_TYPES,
  SOLUTIONS_NEEDS,
  SOLUTIONS_DRAWER_LINKS,
  AI_MENU_ITEMS,
  type NavLinkItem,
} from "@/lib/marketing/nav-links";
import { AI_PROMISE } from "@/lib/marketing/ai-content";

type PanelKey = "product" | "solutions" | "resources" | "ai";

const OPEN_DELAY = 150;
const CLOSE_DELAY = 300;

function NavLinkList({ items, compact, onNavigate }: { items: NavLinkItem[]; compact?: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className="group/link block" onClick={onNavigate}>
          <span className="flex items-center gap-1.5 text-[14.5px] font-medium text-fg group-hover/link:text-primary">
            {item.label}
            {item.starred ? <span className="text-[11px] text-[var(--rating-star)]">★</span> : null}
          </span>
          {!compact && item.description ? (
            <span className="mt-0.5 block text-[12.5px] text-fg-faint">{item.description}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function AiMenuGrid({ items, onNavigate }: { items: NavLinkItem[]; onNavigate?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          onClick={onNavigate}
          className="group/link -mx-2 flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
            {item.icon ? <item.icon className="h-[18px] w-[18px] text-accent" aria-hidden strokeWidth={1.8} /> : null}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg group-hover/link:text-primary">
              {item.label}
              {item.starred ? <span className="text-[11px] text-[var(--rating-star)]">★</span> : null}
            </span>
            {item.description ? <span className="mt-0.5 block text-[12px] leading-snug text-fg-faint">{item.description}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
      {children}
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState<PanelKey | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAcc, setDrawerAcc] = useState<Record<string, boolean>>({});
  const [bizLine, setBizLine] = useState("");
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || document.documentElement.scrollTop) > 4);
    const onResize = () => {
      const isNarrow = window.innerWidth < 1080;
      setNarrow(isNarrow);
      if (isNarrow) {
        setOpen(null);
        setDrawerOpen(false);
      }
    };
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function hoverOpen(key: PanelKey) {
    if (narrow) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    if (open === key) return;
    openTimer.current = setTimeout(() => setOpen(key), OPEN_DELAY);
  }
  function hoverClose() {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), CLOSE_DELAY);
  }
  function focusOpen(key: PanelKey) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    setOpen(key);
  }

  function toggleAcc(key: string) {
    setDrawerAcc((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function closeMenu() {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(null);
  }

  const tabClass = (key: PanelKey | null) =>
    `inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium transition-colors ${
      open === key ? "bg-surface-2 text-primary" : "text-fg hover:text-primary"
    }`;

  return (
    <header
      className="sticky top-0 z-40 bg-bg transition-colors"
      style={{ borderBottom: scrolled || open ? "1px solid var(--border)" : "1px solid transparent" }}
      onMouseLeave={hoverClose}
      data-theme="light"
    >
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center gap-6 px-5 sm:px-7">
        <Link href="/" className="flex flex-none items-center" aria-label="Noxtill home">
          <Image src="/brand/noxtill-logo.png" alt="Noxtill" width={120} height={34} className="h-[34px] w-auto" priority />
        </Link>

        <nav className={`min-w-0 flex-1 items-center justify-center gap-1 ${narrow ? "hidden" : "flex"}`}>
          <button type="button" className={tabClass("product")} onMouseEnter={() => hoverOpen("product")} onFocus={() => focusOpen("product")}>
            Product <ChevronDown className="h-3 w-3 opacity-55" aria-hidden />
          </button>
          <button type="button" className={tabClass("solutions")} onMouseEnter={() => hoverOpen("solutions")} onFocus={() => focusOpen("solutions")}>
            Solutions <ChevronDown className="h-3 w-3 opacity-55" aria-hidden />
          </button>
          <button type="button" className={tabClass("ai")} onMouseEnter={() => hoverOpen("ai")} onFocus={() => focusOpen("ai")}>
            AI <ChevronDown className="h-3 w-3 opacity-55" aria-hidden />
          </button>
          <button type="button" className={tabClass("resources")} onMouseEnter={() => hoverOpen("resources")} onFocus={() => focusOpen("resources")}>
            Resources <ChevronDown className="h-3 w-3 opacity-55" aria-hidden />
          </button>
          
          <Link href="/pricing" className={tabClass(null)} onMouseEnter={hoverClose} onFocus={hoverClose}>
            Pricing
          </Link>
          <Link href="/integrations-directory" className={tabClass(null)} onMouseEnter={hoverClose} onFocus={hoverClose}>
            Integrations
          </Link>
        </nav>

        <div className="ml-auto flex flex-none items-center gap-3.5">
          
          <Link
            href="/book-a-demo"
            className={`rounded-xl bg-primary px-5 py-2.5 text-[14.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${narrow ? "hidden" : "inline-block"}`}
          >
            Book a Demo
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className={`h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface ${narrow ? "inline-flex" : "hidden"}`}
          >
            <Menu className="h-5 w-5 text-fg" aria-hidden />
          </button>
        </div>
      </div>

      {/* Desktop mega-menu panels */}
      <div
        className="absolute inset-x-0 top-[72px]"
        style={{ pointerEvents: open ? "auto" : "none" }}
        onMouseEnter={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
        }}
      >
        <Panel visible={open === "product"}>
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-7 px-7 pb-2 pt-7">
            {PRODUCT_GROUPS.map((group) => (
              <div key={group.title} className="min-w-[180px] flex-1 basis-[190px]">
                <ColumnHeading>{group.title}</ColumnHeading>
                <NavLinkList items={group.items} onNavigate={closeMenu} />
              </div>
            ))}
            <div className="flex min-w-[230px] max-w-[280px] flex-1 basis-[240px] flex-col items-center gap-3.5 rounded-2xl bg-primary p-5 text-center text-white">
              <div className="w-[118px] rounded-[20px] border-[5px] border-primary-hover bg-surface-2 px-[7px] pb-2.5 pt-2">
                <div className="mx-auto mb-2 h-1 w-[34px] rounded-full bg-border-strong" />
                <div className="mb-1.5 rounded-[9px_9px_3px_9px] bg-[#d6f8e6] px-2 py-1.5 text-[9px] leading-tight text-fg">
                  Today: <strong>$18,760</strong> in sales, 128 orders, 24 bookings.
                </div>
                <div className="rounded-[9px_9px_9px_3px] bg-white px-2 py-1.5 text-[9px] leading-tight text-fg">
                  Nightly Close sent 10:00pm ✓
                </div>
              </div>
              <div>
                <div className="mb-1 font-display text-base font-semibold">See it in 90 seconds</div>
                <div className="text-[12.5px] leading-snug text-white/75">
                  The Nightly Close, on WhatsApp, every night at ten.
                </div>
              </div>
              <Link
                href="/book-a-demo"
                onClick={closeMenu}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--rating-star)] px-4.5 py-2.5 text-[13.5px] font-semibold text-fg"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
                Book a Demo
              </Link>
            </div>
          </div>
          <div className="border-t border-border bg-surface-2 px-7 py-3.5">
            <div className="mx-auto flex max-w-[1320px] flex-wrap gap-x-6 gap-y-2 text-[13px]">
              <Link href="/product" onClick={closeMenu} className="text-primary hover:text-primary-hover">Compare all features →</Link>
              <Link href="/resources" onClick={closeMenu} className="text-primary hover:text-primary-hover">Mobile app →</Link>
              <Link href="/resources" onClick={closeMenu} className="text-primary hover:text-primary-hover">What&apos;s new →</Link>
            </div>
          </div>
        </Panel>

        <Panel visible={open === "solutions"}>
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-7 px-7 pb-2 pt-7">
            <div className="min-w-[185px] flex-1 basis-[200px]">
              <ColumnHeading>By business type</ColumnHeading>
              <NavLinkList items={SOLUTIONS_BUSINESS_TYPES} compact onNavigate={closeMenu} />
            </div>
            <div className="min-w-[185px] flex-1 basis-[200px]">
              <ColumnHeading>More business types</ColumnHeading>
              <NavLinkList items={SOLUTIONS_MORE_BUSINESS_TYPES} compact onNavigate={closeMenu} />
            </div>
            <div className="min-w-[220px] flex-1 basis-[250px]">
              <ColumnHeading>By what you need</ColumnHeading>
              <NavLinkList items={SOLUTIONS_NEEDS} onNavigate={closeMenu} />
            </div>
            <div className="min-w-[240px] max-w-[300px] flex-1 basis-[250px] rounded-2xl border border-border bg-surface-2 p-5">
              <div className="mb-2 font-display text-[17px] font-semibold text-fg">Not on the list?</div>
              <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">
                Describe your business in one line and our AI builds your dashboard.
              </p>
              <input
                type="text"
                value={bizLine}
                onChange={(e) => setBizLine(e.target.value)}
                placeholder="e.g. mobile bicycle repair, two vans"
                className="mb-2.5 w-full rounded-xl border border-border-strong bg-white px-3 py-2.5 text-[13px] text-fg"
              />
              <button
                type="button"
                className="w-full rounded-xl bg-primary px-3.5 py-2.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Try it
              </button>
            </div>
          </div>
          <div className="border-t border-border bg-surface-2 px-7 py-3.5">
            <div className="mx-auto max-w-[1320px] text-[13px]">
              <Link href="/solutions" onClick={closeMenu} className="text-primary hover:text-primary-hover">See all 300+ business types →</Link>
            </div>
          </div>
        </Panel>

        <Panel visible={open === "resources"}>
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-7 px-7 pb-2 pt-7">
            <div className="min-w-[160px] flex-1 basis-[170px]">
              <ColumnHeading>Learn</ColumnHeading>
              <NavLinkList items={RESOURCES_LEARN} compact onNavigate={closeMenu} />
            </div>
            <div className="min-w-[160px] flex-1 basis-[170px]">
              <ColumnHeading>Read</ColumnHeading>
              <NavLinkList items={RESOURCES_READ} compact onNavigate={closeMenu} />
            </div>
            <div className="min-w-[220px] flex-1 basis-[240px]">
              <ColumnHeading>Free tools</ColumnHeading>
              <NavLinkList items={RESOURCES_TOOLS} onNavigate={closeMenu} />
            </div>
            <div className="min-w-[160px] flex-1 basis-[170px]">
              <ColumnHeading>Support</ColumnHeading>
              <NavLinkList items={RESOURCES_SUPPORT} compact onNavigate={closeMenu} />
            </div>
            <Link
              href="/resources"
              onClick={closeMenu}
              className="block min-w-[230px] max-w-[290px] flex-1 basis-[240px] overflow-hidden rounded-2xl border border-border hover:border-primary"
            >
              <div className="h-[118px] w-full bg-surface-2" />
              <div className="p-4">
                <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                  Latest from the blog
                </div>
                <div className="text-sm font-medium leading-snug text-fg">
                  The ten-minute nightly close: what to look at, and what to ignore
                </div>
                <div className="mt-2 text-xs text-fg-faint">6 min read</div>
              </div>
            </Link>
          </div>
        </Panel>

        <Panel visible={open === "ai"}>
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-7 px-7 pb-2 pt-7">
            <div className="min-w-[340px] flex-[2_1_460px]">
              <ColumnHeading>Powered by AI</ColumnHeading>
              <AiMenuGrid items={AI_MENU_ITEMS} onNavigate={closeMenu} />
            </div>
            <div className="flex min-w-[230px] max-w-[280px] flex-1 basis-[240px] flex-col gap-4 rounded-2xl bg-primary p-5 text-white">
              <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">
                Our AI commitments
              </div>
              <div className="flex flex-1 flex-col gap-3.5">
                {AI_PROMISE.principles.map((principle) => (
                  <div key={principle.title} className="flex items-start gap-2.5">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10">
                      <principle.icon className="h-[14px] w-[14px] text-accent-on-deep" aria-hidden strokeWidth={1.9} />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-fg-on-deep">{principle.title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-fg-on-deep-muted">{principle.description}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/ai"
                onClick={closeMenu}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4.5 py-2.5 text-[13.5px] font-semibold text-[#053b2a] hover:bg-[#e6f5ee]"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
                See all AI features
              </Link>
            </div>
          </div>
          <div className="border-t border-border bg-surface-2 px-7 py-3.5">
            <div className="mx-auto max-w-[1320px] text-[13px]">
              <Link href="/ai" onClick={closeMenu} className="text-primary hover:text-primary-hover">See every AI feature →</Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
      ) : null}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-200"
        style={{ transform: drawerOpen ? "translateX(0)" : "translateX(100%)" }}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4.5">
          <Image src="/brand/noxtill-logo.png" alt="Noxtill" width={100} height={28} className="h-7 w-auto" />
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-1.5">
            <X className="h-5 w-5 text-fg" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <DrawerAccordion
            title="Product"
            open={!!drawerAcc.product}
            onToggle={() => toggleAcc("product")}
            links={PRODUCT_DRAWER_LINKS}
            onNavigate={() => setDrawerOpen(false)}
          />
          <DrawerAccordion
            title="Solutions"
            open={!!drawerAcc.solutions}
            onToggle={() => toggleAcc("solutions")}
            links={SOLUTIONS_DRAWER_LINKS}
            onNavigate={() => setDrawerOpen(false)}
          />
          <DrawerAccordion
            title="Resources"
            open={!!drawerAcc.resources}
            onToggle={() => toggleAcc("resources")}
            links={RESOURCES_DRAWER_LINKS}
            onNavigate={() => setDrawerOpen(false)}
          />
          <DrawerAccordion
            title="AI"
            open={!!drawerAcc.ai}
            onToggle={() => toggleAcc("ai")}
            links={AI_MENU_ITEMS}
            onNavigate={() => setDrawerOpen(false)}
          />
          <Link href="/pricing" className="block border-b border-border py-4 text-base font-medium text-fg" onClick={() => setDrawerOpen(false)}>
            Pricing
          </Link>
          <Link href="/integrations-directory" className="block border-b border-border py-4 text-base font-medium text-fg" onClick={() => setDrawerOpen(false)}>
            Integrations
          </Link>

          <div className="mt-5 flex flex-col gap-2.5">
            <Link
              href="/book-a-demo"
              onClick={() => setDrawerOpen(false)}
              className="rounded-xl bg-primary px-5 py-3.5 text-center text-[15px] font-medium text-primary-foreground"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </aside>
    </header>
  );
}

function Panel({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className="rounded-b-2xl border-t border-border bg-white shadow-[0_26px_60px_-34px_rgba(24,36,32,0.34)] transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
        display: visible ? "block" : "none",
      }}
    >
      {children}
    </div>
  );
}

function DrawerAccordion({
  title,
  open,
  onToggle,
  links,
  onNavigate,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  links: NavLinkItem[];
  onNavigate?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-b border-border py-4 text-left text-base font-medium text-fg"
      >
        {title}
        <ChevronDown className={`h-3.5 w-3.5 text-fg-faint transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-0.5 py-1.5 pb-3">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="py-2 text-[14.5px] text-fg-muted" onClick={onNavigate}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
