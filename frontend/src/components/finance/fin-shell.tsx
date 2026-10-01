"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ApiError } from "@/lib/api-client";
import { finApi } from "@/lib/finance-api";
import { GROUPS, IC, SCREENS, errText, hrefOf, screenOf } from "./fin-core";
import { useFin } from "./fin-store";
import { useFinActions } from "./fin-actions";
import { FIN_STYLES, Gate, PipePanel, Skeleton, Svg, Toast, btnPri, btnSec, card, selSt } from "./fin-render";
import { ScreenBody, saveSettings } from "./fin-screen";
import { FinDrawer, FinModal } from "./fin-overlays";
import { JournalBuilder } from "./fin-journal-builder";
import { BillModal } from "./fin-bill";

const BADGE_RED = new Set(["recon", "journals"]);

/** Finance & Accounting shell. Pages under /finance render nothing themselves — the shell draws the screen for the route. */
export function FinanceShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sc = screenOf(pathname);
  const k = sc.k;
  const period = useFin((s) => s.period);
  const branch = useFin((s) => s.branch);
  const cur = useFin((s) => s.cur);
  const adv = useFin((s) => s.adv);
  const q = useFin((s) => s.q);
  const stmt = useFin((s) => s.stmt);
  const cmp = useFin((s) => s.cmp);
  const bver = useFin((s) => s.bver);
  const glAccount = useFin((s) => s.glAccount);
  const glSource = useFin((s) => s.glSource);
  const bank = useFin((s) => s.bank);
  const set = useFin((s) => s.set);

  const bootQ = useQuery({ queryKey: ["fin", "boot"], queryFn: finApi.boot, refetchInterval: 60_000 });
  const boot = bootQ.data;
  const fin = useFinActions(boot, k);

  const scope = useMemo(() => ({ period: period || undefined, branch, cur }), [period, branch, cur]);
  const screenQ = useQuery({
    queryKey: ["fin", "screen", k, scope, k === "statements" ? { stmt, cmp } : null, k === "budgets" ? bver : null, k === "gl" ? { glAccount, glSource } : null, k === "feeds" ? bank : null],
    queryFn: () => finApi.screen(k, { ...scope, stmt: k === "statements" ? stmt : undefined, cmp: k === "statements" ? (cmp ? "1" : "0") : undefined, bver: k === "budgets" ? bver || undefined : undefined, account: k === "gl" ? glAccount || undefined : undefined, source: k === "gl" ? glSource || undefined : undefined, bank: k === "feeds" ? bank || undefined : undefined }),
    enabled: !!boot,
    refetchInterval: 90_000,
  });
  const scr = screenQ.data;

  // Deep links: /finance?approvals=1 (notifications), ?open=<kind>:<id> (Action Center).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const open = sp.get("open");
    if (open) {
      const [kind, id] = open.split(":");
      const map: Record<string, string> = { journal: "journals", bill: "bills", tax: "taxes", reconciliation: "recon", budget: "budgets" };
      if (kind === "reconciliation") set({ reconId: id });
      else if (map[kind]) set({ drawer: { k: map[kind], id, tab: null } });
      router.replace(map[kind] ? hrefOf(map[kind]) : pathname);
    }
  }, [pathname, router, set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") set({ modal: null, drawer: null, jb: null, bill: null });
      const t = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(t)) {
        e.preventDefault();
        document.getElementById("nxfq")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);

  const titleNode = useMemo(
    () => (
      <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-.4px", color: "#0F172A", whiteSpace: "nowrap" }}>Finance &amp; Accounting</span>
        {boot?.actor.scoped ? <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#175CD3", background: "#EFF8FF", borderRadius: "6px", padding: "3px 7px" }}>Scoped access</span> : null}
      </span>
    ),
    [boot?.actor.scoped],
  );
  const search = useMemo(
    () => (
      <div data-hidesm="1" style={{ width: "360px", maxWidth: "36vw", position: "relative" }}>
        <svg style={{ position: "absolute", left: "12px", top: "13px", color: "#98A2B3" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input id="nxfq" value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Search this screen — account, journal, vendor…  ( / )" aria-label="Search this screen" className="fx-in" style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1px solid #E6EAF0", borderRadius: "10px", fontSize: "13px", background: "#F9FAFB", minHeight: "42px" }} />
      </div>
    ),
    [q, set],
  );
  const actions = useMemo(
    () => (
      <button type="button" onClick={() => set({ adv: !adv })} role="switch" aria-checked={adv} title="Show control accounts, FX detail and posting metadata" style={{ display: "flex", alignItems: "center", gap: "9px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "22px", padding: "6px 12px 6px 7px", cursor: "pointer", minHeight: "40px" }}>
        <span style={{ width: "36px", height: "20px", borderRadius: "12px", background: adv ? "#12A150" : "#D0D5DD", position: "relative", display: "block", transition: "background .2s" }}>
          <span style={{ position: "absolute", top: "2px", left: adv ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .2s" }} />
        </span>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#344054", whiteSpace: "nowrap" }}>Accountant view</span>
      </button>
    ),
    [adv, set],
  );
  useModuleHeader({ title: titleNode, search, actions });

  const doPrimary = () => {
    if (sc.pa === "saveSettings") return void saveSettings(fin, scr?.settings?.version ?? boot?.settingsVersion ?? 1);
    if (sc.pa.startsWith("seg:")) return set((s) => ({ seg: { ...s.seg, [k]: sc.pa.slice(4) } }));
    return void fin.act(sc.pa);
  };
  const badges = boot?.badges ?? {};
  const err = bootQ.error;
  const forbidden = err instanceof ApiError && err.status === 403;

  let body: ReactNode;
  if (bootQ.isLoading) body = <Skeleton />;
  else if (forbidden) body = <Gate t="You don’t have access to Finance & Accounting" d={errText(err)} />;
  else if (err || !boot) body = <Gate t="Couldn’t load Finance" d={`The Finance service didn’t respond. ${errText(err)}`} act={<button type="button" style={btnPri} onClick={() => void bootQ.refetch()}>Retry</button>} />;
  else if (screenQ.isLoading || !scr) body = screenQ.error ? <Gate t="Couldn’t load this screen" d={errText(screenQ.error)} act={<button type="button" style={btnPri} onClick={() => void screenQ.refetch()}>Retry</button>} /> : <Skeleton />;
  else body = <ScreenBody k={k} sc={scr} fin={fin} boot={boot} />;

  const manageOnly = ["addAccount", "newJournal", "addBank", "addBill", "capitalize", "createBudget", "startClose", "startRecon", "reviewFeed"].includes(sc.pa);
  const priDis = (manageOnly && !boot?.actor.manage) || (sc.pa === "saveSettings" && !boot?.actor.admin);

  return (
    <div className="ui-fin" style={{ display: "flex", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{FIN_STYLES}</style>
      <nav data-subnav="1" aria-label="Finance sections" style={{ width: "232px", flex: "0 0 232px", background: "#fff", borderRight: "1px solid #E6EAF0", padding: "10px 10px 24px", position: "sticky", top: 0, height: "calc(100vh - 64px)", overflowY: "auto", alignSelf: "flex-start" }}>
        {GROUPS.map((g) => (
          <div key={g} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "#98A2B3", padding: "13px 10px 5px" }}>{g}</div>
            {SCREENS.filter((s) => s.g === g).map((s) => {
              const on = s.k === k;
              const bd = badges[s.k];
              const red = BADGE_RED.has(s.k);
              return (
                <Link key={s.k} href={hrefOf(s.k)} className="fx-sub" aria-current={on ? "page" : undefined} onClick={() => set({ drawer: null, reconId: null, q: "", moreF: false })} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 10px", borderRadius: "9px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#344054", background: on ? "#E8F7EE" : "transparent", minHeight: "36px", lineHeight: 1.25, textDecoration: "none" }}>
                  <Svg d={IC[s.k]} style={{ flex: "0 0 16px" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{s.short ?? s.l}</span>
                  {bd ? <span style={{ fontSize: "10px", fontWeight: 800, color: red ? "#B42318" : "#B54708", background: red ? "#FEF3F2" : "#FEF6E7", borderRadius: "20px", padding: "1px 7px" }}>{bd}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0, padding: "18px 22px 40px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <select data-subsel="1" value={k} onChange={(e) => router.push(hrefOf(e.target.value))} aria-label="Finance section" style={{ display: "none", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, color: "#101828", background: "#fff", minHeight: "44px", width: "100%" }}>
            {SCREENS.map((s) => (
              <option key={s.k} value={s.k}>
                {s.g} — {s.short ?? s.l}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: "260px" }}>
              <nav aria-label="Breadcrumb" style={{ display: "flex", gap: "6px", fontSize: "11.5px", color: "#98A2B3", fontWeight: 600, flexWrap: "wrap" }}>
                <span>Money</span>
                <span aria-hidden="true">›</span>
                <span>Finance &amp; Accounting</span>
                <span aria-hidden="true">›</span>
                <span>{sc.g}</span>
              </nav>
              <h1 style={{ margin: "5px 0 0", fontSize: "24px", fontWeight: 800, letterSpacing: "-.7px", color: "#0F172A" }}>{sc.l}</h1>
              <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#667085", maxWidth: "720px", textWrap: "pretty" }}>{sc.sub}</p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {sc.sec.map(([l, a]) => (
                <button key={l} type="button" className="fx-btn" onClick={() => void fin.act(a)} style={btnSec}>
                  {l}
                </button>
              ))}
              <button type="button" className="fx-pri" disabled={priDis} title={priDis ? "Your role can view Finance but not make changes here." : undefined} onClick={doPrimary} style={{ ...btnPri, opacity: priDis ? 0.5 : 1, cursor: priDis ? "not-allowed" : "pointer" }}>
                {sc.primary}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>
              ENTITY
              <select value={(boot?.branches.length ?? 0) > 1 && branch === "all" ? "group" : "single"} onChange={(e) => set({ branch: e.target.value === "group" ? "all" : boot?.branches[0]?.id ?? "all" })} style={selSt}>
                {(boot?.branches.length ?? 0) > 1 && boot?.allBranches ? <option value="group">{boot.entity} · consolidated</option> : null}
                <option value="single">{boot?.entity ?? "—"}</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>
              BRANCH
              <select value={branch} onChange={(e) => set({ branch: e.target.value })} style={selSt}>
                {boot?.allBranches ? <option value="all">All branches</option> : null}
                {(boot?.branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>
              PERIOD
              <select value={period || boot?.periods[0]?.k || ""} onChange={(e) => set({ period: e.target.value })} style={selSt}>
                {(boot?.periods ?? []).map((p) => (
                  <option key={p.k} value={p.k}>
                    {p.l}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>
              CURRENCY
              <select value={cur} onChange={(e) => set({ cur: e.target.value as "base" | "txn" })} style={selSt}>
                <option value="base">{boot?.base ?? "USD"} (base)</option>
                <option value="txn">Transaction currency</option>
              </select>
            </label>
            <span style={{ display: "flex", alignItems: "center", gap: "7px", marginLeft: "auto", fontSize: "11.5px", fontWeight: 600, color: "#475467", background: "#F7FCF9", border: "1px solid #CDEBD8", borderRadius: "20px", padding: "5px 11px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: scr?.scope.periodStatus === "locked" ? "#0A1B2A" : "#12A150", animation: "nxpulse 2s ease infinite" }} />
              {scr?.freshness ?? "Loading…"}
            </span>
            {boot?.actor.manage ? (
              <button type="button" onClick={() => void fin.act("sweep")} title="Post new and changed sales, payments, stock, expenses and deposits now" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "32px" }}>
                Refresh
              </button>
            ) : null}
          </div>
        </section>
        {body}
        {children}
      </main>
      {boot ? (
        <>
          <FinDrawer fin={fin} scope={scope} />
          <FinModal />
          <JournalBuilder boot={boot} fin={fin} />
          <BillModal boot={boot} fin={fin} />
        </>
      ) : null}
      <PipePanel />
      <Toast />
    </div>
  );
}
