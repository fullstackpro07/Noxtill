"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { fetchSettings, saveSettings, setBillRate, setProjectRole, type ProjectConfig } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore } from "./projects-store";
import { NotifyPrefs } from "./activity-view";
import { ErrorBox, Loading, card, errorText, fieldLabel, fieldInput, fieldSelect } from "./projects-ui";

const SECS = ["General", "Project Numbering", "Statuses", "Custom Fields", "Permissions", "Notifications", "Client Portal", "Archive Policy"];
const CAT_COLOR: Record<string, string> = { "Not started": "#2F4FB3", "In progress": "#12A150", Paused: "#667085", Done: "#0E8442", Closed: "#98A2B3" };

export function SettingsView() {
  const q = useQuery({ queryKey: ["projects-settings"], queryFn: fetchSettings });
  const business = useAuthStore((s) => s.business);
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const [sec, setSec] = useState("General");
  const [draft, setCfg] = useState<ProjectConfig | null>(null);
  const [newField, setNewField] = useState("");
  const [newType, setNewType] = useState("Text");
  const [newApplies, setNewApplies] = useState<"Project" | "Task">("Project");
  const [saving, setSaving] = useState(false);
  const cfg = draft ?? q.data?.config ?? null;
  const dirty = useMemo(() => !!cfg && !!q.data && JSON.stringify(cfg) !== JSON.stringify(q.data.config), [cfg, q.data]);
  if (q.isLoading || !cfg) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const S = q.data;
  const ro = !S.canManage;
  const set = <K extends keyof ProjectConfig>(k: K, v: ProjectConfig[K]) => setCfg({ ...cfg, [k]: v });
  const year = new Date().getFullYear();
  const code = (business?.name ?? "BR").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  const preview = `${cfg.prefix}${cfg.year ? "-" + year : ""}${cfg.branchCode ? "-" + code : ""}-${String(cfg.nextNo).padStart(5, "0")}`;
  const check = (k: keyof ProjectConfig, label: string) => (
    <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
      <input type="checkbox" disabled={ro} checked={!!cfg[k]} onChange={() => set(k, !cfg[k] as never)} />
      {label}
    </label>
  );
  const sel = (k: keyof ProjectConfig, label: string, opts: Array<[string, string]>, disabled = ro, hint?: string) => (
    <label style={fieldLabel}>
      {label}
      <select disabled={disabled} value={String(cfg[k] ?? "")} onChange={(e) => set(k, (e.target.value || null) as never)} style={fieldSelect}>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {hint && <span style={{ fontSize: "11px", fontWeight: 500, color: "#98A2B3" }}>{hint}</span>}
    </label>
  );
  const o = (xs: string[]) => xs.map((x) => [x, x] as [string, string]);

  return (
    <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "14px" }}>
      <aside style={{ ...card, padding: "10px", display: "flex", flexDirection: "column", gap: "2px", alignSelf: "start" }}>
        {SECS.map((k) => (
          <button key={k} type="button" onClick={() => setSec(k)} style={{ border: 0, textAlign: "left", background: sec === k ? "#E7F6EE" : "transparent", color: sec === k ? "#0E8442" : "#475467", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
            {k}
          </button>
        ))}
      </aside>
      <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828", flex: 1 }}>{sec}</h2>
          {ro && sec !== "Notifications" && <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>View only — needs “Manage settings”</span>}
          {dirty && (
            <>
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#B54708" }}>Unsaved changes</span>
              <button type="button" onClick={() => setCfg(null)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Discard
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveSettings(cfg);
                    flash("Settings saved · change recorded in audit log");
                    setCfg(null);
                    await invalidate();
                  } catch (e) {
                    flash(errorText(e));
                  }
                  setSaving(false);
                }}
                style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "8px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>

        {sec === "General" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
            {sel("defMgr", "Default project manager", [["", "The person creating the project"], ...S.people.map((p) => [p.id, p.name] as [string, string])])}
            {sel("defStatus", "Default status", o(cfg.statuses.filter((s) => s.cat === "Not started" || s.name === "Active").map((s) => s.name)))}
            {sel("defPri", "Default priority", o(["Urgent", "High", "Medium", "Low", "None"]))}
            {sel("defDays", "Working days", o(["Mon–Fri", "Mon–Sat", "Every day"]), ro, "Used when templates spread phases over dates.")}
            <label style={fieldLabel}>
              Default timezone
              <select disabled value={business?.timezone ?? "UTC"} style={fieldSelect}>
                <option>{business?.timezone ?? "UTC"}</option>
              </select>
              <span style={{ fontSize: "11px", fontWeight: 500, color: "#98A2B3" }}>Project dates follow the business timezone, set in business Settings.</span>
            </label>
            {sel("defVis", "Default visibility", o(["Private", "Team", "Organization"]), ro, "Private projects are visible only to their manager, members and assignees.")}
            {sel("defView", "Default project view", o(["Overview", "Tasks"]), ro, "The tab Project 360 opens on.")}
            <label style={fieldLabel}>
              Kanban WIP limit (In Progress)
              <input disabled={ro} type="number" min={1} max={50} value={cfg.wipLimit} onChange={(e) => set("wipLimit", +e.target.value)} style={fieldInput} />
              <span style={{ fontSize: "11px", fontWeight: 500, color: "#98A2B3" }}>Moving past it is allowed but warned on the board.</span>
            </label>
          </div>
        )}

        {sec === "Project Numbering" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "12px" }}>
              <label style={fieldLabel}>
                Project prefix
                <input disabled={ro} value={cfg.prefix} onChange={(e) => set("prefix", e.target.value.toUpperCase())} style={fieldInput} />
              </label>
              <label style={fieldLabel}>
                Next number
                <input disabled={ro} type="number" min={S.config.nextNo} value={cfg.nextNo} onChange={(e) => set("nextNo", +e.target.value)} style={fieldInput} />
              </label>
              <label style={fieldLabel}>
                Task prefix
                <input disabled={ro} value={cfg.tprefix} onChange={(e) => set("tprefix", e.target.value.toUpperCase())} style={fieldInput} />
              </label>
            </div>
            {check("year", "Include year")}
            {check("branchCode", "Include branch code")}
            <div style={{ background: "#F3FBF6", border: "1px solid #D1F2DE", borderRadius: "10px", padding: "11px 13px", fontSize: "12.5px", color: "#101828" }}>
              Next project ID: <b>{preview}</b> · IDs already issued never change.
            </div>
          </>
        )}

        {sec === "Statuses" && (
          <>
            {cfg.statuses.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: "9px", alignItems: "center", border: "1px solid #F0F2F5", borderRadius: "10px", padding: "8px 10px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.c }} />
                <input value={r.name} disabled={r.locked || ro} onChange={(e) => set("statuses", cfg.statuses.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Status name" style={{ flex: 1, height: "34px", border: "1px solid #E6EAF0", borderRadius: "8px", padding: "0 9px", fontSize: "12.5px", background: r.locked ? "#F9FAFB" : "#fff" }} />
                {r.locked ? (
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#667085", width: "90px" }}>{r.cat}</span>
                ) : (
                  <select disabled={ro} value={r.cat} onChange={(e) => set("statuses", cfg.statuses.map((x, j) => (j === i ? { ...x, cat: e.target.value, c: CAT_COLOR[e.target.value] ?? x.c } : x)))} aria-label="Category" style={{ height: "30px", border: "1px solid #E6EAF0", borderRadius: "7px", fontSize: "11px", fontWeight: 700, color: "#667085", width: "96px" }}>
                    {["Not started", "In progress", "Paused"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
                {(
                  [
                    [-1, "↑", "Move up"],
                    [1, "↓", "Move down"],
                  ] as const
                ).map(([d, g, l]) => (
                  <button
                    key={d}
                    type="button"
                    disabled={ro}
                    aria-label={l}
                    onClick={() => {
                      const j = i + d;
                      if (j < 0 || j >= cfg.statuses.length) return;
                      const a = cfg.statuses.slice();
                      [a[i], a[j]] = [a[j], a[i]];
                      set("statuses", a);
                    }}
                    style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "7px", width: "30px", height: "30px", cursor: "pointer" }}
                  >
                    {g}
                  </button>
                ))}
                {r.locked ? (
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#667085", background: "#F2F4F7", borderRadius: "5px", padding: "2px 6px" }}>System</span>
                ) : (
                  <button type="button" disabled={ro} aria-label="Remove status" onClick={() => set("statuses", cfg.statuses.filter((_, j) => j !== i))} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "7px", width: "30px", height: "30px", cursor: "pointer", color: "#667085" }}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {!ro && (
              <button type="button" onClick={() => set("statuses", [...cfg.statuses, { name: "New status", cat: "In progress", c: "#12A150", locked: false }])} style={{ alignSelf: "flex-start", border: "1px dashed #12A150", background: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 700, color: "#0E8442", cursor: "pointer" }}>
                + Add status
              </button>
            )}
            <div style={{ fontSize: "11.5px", color: "#667085" }}>A status can’t be removed while a project uses it. The category decides how progress and health treat it.</div>
          </>
        )}

        {sec === "Custom Fields" && (
          <>
            {cfg.fields.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", border: "1px solid #F0F2F5", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px" }}>
                <b style={{ flex: 1, color: "#101828" }}>{f.name}</b>
                <span style={{ color: "#475467" }}>{f.type}</span>
                <span style={{ color: "#475467" }}>{f.applies}</span>
                <button type="button" disabled={ro} onClick={() => set("fields", cfg.fields.map((x, j) => (j === i ? { ...x, client: x.client === "Client visible" ? "Internal only" : "Client visible" } : x)))} style={{ border: 0, background: "none", fontSize: "11px", fontWeight: 700, color: f.client === "Client visible" ? "#067647" : "#667085", cursor: "pointer" }}>
                  {f.client}
                </button>
                {!ro && (
                  <button type="button" aria-label="Remove field" onClick={() => set("fields", cfg.fields.filter((_, j) => j !== i))} style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer" }}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {!cfg.fields.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No custom fields yet. Project fields appear in the Project 360 summary and in the project editor.</div>}
            {!ro && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="New field name" aria-label="New field name" style={{ flex: 1, minWidth: "180px", height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12.5px" }} />
                <select value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Field type" style={{ height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }}>
                  {S.fieldTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select value={newApplies} onChange={(e) => setNewApplies(e.target.value as "Project" | "Task")} aria-label="Applies to" style={{ height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }}>
                  <option>Project</option>
                  <option>Task</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!newField.trim()) return;
                    set("fields", [...cfg.fields, { name: newField.trim(), type: newType, applies: newApplies, client: "Internal only" }]);
                    setNewField("");
                  }}
                  style={{ border: "1px solid #12A150", background: "#fff", color: "#0E8442", borderRadius: "9px", padding: "0 13px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}
                >
                  Add field
                </button>
              </div>
            )}
          </>
        )}

        {sec === "Permissions" && (
          <>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "760px" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#667085", fontSize: "10.5px", textTransform: "uppercase" }}>
                    <th style={{ padding: "8px" }}>Permission</th>
                    {S.roles.map((r) => (
                      <th key={r} style={{ padding: "8px", textAlign: "center" }}>
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {S.areas.map((a) => (
                    <tr key={a} style={{ borderTop: "1px solid #F0F2F5" }}>
                      <td style={{ padding: "8px", color: "#344054", fontWeight: 600 }}>{a}</td>
                      {S.roles.map((r) => {
                        const locked = r === "Owner" || (r === "Client" && !S.clientAreas.includes(a));
                        return (
                          <td key={r} style={{ padding: "8px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!cfg.perms[a]?.[r]}
                              disabled={locked || ro}
                              title={r === "Client" && locked ? "Not applicable to portal clients" : undefined}
                              aria-label={`${r}: ${a}`}
                              onChange={() => set("perms", { ...cfg.perms, [a]: { ...cfg.perms[a], [r]: !cfg.perms[a]?.[r] } })}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: "11.5px", color: "#667085" }}>Owner permissions are locked. Changes are enforced server-side and written to the audit log. For portal clients only “View financials” applies — it shows their invoices in the portal.</div>
            <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>Project roles &amp; bill rates</div>
              <div style={{ fontSize: "11.5px", color: "#667085" }}>Bill rate is what a person’s billable project hour is charged at; it is snapshotted on each time entry. Wage comes from Staff and is used for labour cost.</div>
              {S.people.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "12.5px" }}>
                  <span style={{ flex: 1, fontWeight: 700, color: "#101828" }}>{p.name}</span>
                  <span style={{ color: "#98A2B3", fontSize: "11.5px", textTransform: "capitalize" }}>{p.systemRole}</span>
                  <span style={{ color: "#98A2B3", fontSize: "11.5px", width: "120px", textAlign: "right" }}>{p.costRate != null ? `Wage ${business?.currency ?? ""} ${p.costRate}/h` : "No wage in Staff"}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={p.billRate ?? ""}
                    key={`${p.id}-${p.billRate}`}
                    placeholder="Bill rate/h"
                    disabled={!S.canManageBudgets}
                    aria-label={`Bill rate for ${p.name}`}
                    onBlur={async (e) => {
                      const raw = e.target.value.trim();
                      const next = raw === "" ? null : Number(raw);
                      if (next === (p.billRate ?? null)) return;
                      try {
                        await setBillRate(p.id, next);
                        flash(next == null ? `${p.name}’s bill rate cleared` : `${p.name} now bills ${business?.currency ?? ""} ${next}/h`);
                        await invalidate();
                      } catch (er) {
                        flash(errorText(er));
                      }
                    }}
                    style={{ width: "110px", height: "34px", border: "1px solid #E6EAF0", borderRadius: "8px", padding: "0 8px", fontSize: "12px" }}
                  />
                  <select
                    disabled={p.locked || ro}
                    value={p.projectRole}
                    aria-label={`Project role for ${p.name}`}
                    onChange={async (e) => {
                      try {
                        await setProjectRole(p.id, e.target.value);
                        flash(`${p.name} is now ${e.target.value}`);
                        await invalidate();
                      } catch (er) {
                        flash(errorText(er));
                      }
                    }}
                    style={{ height: "34px", border: "1px solid #E6EAF0", borderRadius: "8px", padding: "0 8px", fontSize: "12px" }}
                  >
                    {(p.locked ? ["Owner"] : S.roles.filter((r) => r !== "Owner" && r !== "Client")).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {sec === "Notifications" && (
          <>
            <div style={{ fontSize: "12px", color: "#667085" }}>Your own project alerts. They are delivered in-app and follow your global notification settings.</div>
            <NotifyPrefs />
          </>
        )}

        {sec === "Archive Policy" && (
          <>
            {sel("archiveDays", "Auto-archive completed projects after", o(["Never", "30 days", "90 days", "1 year"]))}
            {check("noHardDelete", "Block hard delete when a project has financial references, approvals or client history")}
            <div style={{ fontSize: "11.5px", color: "#667085" }}>Auto-archive runs daily. Archived projects stay in the Archived view.</div>
          </>
        )}

        {sec === "Client Portal" && (
          <>
            {check("portalOn", "Enable client portal")}
            {check("portalMfa", "Require email code on each sign-in")}
            {sel("inviteExp", "Invite links expire after", o(["7 days", "14 days", "30 days"]))}
          </>
        )}
      </section>
    </div>
  );
}
