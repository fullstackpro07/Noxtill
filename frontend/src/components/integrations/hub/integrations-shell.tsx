"use client";

import { Suspense, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { HIcon, R, chipStyle, errorMessage } from "./hub-ui";
import { useIntegrations } from "./integrations-store";
import { useHubOverview, useRefreshHub } from "./use-hub";
import { IntegrationsOverlays } from "./integrations-overlays";

interface TabDef {
  key: string;
  label: string;
  icon: string;
  href: string;
  count?: "connections" | "accounting" | "ecommerce";
}

const TABS: TabDef[] = [
  { key: "directory", label: "Directory", icon: "layout-grid", href: "/integrations" },
  { key: "connections", label: "Connections", icon: "plug-zap", href: "/integrations/connections", count: "connections" },
  { key: "accounting", label: "Accounting", icon: "receipt-text", href: "/integrations/accounting", count: "accounting" },
  { key: "ecommerce", label: "E-commerce", icon: "shopping-bag", href: "/integrations/ecommerce", count: "ecommerce" },
  { key: "automation", label: "Automation", icon: "workflow", href: "/integrations/automation" },
  { key: "developer", label: "Developer", icon: "key-round", href: "/integrations/developer" },
  { key: "map", label: "Business map", icon: "git-fork", href: "/integrations/map" },
];

const TITLES: Record<string, string> = {
  directory: "Integrations",
  connections: "Connections",
  accounting: "Accounting Sync",
  ecommerce: "E-commerce Sync",
  automation: "Automation",
  developer: "Developer",
  map: "Connected Business Map",
};

export function screenOf(pathname: string): string {
  for (const t of TABS) {
    if (t.key !== "directory" && (pathname === t.href || pathname.startsWith(`${t.href}/`))) return t.key;
  }
  return "directory";
}

function HeaderSearch() {
  const openPanel = useIntegrations((s) => s.openPanel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      openPanel({ type: "command" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);
  return (
    <div className="nx-hsearch" style={{ containerType: "inline-size", width: "100%", minWidth: 0 }}>
      <style>{`@container (max-width: 150px) { .nx-hsearch-text, .nx-hsearch-key { display: none !important; } .nx-hsearch-btn { justify-content: center; padding: 0 !important; } }`}</style>
      <button
        type="button"
        className="nx-hsearch-btn"
        onClick={() => openPanel({ type: "command" })}
        aria-label="Search integrations, or run a command"
        style={{ width: "100%", minWidth: 0, height: 38, minHeight: 38, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", background: R.page, border: `1px solid ${R.border}`, borderRadius: 10, cursor: "text", textAlign: "left", overflow: "hidden" }}
      >
        <HIcon name="search" size={15} style={{ color: R.label, flexShrink: 0 }} />
        <span className="nx-hsearch-text" style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#8B97A6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Search integrations, or run a command…</span>
        <span className="nx-hsearch-key" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: R.label, background: "#fff", border: `1px solid ${R.border}`, borderBottomWidth: 2, borderRadius: 5, padding: "2px 6px", flexShrink: 0 }}>/</span>
      </button>
    </div>
  );
}

function HealthPill() {
  const { data } = useHubOverview();
  const openPanel = useIntegrations((s) => s.openPanel);
  const health = data?.health;
  const attention = (health?.needsAttention ?? 0) > 0;
  const label = !health ? "Checking connections…" : health.headline;
  return (
    <button
      type="button"
      onClick={() => openPanel({ type: "health" })}
      style={{ ...chipStyle(attention ? "amber" : health?.allHealthy ? "green" : "neutral", { height: 34, fontSize: 12.5, padding: "0 11px" }), minHeight: 34, flexShrink: 0, cursor: "pointer" }}
    >
      <HIcon name={attention ? "triangle-alert" : health?.allHealthy ? "circle-check" : "plug-zap"} size={13} />
      <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
    </button>
  );
}

function HeaderActions() {
  const openPanel = useIntegrations((s) => s.openPanel);
  const router = useRouter();
  return (
    <>
      <HealthPill />
      <button
        type="button"
        onClick={() => openPanel({ type: "request" })}
        style={{ height: 34, minHeight: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: R.ink }}
      >
        <HIcon name="plus" size={14} />
        <span style={{ whiteSpace: "nowrap" }}>Request</span>
      </button>
      <button
        type="button"
        onClick={() => router.push("/integrations/developer")}
        style={{ height: 34, minHeight: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "0 13px", borderRadius: 10, background: R.green, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: 0 }}
      >
        <HIcon name="book-open" size={15} />
        <span style={{ whiteSpace: "nowrap" }}>API docs</span>
      </button>
    </>
  );
}

/** Handles the browser coming back from a provider's OAuth screen, and `?provider=` deep links. */
function useReturnParams() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const refresh = useRefreshHub();
  const { data } = useHubOverview();
  const { notify, openDrawer } = useIntegrations();

  const connected = params.get("connected");
  const failed = params.get("error");
  const open = params.get("provider");

  useEffect(() => {
    if (!connected && !failed) return;
    const name = data?.providers.find((p) => p.key === (connected ?? failed))?.name ?? connected ?? failed ?? "the provider";
    if (connected) notify(`${name} connected`, data?.providers.find((p) => p.key === connected)?.syncNote ?? "Recorded in the audit trail.");
    else notify(`Could not connect ${name}`, "The provider did not complete the authorisation. Nothing was changed.");
    refresh();
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, failed]);

  useEffect(() => {
    if (!open) return;
    openDrawer(open);
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** `useSearchParams` needs a Suspense boundary in Next; this renders nothing and only runs the hook. */
function ReturnParamsHandler() {
  useReturnParams();
  return null;
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screen = screenOf(pathname);
  const { data, error } = useHubOverview();

  const subtitle = "Connect Noxtill with the tools your business already uses.";
  const search = useMemo(() => <HeaderSearch />, []);
  const actions = useMemo(() => <HeaderActions />, []);
  useModuleHeader({ title: TITLES[screen], subtitle, search, actions });

  return (
    <div className="flex min-h-full flex-col" style={{ background: R.page }}>
      <div
        className="nx-scroll"
        style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 2, padding: "0 24px", background: "#fff", borderBottom: `1px solid ${R.border}`, overflowX: "auto" }}
      >
        {TABS.map((t) => {
          const on = t.key === screen;
          const count = t.count ? data?.tabCounts[t.count] : 0;
          return (
            <Link
              key={t.key}
              href={t.href}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 11px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontWeight: on ? 700 : 600, color: on ? R.ink : R.muted, boxShadow: on ? `inset 0 -2px 0 ${R.green}` : "none" }}
            >
              <HIcon name={t.icon} size={14} />
              <span>{t.label}</span>
              {count ? (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "#DCFCE7" : "#FEF3F2", color: on ? "#15803D" : "#B42318" }}>{count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div style={{ padding: "18px 24px 30px", maxWidth: 1680, width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        {error ? (
          <div style={{ background: "#fff", border: "1px solid #FBD5D2", borderRadius: 12, padding: "14px 16px", fontSize: 12.5, color: "#B42318", fontWeight: 600 }}>
            Integrations could not be loaded: {errorMessage(error)}
          </div>
        ) : null}
        {children}
      </div>
      <Suspense fallback={null}>
        <ReturnParamsHandler />
      </Suspense>
      <IntegrationsOverlays />
    </div>
  );
}

export function IntegrationsShell({ children }: { children: ReactNode }) {
  const reset = useIntegrations((s) => s.reset);
  useEffect(() => reset, [reset]);
  return <ShellContent>{children}</ShellContent>;
}
