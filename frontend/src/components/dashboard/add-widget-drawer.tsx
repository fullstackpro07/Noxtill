"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X, Check } from "lucide-react";
import { CATEGORY_LABELS, WIDGETS, type WidgetCategory } from "@/lib/widgets";
import { useDashboardStore } from "@/store/dashboard-store";
import { useNxPortalTarget } from "@/hooks/use-nx-portal-target";

const EMPTY_LAYOUT: string[] = [];

const CATEGORY_ORDER: WidgetCategory[] = ["sales", "inventory", "credit", "bookings", "reviews", "marketing", "staff", "messaging"];

const KIND_PREVIEW: Record<string, "chart" | "kpi" | "list" | "donut"> = {
  currency: "kpi",
  currencyPair: "kpi",
  count: "kpi",
  percent: "kpi",
  average: "kpi",
  productList: "list",
  leaderboard: "list",
  competitorList: "list",
  quota: "chart",
  channelBreakdown: "donut",
};

function Preview({ kind }: { kind: "chart" | "kpi" | "list" | "donut" }) {
  if (kind === "chart") {
    return (
      <svg viewBox="0 0 66 40" className="h-full w-full">
        <path d="M2 30 L14 20 L24 26 L36 12 L48 18 L64 6" fill="none" stroke="var(--app-primary)" strokeWidth={2} strokeLinejoin="round" />
        <path d="M2 30 L14 20 L24 26 L36 12 L48 18 L64 6 L64 38 L2 38 Z" fill="var(--app-primary)" opacity={0.12} />
      </svg>
    );
  }
  if (kind === "donut") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9">
        <circle cx={20} cy={20} r={14} fill="none" stroke="var(--app-border-strong)" strokeWidth={8} />
        <circle cx={20} cy={20} r={14} fill="none" stroke="var(--app-primary)" strokeWidth={8} strokeDasharray="52 88" transform="rotate(-90 20 20)" />
      </svg>
    );
  }
  if (kind === "list") {
    return (
      <div className="flex w-full flex-col gap-1">
        {[8, 8, 8].map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: i === 0 ? "var(--app-primary)" : "var(--app-success-border)" }} />
            <span className="h-1 flex-1 rounded-[3px]" style={{ background: "var(--app-border-strong)" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-0.5">
      <span className="h-1 w-3/5 rounded-[3px]" style={{ background: "var(--app-border-strong)" }} />
      <span className="text-[13px] font-extrabold leading-none" style={{ color: "var(--app-text)" }}>24.5K</span>
      <span className="text-[8px] font-bold" style={{ color: "var(--app-primary)" }}>▲ 12.5%</span>
    </div>
  );
}

export function AddWidgetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WidgetCategory | "all">("all");
  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? EMPTY_LAYOUT;
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGETS.filter((w) => (category === "all" || w.category === category) && (!q || w.title.toLowerCase().includes(q)));
  }, [query, category]);

  const portalTarget = useNxPortalTarget();
  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.34)" }} />
      <div className="animate-sheet-in absolute inset-y-0 end-0 flex w-full max-w-[440px] flex-col" style={{ background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}>
        <div className="flex items-center gap-3 p-[18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h2 className="flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Widget Gallery</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 p-[18px] pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search widgets..."
              autoFocus
              className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
              style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={category === "all" ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
            >
              All
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={category === c ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-[18px] pt-0">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No widgets match your search.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((widget) => {
                const added = draftLayout.includes(widget.key);
                const Icon = widget.icon;
                const preview = KIND_PREVIEW[widget.kind] ?? "kpi";
                return (
                  <div key={widget.key} className="flex gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                    <span
                      className="flex h-14 w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] p-1.5"
                      style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}
                    >
                      <Preview kind={preview} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-primary)" }} aria-hidden />
                        <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{widget.title}</p>
                      </div>
                      <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{CATEGORY_LABELS[widget.category]}</p>
                      <div className="mt-2">
                        {added ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                              <Check className="h-3 w-3" aria-hidden />
                              Added
                            </span>
                            <button type="button" onClick={() => removeWidget(widget.key)} className="rounded-[8px] px-2.5 py-1 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addWidget(widget.key)}
                            className="flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[11px] font-bold text-white"
                            style={{ background: "var(--app-primary)" }}
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
