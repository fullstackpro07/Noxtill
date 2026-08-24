"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, RotateCcw, Search, Zap } from "lucide-react";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  MORE_FILTER_KEYS,
  POPULAR_ORDER,
  TOP_FILTER_KEYS,
  type IntegrationTool,
} from "@/lib/marketing/integrations-content";

type SortKey = "popular" | "az" | "newest";

function labelFor(key: string) {
  return INTEGRATION_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
function topLabelFor(key: string) {
  return INTEGRATION_CATEGORIES.find((c) => c.key === key)?.topLabel ?? key;
}
function countFor(key: string) {
  return key === "all" ? INTEGRATIONS.length : INTEGRATIONS.filter((t) => t.categories.includes(key)).length;
}

function pillClass(active: boolean) {
  return `whitespace-nowrap rounded-[11px] border px-4.5 py-2.5 text-[13.5px] transition-colors ${
    active ? "border-[#a9e8cb] bg-[#eafaf1] text-[#0b7a4c]" : "border-border bg-white text-fg hover:border-border-strong"
  }`;
}

function sideRowClass(active: boolean) {
  return `flex w-full items-center justify-between gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13.5px] transition-colors ${
    active ? "bg-[#eafaf1] font-medium text-[#0b7a4c]" : "text-fg hover:bg-surface-2"
  }`;
}

export function IntegrationsDirectory() {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [moreOpen, setMoreOpen] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: IntegrationTool[] = INTEGRATIONS.filter((t) => cat === "all" || t.categories.includes(cat));

    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.categoryLabel.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.join(" ").toLowerCase().includes(q) ||
          t.categories.some((k) => labelFor(k).toLowerCase().includes(q)),
      );
    }

    if (sort === "az") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "popular") {
      const rank = (n: string) => {
        const i = POPULAR_ORDER.indexOf(n);
        return i === -1 ? 900 : i;
      };
      list = [...list].sort((a, b) => rank(a.name) - rank(b.name));
    }
    // "newest" falls back to catalog order (source order approximates release order).

    return list;
  }, [cat, query, sort]);

  function clearAll() {
    setCat("all");
    setQuery("");
    setSort("popular");
    setMoreOpen(false);
  }

  const emptyMessage = query.trim()
    ? `No integrations found for "${query.trim()}"${cat === "all" ? "." : ` in ${labelFor(cat)}.`}`
    : `No integrations in ${labelFor(cat)} yet.`;

  return (
    <div>
      <div className="mb-6.5 flex flex-wrap items-start gap-6 sm:gap-10">
        <div className="min-w-[260px] flex-[0_1_300px]">
          <h2 className="mb-2.5 text-balance font-display text-[27px] font-bold tracking-tight text-fg">Integration Directory</h2>
          <p className="text-sm leading-relaxed text-fg-muted">
            Connect Noxtill with the tools you already use. Search, filter and explore every connector we support today.
          </p>
        </div>
        <div className="relative min-w-[300px] flex-[1_1_480px]">
          <Search className="pointer-events-none absolute left-4.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            type="text"
            aria-label="Search integrations"
            placeholder="Search apps, platforms or tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[58px] w-full rounded-[14px] border border-border bg-white pl-11.5 pr-4.5 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
          {TOP_FILTER_KEYS.map((key) => (
            <button key={key} type="button" onClick={() => { setCat(key); setMoreOpen(false); }} aria-pressed={cat === key} className={pillClass(cat === key)}>
              {topLabelFor(key)}
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`${pillClass(MORE_FILTER_KEYS.includes(cat))} inline-flex items-center gap-1`}
            >
              More <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            {moreOpen ? (
              <div className="absolute left-0 top-[46px] z-20 flex w-[226px] flex-col gap-0.5 rounded-[14px] border border-border bg-white p-1.5 shadow-[0_20px_46px_-22px_rgba(16,29,38,0.32)]">
                {MORE_FILTER_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setCat(key); setMoreOpen(false); }}
                    className={`w-full rounded-[9px] px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                      cat === key ? "bg-[#eafaf1] text-[#0b7a4c]" : "text-fg hover:bg-surface-2"
                    }`}
                  >
                    {labelFor(key)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border px-3">
          <span className="text-[13.5px] text-fg-muted">Sort by:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort integrations"
            className="cursor-pointer appearance-none bg-transparent text-[13.5px] text-fg focus:outline-none"
          >
            <option value="popular">Popular</option>
            <option value="az">A–Z</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5.5">
        <div className="min-w-[240px] flex-[0_1_262px] rounded-2xl border border-border p-4">
          <div className="mb-3 font-display text-[14.5px] font-semibold text-fg">Filter by category</div>
          <div className="flex flex-col gap-0.5">
            {INTEGRATION_CATEGORIES.map(({ key, label }) => {
              const active = cat === key;
              return (
                <button key={key} type="button" onClick={() => setCat(key)} aria-pressed={active} className={sideRowClass(active)}>
                  <span className="truncate">{label}</span>
                  <span className={`shrink-0 rounded-[7px] px-2 py-0.5 text-[11.5px] ${active ? "bg-[#d6f4e5] text-[#0b7a4c]" : "bg-surface-2 text-fg-faint"}`}>
                    {countFor(key)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <button type="button" onClick={clearAll} className="flex items-center gap-2 px-2 py-1 text-[13px] font-medium text-primary hover:text-primary-hover">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Clear all filters
            </button>
          </div>
        </div>

        <div className="min-w-[300px] flex-[1_1_620px]">
          {rows.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4.5">
              {rows.map((tool) => (
                <IntegrationCard key={tool.slug} tool={tool} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border-strong px-6 py-13.5 text-center">
              <p className="mb-1.5 text-[15px] text-fg-muted">{emptyMessage}</p>
              <p className="mb-4 text-[13.5px] text-fg-faint">Try another category, or clear your filters.</p>
              <button type="button" onClick={clearAll} className="rounded-[10px] bg-primary px-5.5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ tool }: { tool: IntegrationTool }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-white p-4.5 shadow-[0_10px_26px_-22px_rgba(16,29,38,0.3)] transition-colors hover:border-[#a9e8cb]">
      {tool.popular ? (
        <span className="absolute right-3.5 top-3.5 rounded-full bg-[#eafaf1] px-2.5 py-1 text-[10.5px] font-medium text-[#0b7a4c]">Popular</span>
      ) : null}
      <div className={`flex items-center gap-3 ${tool.popular ? "pr-[74px]" : ""}`}>
        <span className="flex h-11.5 w-11.5 shrink-0 items-center justify-center rounded-[13px] border border-border bg-white">
          <Image src={tool.logo} alt={`${tool.name} logo`} width={28} height={28} className="h-7 w-7 object-contain" loading="lazy" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-semibold text-fg">{tool.name}</span>
          <span className="mt-0.5 block text-[12.5px] text-fg-faint">{tool.categoryLabel}</span>
        </span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-fg-muted">{tool.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {tool.tags.map((tag) => (
          <span key={tag} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-fg-muted">
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-end pt-1">
        <button type="button" className="flex items-center gap-1.5 text-[13px] font-medium text-primary">
          Connect
          <Zap className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
