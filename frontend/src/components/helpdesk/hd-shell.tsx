"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { hdApi, hdDownload, hdQs } from "@/lib/helpdesk-api";
import { useHd, useWorkspace } from "./hd-store";
import { useHdActions } from "./hd-actions";
import { Banner, Gate, HD_STYLES, LOCK, Skeleton, Svg, Toast, WARN } from "./hd-render";
import { HdOverlays } from "./hd-overlays";
import { TABS, btn, errText, screenOf, type Btn } from "./hd-core";

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const agoShort = (ms: number) => {
  const m = ms / 60000;
  if (m < 1) return "just now";
  if (m < 60) return Math.round(m) + "m ago";
  return Math.floor(m / 60) + "h ago";
};

export function HelpdeskShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { key, number } = screenOf(pathname);
  const wsq = useWorkspace();
  const ws = wsq.data;
  const act = useHdActions(ws);
  const range = useHd((s) => s.range);
  const branch = useHd((s) => s.branch);
  const set = useHd((s) => s.set);
  const toast = useHd((s) => s.toast);
  const refreshing = useHd((s) => s.refreshing);
  const cur = useHd((s) => s.cur);
  const tf = useHd((s) => s.tf);
  const sort = useHd((s) => s.sort);
  const sel = useHd((s) => s.sel);
  const pageNumbers = useHd((s) => s.pageNumbers);
  const now = useNow(30_000);
  const online = useOnline();

  useEffect(() => {
    if (number) set({ cur: number });
  }, [number, set]);

  const T = TABS.find((t) => t[0] === key) ?? TABS[0];
  const title = key === "detail" ? "Helpdesk" : T[3];
  const sub = key === "detail" ? `Ticket ${number ?? ""}` : T[4];
  const lastSync = wsq.dataUpdatedAt || now;
  const stale = now - lastSync > 15 * 60000;
  const fresh = refreshing
    ? { label: "Refreshing…", bg: "#F2F4F7", bd: "#E6EAF0", fg: "#475467", dot: "#98A2B3" }
    : !online
      ? { label: "Offline · synced " + agoShort(now - lastSync), bg: "#FEF3F2", bd: "#FDD9D6", fg: "#B42318", dot: "#F04438" }
      : stale
        ? { label: "Stale · synced " + agoShort(now - lastSync), bg: "#FEF6E7", bd: "#FDE3B3", fg: "#B54708", dot: "#F79009" }
        : { label: "Live · synced " + agoShort(now - lastSync), bg: "#F7FCF9", bd: "#D1F2DF", fg: "#0E8442", dot: "#12A150" };

  const refresh = useMemo(
    () => async () => {
      set({ refreshing: true });
      try {
        await hdApi.refresh();
        await act.invalidate();
        act.flash("Helpdesk refreshed · SLA timers re-evaluated.");
      } catch (e) {
        act.flash("Refresh failed — " + errText(e) + " Showing last synced data.");
      } finally {
        set({ refreshing: false });
      }
    },
    [act, set],
  );
  const can = act.can;
  const titleNode = useMemo(
    () => (
      <span style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <span style={{ width: "38px", height: "38px", borderRadius: "11px", background: "#0A1B2A", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
          <Svg d={T[5]} size={20} sw={1.8} stroke="#39E28B" />
        </span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ margin: 0, fontSize: "21px", fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", lineHeight: 1.2, whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ margin: "3px 0 0", fontSize: "12px", color: "#667085", fontWeight: 400, letterSpacing: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
        </span>
      </span>
    ),
    [T, title, sub],
  );

  const showRange = key === "overview" || key === "analytics";
  const showBranch = ["overview", "tickets", "queues", "sla", "analytics"].includes(key);
  const actions = useMemo(() => {
  const manager = act.manager;
  const H: Record<string, Btn[]> = {
    overview: [btn("new", "+ New Ticket", "primary", !can("Reply")), btn("all", "View All Tickets")],
    tickets: [btn("export", "Export"), btn("bulk", "Bulk Actions"), btn("new", "+ New Ticket", "primary", !can("Reply"))],
    detail: [],
    queues: [btn("asgset", "Assignment Settings"), btn("newq", "+ Create Queue", "primary", !manager)],
    sla: [btn("newrule", "+ New Escalation Rule", "ghost", !can("Manage SLA")), btn("newsla", "+ New SLA Policy", "primary", !can("Manage SLA"))],
    kb: [btn("newcat", "+ New Category", "ghost", !manager), btn("newart", "+ New Article", "primary")],
    macros: [btn("newreply", "+ New Saved Reply"), btn("newmacro", "+ New Macro", "primary", !manager, "Macros are managed by Owners and Managers")],
    csat: [btn("survey", "Survey Settings", "ghost", !manager)],
    analytics: [],
    settings: [],
  };
  const hdrAct = async (k: string) => {
    if (k === "new") return act.openModal("new");
    if (k === "all") return act.tfGo({});
    if (k === "newq") return act.openModal("queueEdit", { id: null });
    if (k === "asgset") {
      set({ sec: "assignment" });
      return act.go("settings");
    }
    if (k === "newsla") return act.openModal("sla", { id: null });
    if (k === "newrule") return act.openModal("rule", { id: null });
    if (k === "newart") return act.openModal("article", { id: null });
    if (k === "newcat") return act.openModal("category");
    if (k === "newreply") {
      set({ mTab: "replies" });
      return act.openModal("reply", { id: null });
    }
    if (k === "newmacro") {
      set({ mTab: "macros" });
      return act.openModal("macro", { id: null });
    }
    if (k === "survey") return act.openModal("survey");
    if (k === "bulk") {
      if (sel.length) return act.flash("Bulk actions are in the green bar above the table.");
      set({ sel: pageNumbers });
      return act.flash(pageNumbers.length + " tickets on this page selected — choose a bulk action.");
    }
    if (k === "export") {
      try {
        const n = await hdDownload(`/tickets/export${hdQs({ ...tf, sort, branch })}`, "helpdesk-tickets.csv");
        act.flash(`Exported ${n} tickets matching your filters.`);
      } catch (e) {
        act.flash("Export failed — " + errText(e));
      }
    }
  };

  const branches = ws?.branches ?? [];

  const selSt = { border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "40px" };
  return (
    <div className="ui-hd" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      {showRange && (
        <select aria-label="Date range" value={range} onChange={(e) => set({ range: e.target.value })} style={selSt}>
          {["Today", "7 days", "30 days", "90 days"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      {showBranch && (
        <select aria-label="Branch scope" value={branch} onChange={(e) => set({ branch: e.target.value, sel: [], page: 0 })} style={selSt}>
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <span role="status" data-hidesm="1" style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${fresh.bd}`, background: fresh.bg, borderRadius: "20px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: fresh.fg, minHeight: "40px", whiteSpace: "nowrap" }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: fresh.dot, animation: "hdpulse 2.4s ease-in-out infinite" }} />
        {fresh.label}
      </span>
      <button type="button" className="hd-ref" onClick={() => void refresh()} aria-label="Refresh" title="Refresh" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", cursor: "pointer", color: "#344054" }}>
        <Svg d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
      </button>
      {ws &&
        (H[key] ?? []).map((a) => (
          <button key={a.k} type="button" onClick={() => void hdrAct(a.k)} disabled={a.dis} title={a.why} style={{ display: "flex", alignItems: "center", gap: "6px", border: `1px solid ${a.bd}`, background: a.bg, borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 800, color: a.fg, cursor: "pointer", minHeight: "40px", whiteSpace: "nowrap" }}>
            {a.t}
          </button>
        ))}
    </div>
  );

  }, [act, can, ws, key, range, branch, set, sel, pageNumbers, tf, sort, showRange, showBranch, fresh.label, fresh.bg, fresh.bd, fresh.fg, fresh.dot, refresh]);

  useModuleHeader({ title: titleNode, actions });

  const err = wsq.error;
  const forbidden = err instanceof ApiError && err.status === 403;
  const breached = ws?.breached ?? 0;
  const tabs = TABS.filter((t) => t[0] !== "detail" || cur);

  let body: ReactNode = children;
  if (wsq.isLoading) body = <Skeleton />;
  else if (forbidden)
    body = (
      <Gate
        t="You don’t have access to Helpdesk"
        d={errText(err)}
        icon={LOCK}
        bg="#F2F4F7"
        fg="#475467"
        meta="GET /helpdesk/workspace → 403 Forbidden"
        acts={[{ ...btn("reqaccess", "Request access", "primary"), on: () => void hdApi.requestAccess().then((r) => act.flash(r.notified ? `Access request sent to ${r.notified} owner${r.notified > 1 ? "s" : ""}.` : "No owner could be notified.")).catch((e) => act.flash(errText(e))) }]}
      />
    );
  else if (err || !ws)
    body = (
      <Gate
        t="Couldn’t load Helpdesk"
        d={`The Helpdesk service didn’t respond. Nothing you saved has been lost. ${errText(err)}`}
        icon={WARN}
        bg="#FEF3F2"
        fg="#B42318"
        meta={`GET /helpdesk/workspace → ${err instanceof ApiError ? err.status : "no response"}`}
        acts={[{ ...btn("retry", wsq.isFetching ? "Retrying…" : "Retry", "primary"), on: () => void wsq.refetch() }]}
      />
    );
  else if (key === "analytics" && !can("View analytics"))
    body = <Gate t="Analytics isn’t available for your role" d="Helpdesk Analytics needs the “View analytics” permission. Your own queue stats are on the Overview." icon={LOCK} bg="#F2F4F7" fg="#475467" meta="GET /helpdesk/analytics → 403" acts={[{ ...btn("toov", "Go to Overview", "primary"), on: () => act.go("overview") }]} />;

  const banner = !ws
    ? null
    : !online
      ? { t: "You’re offline", d: "Showing data from the last sync. Replies, notes and changes will not be saved until you reconnect — nothing is queued silently.", bg: "#FEF3F2", bd: "#FDD9D6", fg: "#B42318", acts: [{ k: "refresh", t: "Try again", on: () => void refresh() }] }
      : stale
        ? { t: "Data may be out of date", d: `Last synced ${agoShort(now - lastSync)}. SLA timers are still calculated live, but new tickets and replies may be missing.`, bg: "#FEF6E7", bd: "#FDE3B3", fg: "#B54708", acts: [{ k: "refresh", t: "Refresh now", on: () => void refresh() }] }
        : null;

  return (
    <div className="ui-hd" style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{HD_STYLES}</style>
      <nav aria-label="Helpdesk" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: "2px", overflowX: "auto", overflowY: "hidden", position: "sticky", top: 0, zIndex: 25 }}>
        {tabs.map((t) => {
          const on = t[0] === key;
          const href = t[0] === "detail" ? `/helpdesk/tickets/${encodeURIComponent(cur ?? "")}` : t[2];
          const badge = (t[0] === "tickets" || t[0] === "sla") && breached ? `${breached} breached` : null;
          return (
            <Link key={t[0]} href={href} className="hd-tab" aria-current={on ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: "7px", padding: "13px 11px 14px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: "46px", textDecoration: "none" }}>
              {t[0] === "detail" ? "#" + cur : t[1]}
              {badge ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: "20px", padding: "1px 7px" }}>{badge}</span> : null}
              <span style={{ position: "absolute", left: "8px", right: "8px", bottom: 0, height: "2.5px", borderRadius: "3px", background: on ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
        {ws ? (
          <button
            type="button"
            className="hd-ref"
            onClick={() => set({ drawer: { kind: "role" } })}
            title="See what your role can do in Helpdesk"
            style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 700, color: "#475467", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Viewing as {ws.me.role} · {ws.me.name}
          </button>
        ) : null}
      </nav>
      <main style={{ flex: 1, padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        {banner && !forbidden ? <Banner {...banner} /> : null}
        {body}
      </main>
      {ws ? <HdOverlays ws={ws} /> : null}
      {toast ? <Toast msg={toast} /> : null}
    </div>
  );
}
