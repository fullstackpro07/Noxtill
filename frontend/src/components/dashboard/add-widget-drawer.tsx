"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X, Check } from "lucide-react";
import { DASHBOARD_ROWS, DASHBOARD_ROW_MODULES } from "@/lib/dashboard-rows";
import { WIDGETS, CATEGORY_LABELS, type WidgetCategory } from "@/lib/widgets";
import { useDashboardStore } from "@/store/dashboard-store";
import { useNxPortalTarget } from "@/hooks/use-nx-portal-target";

const EMPTY_LAYOUT: string[] = [];
type Tab = "rows" | "kpi";

/** Add Widget fix-it: two real catalogs, matching the two things Customize Dashboard now manages —
 * "Sections" toggles whole design rows on/off (paired with the row-reorder lists), "KPI Cards"
 * appends an extra real metric tile onto the end of the KPI Row (per your "add widget should work
 * like adding a KPI card" direction). */
export function AddWidgetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("kpi");
  const [query, setQuery] = useState("");
  const [rowModule, setRowModule] = useState<string | "all">("all");
  const [kpiCategory, setKpiCategory] = useState<WidgetCategory | "all">("all");

  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? EMPTY_LAYOUT;
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const draftKpiExtras = useDashboardStore((s) => s.draftKpiExtras) ?? EMPTY_LAYOUT;
  const addKpiExtra = useDashboardStore((s) => s.addKpiExtra);
  const removeKpiExtra = useDashboardStore((s) => s.removeKpiExtra);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DASHBOARD_ROWS.filter((r) => (rowModule === "all" || r.module === rowModule) && (!q || r.title.toLowerCase().includes(q)));
  }, [query, rowModule]);

  const filteredKpiWidgets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGETS.filter((w) => (kpiCategory === "all" || w.category === kpiCategory) && (!q || w.title.toLowerCase().includes(q)));
  }, [query, kpiCategory]);

  const portalTarget = useNxPortalTarget();
  if (!open || !portalTarget) return null;

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 0",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 700,
    background: active ? "var(--app-primary)" : "transparent",
    color: active ? "#fff" : "var(--app-text-faint)",
  });

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

        <div className="flex gap-1.5 p-[18px] pb-0">
          <button type="button" onClick={() => setTab("kpi")} style={tabBtnStyle(tab === "kpi")}>KPI Cards</button>
          <button type="button" onClick={() => setTab("rows")} style={tabBtnStyle(tab === "rows")}>Sections</button>
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
          {tab === "kpi" ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setKpiCategory("all")}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={kpiCategory === "all" ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as WidgetCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setKpiCategory(c)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={kpiCategory === c ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRowModule("all")}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={rowModule === "all" ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
              >
                All
              </button>
              {DASHBOARD_ROW_MODULES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRowModule(m)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={rowModule === m ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-[18px] pt-0">
          {tab === "kpi" ? (
            filteredKpiWidgets.length === 0 ? (
              <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No widgets match your search.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredKpiWidgets.map((widget) => {
                  const added = draftKpiExtras.includes(widget.key);
                  const Icon = widget.icon;
                  return (
                    <div key={widget.key} className="flex gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                      <span
                        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[9px]"
                        style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}
                      >
                        <Icon className="h-6 w-6" style={{ color: "var(--app-primary)" }} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{widget.title}</p>
                        <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{CATEGORY_LABELS[widget.category]}</p>
                        <div className="mt-2">
                          {added ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                                <Check className="h-3 w-3" aria-hidden />
                                Added
                              </span>
                              <button type="button" onClick={() => removeKpiExtra(widget.key)} className="rounded-[8px] px-2.5 py-1 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addKpiExtra(widget.key)}
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
            )
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No sections match your search.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredRows.map((row) => {
                const added = draftLayout.includes(row.key);
                const Icon = row.icon;
                return (
                  <div key={row.key} className="flex gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[9px]"
                      style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}
                    >
                      <Icon className="h-6 w-6" style={{ color: "var(--app-primary)" }} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{row.title}</p>
                      <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{row.module}</p>
                      <div className="mt-2">
                        {added ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                              <Check className="h-3 w-3" aria-hidden />
                              Added
                            </span>
                            <button type="button" onClick={() => removeWidget(row.key)} className="rounded-[8px] px-2.5 py-1 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addWidget(row.key)}
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
