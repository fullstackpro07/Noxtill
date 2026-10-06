"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { fsApi, type FsScreen, type FsSettingsView } from "@/lib/field-service-api";
import { BtnV, FieldRow, Gate, PAY_STYLES, Rows, Skeleton, Svg } from "@/components/payments/pay-render";
import { getPath, setPath } from "@/components/assets/am-store";
import { FS_PATH, errText, useFsActions } from "./fs-actions";
import { fsScopeOf, useFs } from "./fs-store";
import { FsDrawerView, FsModalView, FsToast } from "./fs-overlays";
import { clearSynced, queueInit, syncQueue, useFsQueue } from "./fs-offline";

const ICON = "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5Z";
const LABELS: Record<string, string> = { overview: "Overview", requests: "Requests", workorders: "Work Orders", dispatch: "Dispatch", calendar: "Calendar", map: "Map", technician: "Technician", inspections: "Inspections", parts: "Parts", labor: "Time & Labor", equipment: "Equipment", pm: "Preventive", agreements: "Agreements", warranty: "Warranty", settings: "Settings" };

/** Route → tab (and work order id for the detail screen). */
const routeOf = (path: string): { tab: string; cur?: string } => {
  const rest = path.replace(/^\/field-service\/?/, "");
  const m = /^work-orders\/([^/]+)/.exec(rest);
  if (m) return { tab: "detail", cur: decodeURIComponent(m[1]) };
  const seg = rest.split("/")[0];
  return { tab: Object.keys(FS_PATH).find((k) => k !== "detail" && FS_PATH[k] === (seg ? `/${seg}` : "")) ?? "overview" };
};

/** Field Service shell. Route pages render nothing — the shell draws the screen for the route. */
export function FieldServiceShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const route = routeOf(pathname);
  const set = useFs((s) => s.set);
  const st = useFs(useShallow((s) => ({ tab: s.tab, cur: s.cur, sel: s.sel })));
  useEffect(() => {
    if (st.tab !== route.tab || (route.cur && st.cur !== route.cur)) set({ tab: route.tab, ...(route.cur ? { cur: route.cur } : {}), drawer: null, sel: route.tab === st.tab ? st.sel : [] });
  }, [route.tab, route.cur, st.tab, st.cur, st.sel, set]);
  const scope = useFs(useShallow(fsScopeOf));
  const q = { ...scope, tab: route.tab, cur: route.cur ?? scope.cur };

  const optQ = useQuery({ queryKey: ["fs", "options"], queryFn: fsApi.options, staleTime: 30_000 });
  const scrQ = useQuery({ queryKey: ["fs", "screen", q], queryFn: () => fsApi.screen(q), enabled: !!optQ.data, refetchInterval: 60_000, placeholderData: (prev) => (prev && !!prev.settings === (route.tab === "settings") ? prev : undefined) });
  const scr: FsScreen | undefined = scrQ.data;
  const A = useFsActions(optQ.data);

  // Device queue + connectivity: replay queued technician actions when the connection returns.
  const online = useFsQueue((s) => s.online);
  useEffect(() => {
    queueInit();
    const q2 = useFsQueue.getState();
    q2.setOnline(navigator.onLine);
    const up = () => {
      useFsQueue.getState().setOnline(true);
      void syncQueue().then((r) => (r.synced || r.failed ? A.after(`Back online — synced ${r.synced}${r.failed ? `, ${r.failed} failed (see queue)` : ""}.`) : undefined));
    };
    const down = () => useFsQueue.getState().setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [A]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useFs.getState();
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
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{head?.title ?? "Field Service"}</span>
      </span>
    ),
    [head?.icon, head?.title],
  );
  const subtitle = useMemo(() => <span style={{ fontSize: 12, color: "#667085" }}>{head?.sub ?? "Manage requests, work orders, dispatch and technician execution."}</span>, [head?.sub]);
  const fetching = scrQ.isFetching;
  const headerActs = useMemo(
    () =>
      head ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {head.sels.map((f) => (
            <select key={f.k} aria-label={f.l} value={f.v} onChange={(e) => set({ zone: e.target.value, page: {}, sel: [] })} style={{ border: `1px solid ${f.v ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 210 }}>
              {f.opts.map((o) => (
                <option key={o.v} value={o.v}>{o.t}</option>
              ))}
            </select>
          ))}
          <select aria-label="More" value="" onChange={(e) => e.target.value && A.top(e.target.value)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 210 }}>
            <option value="">More…</option>
            {head.more.map((o) => (
              <option key={o.v} value={o.v}>{o.t}</option>
            ))}
          </select>
          {head.lock ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#B54708", background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: 20, padding: "7px 11px" }}>🔒 {head.lock}</span> : null}
          <span role="status" data-hidesm="1" style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${!online ? "#FDD9D6" : fetching ? "#D1E9FF" : "#D1F2DF"}`, background: !online ? "#FEF3F2" : fetching ? "#EFF8FF" : "#F7FCF9", borderRadius: 20, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: !online ? "#B42318" : fetching ? "#175CD3" : "#0E8442", minHeight: 40, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: !online ? "#F04438" : fetching ? "#2E90FA" : "#12A150", animation: "pypulse 2.4s ease-in-out infinite" }} />
            {!online ? "Offline · device queue" : fetching ? "Syncing…" : `Synced ${new Date(head.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          <button type="button" onClick={() => A.top("refresh")} aria-label="Refresh" title="Refresh" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, cursor: "pointer", color: "#344054" }}>
            <Svg d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" size={16} w={2} />
          </button>
          {head.hdrActs.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => A.top(a.k)} style={{ borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, minHeight: 40 }} />
          ))}
        </div>
      ) : null,
    [head, A, set, fetching, online],
  );
  useModuleHeader({ title: titleNode, subtitle, actions: headerActs });

  const err = optQ.error ?? scrQ.error;
  const forbidden = err instanceof ApiError && err.status === 403;
  let body: ReactNode;
  if (optQ.isLoading || (scrQ.isLoading && !scr)) body = <Skeleton />;
  else if (forbidden) body = <Gate t="You don’t have access to Field Service" d={errText(err)} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" />;
  else if (err || !scr)
    body = (
      <Gate
        t="Couldn’t load Field Service"
        d={`The field-service API didn’t respond. Technicians’ offline queues are safe on their devices; nothing was changed. ${errText(err)}`}
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
  else if (scr.gate) body = <Gate t={scr.gate.t} d={scr.gate.d} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" act={<button type="button" onClick={() => A.go(head?.techOnly ? "technician" : "overview")} style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>Go to my home</button>} />;
  else if (scr.settings) body = <SettingsBody se={scr.settings} onBtn={A.settingsBtn} after={A.after} />;
  else
    body = (
      <>
        {route.tab === "technician" ? <OfflineQueue maxHours={optQ.data?.cfg.offline.maxHours ?? 12} enabled={optQ.data?.cfg.offline.enabled ?? true} onSync={() => A.top("sync")} /> : null}
        <Rows rows={scr.rows ?? []} h={{ ...A.handlers, sel: st.sel }} />
      </>
    );

  const tabs = head?.tabs ?? Object.keys(FS_PATH).filter((k) => k !== "detail").map((k) => ({ k, label: LABELS[k], path: FS_PATH[k], badge: null }));
  return (
    <div className="ui-pay" style={{ minHeight: "100%", background: "#F4F6F8", fontFamily: "inherit" }}>
      <style>{PAY_STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
        <nav aria-label="Field Service" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {tabs.map((t) => {
            const on = t.k === route.tab;
            const href = `/field-service${t.k === "detail" ? `/work-orders/${scope.cur}` : t.path}`;
            return (
              <Link key={t.k} href={href} className="ph-tab" aria-current={on ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 11px 14px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
                {t.label}
                {t.badge ? <span style={{ fontSize: 10, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 20, padding: "1px 7px" }}>{t.badge}</span> : null}
                <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: on ? "#12A150" : "transparent" }} />
              </Link>
            );
          })}
          {head ? <span title="Your role in Field Service" style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>Viewing as {head.roleLabel}</span> : null}
        </nav>
      </div>
      <main data-main="1" data-screen-label={scr?.screenLabel} style={{ padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {!online && scr && !scr.gate ? (
          <div role="alert" style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 14, padding: "13px 15px" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#B42318" }}>You’re offline</div>
              <div style={{ fontSize: 12, color: "#344054", marginTop: 3, lineHeight: 1.5 }}>Offline-safe technician actions (status taps, checklist, notes, signature, completion) save on this device as Pending Sync. Dispatch, parts and invoice handoffs wait until you reconnect.</div>
            </div>
          </div>
        ) : null}
        {body}
        {children}
      </main>
      <FsDrawerView onAct={A.drawerAct} onDecide={A.onDecide} />
      <FsModalView />
      <FsToast />
      <LeaveGuard />
    </div>
  );
}

/** Device queue of offline technician actions (fs-core.js vTechnician offline queue). */
function OfflineQueue({ maxHours, enabled, onSync }: { maxHours: number; enabled: boolean; onSync: () => void }) {
  const items = useFsQueue((s) => s.items);
  const online = useFsQueue((s) => s.online);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!items.length && online) return null;
  const pending = items.filter((x) => x.st !== "Synced").length;
  const C: Record<string, [string, string]> = { "Pending Sync": ["#B54708", "#FEF6E7"], Syncing: ["#175CD3", "#EFF8FF"], Synced: ["#0E8442", "#ECFDF3"], Failed: ["#B42318", "#FEF3F2"] };
  return (
    <section aria-label="Offline queue" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #F2F4F7" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>Offline queue</h2>
          <div style={{ fontSize: 11.5, color: "#667085", marginTop: 3, lineHeight: 1.45 }}>
            {!enabled ? "Offline mode is off in Settings — actions need a connection." : online ? `${pending} action(s) waiting to sync from this device` : "Offline — actions are saved on this device with idempotency keys and sync when you reconnect"}
          </div>
        </div>
        <button type="button" disabled={!online || !pending} onClick={onSync} style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 36 }}>Sync now</button>
        <button type="button" disabled={!items.some((x) => x.st === "Synced")} onClick={clearSynced} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 36 }}>Clear synced</button>
      </div>
      {items.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {["Action", "Job", "Queued", "Key", "State"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#667085", borderBottom: "1px solid #EEF1F4" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const old = x.st === "Pending Sync" && now - x.at > maxHours * 3600000;
                const c = C[x.st] ?? C["Pending Sync"];
                return (
                  <tr key={x.id} style={{ borderBottom: "1px solid #F2F4F7" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#101828" }}>{x.label}</td>
                    <td style={{ padding: "10px 12px" }}>{x.wo}</td>
                    <td style={{ padding: "10px 12px" }}>{new Date(x.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "ui-monospace,monospace", fontSize: 11 }}>{x.key}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 7px", background: c[1], color: c[0] }}>{x.st}</span>
                      {old ? <div style={{ fontSize: 11, color: "#B54708", marginTop: 3 }}>Older than {maxHours} h — review before syncing</div> : null}
                      {x.err ? <div style={{ fontSize: 11, color: "#B42318", marginTop: 3 }}>{x.err}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: "18px 16px", fontSize: 12, color: "#667085" }}>Nothing queued.</div>
      )}
    </section>
  );
}

/** Warns before leaving Settings with unsaved changes. */
function LeaveGuard() {
  const dirty = useFs((s) => s.tab === "settings" && Object.keys(s.draft).length > 0);
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

function SettingsBody({ se, onBtn, after }: { se: FsSettingsView; onBtn: (k: string, saved?: Record<string, unknown>) => void; after: (m: string) => Promise<void> }) {
  const draft = useFs((s) => s.draft);
  const busy = useFs((s) => s.busy);
  const set = useFs((s) => s.set);
  const flash = useFs((s) => s.flash);
  const openModal = useFs((s) => s.openModal);
  const saved = se.saved as unknown as Record<string, unknown>;
  const has = Object.keys(draft).length > 0;
  const value = (key: string) => {
    const d = has ? getPath(draft, key) : undefined;
    return d !== undefined ? d : getPath(saved, key);
  };
  const cfgOf = (x: Record<string, unknown>) => (x.config ?? {}) as Record<string, unknown>;
  const KEYS: Record<string, string[]> = { territories: ["territories", "adj", "travel"], skills: ["skills", "certs"] };
  const dirtyOf = (k: string) => has && !se.liveSecs.includes(k) && (KEYS[k] ?? [k]).some((x) => JSON.stringify(cfgOf(draft)[x]) !== JSON.stringify(cfgOf(saved)[x]));
  const dn = se.nav.filter((n) => dirtyOf(n.k)).length;
  const doSave = async (reason?: string) => {
    set({ busy: true });
    try {
      const r = await fsApi.saveSettings({ expectedVersion: se.v, config: cfgOf(draft), reason });
      set({ draft: {}, busy: false });
      await after(r.changed.length ? `Settings v${r.version} saved and audited.` : "No changes to save.");
    } catch (e) {
      set({ busy: false });
      flash(errText(e));
    }
  };
  const save = async () => {
    try {
      const df = await fsApi.diff(cfgOf(draft));
      if (!df.changes.length) return flash("No changes to save.");
      if (!df.needsReason) return void doSave();
      openModal({
        title: "High-impact settings change",
        sub: `Saves Field Service settings v${se.v + 1}`,
        primaryT: `Save v${se.v + 1}`,
        pBg: "#0A1B2A",
        fields: [
          { name: "ch", label: "Changes", type: "read", value: df.changes.join("\n") },
          { name: "reason", label: "Reason", type: "text", req: true, af: true },
        ],
        onSubmit: async (v) => {
          await doSave(String(v.reason ?? ""));
        },
      });
    } catch (e) {
      flash(errText(e));
    }
  };
  const onSet = (key: string, v: unknown, type: string) => {
    if (key.startsWith("svc:")) {
      void fsApi
        .svcActive(key.slice(4), Boolean(v))
        .then(() => after(Boolean(v) ? "Service type activated." : "Service type deactivated."))
        .catch((e) => flash(errText(e)));
      return;
    }
    let val: unknown = v;
    if (/^config\.sla\./.test(key) && typeof v === "string") val = v.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
    else if (v === "" && type === "number") val = null;
    set((s) => ({ draft: setPath(Object.keys(s.draft).length ? s.draft : JSON.parse(JSON.stringify(saved)), key, val) }));
  };
  return (
    <>
      <div data-screen-label="16 Field Service Settings" data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <nav data-setnav="1" aria-label="Settings sections" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 6, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 130 }}>
          {se.nav.map((n) => {
            const on = n.k === se.sec.k;
            return (
              <button key={n.k} type="button" onClick={() => set({ sec: n.k })} aria-current={on ? "page" : undefined} style={{ border: 0, background: on ? "#ECFDF3" : "transparent", textAlign: "left", borderRadius: 9, padding: "10px 11px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#344054", cursor: "pointer", whiteSpace: "nowrap", display: "flex", justifyContent: "space-between", gap: 8, minHeight: 40, alignItems: "center" }}>
                {n.t}
                {dirtyOf(n.k) ? <span aria-label="Unsaved" style={{ width: 7, height: 7, borderRadius: "50%", background: "#F79009" }} /> : null}
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
              <FieldRow key={`${f.key}|${i}`} f={f} value={f.key.startsWith("svc:") ? f.on : f.key ? value(f.key) : undefined} onBtn={(k) => onBtn(k, saved)} onSet={(v) => onSet(f.key, v, f.type)} />
            ))}
          </div>
        </section>
      </div>
      {has && dn > 0 ? (
        <div role="region" aria-label="Unsaved changes" style={{ position: "sticky", bottom: 14, background: "#0A1B2A", borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 14px 40px rgba(10,27,42,.25)" }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "#E7EEF4", fontWeight: 600 }}>{dn} section(s) changed. Saving creates settings v{se.v + 1} and an audit record.</span>
          <button type="button" onClick={() => set({ draft: {} })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: 9, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: 38 }}>Discard</button>
          <button type="button" disabled={busy} onClick={() => void save()} style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "9px 15px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 38 }}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      ) : null}
    </>
  );
}
