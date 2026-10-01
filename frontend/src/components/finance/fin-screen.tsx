"use client";

import type { CSSProperties } from "react";
import { finApi, type Boot, type Screen, type SettingRow } from "@/lib/finance-api";
import { mdy } from "./fin-core";
import { useFin } from "./fin-store";
import { FlowView, KpiGrid, Kpis2, Notices, TableView, card, selSt } from "./fin-render";
import { ReconWorkspace } from "./fin-recon";
import type { FinAct } from "./fin-actions";

/** Settings rows edit a draft; Save Settings sends it as one versioned patch. */
const PATH: Record<string, [string, string]> = {
  fyStart: ["profile", "fyStart"],
  branchMode: ["profile", "branchMode"],
  softClose: ["posting", "softClose"],
  reqDept: ["posting", "reqDept"],
  dupBill: ["posting", "dupBill"],
  autoRev: ["posting", "autoRev"],
  reqEvidence: ["close", "reqEvidence"],
  lockAfter: ["close", "lockAfter"],
  closeDay: ["close", "closeDay"],
  sod1: ["sod", "sod1"],
  sod2: ["sod", "sod2"],
  sod3: ["sod", "sod3"],
  sod4: ["sod", "sod4"],
};

export function buildSettingsPatch(draft: Record<string, unknown>) {
  const patch: Record<string, Record<string, unknown> | unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (PATH[k]) {
      const [g, f] = PATH[k];
      patch[g] = { ...((patch[g] as Record<string, unknown>) ?? {}), [f]: v };
    } else if (k === "expensePaidFrom") patch.expensePaidFrom = String(v).split(" ")[0];
    else if (k === "arTermsDays") patch.arTermsDays = v === "Due on sale" ? 0 : parseInt(String(v), 10);
    else patch[k] = v;
  }
  return patch;
}

export async function saveSettings(fin: FinAct, version: number) {
  const draft = useFin.getState().setDraft;
  if (!Object.keys(draft).length) return useFin.getState().flash("Nothing changed.");
  await fin.run("Saving settings", ["Validate", "Policy check", "Approval check", `Save version ${version + 1}`], async () => {
    const r = await finApi.saveSettings(version, buildSettingsPatch(draft));
    useFin.setState({ setDraft: {} });
    return r.pendingOwner ? { msg: "Saved. The segregation-of-duties change was sent to the Owner for approval and takes effect once approved.", warn: true } : `Settings saved (version ${r.version}).`;
  });
}

function Toggle({ r, onClick }: { r: SettingRow; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={!!r.on} aria-label={r.l} style={{ display: "flex", alignItems: "center", gap: "8px", border: 0, background: "transparent", cursor: r.locked ? "not-allowed" : "pointer", minHeight: "40px" }}>
      <span style={{ width: "38px", height: "22px", borderRadius: "12px", background: r.tbg, position: "relative", display: "block" }}>
        <span style={{ position: "absolute", top: "2px", left: r.tx, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
      </span>
      <span style={{ fontSize: "12px", fontWeight: 700, color: "#475467", width: "24px" }}>{r.word}</span>
    </button>
  );
}

function Settings({ s, fin, boot }: { s: NonNullable<Screen["settings"]>; fin: FinAct; boot: Boot | undefined }) {
  const draft = useFin((x) => x.setDraft);
  const set = useFin((x) => x.set);
  const view = (r: SettingRow): SettingRow => {
    if (!r.k || draft[r.k] === undefined) return r;
    if (r.isTog) {
      const on = !!draft[r.k];
      return { ...r, on, tbg: on ? "#12A150" : "#D0D5DD", tx: on ? "18px" : "2px", word: on ? "On" : "Off" };
    }
    return { ...r, val: String(draft[r.k]) };
  };
  const tog = (r: SettingRow) => {
    if (!s.canEdit) return useFin.getState().flash("Changing accounting settings needs an Owner / Controller.");
    if (r.locked) return useFin.getState().flash("Unbalanced journals can never be posted. This control can’t be turned off.");
    const cur = draft[r.k!] === undefined ? !!r.on : !!draft[r.k!];
    set((x) => ({ setDraft: { ...x.setDraft, [r.k!]: !cur } }));
  };
  const rowAct = (a: string) => {
    const st = useFin.getState();
    if (a === "editDepartments")
      return st.openModal({
        title: "Departments",
        intro: "Departments tag journal and bill lines. One per line; you can require them on expense lines in Posting controls.",
        fields: [{ k: "d", l: "Departments", type: "area", ph: "Sales\nOperations\nMarketing" }],
        init: { d: (boot?.departments ?? []).join("\n") },
        buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Save", kind: "p", run: (mf) => fin.run("Saving departments", ["Validate", "Save settings"], async () => { const r = await finApi.saveSettings(s.version, { departments: mf.d.split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 50) }); return `Departments saved (version ${r.version}).`; }) }],
      });
    if (a === "editExpenseMap") {
      const accts = (boot?.accounts ?? []).filter((x) => !x.header && x.active && ["expense", "cos", "asset"].includes(x.type));
      const fields = s.expenseCategories.slice(0, 30).map((c, i) => ({ k: `c${i}`, l: c, type: "sel" as const, opts: [{ v: "", l: "By keyword (automatic)" }, ...accts.map((x) => ({ v: x.code, l: `${x.code} ${x.name}` }))] }));
      return st.openModal({
        title: "Expense category mapping",
        intro: "Which account each Expenses category posts to. Changing a mapping reposts the affected expenses with a reversal and a new journal.",
        fields,
        init: Object.fromEntries(s.expenseCategories.slice(0, 30).map((c, i) => [`c${i}`, s.expenseMap[c.toLowerCase()] ?? ""])),
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Save Mapping",
            kind: "p",
            run: (mf) =>
              fin.run("Saving mapping", ["Validate accounts", "Save settings", "Repost affected expenses"], async () => {
                const map: Record<string, string> = {};
                s.expenseCategories.slice(0, 30).forEach((c, i) => {
                  if (mf[`c${i}`]) map[c.toLowerCase()] = mf[`c${i}`];
                });
                const r = await finApi.saveSettings(s.version, { expenseMap: map });
                await finApi.sweep(true);
                return `Mapping saved (version ${r.version}) and expenses reposted.`;
              }),
          },
        ],
      });
    }
    if (a.startsWith("editTaxCode:")) {
      const code = a.slice(12);
      const tc = boot?.taxCodes.find((t) => t.code === code);
      return st.openModal({
        title: `Tax code ${code}`,
        intro: "Rates here apply to bills and bank categorizations. Sales tax on orders comes from Settings › Taxes.",
        fields: [{ k: "name", l: "Name", type: "text", req: true }, { k: "rate", l: "Rate %", type: "number", req: true }],
        init: { name: tc?.name ?? "", rate: String(tc?.rate ?? "0") },
        buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Save", kind: "p", req: ["name", "rate"], run: (mf) => fin.run("Saving tax code", ["Validate", "Save"], async () => { await finApi.taxCode({ code, name: mf.name, rate: Number(mf.rate), kind: tc?.kind ?? "input" }); return `${code} saved.`; }) }],
      });
    }
    return fin.act(a);
  };
  const editThresholds = () =>
    useFin.getState().openModal({
      title: "Approval thresholds",
      intro: "Above these amounts a second person must approve. Owners always pass.",
      fields: [
        { k: "jd", l: "Post directly below", type: "number", req: true },
        { k: "jo", l: "Owner / Controller above", type: "number", req: true },
        { k: "bo", l: "Bills needing Owner / Controller above", type: "number", req: true },
      ],
      init: { jd: String(boot?.thresholds.journalDirect ?? 1000), jo: String(boot?.thresholds.journalOwner ?? 10000), bo: String(boot?.thresholds.billOwner ?? 5000) },
      buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Save", kind: "p", req: ["jd", "jo", "bo"], run: (mf) => fin.run("Saving thresholds", ["Validate", "Save settings"], async () => { const r = await finApi.saveSettings(s.version, { thresholds: { journalDirect: Number(mf.jd), journalOwner: Number(mf.jo), billOwner: Number(mf.bo) } }); return `Thresholds saved (version ${r.version}).`; }) }],
    });
  const h2: CSSProperties = { margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" };
  return (
    <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "16px", alignItems: "start" }}>
      <nav aria-label="Settings sections" style={{ ...card, borderRadius: "14px", padding: "8px", position: "sticky", top: "80px", display: "flex", flexDirection: "column", gap: "1px" }}>
        {s.nav.map((n) => (
          <a key={n} href={`#fs-${n.replace(/\W+/g, "-")}`} className="fx-sub" style={{ fontSize: "12.5px", fontWeight: 600, color: "#344054", padding: "8px 10px", borderRadius: "8px" }}>
            {n}
          </a>
        ))}
      </nav>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        {!s.canEdit ? <div style={{ fontSize: "12.5px", color: "#B54708", background: "#FFFCF5", border: "1px solid #FEDF89", borderRadius: "12px", padding: "10px 12px", fontWeight: 600 }}>You can view these settings. Changing them needs an Owner / Controller.</div> : null}
        {s.sections.map((sec) => (
          <section key={sec.id} id={`fs-${sec.t.replace(/\W+/g, "-")}`} style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5" }}>
              <h2 style={h2}>{sec.t}</h2>
              {sec.d ? <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>{sec.d}</div> : null}
            </div>
            {sec.rows.map((r0, i) => {
              const r = view(r0);
              return (
                <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid #F2F4F7", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.l}</div>
                    {r.d ? <div style={{ fontSize: "11.5px", color: "#98A2B3" }}>{r.d}</div> : null}
                  </div>
                  {r.isStatic ? <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#344054" }}>{r.val}</span> : null}
                  {r.isStatic && r.a ? (
                    <button type="button" onClick={() => void rowAct(r.a!)} disabled={!s.canEdit} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: s.canEdit ? "#0E8442" : "#98A2B3", cursor: s.canEdit ? "pointer" : "not-allowed", minHeight: "36px" }}>
                      {r.al}
                    </button>
                  ) : null}
                  {r.isSel ? (
                    <select value={r.val} disabled={!s.canEdit} onChange={(e) => set((x) => ({ setDraft: { ...x.setDraft, [r.k!]: e.target.value } }))} aria-label={r.l} style={{ ...selSt, padding: "8px 10px", minHeight: "40px", minWidth: "200px" }}>
                      {(r.opts ?? []).includes(r.val ?? "") ? null : <option>{r.val}</option>}
                      {(r.opts ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : null}
                  {r.isTog ? <Toggle r={r} onClick={() => tog(r)} /> : null}
                </div>
              );
            })}
          </section>
        ))}
        <section id="fs-Approval-thresholds" style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <h2 style={h2}>Approval thresholds</h2>
              <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>Approvals also appear in the Dashboard’s Action Center for the people who can approve them.</div>
            </div>
            {s.canEdit ? (
              <button type="button" onClick={editThresholds} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "36px" }}>
                Edit
              </button>
            ) : null}
          </div>
          {s.th.map((t) => (
            <div key={t.a} style={{ display: "flex", gap: "12px", padding: "11px 18px", borderTop: "1px solid #F2F4F7", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{t.a}</span>
              <span style={{ fontSize: "12.5px", color: "#344054" }}>→ {t.b}</span>
            </div>
          ))}
        </section>
        <section id="fs-Accountant-access" style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <h2 style={h2}>Accountant access</h2>
              <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>Scoped by branch and permission, with an expiry. A scoped accountant only sees their branches’ figures.</div>
            </div>
            <button type="button" className="fx-dark" disabled={!s.canEdit} onClick={() => void fin.act("invite")} style={{ border: 0, background: s.canEdit ? "#0A1B2A" : "#D0D5DD", borderRadius: "10px", padding: "9px 14px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: s.canEdit ? "pointer" : "not-allowed", minHeight: "40px" }}>
              Invite Accountant
            </button>
          </div>
          {s.people.map((p) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) minmax(160px,1fr) minmax(180px,1.2fr) 150px 100px 70px", gap: "12px", padding: "12px 18px", borderTop: "1px solid #F2F4F7", alignItems: "center", overflowX: "auto" }}>
              <span>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{p.n}</span>
                <span style={{ fontSize: "11.5px", color: "#98A2B3" }}>{p.f}</span>
              </span>
              <span style={{ fontSize: "12px", color: "#344054" }}>{p.sc}</span>
              <span style={{ fontSize: "12px", color: "#344054" }}>{p.p}</span>
              <span style={{ fontSize: "11.5px", color: "#667085" }}>{p.e}</span>
              <span style={{ justifySelf: "start", fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: p.bg, color: p.fg }}>{p.s}</span>
              {p.canRevoke ? (
                <button type="button" onClick={() => void fin.act(`revoke:${p.id}`)} style={{ border: 0, background: "transparent", fontSize: "12px", fontWeight: 800, color: "#B42318", cursor: "pointer" }}>
                  Revoke
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </section>
        <section id="fs-Segregation-of-duties" style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5" }}>
            <h2 style={h2}>Segregation of duties</h2>
            <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>Turning a rule off needs Owner approval.</div>
          </div>
          {s.sod.map((r0) => {
            const r = view(r0);
            return (
              <div key={r.k} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px 18px", borderTop: "1px solid #F2F4F7" }}>
                <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.l}</span>
                <Toggle r={r} onClick={() => tog(r)} />
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export function ScreenBody({ k, sc, fin, boot }: { k: string; sc: Screen; fin: FinAct; boot: Boot | undefined }) {
  const adv = useFin((s) => s.adv);
  const reconId = useFin((s) => s.reconId);
  const stmtT = useFin((s) => s.stmt);
  const cmp = useFin((s) => s.cmp);
  const glAccount = useFin((s) => s.glAccount);
  const glSource = useFin((s) => s.glSource);
  const bank = useFin((s) => s.bank);
  const branch = useFin((s) => s.branch);
  const set = useFin((s) => s.set);
  const showRecon = k === "recon" && !!reconId;
  const onKpi = (kp: { go: string; seg: string }) => {
    if (kp.go) fin.go(kp.go, kp.seg || undefined);
    else if (kp.seg) set((s) => ({ seg: { ...s.seg, [k]: kp.seg } }));
  };
  const onRow = (id: string) => {
    if (k === "recon") {
      const row = sc.table?.rows.find((r) => r.id === id);
      if (row?.seg.includes("In Progress")) return set({ reconId: id });
    }
    if (k === "fa" && id.startsWith("pending:")) return fin.openRec("fa", id);
    if (k === "close" && id.startsWith("tpl:")) return useFin.getState().flash("Start the close to work through this control.");
    fin.openRec(k === "gl" ? "gl" : k, id);
  };
  const ci = sc.closeInfo;
  const stmt = sc.stmt;
  return (
    <>
      <Notices items={sc.notices} act={(a) => void fin.act(a)} />
      {sc.kpis.length && !showRecon ? <KpiGrid kpis={sc.kpis} overview={k === "overview"} adv={adv} onKpi={onKpi} /> : null}

      {k === "overview" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Kpis2 kpis={sc.kpis2} onKpi={onKpi} />
          <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(0,1fr)", gap: "16px", alignItems: "start" }}>
            <section id="nxf-att" style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "15px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>Needs your attention</h2>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: "20px", padding: "2px 8px" }}>{sc.attention?.length ?? 0}</span>
                <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "#98A2B3" }}>Sorted by impact</span>
              </div>
              {(sc.attention ?? []).map((a, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", borderTop: "1px solid #F2F4F7", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "11px", minWidth: 0 }}>
                    <span aria-label={`${a.sev} impact`} style={{ width: "9px", height: "9px", borderRadius: "50%", background: a.dot, flex: "0 0 9px", marginTop: "5px" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828", textWrap: "pretty" }}>{a.issue}</div>
                      <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px", textWrap: "pretty" }}>{a.impact}</div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "6px", fontSize: "11px", fontWeight: 600, color: "#98A2B3" }}>
                        {a.hasAmt ? <span style={{ color: "#344054" }}>{a.amt}</span> : null}
                        <span>Due {a.due}</span>
                        <span>Owner: {a.owner}</span>
                        <span>{a.sev} impact</span>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="fx-att" onClick={() => void fin.act(a.a)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 13px", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", whiteSpace: "nowrap", minHeight: "40px" }}>
                    {a.al}
                  </button>
                </div>
              ))}
              {!sc.attention?.length ? <div style={{ padding: "22px 18px", fontSize: "12.5px", color: "#0E8442", fontWeight: 700, borderTop: "1px solid #F2F4F7" }}>Nothing needs attention right now.</div> : null}
            </section>
            <section style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "15px 18px", borderBottom: "1px solid #F0F2F5" }}>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>Books health</h2>
                <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "2px" }}>Control checks · checked live now{sc.healthAt ? ` · nightly run ${mdy(sc.healthAt)}` : " · nightly run at 02:00"}</div>
              </div>
              {(sc.health ?? []).map((h) => (
                <div key={h.l} style={{ display: "flex", gap: "11px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid #F2F4F7" }}>
                  <span style={{ width: "26px", height: "26px", borderRadius: "8px", background: h.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 26px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={h.fg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={h.ip} />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{h.l}</div>
                    <div style={{ fontSize: "11.5px", color: "#667085" }}>{h.v}</div>
                  </div>
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: h.fg }}>{h.word}</span>
                  {h.hasA ? (
                    <button type="button" onClick={() => void fin.act(h.a)} style={{ border: 0, background: "transparent", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", padding: "6px 4px", minHeight: "34px" }}>
                      {h.al} ›
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          </div>
          <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ width: "30px", height: "30px", borderRadius: "9px", background: "#0A1B2A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6CE0A0" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z" />
                </svg>
              </span>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>Finance brief</h2>
              <span style={{ fontSize: "11.5px", color: "#667085", marginLeft: "auto" }}>Rule-based findings from your posted books. They explain and suggest — they never post, file or approve anything.</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "12px" }}>
              {(sc.brief ?? []).map((b) => (
                <article key={b.key} style={{ border: "1px solid #E6EAF0", borderRadius: "14px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828", textWrap: "pretty" }}>{b.finding}</div>
                  <div style={{ fontSize: "12px", color: "#475467", textWrap: "pretty" }}>{b.why}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "4px 10px", fontSize: "11.5px" }}>
                    <span style={{ color: "#98A2B3", fontWeight: 700 }}>Evidence</span>
                    <span style={{ color: "#344054" }}>{b.sources}</span>
                    <span style={{ color: "#98A2B3", fontWeight: 700 }}>Confidence</span>
                    <span style={{ color: "#344054" }}>{b.conf}</span>
                    <span style={{ color: "#98A2B3", fontWeight: 700 }}>Impact</span>
                    <span style={{ color: "#344054" }}>{b.impact}</span>
                    <span style={{ color: "#98A2B3", fontWeight: 700 }}>Approval</span>
                    <span style={{ color: "#344054" }}>{b.appr}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "4px" }}>
                    <button type="button" className="fx-dark" onClick={() => void fin.act(b.a)} style={{ border: 0, background: "#0A1B2A", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "38px" }}>
                      {b.al}
                    </button>
                    <button type="button" onClick={() => void finApi.dismiss(b.key).then(() => { useFin.getState().flash("Dismissed. It comes back if the numbers change; the dismissal is in the audit log."); return fin.invalidate(); })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: "38px" }}>
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
              {!sc.brief?.length ? <div style={{ fontSize: "12.5px", color: "#667085" }}>No findings — overdue receivables, bank matches, close blockers, suspense, budget variances and bill reviews are all clear.</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {sc.aging ? (
        <section style={{ ...card, padding: "15px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{sc.agingTitle}</div>
          <div role="img" aria-label="Aging distribution" style={{ display: "flex", height: "14px", borderRadius: "8px", overflow: "hidden", gap: "2px", background: "#F2F4F7" }}>
            {sc.aging.map((g) => (
              <span key={g.l} style={{ width: g.w, background: g.c }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {sc.aging.map((g) => (
              <span key={g.l} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#475467" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: g.c }} />
                <b style={{ color: "#101828" }}>{g.l}</b> {g.v}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {sc.versions ? (
        <section style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#475467" }}>Budget versions</div>
          {sc.versions.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "10px" }}>
              {sc.versions.map((v) => (
                <button key={v.id} type="button" onClick={() => set({ bver: v.id })} style={{ textAlign: "left", background: "#fff", border: `${v.bw} solid ${v.bd}`, boxShadow: v.sh, borderRadius: "12px", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "6px", minHeight: "64px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{v.l}</span>
                  <span style={{ fontSize: "11px", color: "#98A2B3" }}>{v.sub}</span>
                  <span style={{ alignSelf: "flex-start", fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: v.bg, color: v.fg }}>{v.s}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ ...card, padding: "22px", fontSize: "12.5px", color: "#667085" }}>No budgets yet. Create one from last year’s posted actuals or import a spreadsheet.</div>
          )}
          {sc.selectedBudget ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {sc.selectedBudget.status === "Draft" ? <button type="button" onClick={() => void fin.act(`editBudget:${sc.selectedBudget!.id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>Edit Lines</button> : null}
              {sc.selectedBudget.status === "Draft" ? <button type="button" onClick={() => void fin.act(`submitBudget:${sc.selectedBudget!.id}`)} style={{ border: "1px solid #12A150", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>Submit for Approval</button> : null}
              {sc.selectedBudget.status === "Submitted" && boot?.actor.admin ? <button type="button" onClick={() => void fin.act(`approveBudget:${sc.selectedBudget!.id}`)} style={{ border: 0, background: "#12A150", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>Approve</button> : null}
              {sc.selectedBudget.status === "Submitted" && boot?.actor.admin ? <button type="button" onClick={() => void fin.act(`rejectBudget:${sc.selectedBudget!.id}`)} style={{ border: "1px solid #FDA29B", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, color: "#B42318", cursor: "pointer" }}>Reject</button> : null}
              {["Approved", "Locked"].includes(sc.selectedBudget.status) ? <button type="button" onClick={() => void fin.act(`reviseBudget:${sc.selectedBudget!.id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>Create Revision</button> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {sc.bankCards ? (
        sc.bankCards.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "12px" }}>
            {sc.bankCards.map((c) => (
              <button key={c.id} type="button" className="fx-kpi" onClick={() => fin.openRec("bankacc", c.id)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "11px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
                  <span style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#E8F7EE", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 5H3z" />
                    </svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "14px", fontWeight: 800, color: "#101828" }}>
                      {c.name} <span style={{ color: "#98A2B3", fontWeight: 600 }}>{c.mask}</span>
                    </span>
                    <span style={{ display: "block", fontSize: "11.5px", color: "#667085" }}>
                      {c.inst} · {c.cur} · GL {c.gl}
                    </span>
                  </span>
                </span>
                <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%" }}>
                  <span style={{ background: "#F9FAFB", borderRadius: "10px", padding: "9px 10px" }}>
                    <span style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#98A2B3" }}>STATEMENT</span>
                    <span style={{ display: "block", fontSize: "15px", fontWeight: 800, color: "#101828" }}>{c.stmt}</span>
                  </span>
                  <span style={{ background: "#F9FAFB", borderRadius: "10px", padding: "9px 10px" }}>
                    <span style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#98A2B3" }}>BOOK</span>
                    <span style={{ display: "block", fontSize: "15px", fontWeight: 800, color: "#101828" }}>{c.book}</span>
                  </span>
                </span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: c.dfg }}>{c.diff}</span>
                <span style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                  <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: c.rsBg, color: c.rsFg }}>{c.rs}</span>
                  <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: c.hBg, color: c.hFg }}>Feed: {c.health}</span>
                  <span style={{ fontSize: "11px", color: "#98A2B3", marginLeft: "auto" }}>{c.sync}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ ...card, padding: "32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#344054" }}>No bank or cash accounts yet</div>
            <div style={{ fontSize: "12.5px", color: "#98A2B3", maxWidth: "460px" }}>Add each bank account and the cash drawer to reconcile them. Card and online takings already post to Payment Clearing; payouts move them into the bank.</div>
            <button type="button" onClick={() => void fin.act("addBank")} style={{ marginTop: "6px", border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}>
              Add / Connect Account
            </button>
          </div>
        )
      ) : null}

      {ci ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <section style={{ ...card, padding: "18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "14px", alignItems: "center" }}>
            <div style={{ gridColumn: "span 2", minWidth: 0 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>PERIOD</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.5px" }}>{ci.period}</div>
              <div style={{ height: "10px", borderRadius: "6px", background: "#EEF1F4", marginTop: "10px", overflow: "hidden" }} role="progressbar" aria-valuenow={ci.done} aria-valuemax={ci.total} aria-label="Close progress">
                <div style={{ height: "100%", width: ci.w, background: "#12A150", borderRadius: "6px", transition: "width .4s" }} />
              </div>
              <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "6px" }}>
                <b style={{ color: "#101828" }}>{ci.pct}</b> · {ci.done} of {ci.total} controls complete
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>TARGET CLOSE</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>{ci.target}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>OWNER</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>{ci.owner}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>STATUS</div>
              <span style={{ display: "inline-block", marginTop: "3px", fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: ci.sBg, color: ci.sFg }}>{ci.status}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {ci.started ? (
                <button type="button" disabled={!ci.canFinal} onClick={() => void fin.act(`finalApprove:${ci.runId}`)} style={{ border: 0, background: ci.canFinal ? "#12A150" : "#D0D5DD", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: ci.canFinal ? "pointer" : "not-allowed", minHeight: "44px" }}>
                  Final Approval &amp; Lock
                </button>
              ) : (
                <button type="button" onClick={() => void fin.act("startClose")} style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
                  Start Close
                </button>
              )}
              <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{ci.fwhy}</span>
            </div>
          </section>
          <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: "16px", alignItems: "start" }}>
            <section style={{ background: "#fff", border: "1px solid #FDD9D6", borderRadius: "16px", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #FEE4E2", display: "flex", alignItems: "center", gap: "9px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B42318" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#B42318" }}>Close blockers</h2>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: "20px", padding: "2px 8px" }}>{sc.blockers?.length ?? 0}</span>
              </div>
              {!sc.blockers?.length ? <div style={{ padding: "18px", fontSize: "12.5px", color: "#0E8442", fontWeight: 700 }}>No blockers. Review statements, then give final approval.</div> : null}
              {(sc.blockers ?? []).map((b, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderTop: "1px solid #FEF3F2" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{b.l}</div>
                    <div style={{ fontSize: "12px", color: "#B42318", marginTop: "2px" }}>{b.d}</div>
                  </div>
                  <button type="button" onClick={() => void fin.act(b.a)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", minHeight: "38px" }}>
                    {b.al} ›
                  </button>
                </div>
              ))}
            </section>
            <section style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5" }}>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>Cut-off checks</h2>
                <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "2px" }}>Read-only view of other modules. Fix issues at the source.</div>
              </div>
              {(sc.cutoff ?? []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid #F2F4F7" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>
                      {c.ref} <span style={{ fontWeight: 600, color: "#98A2B3" }}>· {c.m}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#667085" }}>{c.d}</div>
                  </div>
                  <button type="button" onClick={() => void fin.act(c.m.startsWith("Orders") ? "link:/orders" : c.m.startsWith("Bookings") ? "link:/bookings" : "link:/inventory/purchases")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
                    Open Source
                  </button>
                </div>
              ))}
              {!sc.cutoff?.length ? <div style={{ padding: "14px 18px", fontSize: "12.5px", color: "#0E8442", fontWeight: 700, borderTop: "1px solid #F2F4F7" }}>No cut-off items: no goods awaiting bills, open orders or pending deposits around month end.</div> : null}
              <div style={{ padding: "13px 18px", borderTop: "1px solid #F0F2F5", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#98A2B3" }}>PERIODS</div>
                {(sc.periods ?? []).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", flex: 1 }}>
                      {p.l} <span style={{ fontWeight: 500, color: "#98A2B3", fontSize: "11.5px" }}>· {p.d}</span>
                    </span>
                    <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: p.bg, color: p.fg }}>{p.s}</span>
                    {p.canReopen ? (
                      <button type="button" onClick={() => void fin.act(`reopenPeriod:${p.id}`)} style={{ border: 0, background: "transparent", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", minHeight: "34px" }}>
                        {boot?.actor.admin ? "Reopen" : "Request Reopen"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {sc.flow && !showRecon ? <FlowView flow={sc.flow} /> : null}

      {sc.depr ? (
        <section style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>{sc.depr.title}</h2>
            <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: sc.depr.status === "Posted" ? "#E8F7EE" : "#FEF6E7", color: sc.depr.status === "Posted" ? "#0E8442" : "#B54708" }}>
              {sc.depr.status}
              {sc.depr.je ? ` · ${sc.depr.je}` : ""}
            </span>
            {sc.depr.blocked ? <span style={{ fontSize: "11.5px", color: "#B42318" }}>{sc.depr.blocked}</span> : null}
            <span style={{ marginLeft: "auto", fontSize: "13px", fontWeight: 800, color: "#101828" }}>Total {sc.depr.total}</span>
            {sc.depr.canRun ? (
              <button type="button" onClick={() => void fin.act("runDep")} style={{ border: 0, background: "#12A150", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>
                Run Depreciation
              </button>
            ) : null}
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: "620px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.5fr) 120px 120px 120px 110px", gap: "12px", padding: "9px 18px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px" }}>
                <span>Asset</span>
                <span style={{ textAlign: "right" }}>Opening NBV</span>
                <span style={{ textAlign: "right" }}>Depreciation</span>
                <span style={{ textAlign: "right" }}>Closing NBV</span>
                <span>Method</span>
              </div>
              {sc.depr.rows.map((r) => (
                <div key={r.a} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.5fr) 120px 120px 120px 110px", gap: "12px", padding: "9px 18px", borderTop: "1px solid #F2F4F7", fontSize: "12.5px", color: "#344054" }}>
                  <span style={{ fontWeight: 700, color: "#101828" }}>{r.a}</span>
                  <span style={{ textAlign: "right" }}>{r.open}</span>
                  <span style={{ textAlign: "right", fontWeight: 700 }}>{r.dep}</span>
                  <span style={{ textAlign: "right" }}>{r.close}</span>
                  <span style={{ color: "#667085" }}>{r.m}</span>
                </div>
              ))}
              {!sc.depr.rows.length ? <div style={{ padding: "14px 18px", fontSize: "12.5px", color: "#98A2B3", borderTop: "1px solid #F2F4F7" }}>No asset is due for depreciation in this month.</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {showRecon ? <ReconWorkspace id={reconId!} fin={fin} /> : null}

      {stmt ? (
        <section id="nxf-stmt" style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <div role="tablist" aria-label="Statement" style={{ display: "flex", gap: "3px", background: "#F2F4F7", padding: "3px", borderRadius: "10px", flexWrap: "wrap" }}>
              {stmt.tabs.map((t) => (
                <button key={t.k} type="button" role="tab" aria-selected={t.k === stmtT} onClick={() => set({ stmt: t.k })} style={{ border: 0, borderRadius: "8px", padding: "8px 13px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", background: t.bg, color: t.fg, boxShadow: t.sh, minHeight: "38px" }}>
                  {t.l}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px", fontWeight: 700, color: "#475467", cursor: "pointer" }}>
              <input type="checkbox" checked={cmp} onChange={() => set({ cmp: !cmp })} style={{ width: "16px", height: "16px", accentColor: "#12A150" }} />
              Compare to prior period
            </label>
            {(boot?.branches.length ?? 0) > 1 ? (
              <select aria-label="Dimensions" value={branch} onChange={(e) => set({ branch: e.target.value })} style={{ ...selSt, fontSize: "12px" }}>
                {boot?.allBranches ? <option value="all">All branches (consolidated)</option> : null}
                {boot?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} only
                  </option>
                ))}
              </select>
            ) : (
              <select aria-label="Consolidation scope" style={{ ...selSt, fontSize: "12px" }} disabled>
                <option>Single entity</option>
              </select>
            )}
            <span style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
              {["pdf", "xlsx", "csv"].map((f) => (
                <button key={f} type="button" onClick={() => void fin.act(`exportStmt:${f}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </span>
          </div>
          {!stmt.ok && stmt.integrity ? (
            <div role="alert" style={{ margin: "18px", border: "2px solid #B42318", background: "#FEF3F2", borderRadius: "14px", padding: "18px" }}>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#B42318" }}>Critical integrity error — {stmt.title} does not balance</div>
              <div style={{ fontSize: "12.5px", color: "#475467", marginTop: "5px" }}>
                {stmt.integrity.ta} ≠ {stmt.integrity.tle} (difference {stmt.integrity.d}). The statement is withheld until the ledger is corrected.
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button type="button" onClick={() => fin.go("gl")} style={{ border: 0, background: "#B42318", borderRadius: "9px", padding: "9px 14px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}>
                  Investigate in Ledger
                </button>
                <button type="button" onClick={() => fin.go("close")} style={{ border: "1px solid #FDA29B", background: "#fff", borderRadius: "9px", padding: "9px 14px", fontSize: "12px", fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: "40px" }}>
                  View Close Controls
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", marginBottom: "6px" }}>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>{stmt.title}</h2>
                <span style={{ fontSize: "12px", color: "#667085" }}>{stmt.sub}</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#667085", marginBottom: "12px" }}>{stmt.basis}</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: "560px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: stmt.grid, gap: "10px", padding: "8px 0", borderBottom: "1px solid #E6EAF0", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px" }}>
                    <span>Line</span>
                    <span style={{ textAlign: "right" }}>{stmt.hA}</span>
                    {stmt.showB ? <span style={{ textAlign: "right" }}>{stmt.hB}</span> : null}
                    {stmt.showC ? <span style={{ textAlign: "right" }}>{stmt.hC}</span> : null}
                  </div>
                  {stmt.rows.map((r) => (
                    <div key={r.i} className={r.drill ? "fx-row" : undefined} onClick={() => r.drill && fin.openRec("statements", r.code)} style={{ display: "grid", gridTemplateColumns: stmt.grid, gap: "10px", padding: `${r.pt} 8px 9px ${r.pl}`, borderTop: r.bt, background: r.bg, cursor: r.cur, fontSize: r.fs, fontWeight: r.fw, color: r.col, textTransform: r.tt as CSSProperties["textTransform"], borderRadius: "4px" }}>
                      <span>{r.l}</span>
                      <span style={{ textAlign: "right", color: /−/.test(r.a) ? "#B42318" : "inherit" }}>{r.a}</span>
                      {stmt.showB ? <span style={{ textAlign: "right", color: "#667085" }}>{r.b}</span> : null}
                      {stmt.showC ? <span style={{ textAlign: "right", color: "#475467" }}>{r.c}</span> : null}
                    </div>
                  ))}
                  {stmt.rows.length <= 2 ? <div style={{ padding: "14px 0", fontSize: "12.5px", color: "#98A2B3" }}>No posted activity in this period.</div> : null}
                </div>
              </div>
              {stmt.check ? (
                <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: "#0E8442", background: "#F7FCF9", border: "1px solid #CDEBD8", borderRadius: "10px", padding: "9px 12px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Integrity check passed · {stmt.check}
                </div>
              ) : null}
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "10px" }}>Click any account line to see contributing journals and source transactions.</div>
            </div>
          )}
        </section>
      ) : null}

      {sc.settings ? <Settings s={sc.settings} fin={fin} boot={boot} /> : null}

      {sc.table && !showRecon ? (
        <TableView
          screenKey={k}
          table={sc.table}
          onRow={onRow}
          extraFilters={
            k === "gl" && sc.glFilters ? (
              <>
                <select aria-label="Account" value={glAccount} onChange={(e) => set({ glAccount: e.target.value })} style={{ ...selSt, fontSize: "12px", maxWidth: "220px" }}>
                  <option value="">All accounts</option>
                  {sc.glFilters.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.l}
                    </option>
                  ))}
                </select>
                <select aria-label="Source module" value={glSource} onChange={(e) => set({ glSource: e.target.value })} style={{ ...selSt, fontSize: "12px" }}>
                  <option value="">All sources</option>
                  {sc.glFilters.sources.map((x) => (
                    <option key={x.k} value={x.k}>
                      {x.l}
                    </option>
                  ))}
                </select>
              </>
            ) : k === "feeds" && sc.feedFilter ? (
              <select aria-label="Bank account" value={bank} onChange={(e) => set({ bank: e.target.value })} style={{ ...selSt, fontSize: "12px" }}>
                <option value="">All bank accounts</option>
                {sc.feedFilter.banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.l}
                  </option>
                ))}
              </select>
            ) : null
          }
          emptyText={EMPTY[k]}
        />
      ) : null}
    </>
  );
}

const EMPTY: Record<string, string> = {
  gl: "No posted lines in this period",
  journals: "No journals in this period",
  feeds: "No bank transactions yet — import a statement or link a payout provider",
  recon: "No reconciliations yet — start one from a statement balance",
  ar: "Nothing is owed by customers",
  ap: "No open payables",
  bills: "No bills yet",
  taxes: "No tax activity yet",
  fa: "No assets in the register",
  budgets: "No budget lines",
  close: "Nothing to close",
};
