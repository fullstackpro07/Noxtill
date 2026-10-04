"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { payApi, type PayScreen } from "@/lib/payments-api";
import { scopeOf, usePay } from "./pay-store";
import { TAB_PATH, errText, usePayActions } from "./pay-actions";
import { BtnV, FieldRow, Gate, PAY_STYLES, Rows, Skeleton, Svg } from "./pay-render";
import { PayDrawer, PayModal, PayToast } from "./pay-overlays";

const tabOf = (path: string) => {
  const seg = path.replace(/^\/payments\/?/, "").split("/")[0];
  return Object.keys(TAB_PATH).find((k) => TAB_PATH[k] === (seg ? `/${seg}` : "")) ?? "overview";
};

/** Payments & Billing shell. Route pages render nothing — the shell draws the tab for the route. */
export function PaymentsShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = tabOf(pathname);
  const set = usePay((s) => s.set);
  const s = usePay();
  useEffect(() => {
    if (s.tab !== tab) set({ tab, drawer: null, sel: [] });
  }, [tab, s.tab, set]);
  const scope = scopeOf({ ...s, tab });

  const bootQ = useQuery({ queryKey: ["pay", "boot"], queryFn: payApi.boot, refetchInterval: 120_000 });
  const boot = bootQ.data;
  const screenQ = useQuery({ queryKey: ["pay", "screen", scope], queryFn: () => payApi.screen(scope), enabled: !!boot, refetchInterval: 60_000, placeholderData: (prev) => (prev && prev.tabs.find((t) => t.cur)?.k === tab ? prev : undefined) });
  const scr: PayScreen | undefined = screenQ.data;
  const A = usePayActions(boot, scr);

  // Deep links: ?open=kind:id (Action Center), ?approval=id
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const o = sp.get("open");
    const ap = sp.get("approval");
    if (o) {
      const [kind, id] = o.split(":");
      set({ drawer: { kind, id } });
    } else if (ap) set({ drawer: { kind: "approvals", id: "_" } });
    if (o || ap) router.replace(pathname);
  }, [pathname, router, set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = usePay.getState();
      if (st.modal) st.closeModal();
      else if (st.drawer) st.set({ drawer: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const titleNode = useMemo(
    () =>
      scr ? (
        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: "#0A1B2A", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
            <Svg d={scr.hdr.icon} size={20} stroke="#39E28B" />
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap" }}>{scr.hdr.title}</span>
            <span role="status" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", borderRadius: 6, padding: "3px 8px", border: `1.5px solid ${scr.envB.bd}`, background: scr.envB.bg, color: scr.envB.fg }}>{scr.envB.t}</span>
          </span>
        </span>
      ) : (
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A" }}>Payments &amp; Billing</span>
      ),
    [scr],
  );
  const subtitle = useMemo(() => <span style={{ fontSize: 12, color: "#667085" }}>{scr?.hdr.sub ?? "Money requested, collected, failed, refunded, disputed and paid out"}</span>, [scr?.hdr.sub]);
  const actions = useMemo(
    () =>
      scr ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%" }}>
          {scr.hdrSels.map((f) => (
            <select key={f.k} aria-label={f.l} value={f.k === "more" ? "" : f.v} onChange={(e) => A.hdrSel(f.k, e.target.value)} style={{ border: `1px solid ${f.bd}`, background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 210 }}>
              {f.opts.map((o) => (
                <option key={o.v} value={o.v}>{o.t}</option>
              ))}
            </select>
          ))}
          <button type="button" role="status" onClick={() => A.top("fresh")} title="Provider freshness & health" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, border: `1px solid ${scr.fresh.bd}`, background: scr.fresh.bg, borderRadius: 20, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: scr.fresh.fg, minHeight: 40, whiteSpace: "nowrap", cursor: "pointer" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: scr.fresh.dot, animation: "pypulse 2.4s ease-in-out infinite" }} />
            {screenQ.isFetching ? "Syncing…" : scr.fresh.label}
          </button>
          <button type="button" onClick={() => A.top("refresh")} aria-label="Refresh" title="Refresh" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, cursor: "pointer", color: "#344054" }}>
            <Svg d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" size={16} w={2} />
          </button>
        </div>
      ) : null,
    [scr, A, screenQ.isFetching],
  );
  // Header buttons (Ask AI, Create Payment Request, Export…) live in the module header itself.
  const headerActs = useMemo(
    () =>
      scr?.hdrActs.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {scr.hdrActs.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => A.top(a.k)} style={{ borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, minHeight: 40 }} />
          ))}
        </div>
      ) : null,
    [scr, A],
  );
  useModuleHeader({ title: titleNode, subtitle, actions: headerActs });

  const err = bootQ.error ?? screenQ.error;
  const forbidden = err instanceof ApiError && err.status === 403;
  let body: ReactNode;
  if (bootQ.isLoading || (screenQ.isLoading && !scr)) body = <Skeleton />;
  else if (forbidden) body = <Gate t="You don’t have access to Payments & Billing" d={errText(err)} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" />;
  else if (err || !scr) body = <Gate t="Couldn’t load Payments & Billing" d={`The payments service didn’t respond. No money moved and nothing was changed. ${errText(err)}`} icon="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" bg="#FEF3F2" fg="#B42318" act={<button type="button" onClick={() => { void bootQ.refetch(); void screenQ.refetch(); }} style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>Retry</button>} />;
  else if (scr.isSettings && scr.se) body = <SettingsBody scr={scr} save={A.saveSettings} onBtn={A.top} />;
  else body = <Rows rows={scr.rows} h={{ ...A.handlers, sel: s.sel }} />;

  return (
    <div className="ui-pay" style={{ minHeight: "100%", background: "#F4F6F8", fontFamily: "inherit" }}>
      <style>{PAY_STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
        {scr?.testBand ? (
          <div role="status" style={{ background: "repeating-linear-gradient(135deg,#FEF6E7 0 14px,#FDE3B3 14px 28px)", borderBottom: "2px solid #F79009", padding: "6px 22px", fontSize: 11.5, fontWeight: 800, color: "#7A2E0B", letterSpacing: ".3px", textAlign: "center" }}>
            TEST MODE · sandbox providers only · no real money moves · test data never appears in live totals
          </div>
        ) : null}
        <nav aria-label="Payments & Billing" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {(scr?.tabs ?? Object.keys(TAB_PATH).map((k) => ({ k, label: k, path: TAB_PATH[k], cur: null, fw: 600, fg: "#667085", bar: "transparent", badge: null }))).map((t) => (
            <Link key={t.k} href={`/payments${t.path}`} className="ph-tab" aria-current={t.k === tab ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 11px 14px", fontSize: 12.5, fontWeight: t.k === tab ? 800 : 600, color: t.k === tab ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
              {t.label}
              {t.badge ? <span style={{ fontSize: 10, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 20, padding: "1px 7px" }}>{t.badge}</span> : null}
              <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: t.k === tab ? (s.env === "test" ? "#F79009" : "#12A150") : "transparent" }} />
            </Link>
          ))}
          {scr ? <span title="Your role in Payments" style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>Viewing as {scr.roleLabel}</span> : null}
        </nav>
        {actions ? <div aria-label="Scope and filters" style={{ display: "flex", justifyContent: "flex-start", padding: "10px 22px", borderBottom: "1px solid #E6EAF0", background: "#fff" }}>{actions}</div> : null}
      </div>
      <main data-main="1" data-screen-label={scr?.screenLabel} style={{ padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {scr?.banner ? (
          <div role="alert" style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", background: scr.banner.bg, border: `1px solid ${scr.banner.bd}`, borderRadius: 14, padding: "13px 15px" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: scr.banner.fg }}>{scr.banner.t}</div>
              <div style={{ fontSize: 12, color: "#344054", marginTop: 3, lineHeight: 1.5 }}>{scr.banner.d}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {scr.banner.acts.map((a) => (
                <button key={a.k} type="button" onClick={() => A.bannerAct(a.k)} style={{ border: `1px solid ${scr.banner!.bd}`, background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: scr.banner!.fg, cursor: "pointer", minHeight: 36 }}>{a.t}</button>
              ))}
            </div>
          </div>
        ) : null}
        {body}
        {children}
      </main>
      <PayDrawer onAct={A.drawerAct} />
      <PayModal />
      <PayToast />
    </div>
  );
}

function SettingsBody({ scr, save, onBtn }: { scr: PayScreen; save: (v: number, p: Record<string, Record<string, unknown>>) => Promise<void> | void; onBtn: (k: string) => void }) {
  const se = scr.se!;
  const draft = usePay((s) => s.draft);
  const busy = usePay((s) => s.busy);
  const set = usePay((s) => s.set);
  const value = (key: string) => {
    const [sec, f] = key.split(".");
    if (draft[sec] && f in draft[sec]) return draft[sec][f];
    return se.policy[sec]?.[f];
  };
  const dirtyOf = (sec: string) => !!draft[sec] && Object.entries(draft[sec]).some(([k, v]) => JSON.stringify(se.policy[sec]?.[k]) !== JSON.stringify(v));
  const dn = se.nav.filter((n) => dirtyOf(n.k)).length;
  return (
    <>
      <div data-screen-label="11 Payment Policies & Settings" data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <nav data-setnav="1" aria-label="Settings sections" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 6, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 130 }}>
          {se.nav.map((n) => (
            <button key={n.k} type="button" onClick={() => set({ sec: n.k })} aria-current={n.cur ? "page" : undefined} style={{ border: 0, background: n.bg, textAlign: "left", borderRadius: 9, padding: "10px 11px", fontSize: 12.5, fontWeight: n.fw, color: n.fg, cursor: "pointer", whiteSpace: "nowrap", display: "flex", justifyContent: "space-between", gap: 8, minHeight: 40, alignItems: "center" }}>
              {n.t}
              {dirtyOf(n.k) ? <span aria-label="Unsaved" style={{ width: 7, height: 7, borderRadius: "50%", background: "#F79009" }} /> : null}
            </button>
          ))}
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
                onBtn={onBtn}
                onSet={(v) => {
                  const [sec, k] = f.key.split(".");
                  set((st) => ({ draft: { ...st.draft, [sec]: { ...(st.draft[sec] ?? {}), [k]: v } } }));
                }}
              />
            ))}
          </div>
        </section>
      </div>
      {dn > 0 ? (
        <div role="region" aria-label="Unsaved changes" style={{ position: "sticky", bottom: 14, background: "#0A1B2A", borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 14px 40px rgba(10,27,42,.25)" }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "#E7EEF4", fontWeight: 600 }}>{dn} section(s) changed. Saving creates settings v{se.v + 1} and an audit record.</span>
          <button type="button" onClick={() => set({ draft: {} })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: 9, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: 38 }}>Discard</button>
          <button type="button" disabled={busy} onClick={() => void save(se.v, se.policy)} style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "9px 15px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 38 }}>{busy ? "Saving…" : "Save policy"}</button>
        </div>
      ) : null}
    </>
  );
}
