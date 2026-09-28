"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useAuthStore } from "@/store/auth-store";
import { fetchBrainScope, fetchCommand } from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { BrainOverlays } from "./brain-overlays";
import { Icon } from "./brain-ui";

export const BRAIN_TABS = [
  { key: "command", label: "Command Center", href: "/business-brain", d: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
  { key: "situation", label: "Situation", href: "/business-brain/situation", d: "M3 12h4l2-5 3 10 2-5h7" },
  { key: "cause", label: "Root Cause", href: "/business-brain/cause", d: "M12 3v5M12 8 6 13v8M12 8l6 5v8M6 21h.01M18 21h.01" },
  { key: "opportunity", label: "Opportunity & Risk", href: "/business-brain/opportunity", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-5 6.4-4.2" },
  { key: "outlook", label: "Outlook", href: "/business-brain/outlook", d: "m3 16 5-6 4 3 5-7 4 4" },
  { key: "decisions", label: "Decisions", href: "/business-brain/decisions", d: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" },
  { key: "actions", label: "Action Center", href: "/business-brain/actions", d: "M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" },
  { key: "memory", label: "Memory & Rules", href: "/business-brain/memory", d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
  { key: "history", label: "History", href: "/business-brain/history", d: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v5l3.5 2" },
  {
    key: "settings",
    label: "Governance",
    href: "/business-brain/settings",
    d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z",
  },
];

const STYLES = `
.ui-brain .bb-soft:hover{background:#F7FCF9}
.ui-brain .bb-soft:disabled:hover{background:#fff}
.ui-brain .bb-primary:hover{background:#0E8442!important}
.ui-brain .bb-primary:disabled:hover{background:#12A150!important}
.ui-brain .bb-row:hover{background:#FAFBFC!important}
.ui-brain .bb-accent:hover{border-color:#12A150!important}
.ui-brain .bb-dark-chip:hover{border-color:#12A150!important;color:#fff!important}
.ui-brain .bb-tab:hover{color:#0E8442!important}
.ui-brain input:focus,.ui-brain textarea:focus,.ui-brain select:focus{outline:none}
@keyframes bbin{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes bbpulse{0%,100%{opacity:.35}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.ui-brain *{animation:none!important;transition:none!important}}
@media(max-width:1180px){.ui-brain [data-2col]{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:900px){.ui-brain [data-drawer]{width:100%!important}}
@media(max-width:620px){.ui-brain [data-kpi]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;

function active(pathname: string) {
  if (pathname === "/business-brain") return BRAIN_TABS[0];
  return [...BRAIN_TABS.slice(1)].sort((a, b) => b.href.length - a.href.length).find((t) => pathname.startsWith(t.href)) ?? BRAIN_TABS[0];
}

export function BrainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = active(pathname);
  const role = useAuthStore((s) => s.user?.role);
  const branch = useBrainStore((s) => s.branch);
  const setBranch = useBrainStore((s) => s.setBranch);
  const scope = useBrainScope();
  const { data: scopes } = useQuery({ queryKey: ["brain-scope"], queryFn: fetchBrainScope, staleTime: 300000 });
  const { data: command, dataUpdatedAt, isFetching } = useQuery({ queryKey: ["brain-command", scope], queryFn: () => fetchCommand(scope), refetchInterval: 120000 });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const age = dataUpdatedAt ? Math.max(0, Math.round((now - dataUpdatedAt) / 60000)) : null;
  const fresh = isFetching && !command ? "Reading…" : age === null ? "Reading…" : age < 1 ? "Read just now" : `Read ${age} min ago`;
  const stale = age !== null && age >= 10;

  const title = useMemo(
    () => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
        <span style={{ width: "38px", height: "38px", borderRadius: "11px", background: "#0A1B2A", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
          <Icon d="M12 3a4 4 0 0 0-4 4 3 3 0 0 0-.5 5.9A3.5 3.5 0 0 0 11 21h1V3Zm0 0a4 4 0 0 1 4 4 3 3 0 0 1 .5 5.9A3.5 3.5 0 0 1 13 21h-1M8 9.5h2.5M16 9.5h-2.5M9 14h3M15 14h-3" size={20} stroke="#39E28B" width={1.7} />
        </span>
        Business Brain
      </span>
    ),
    [],
  );

  const actions = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {scopes && scopes.branches.length > 1 && (
          <select
            aria-label="Branch"
            value={branch ?? scopes.own}
            onChange={(e) => setBranch(e.target.value === scopes.own ? undefined : e.target.value)}
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "40px" }}
          >
            <option value="all">All branches</option>
            {scopes.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <span
          title="How long ago this reading was taken from your records. It refreshes every two minutes."
          style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${stale ? "#FDE3B3" : "#D5EFE0"}`, background: stale ? "#FFFBF2" : "#F7FCF9", borderRadius: "20px", padding: "8px 13px", fontSize: "11.5px", fontWeight: 700, color: stale ? "#B54708" : "#0E8442", minHeight: "40px", whiteSpace: "nowrap" }}
        >
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: stale ? "#F79009" : "#12A150", animation: "bbpulse 2.4s ease-in-out infinite" }} />
          {fresh}
        </span>
        <button
          type="button"
          onClick={() => {
            if (tab.key !== "command") router.push("/business-brain");
            setTimeout(() => document.getElementById("bb-ask")?.focus(), tab.key === "command" ? 0 : 400);
          }}
          style={{ display: "flex", alignItems: "center", gap: "7px", background: "#0A1B2A", border: 0, borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", whiteSpace: "nowrap" }}
        >
          <Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" />
          Ask Business Brain
        </button>
      </div>
    ),
    [scopes, branch, setBranch, fresh, stale, tab.key, router],
  );

  useModuleHeader({ title, subtitle: "Your business, understood as one connected system.", actions });

  const badges = command?.badges;
  return (
    <div className="ui-brain" style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 25, background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: "2px", overflowX: "auto" }}>
        {BRAIN_TABS.map((t) => {
          const on = t.key === tab.key;
          const badge = t.key === "command" ? badges?.command : t.key === "decisions" ? badges?.decisions : t.key === "actions" ? badges?.actions : undefined;
          const red = t.key === "command";
          return (
            <Link
              key={t.key}
              href={t.href}
              className="bb-tab"
              style={{ position: "relative", display: "flex", alignItems: "center", gap: "7px", padding: "13px 12px 14px", fontSize: "12.5px", fontWeight: on ? 700 : 500, color: on ? "#0E8442" : "#475467", whiteSpace: "nowrap", minHeight: "46px", textDecoration: "none" }}
            >
              <Icon d={t.d} />
              {t.label}
              {!!badge && <span style={{ fontSize: "10px", fontWeight: 800, color: red ? "#B42318" : "#B54708", background: red ? "#FEF3F2" : "#FEF6E7", borderRadius: "20px", padding: "1px 7px" }}>{badge}</span>}
              <span style={{ position: "absolute", left: "8px", right: "8px", bottom: 0, height: "2.5px", borderRadius: "3px", background: on ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
        {role && (
          <span style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>
            Viewing as {role.charAt(0).toUpperCase() + role.slice(1)}
          </span>
        )}
      </div>
      <main style={{ flex: 1, padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: "15px", minWidth: 0 }}>{children}</main>
      <BrainOverlays />
    </div>
  );
}
