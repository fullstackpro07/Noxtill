"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { SolutionsTypeCard } from "@/components/site/solutions-type-card";
import { SolutionsNeedCard } from "@/components/site/solutions-need-card";
import { BUSINESS_TYPES, NEEDS } from "@/lib/marketing/solutions-content";

type Tab = "types" | "needs";

/**
 * Client-side tab + search filter for the business-type / need card grids. Both grids stay
 * mounted (not conditionally rendered) so every `#slug` anchor from nav-links.ts always
 * resolves, even for cards hidden by the inactive tab or a non-matching search query.
 *
 * Cards on the inactive tab are `hidden` (display:none), which the browser can't natively
 * scroll to — so `#slug` deep links (from the mega-menu, footer, or another page) are
 * resolved manually here: on mount and on hash change, flip to whichever tab owns that
 * slug, then scroll to it once the grid re-renders visible.
 */
export function SolutionsNavigator() {
  const [tab, setTab] = useState<Tab>("types");
  const [query, setQuery] = useState("");
  const pendingHash = useRef<string | null>(null);

  useEffect(() => {
    function goToHash(hash: string) {
      const slug = hash.replace(/^#/, "");
      if (!slug) return;
      if (NEEDS.some((n) => n.slug === slug)) {
        pendingHash.current = slug;
        setTab("needs");
      } else if (BUSINESS_TYPES.some((t) => t.slug === slug)) {
        pendingHash.current = slug;
        setTab("types");
      } else {
        return;
      }
      setQuery("");
    }

    if (window.location.hash) goToHash(window.location.hash);
    window.addEventListener("hashchange", () => goToHash(window.location.hash));
    return () => window.removeEventListener("hashchange", () => goToHash(window.location.hash));
  }, []);

  useEffect(() => {
    if (!pendingHash.current) return;
    const id = pendingHash.current;
    pendingHash.current = null;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [tab]);

  const q = query.trim().toLowerCase();

  const filteredTypes = useMemo(
    () => BUSINESS_TYPES.filter((t) => !q || t.name.toLowerCase().includes(q) || t.keywords.includes(q)),
    [q],
  );
  const filteredNeeds = useMemo(
    () => NEEDS.filter((n) => !q || n.title.toLowerCase().includes(q) || n.keywords.includes(q)),
    [q],
  );

  const count = tab === "types" ? filteredTypes.length : filteredNeeds.length;
  const noun = tab === "types" ? "business type" : "solution";
  const resultLabel = `${count} ${noun}${count === 1 ? "" : "s"}${q ? ` matching “${query.trim()}”` : ""}`;

  const hiddenTypeSlugs = new Set(BUSINESS_TYPES.filter((t) => !filteredTypes.includes(t)).map((t) => t.slug));
  const hiddenNeedSlugs = new Set(NEEDS.filter((n) => !filteredNeeds.includes(n)).map((n) => n.slug));

  return (
    <div className="bg-surface-tint">
      <section id="navigator" className="px-5 pb-6 sm:px-7">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-3">
          <div role="group" aria-label="Choose an entry path" className="flex gap-1.5 rounded-full border border-border p-1">
            <button
              type="button"
              onClick={() => setTab("types")}
              aria-pressed={tab === "types"}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                tab === "types" ? "bg-primary text-primary-foreground" : "text-fg-muted hover:text-fg"
              }`}
            >
              By business type
            </button>
            <button
              type="button"
              onClick={() => setTab("needs")}
              aria-pressed={tab === "needs"}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                tab === "needs" ? "bg-primary text-primary-foreground" : "text-fg-muted hover:text-fg"
              }`}
            >
              By what you need
            </button>
          </div>
          <div className="relative min-w-[280px] max-w-[420px] flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint"
              aria-hidden
            />
            <input
              type="text"
              aria-label="Search solutions"
              placeholder="Search solutions… salon, no-shows, credit, profit"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-[46px] w-full rounded-xl border border-border-strong pl-10 pr-4 text-sm text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-fg-faint">{resultLabel}</p>
      </section>

      <section className="px-5 pb-14 sm:px-7" hidden={tab !== "types"}>
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-1.5 text-balance font-display text-[28px] font-semibold tracking-tight text-fg">
            Solutions by business type
          </h2>
          <p className="mb-6 max-w-[68ch] text-[14.5px] text-fg-muted">
            Choose your business and see the daily workflow Noxtill is set up for — the problem it removes, the
            modules involved, and where it ends up.
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {BUSINESS_TYPES.map((type, i) => (
              <div key={type.slug} hidden={hiddenTypeSlugs.has(type.slug)}>
                <Reveal delay={(i % 6) * 60}>
                  <SolutionsTypeCard type={type} />
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-14 sm:px-7" hidden={tab !== "needs"}>
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-1.5 text-balance font-display text-[28px] font-semibold tracking-tight text-fg">
            Solve the problems that matter most
          </h2>
          <p className="mb-6 max-w-[68ch] text-[14.5px] text-fg-muted">
            Choose what you want to improve and see how Noxtill handles it — and which businesses it helps most.
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {NEEDS.map((need, i) => (
              <div key={need.slug} hidden={hiddenNeedSlugs.has(need.slug)}>
                <Reveal delay={(i % 6) * 60}>
                  <SolutionsNeedCard need={need} />
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
