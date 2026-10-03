"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { amApi, type AmScreen, type AmSettingsView } from "@/lib/assets-api";
import { BtnV, FieldRow, Gate, PAY_STYLES, Rows, Skeleton, Svg } from "@/components/payments/pay-render";
import { AM_PATH, errText, useAmActions } from "./am-actions";
import { amScopeOf, getPath, setPath, useAm } from "./am-store";
import { AmDrawerView, AmModalView, AmToast } from "./am-overlays";

const ICON = "M21 16V8l-9-5-9 5v8l9 5ZM12 12l9-4M12 12 3 8M12 12v9";
const LABELS: Record<string, string> = { overview: "Overview", register: "Asset Register", detail: "Asset Detail", taxonomy: "Categories & Locations", requests: "Requests", workorders: "Work Orders", pm: "Preventive", history: "Inspections & History", analytics: "Downtime & Analytics", settings: "Settings" };

/** Route → tab (and asset id for the detail screen). */
const routeOf = (path: string): { tab: string; cur?: string } => {
  const rest = path.replace(/^\/assets-maintenance\/?/, "");
  const m = /^assets\/([^/]+)/.exec(rest);
  if (m) return { tab: "detail", cur: decodeURIComponent(m[1]) };
  const seg = rest.split("/")[0];
  return { tab: Object.keys(AM_PATH).find((k) => k !== "detail" && AM_PATH[k] === (seg ? `/${seg}` : "")) ?? "overview" };
};

/** Assets & Maintenance shell. Route pages render nothing — the shell draws the screen for the route. */
export function AssetsShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const route = routeOf(pathname);
  const set = useAm((s) => s.set);
  const st = useAm(useShallow((s) => ({ tab: s.tab, cur: s.cur, sel: s.sel })));
  useEffect(() => {
    if (st.tab !== route.tab || (route.cur && st.cur !== route.cur)) set({ tab: route.tab, ...(route.cur ? { cur: route.cur } : {}), drawer: null, sel: route.tab === st.tab ? st.sel : [] });
  }, [route.tab, route.cur, st.tab, st.cur, st.sel, set]);
  const scope = useAm(useShallow(amScopeOf));
  const q = { ...scope, tab: route.tab, cur: route.cur ?? scope.cur };

  const optQ = useQuery({ queryKey: ["am", "options"], queryFn: amApi.options, staleTime: 30_000 });
  const scrQ = useQuery({ queryKey: ["am", "screen", q], queryFn: () => amApi.screen(q), enabled: !!optQ.data, refetchInterval: 60_000, placeholderData: (prev) => (prev && (prev.settings ? "settings" : "") === (route.tab === "settings" ? "settings" : "") ? prev : undefined) });
  const scr: AmScreen | undefined = scrQ.data;
  const A = useAmActions(optQ.data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useAm.getState();
      if (s.modal) s.closeModal();
      else if (s.drawer) s.set({ drawer: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const head = scr?.head;
  const titleNode = useMemo(
    () => (
      <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: "#0A1B2A", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
          <Svg d={head?.icon ?? ICON} size={20} stroke="#39E28B" />
        </span>
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{head?.title ?? "Assets & Maintenance"}</span>
      </span>
    ),
    [head?.icon, head?.title],
  );
  const subtitle = useMemo(() => <span style={{ fontSize: 12, color: "#667085" }}>{head?.sub ?? "Monitor asset health, upcoming maintenance, downtime and reliability."}</span>, [head?.sub]);
  const headerActs = useMemo(
    () =>
      head?.hdrActs.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {head.hdrActs.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => A.top(a.k)} style={{ borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, minHeight: 40 }} />
          ))}
        </div>
      ) : null,
    [head, A],
  );
  useModuleHeader({ title: titleNode, subtitle, actions: headerActs });

  const loaded = head ? new Date(head.loadedAt) : null;
  const err = optQ.error ?? scrQ.error;
  const forbidden = err instanceof ApiError && err.status === 403;
  let body: ReactNode;
  if (optQ.isLoading || (scrQ.isLoading && !scr)) body = <Skeleton />;
  else if (forbidden) body = <Gate t="You don’t have access to Assets & Maintenance" d={errText(err)} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" />;
  else if (err || !scr)
    body = (
      <Gate
        t="Couldn’t load Assets & Maintenance"
        d={`The assets service didn’t respond. No data was changed — assets, work orders and schedules are safe. ${errText(err)}`}
        icon="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        bg="#FEF3F2"
        fg="#B42318"
        act={
          <button type="button" onClick={() => { void optQ.refetch(); void scrQ.refetch(); }} style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>
            Retry
          </button>
        }
      />
    );
  else if (scr.settings) body = <SettingsBody se={scr.settings} onBtn={A.settingsBtn} after={A.after} />;
  else body = <Rows rows={scr.rows ?? []} h={{ ...A.handlers, sel: st.sel }} />;

  const tabs = head?.tabs ?? Object.keys(AM_PATH).map((k) => ({ k, label: LABELS[k], path: AM_PATH[k], badge: null }));
  return (
    <div className="ui-pay" style={{ minHeight: "100%", background: "#F4F6F8", fontFamily: "inherit" }}>
      <style>{PAY_STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
        <nav aria-label="Assets & Maintenance" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {tabs.map((t) => {
            const on = t.k === route.tab;
            const href = `/assets-maintenance${t.k === "detail" ? (scope.cur ? `/assets/${scope.cur}` : "/assets") : t.path}`;
            return (
              <Link key={t.k} href={href} className="ph-tab" aria-current={on ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 11px 14px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
                {t.label}
                {t.badge ? <span style={{ fontSize: 10, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 20, padding: "1px 7px" }}>{t.badge}</span> : null}
                <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: on ? "#12A150" : "transparent" }} />
              </Link>
            );
          })}
          {head ? <span title="Your role in Assets & Maintenance" style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>Viewing as {head.roleLabel}</span> : null}
        </nav>
        {head ? (
          <div aria-label="Scope and filters" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 22px", borderBottom: "1px solid #E6EAF0", background: "#fff" }}>
            {head.sels.map((f) => (
              <select key={f.k} aria-label={f.l} value={f.v} onChange={(e) => set(f.k === "branch" ? { branch: e.target.value, page: {}, sel: [] } : { period: e.target.value })} style={{ border: `1px solid ${f.v ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 210 }}>
                {f.opts.map((o) => (
                  <option key={o.v} value={o.v}>{o.t}</option>
                ))}
              </select>
            ))}
            <select aria-label="More" value="" onChange={(e) => e.target.value && A.top(e.target.value)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40 }}>
              <option value="">More…</option>
              {head.more.map((o) => (
                <option key={o.v} value={o.v}>{o.t}</option>
              ))}
            </select>
            <button type="button" role="status" onClick={() => A.top("fresh")} title="Data freshness" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, border: "1px solid #D1F2DF", background: "#F7FCF9", borderRadius: 20, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", minHeight: 40, whiteSpace: "nowrap", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#12A150", animation: "pypulse 2.4s ease-in-out infinite" }} />
              {scrQ.isFetching ? "Refreshing…" : `Live · loaded ${loaded ? loaded.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`}
            </button>
            <button type="button" onClick={() => A.top("refresh")} aria-label="Refresh" title="Refresh" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, cursor: "pointer", color: "#344054" }}>
              <Svg d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" size={16} w={2} />
            </button>
          </div>
        ) : null}
      </div>
      <main data-main="1" data-screen-label={scr?.screenLabel} style={{ padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {body}
        {children}
      </main>
      <AmDrawerView onAct={A.drawerAct} onItem={A.onItem} />
      <AmModalView />
      <AmToast />
      <LeaveGuard />
    </div>
  );
}

/** Warns before leaving Settings with unsaved changes. */
function LeaveGuard() {
  const dirty = useAm((s) => s.tab === "settings" && Object.keys(s.draft).length > 0);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  return null;
}

function SettingsBody({ se, onBtn, after }: { se: AmSettingsView; onBtn: (k: string, saved?: Record<string, unknown>) => void; after: (m: string) => Promise<void> }) {
  const draft = useAm((s) => s.draft);
  const busy = useAm((s) => s.busy);
  const set = useAm((s) => s.set);
  const flash = useAm((s) => s.flash);
  const saved = se.saved as unknown as Record<string, unknown>;
  const value = (key: string) => {
    const d = getPath(draft, key);
    return d !== undefined ? d : getPath(saved, key);
  };
  const has = Object.keys(draft).length > 0;
  const dirtyOf = (k: string) => {
    if (!has) return false;
    const p = k === "perms" ? "perms" : `config.${k}`;
    return JSON.stringify(getPath(draft, p)) !== JSON.stringify(getPath(saved, p));
  };
  const dn = se.nav.filter((n) => !se.liveSecs.includes(n.k) && dirtyOf(n.k)).length;
  const save = async () => {
    set({ busy: true });
    try {
      const r = await amApi.saveSettings({ expectedVersion: se.v, config: draft.config, perms: draft.perms });
      set({ draft: {}, busy: false });
      await after(r.changed.length ? `Settings saved (v${r.version}) · audited.` : "No changes to save.");
    } catch (e) {
      set({ busy: false });
      flash(errText(e));
    }
  };
  return (
    <>
      <div data-screen-label="10 Asset Settings" data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <nav data-setnav="1" aria-label="Settings sections" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 6, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 130 }}>
          {se.nav.map((n) => {
            const on = n.k === se.sec.k;
            return (
              <button key={n.k} type="button" onClick={() => set({ sec: n.k })} aria-current={on ? "page" : undefined} style={{ border: 0, background: on ? "#ECFDF3" : "transparent", textAlign: "left", borderRadius: 9, padding: "10px 11px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#344054", cursor: "pointer", whiteSpace: "nowrap", display: "flex", justifyContent: "space-between", gap: 8, minHeight: 40, alignItems: "center" }}>
                {n.t}
                {!se.liveSecs.includes(n.k) && dirtyOf(n.k) ? <span aria-label="Unsaved" style={{ width: 7, height: 7, borderRadius: "50%", background: "#F79009" }} /> : null}
              </button>
            );
          })}
        </nav>
        <section style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden", minWidth: 0 }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{se.sec.t}</div>
              <div style={{ fontSize: 12, color: "#667085", marginTop: 3, lineHeight: 1.45 }}>{se.sec.d}{se.liveSecs.includes(se.sec.k) ? " Changes here save immediately." : ""}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#667085" }}>Settings v{se.v}</span>
          </div>
          {se.readOnly ? <div style={{ margin: "14px 18px 0", background: "#FAFBFC", border: "1px solid #E6EAF0", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#475467" }}>{se.roText}</div> : null}
          <div style={{ padding: "6px 18px 18px" }}>
            {se.fields.map((f, i) => (
              <FieldRow key={`${f.key}|${i}`} f={f} value={f.key ? value(f.key) : undefined} onBtn={(k) => onBtn(k, saved)} onSet={(v) => set((s) => ({ draft: setPath(Object.keys(s.draft).length ? s.draft : JSON.parse(JSON.stringify(saved)), f.key, v === "" && f.type === "number" ? null : v) }))} />
            ))}
          </div>
        </section>
      </div>
      {dn > 0 ? (
        <div role="region" aria-label="Unsaved changes" style={{ position: "sticky", bottom: 14, background: "#0A1B2A", borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 14px 40px rgba(10,27,42,.25)" }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "#E7EEF4", fontWeight: 600 }}>{dn} section(s) changed. Saving creates settings v{se.v + 1} and an audit record.</span>
          <button type="button" onClick={() => set({ draft: {} })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: 9, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: 38 }}>Discard</button>
          <button type="button" disabled={busy} onClick={() => void save()} style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "9px 15px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 38 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      ) : null}
    </>
  );
}
