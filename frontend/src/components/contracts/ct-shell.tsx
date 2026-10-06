"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { ctApi, type CtScreen, type CtSettingsView } from "@/lib/contracts-api";
import { BtnV, FieldRow, Gate, PAY_STYLES, Rows, Skeleton, Svg } from "@/components/payments/pay-render";
import { getPath, setPath } from "@/components/assets/am-store";
import { CT_PATH, errText, useCtActions } from "./ct-actions";
import { ctScopeOf, useCt } from "./ct-store";
import { CtDrawerView, CtModalView, CtToast } from "./ct-overlays";

const ICON = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-.5";
const LABELS: Record<string, string> = { overview: "Overview", documents: "Documents", templates: "Templates", contracts: "Contracts", signatures: "Signatures", approvals: "Approvals", expiries: "Expiries & Renewals", compliance: "Compliance", settings: "Settings" };

/** Route → tab (and contract number for the detail screen). */
const routeOf = (path: string): { tab: string; cur?: string } => {
  const rest = path.replace(/^\/contracts\/?/, "");
  const seg = rest.split("/")[0];
  const tab = Object.keys(CT_PATH).find((k) => k !== "detail" && CT_PATH[k] === (seg ? `/${seg}` : ""));
  if (tab) return { tab };
  return seg ? { tab: "detail", cur: decodeURIComponent(seg) } : { tab: "overview" };
};

/** Contracts shell. Route pages render nothing — the shell draws the screen for the route. */
export function ContractsShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const route = routeOf(pathname);
  const set = useCt((s) => s.set);
  const st = useCt(useShallow((s) => ({ tab: s.tab, cur: s.cur, sel: s.sel })));
  useEffect(() => {
    if (st.tab !== route.tab || (route.cur && st.cur !== route.cur)) set({ tab: route.tab, ...(route.cur ? { cur: route.cur } : {}), drawer: null, sel: route.tab === st.tab ? st.sel : [] });
  }, [route.tab, route.cur, st.tab, st.cur, st.sel, set]);
  const scope = useCt(useShallow(ctScopeOf));
  const q = { ...scope, tab: route.tab, cur: route.cur ?? scope.cur };

  const optQ = useQuery({ queryKey: ["ct", "options"], queryFn: ctApi.options, staleTime: 30_000 });
  const scrQ = useQuery({ queryKey: ["ct", "screen", q], queryFn: () => ctApi.screen(q), enabled: !!optQ.data, refetchInterval: 60_000, placeholderData: (prev) => (prev && !!prev.settings === (route.tab === "settings") ? prev : undefined) });
  const scr: CtScreen | undefined = scrQ.data;
  const A = useCtActions(optQ.data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useCt.getState();
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
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{head?.title ?? "Contracts"}</span>
      </span>
    ),
    [head?.icon, head?.title],
  );
  const subtitle = useMemo(() => <span style={{ fontSize: 12, color: "#667085" }}>{head?.sub ?? "Manage documents, contracts, approvals, signatures and renewals."}</span>, [head?.sub]);
  const fetching = scrQ.isFetching;
  const headerActs = useMemo(
    () =>
      head ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {head.sels.map((f) => (
            <select key={f.k} aria-label={f.l} value={f.v} onChange={(e) => set({ branch: e.target.value, page: {}, sel: [] })} style={{ border: `1px solid ${f.v ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 210 }}>
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
          <span role="status" data-hidesm="1" style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${fetching ? "#D1E9FF" : "#D1F2DF"}`, background: fetching ? "#EFF8FF" : "#F7FCF9", borderRadius: 20, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: fetching ? "#175CD3" : "#0E8442", minHeight: 40, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: fetching ? "#2E90FA" : "#12A150", animation: "pypulse 2.4s ease-in-out infinite" }} />
            {fetching ? "Syncing…" : `Synced ${new Date(head.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          <button type="button" onClick={() => A.top("refresh")} aria-label="Refresh" title="Refresh" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, cursor: "pointer", color: "#344054" }}>
            <Svg d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" size={16} w={2} />
          </button>
          {head.hdrActs.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => A.top(a.k)} style={{ borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, minHeight: 40 }} />
          ))}
        </div>
      ) : null,
    [head, A, set, fetching],
  );
  useModuleHeader({ title: titleNode, subtitle, actions: headerActs });

  const err = optQ.error ?? scrQ.error;
  const forbidden = err instanceof ApiError && err.status === 403;
  let body: ReactNode;
  if (optQ.isLoading || (scrQ.isLoading && !scr)) body = <Skeleton />;
  else if (forbidden) body = <Gate t="You don’t have access to Contracts" d={errText(err)} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" />;
  else if (err || !scr)
    body = (
      <Gate
        t="Couldn’t load Contracts"
        d={`The contracts API didn’t respond. Nothing was changed. ${errText(err)}`}
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
  else if (scr.gate) body = <Gate t={scr.gate.t} d={scr.gate.d} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" act={<button type="button" onClick={() => A.go("overview")} style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>Go to overview</button>} />;
  else if (scr.settings) body = <SettingsBody se={scr.settings} onBtn={A.settingsBtn} after={A.after} />;
  else body = <Rows rows={scr.rows ?? []} h={{ ...A.handlers, sel: st.sel }} />;

  const tabs = head?.tabs ?? Object.keys(CT_PATH).filter((k) => k !== "detail").map((k) => ({ k, label: LABELS[k], path: CT_PATH[k], badge: null }));
  return (
    <div className="ui-pay" style={{ minHeight: "100%", background: "#F4F6F8", fontFamily: "inherit" }}>
      <style>{PAY_STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
        <nav aria-label="Contracts" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {tabs.map((t) => {
            const on = t.k === route.tab;
            return (
              <Link key={t.k} href={`/contracts${t.path}`} className="ph-tab" aria-current={on ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 11px 14px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
                {t.label}
                {t.badge ? <span style={{ fontSize: 10, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 20, padding: "1px 7px" }}>{t.badge}</span> : null}
                <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: on ? "#12A150" : "transparent" }} />
              </Link>
            );
          })}
          {head ? <span title="Your role in Contracts" style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>Viewing as {head.roleLabel}</span> : null}
        </nav>
      </div>
      <main data-main="1" data-screen-label={scr?.screenLabel} style={{ padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {body}
        {children}
      </main>
      <CtDrawerView onAct={A.drawerAct} />
      <CtModalView />
      <CtToast />
      <LeaveGuard />
    </div>
  );
}

function SettingsBody({ se, onBtn, after }: { se: CtSettingsView; onBtn: (k: string) => void; after: (m: string) => Promise<void> }) {
  const draft = useCt((s) => s.draft);
  const busy = useCt((s) => s.busy);
  const set = useCt((s) => s.set);
  const flash = useCt((s) => s.flash);
  const saved = se.saved as unknown as Record<string, unknown>;
  const has = Object.keys(draft).length > 0;
  const value = (key: string) => {
    const d = has ? getPath(draft, key) : undefined;
    return d !== undefined ? d : getPath(saved, key);
  };
  const cfgOf = (x: Record<string, unknown>) => (x.config ?? {}) as Record<string, unknown>;
  const dirtyOf = (k: string) => has && JSON.stringify(cfgOf(draft)[k]) !== JSON.stringify(cfgOf(saved)[k]);
  const dn = se.nav.filter((n) => dirtyOf(n.k)).length;
  const save = async () => {
    set({ busy: true });
    try {
      const r = await ctApi.saveSettings({ expectedVersion: se.v, config: cfgOf(draft) });
      set({ draft: {}, busy: false });
      await after(r.changed.length ? `Settings v${r.version} saved · ${r.changed.join(", ")} · audited.` : "No changes to save.");
    } catch (e) {
      set({ busy: false });
      flash(errText(e));
    }
  };
  const onSet = (key: string, v: unknown, type: string) => {
    const val = v === "" && type === "number" ? 0 : v === "" && /UserId$|ownerId$/.test(key) ? null : v;
    set((s) => ({ draft: setPath(Object.keys(s.draft).length ? s.draft : JSON.parse(JSON.stringify(saved)), key, val) }));
  };
  return (
    <>
      <div data-screen-label="10 Document & eSign Settings" data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
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
              <div style={{ fontSize: 12, color: "#667085", marginTop: 3, lineHeight: 1.45 }}>{se.sec.d}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#667085" }}>Settings v{se.v}</span>
          </div>
          {se.readOnly ? <div style={{ margin: "14px 18px 0", background: "#FAFBFC", border: "1px solid #E6EAF0", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#475467" }}>{se.roText}</div> : null}
          <div style={{ padding: "6px 18px 18px" }}>
            {se.fields.map((f, i) => (
              <FieldRow
                key={`${f.key}|${i}`}
                f={f}
                value={f.key ? value(f.key) : undefined}
                onBtn={(k) =>
                  k === "set-validate"
                    ? void ctApi
                        .validateSettings(cfgOf(has ? draft : saved))
                        .then(() => flash(has ? "Valid — the unsaved changes pass every rule. Save to apply them." : "Valid — the saved settings pass every rule."))
                        .catch((e: unknown) => flash(errText(e)))
                    : onBtn(k)
                }
                onSet={(v) => onSet(f.key, v, f.type)}
              />
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

/** Warns before leaving Settings with unsaved changes. */
function LeaveGuard() {
  const dirty = useCt((s) => s.tab === "settings" && Object.keys(s.draft).length > 0);
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
