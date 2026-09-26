"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchInboxOverview } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { InboxOverlays } from "./inbox-overlays";
import { Icon } from "./inbox-ui";

interface TabDef {
  key: string;
  label: string;
  href: string;
  d: string;
}

export const INBOX_TABS: TabDef[] = [
  { key: "overview", label: "Overview", href: "/unified-inbox", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" },
  { key: "workspace", label: "Conversation", href: "/unified-inbox/conversation", d: "M8 12h8M8 8h8M8 16h5M4 4h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8l-4 3V5a1 1 0 0 1 1-1Z" },
  { key: "customer", label: "Customer 360", href: "/unified-inbox/customer", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
  { key: "timeline", label: "Timeline", href: "/unified-inbox/timeline", d: "M12 8v8M8 12h8M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20" },
  { key: "team", label: "Team Inbox", href: "/unified-inbox/team", d: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.87" },
  { key: "ai", label: "AI Assist", href: "/unified-inbox/ai", d: "m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" },
  { key: "actions", label: "AI Actions", href: "/unified-inbox/actions", d: "M20 11c0 5-3.5 7.7-7.6 9.1a1.2 1.2 0 0 1-.8 0C7.5 18.7 4 16 4 11V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1ZM9.5 12l2 2 3.5-4" },
  { key: "replies", label: "Saved Replies", href: "/unified-inbox/replies", d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4" },
  { key: "automations", label: "Automations", href: "/unified-inbox/automations", d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
  { key: "channels", label: "Channels", href: "/unified-inbox/channels", d: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" },
  { key: "analytics", label: "Analytics", href: "/unified-inbox/analytics", d: "M3 3v16a2 2 0 0 0 2 2h16M7 16v-4M12 16V8M17 16v-6" },
  { key: "attention", label: "Attention", href: "/unified-inbox/attention", d: "M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
  {
    key: "settings",
    label: "Settings",
    href: "/unified-inbox/settings",
    d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z",
  },
];

function activeTab(pathname: string): TabDef {
  if (pathname === "/unified-inbox") return INBOX_TABS[0];
  return [...INBOX_TABS.slice(1)].sort((a, b) => b.href.length - a.href.length).find((t) => pathname.startsWith(t.href)) ?? INBOX_TABS[0];
}

const STYLES = `
.ui-inbox .nx-hover-soft:hover{background:#F7FCF9}
.ui-inbox .nx-hover-soft:disabled:hover{background:#fff}
.ui-inbox .nx-primary:hover{background:#0E8442!important}
.ui-inbox .nx-primary:disabled:hover{background:#12A150!important}
.ui-inbox .nx-accent:hover{border-color:#12A150!important;color:#0E8442!important}
.ui-inbox .nx-row:hover{background:#F7FCF9!important}
.ui-inbox .nx-tab:hover{color:#0E8442!important}
.ui-inbox .nx-muted-row:hover{background:#FAFBFC!important}
.ui-inbox input:focus,.ui-inbox textarea:focus,.ui-inbox select:focus{outline:none;border-color:#12A150!important;box-shadow:0 0 0 3px rgba(18,161,80,.12)}
.ui-inbox ::-webkit-scrollbar{width:8px;height:8px}
.ui-inbox ::-webkit-scrollbar-thumb{background:#D5DCE4;border-radius:8px}
@media(max-width:1180px){.ui-inbox [data-3pane]{grid-template-columns:minmax(0,1fr)!important}.ui-inbox [data-ctx]{display:none!important}}
@media(max-width:620px){.ui-inbox [data-kpi]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;

export function InboxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tab = activeTab(pathname);
  const openModal = useInboxStore((s) => s.openModal);
  const { data: overview, dataUpdatedAt } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview, refetchInterval: 30000 });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  const ageSec = dataUpdatedAt ? Math.max(0, Math.round((now - dataUpdatedAt) / 1000)) : null;
  const synced = ageSec === null ? "Syncing…" : ageSec < 60 ? `Synced ${ageSec} sec ago` : `Synced ${Math.round(ageSec / 60)} min ago`;

  const actions = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          title="How recently this screen re-read your conversations. New messages are pulled in every 30 seconds."
          style={{ display: "flex", alignItems: "center", gap: "7px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "8px 13px", fontSize: "11.5px", fontWeight: 700, color: "#475467", minHeight: "40px", whiteSpace: "nowrap" }}
        >
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#12A150" }} />
          {synced}
        </span>
        <button
          type="button"
          onClick={() => openModal({ type: "compose" })}
          style={{ display: "flex", alignItems: "center", gap: "7px", background: "#12A150", border: 0, borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", whiteSpace: "nowrap" }}
        >
          <Icon d="M12 5v14M5 12h14" size={16} width={2.2} />
          New message
        </button>
      </div>
    ),
    [synced, openModal],
  );

  useModuleHeader({
    title: "Unified Inbox",
    subtitle: "Every customer conversation, connected to your business.",
    actions,
  });

  return (
    <div className="ui-inbox" style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 25, background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: "2px", overflowX: "auto" }}>
        {INBOX_TABS.map((t) => {
          const on = t.key === tab.key;
          const badge = t.key === "overview" ? overview?.totalUnread : t.key === "attention" ? overview?.attentionCount : undefined;
          const isAttn = t.key === "attention";
          return (
            <Link
              key={t.key}
              href={t.href}
              className="nx-tab"
              style={{ position: "relative", display: "flex", alignItems: "center", gap: "7px", padding: "13px 12px 14px", fontSize: "12.5px", fontWeight: on ? 700 : 500, color: on ? "#0E8442" : "#475467", whiteSpace: "nowrap", minHeight: "46px", textDecoration: "none" }}
            >
              <Icon d={t.d} size={15} />
              {t.label}
              {!!badge && (
                <span style={{ fontSize: "10px", fontWeight: 800, color: isAttn ? "#B42318" : "#0E8442", background: isAttn ? "#FEF3F2" : "#E8F7EE", borderRadius: "20px", padding: "1px 7px" }}>{badge}</span>
              )}
              <span style={{ position: "absolute", left: "8px", right: "8px", bottom: 0, height: "2.5px", borderRadius: "3px", background: on ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
        {overview && (
          <span
            title={overview.canManage ? "You can see every conversation." : "You see conversations assigned to you and unassigned ones."}
            style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}
          >
            Viewing as {overview.me.roleLabel}
          </span>
        )}
      </div>
      <main style={{ flex: 1, padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: "15px", minWidth: 0 }}>{children}</main>
      <InboxOverlays />
    </div>
  );
}
