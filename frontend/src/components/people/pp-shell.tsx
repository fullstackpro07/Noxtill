"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { ppApi, type PpScreen } from "@/lib/people-api";
import { BtnV, Gate, PAY_STYLES, Rows, Skeleton, Svg } from "@/components/payments/pay-render";
import { PP_PATH, errText, usePpActions } from "./pp-actions";
import { ppScopeOf, usePp } from "./pp-store";
import { PpDrawerView, PpModalView, PpToast } from "./pp-overlays";

const ICON = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8";
const LABELS: Record<string, string> = { overview: "Overview", recruitment: "Recruitment", jobs: "Jobs", applicants: "Applicants", interviews: "Interviews", offers: "Offers", onboarding: "Onboarding", leave: "Leave", payroll: "Payroll", runs: "Payroll Runs", payslips: "Payslips", benefits: "Benefits", performance: "Performance", training: "Training", offboarding: "Offboarding" };

/** Route → tab (longest path wins, so /people/payroll/runs is Runs, not Payroll). */
const routeOf = (path: string) => {
  const rest = path.replace(/^\/people/, "").replace(/\/$/, "");
  const hit = Object.entries(PP_PATH)
    .filter(([, p]) => (p ? rest === p || rest.startsWith(`${p}/`) : rest === ""))
    .sort((a, b) => b[1].length - a[1].length)[0];
  return hit ? hit[0] : "overview";
};

/** People & Payroll shell. Route pages render nothing — the shell draws the screen for the route. */
export function PeopleShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const tab = routeOf(pathname);
  const set = usePp((s) => s.set);
  const st = usePp(useShallow((s) => ({ tab: s.tab, sel: s.sel })));
  useEffect(() => {
    if (st.tab !== tab) set({ tab, drawer: null, sel: [] });
  }, [tab, st.tab, set]);
  const scope = usePp(useShallow(ppScopeOf));
  const q = { ...scope, tab };

  const optQ = useQuery({ queryKey: ["pp", "options"], queryFn: ppApi.options, staleTime: 30_000 });
  const scrQ = useQuery({ queryKey: ["pp", "screen", q], queryFn: () => ppApi.screen(q), enabled: !!optQ.data, refetchInterval: 60_000, placeholderData: (prev) => prev });
  const scr: PpScreen | undefined = scrQ.data;
  const A = usePpActions(optQ.data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = usePp.getState();
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
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{head?.title ?? "People & Payroll"}</span>
      </span>
    ),
    [head?.icon, head?.title],
  );
  const subtitle = useMemo(() => <span style={{ fontSize: 12, color: "#667085" }}>{head?.sub ?? "Headcount, hiring, leave, payroll readiness and people alerts"}</span>, [head?.sub]);
  const fetching = scrQ.isFetching;
  const headerActs = useMemo(
    () =>
      head ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {head.sels.map((f) => (
            <select key={f.k} aria-label={f.l} value={f.v} onChange={(e) => set({ [f.k]: e.target.value, page: {}, sel: [] })} style={{ border: `1px solid ${f.v ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 150 }}>
              {f.opts.map((o) => (
                <option key={o.v} value={o.v}>{o.t}</option>
              ))}
            </select>
          ))}
          <select aria-label="More" value="" onChange={(e) => e.target.value && A.top(e.target.value)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 40, maxWidth: 120 }}>
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
  else if (forbidden) body = <Gate t="You don’t have access to People & Payroll" d={`${errText(err)} An Owner can grant HR, recruiting, payroll or manager access in Staff › Roles.`} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" />;
  else if (err || !scr)
    body = (
      <Gate
        t="Couldn’t load People & Payroll"
        d={`The HR service didn’t respond. No payroll, leave or candidate data was changed. ${errText(err)}`}
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
  else if (scr.gate) body = <Gate t={scr.gate.t} d={scr.gate.d} icon="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" bg="#F2F4F7" fg="#475467" act={<button type="button" onClick={() => A.go(scr.head.tabs[0]?.k ?? "leave")} style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>Go to my home</button>} />;
  else body = <Rows rows={scr.rows ?? []} h={{ ...A.handlers, sel: st.sel }} />;

  const tabs = head?.tabs ?? Object.keys(PP_PATH).map((k) => ({ k, label: LABELS[k], path: PP_PATH[k], badge: null }));
  return (
    <div className="ui-pay" style={{ minHeight: "100%", background: "#F4F6F8", fontFamily: "inherit" }}>
      <style>{PAY_STYLES}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
        <nav aria-label="People & Payroll" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {tabs.map((t) => {
            const on = t.k === tab;
            return (
              <Link key={t.k} href={`/people${t.path}`} className="ph-tab" aria-current={on ? "page" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 11px 14px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? "#0F172A" : "#667085", whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
                {t.label}
                {t.badge ? <span style={{ fontSize: 10, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 20, padding: "1px 7px" }}>{t.badge}</span> : null}
                <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: on ? "#12A150" : "transparent" }} />
              </Link>
            );
          })}
          {head ? <span title="Your role in People & Payroll" style={{ marginLeft: "auto", alignSelf: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "#475467", whiteSpace: "nowrap" }}>Viewing as {head.roleLabel}</span> : null}
        </nav>
      </div>
      <main data-main="1" data-screen-label={scr?.screenLabel} style={{ padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {head?.banner && !scr?.gate ? (
          <div role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#F2F4F7", border: "1px solid #E6EAF0", borderRadius: 12, padding: "11px 14px" }}>
            <Svg d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" size={16} stroke="#475467" />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#475467" }}>{head.banner.t}</div>
              <div style={{ fontSize: 12, color: "#475467", marginTop: 2 }}>{head.banner.d}</div>
            </div>
          </div>
        ) : null}
        {body}
        {children}
      </main>
      <PpDrawerView onAct={A.drawerAct} />
      <PpModalView />
      <PpToast />
    </div>
  );
}
