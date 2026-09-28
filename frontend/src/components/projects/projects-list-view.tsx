"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { bulkProjects, deleteView, exportProjects, fetchSavedViews, saveView, toggleFavorite, type ProjectRow, type Workspace } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { Badge, ErrorBox, HealthBadge, Loading, ago, card, downloadCsv, errorText, fmt, left, money, pillBtn, pr, selectSt, inputSt, btnGhost, theadRow, th } from "./projects-ui";

export const PROJECT_VIEWS: Record<string, (p: ProjectRow, ws: Workspace) => boolean> = {
  "All Projects": (p) => !isArchived(p),
  "My Projects": (p, ws) => !isArchived(p) && ((!!ws.me.personId && p.managerId === ws.me.personId) || p.favorite),
  Active: (p) => !isArchived(p) && p.statusCat === "In progress",
  "At Risk": (p) => !isArchived(p) && (p.health === "At Risk" || p.health === "Critical" || p.status === "Blocked"),
  Overdue: (p) => !isArchived(p) && p.overdueCount > 0,
  Completed: (p) => !isArchived(p) && p.statusCat === "Done",
  Archived: (p) => isArchived(p),
};
export const isArchived = (p: ProjectRow) => !!p.archivedAt || p.status === "Archived";

export function budgetText(p: ProjectRow, currency: string): { txt: string; fg: string } {
  if (p.budget == null) return { txt: "No budget set", fg: "#98A2B3" };
  const ratio = p.budget ? (p.consumed ?? 0) / p.budget : 0;
  const over = ratio > p.progress / 100 + 0.15;
  return { txt: `${Math.round(ratio * 100)}% of ${money(p.budget, currency)}`, fg: over ? "#B42318" : "#344054" };
}

export function ProjectsListView() {
  const router = useRouter();
  const { data: ws, error, isLoading } = useWorkspace();
  const s = useProjectsStore();
  const invalidate = useProjectsInvalidate();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [sv, setSv] = useState<{ name: string; vis: string } | null>(null);
  const { data: saved = [] } = useQuery({ queryKey: ["projects-views"], queryFn: fetchSavedViews });

  const people = useMemo(() => new Map((ws?.people ?? []).map((p) => [p.id, p.name])), [ws]);
  const rows = useMemo(() => {
    if (!ws) return [];
    const vf = PROJECT_VIEWS[s.view] ?? PROJECT_VIEWS["All Projects"];
    const ql = s.q.trim().toLowerCase();
    return ws.projects.filter(
      (p) => vf(p, ws) && (s.fStatus === "All statuses" || p.status === s.fStatus) && (s.fHealth === "All health" || p.health === s.fHealth) && (!ql || (p.name + p.number + (p.customerName ?? "") + (people.get(p.managerId ?? "") ?? "")).toLowerCase().includes(ql)),
    );
  }, [ws, s.view, s.q, s.fStatus, s.fHealth, people]);

  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;

  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const allSel = rows.length > 0 && rows.every((r) => sel[r.id]);
  const hasFilters = s.fStatus !== "All statuses" || s.fHealth !== "All health" || !!s.q;
  const resetF = () => s.setProjFilters({ fStatus: "All statuses", fHealth: "All health", q: "", view: "All Projects" });
  const liveCount = ws.projects.filter((p) => !isArchived(p)).length;
  const statusList = ws.config.statuses.map((x) => x.name);

  const bulk = (action: "status" | "archive", status?: string) =>
    s.ask({
      title: action === "archive" ? `Archive ${selIds.length} project${selIds.length > 1 ? "s" : ""}?` : `Change status to ${status}?`,
      body: action === "archive" ? "Archived projects remain available in the Archived view and can be restored. They no longer appear in active views." : `You are about to update ${selIds.length} project${selIds.length > 1 ? "s" : ""}. Each change is written to the audit log.`,
      ok: action === "archive" ? "Archive" : "Update projects",
      danger: action === "archive",
      cancel: "Cancel",
      run: async () => {
        try {
          const r = await bulkProjects(selIds, action, status);
          setSel({});
          s.flash(action === "archive" ? "Archived — restore from the Archived view" : `${r.updated} projects updated to ${status}`);
          await invalidate();
        } catch (e) {
          s.flash(errorText(e));
        }
      },
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {Object.keys(PROJECT_VIEWS).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              s.setProjFilters({ view: l });
              setSel({});
            }}
            style={{ ...pillBtn(s.view === l), display: "flex", gap: "6px", alignItems: "center" }}
          >
            {l}
            <span style={{ fontSize: "10.5px", opacity: 0.75 }}>{ws.projects.filter((p) => PROJECT_VIEWS[l](p, ws)).length}</span>
          </button>
        ))}
        {saved.map((v) => {
          const f = v.filters;
          const on = s.view === f.view && s.fStatus === f.fStatus && s.fHealth === f.fHealth && s.q === (f.q ?? "");
          return (
            <span key={v.id} style={{ display: "inline-flex", alignItems: "center", ...pillBtn(on), padding: 0, overflow: "hidden" }}>
              <button type="button" onClick={() => s.setProjFilters({ view: f.view ?? "All Projects", fStatus: f.fStatus ?? "All statuses", fHealth: f.fHealth ?? "All health", q: f.q ?? "" })} style={{ border: 0, background: "none", color: "inherit", padding: "7px 6px 7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                ★ {v.name} <span style={{ fontSize: "10px", opacity: 0.7 }}>· {v.visibility}</span>
              </button>
              {v.mine && (
                <button
                  type="button"
                  aria-label="Delete saved view"
                  onClick={async () => {
                    await deleteView(v.id).catch((e) => s.flash(errorText(e)));
                    await invalidate();
                  }}
                  style={{ border: 0, background: "none", color: "#98A2B3", padding: "7px 10px 7px 4px", cursor: "pointer", fontSize: "13px" }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {sv ? (
          <span style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
            <input value={sv.name} onChange={(e) => setSv({ ...sv, name: e.target.value })} placeholder="View name" aria-label="Saved view name" style={{ height: "32px", border: "1px solid #12A150", borderRadius: "20px", padding: "0 11px", fontSize: "12px", width: "150px" }} />
            <select value={sv.vis} onChange={(e) => setSv({ ...sv, vis: e.target.value })} aria-label="Visibility" style={{ height: "32px", border: "1px solid #E6EAF0", borderRadius: "20px", padding: "0 8px", fontSize: "12px" }}>
              <option>Private</option>
              <option>Team</option>
              <option>Organization</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!sv.name.trim()) return;
                try {
                  await saveView(sv.name.trim(), sv.vis, { view: s.view, fStatus: s.fStatus, fHealth: s.fHealth, q: s.q });
                  s.flash(`Saved view “${sv.name.trim()}” · ${sv.vis}`);
                  setSv(null);
                  await invalidate();
                } catch (e) {
                  s.flash(errorText(e));
                }
              }}
              style={{ height: "32px", border: 0, background: "#12A150", color: "#fff", borderRadius: "20px", padding: "0 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
            >
              Save
            </button>
            <button type="button" onClick={() => setSv(null)} style={{ height: "32px", border: 0, background: "none", color: "#667085", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setSv({ name: "", vis: "Private" })} style={{ border: "1px dashed #12A150", background: "#fff", color: "#0E8442", borderRadius: "20px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            + Save current view
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", alignItems: "center" }}>
        <input value={s.q} onChange={(e) => s.setProjFilters({ q: e.target.value })} placeholder="Search name, ID, customer, manager" aria-label="Search projects" style={{ ...inputSt, flex: 1, minWidth: "220px" }} />
        <select value={s.fStatus} onChange={(e) => s.setProjFilters({ fStatus: e.target.value })} aria-label="Status" style={selectSt}>
          {["All statuses", ...statusList].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={s.fHealth} onChange={(e) => s.setProjFilters({ fHealth: e.target.value })} aria-label="Health" style={selectSt}>
          {["All health", "Healthy", "Watch", "At Risk", "Critical", "No Data"].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" onClick={resetF} style={{ height: "40px", border: 0, background: "none", color: "#0E8442", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
            Reset filters
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              const r = await exportProjects(rows.map((x) => x.id), s.scope);
              downloadCsv(r.filename, r.csv);
              s.flash(`Exported ${r.count} projects (visible columns only)`);
            } catch (e) {
              s.flash(errorText(e));
            }
          }}
          style={btnGhost}
        >
          Export CSV
        </button>
      </div>

      {selIds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0A1B2A", color: "#fff", borderRadius: "12px", padding: "9px 14px", flexWrap: "wrap", animation: "nxin .2s ease" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{selIds.length} selected</span>
          <select value="" onChange={(e) => e.target.value && bulk("status", e.target.value)} aria-label="Change status" style={{ height: "34px", border: 0, borderRadius: "8px", padding: "0 8px", fontSize: "12px" }}>
            <option value="">Change status…</option>
            {statusList
              .filter((x) => x !== "Archived")
              .map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
          <button type="button" onClick={() => bulk("archive")} style={{ height: "34px", border: "1px solid #33506A", background: "transparent", color: "#fff", borderRadius: "8px", padding: "0 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            Archive
          </button>
          <button type="button" onClick={() => setSel({})} style={{ marginLeft: "auto", border: 0, background: "none", color: "#AFC0CE", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}

      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "1100px" }}>
          <thead>
            <tr style={theadRow}>
              <th style={{ padding: "10px 12px", width: "34px" }}>
                <input
                  type="checkbox"
                  checked={allSel}
                  onChange={() => {
                    const n: Record<string, boolean> = {};
                    if (!allSel) rows.forEach((r) => (n[r.id] = true));
                    setSel(n);
                  }}
                  aria-label="Select all"
                />
              </th>
              {["Project", "Customer", "Manager", "Status", "Priority", "Health", "Progress", "Due", "Tasks", "Next milestone", "Budget used", "Last activity"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const [lt, lfg] = left(p.dueDate, ws.today, p.statusCat === "Done");
              const b = budgetText(p, ws.currency);
              return (
                <tr key={p.id} className="pt-row" onClick={() => s.open({ kind: "qp", id: p.id })} onDoubleClick={() => router.push(`/projects/${p.id}`)} style={{ borderTop: "1px solid #F0F2F5", cursor: "pointer", background: sel[p.id] ? "#F3FBF6" : "#fff" }}>
                  <td style={{ padding: "10px 12px" }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!sel[p.id]} onChange={() => setSel((x) => ({ ...x, [p.id]: !x[p.id] }))} aria-label="Select project" />
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        aria-label="Favorite"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await toggleFavorite(p.id).catch((er) => s.flash(errorText(er)));
                          await invalidate();
                        }}
                        style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: p.favorite ? "#F79009" : "#D0D5DD", fontSize: "14px", lineHeight: 1 }}
                      >
                        ★
                      </button>
                      <div>
                        <div style={{ fontWeight: 700, color: "#101828" }}>{p.name}</div>
                        <div style={{ fontSize: "11px", color: "#98A2B3" }}>
                          {p.number} · {p.type}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{p.customerName ?? "Internal"}</td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{people.get(p.managerId ?? "") ?? "Unassigned"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <Badge s={p.status} />
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 700, color: pr(p.priority).fg }}>{p.priority}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <HealthBadge h={p.health} />
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <span style={{ width: "60px", height: "6px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: p.progress + "%", background: "#12A150" }} />
                      </span>
                      <b style={{ color: "#344054" }}>{p.progress}%</b>
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ color: "#344054" }}>{fmt(p.dueDate)}</div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: lfg }}>{lt}</div>
                  </td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    {p.taskCount}
                    {p.overdueCount > 0 && <span style={{ color: "#B42318", fontWeight: 700 }}> · {p.overdueCount} overdue</span>}
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{p.nextMilestone ? `${p.nextMilestone.name} · ${fmt(p.nextMilestone.date).slice(0, 5)}` : "Not set"}</td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap", color: ws.me.can["View financials"] ? b.fg : "#98A2B3", fontWeight: 600 }}>{ws.me.can["View financials"] ? b.txt : "Hidden"}</td>
                  <td style={{ padding: "10px 8px", color: "#667085", whiteSpace: "nowrap" }}>{ago(p.lastActivityAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div style={{ padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>{ws.projects.length ? "No projects match these filters" : "No projects yet"}</div>
            <div style={{ fontSize: "12.5px", color: "#667085" }}>{ws.projects.length ? "Try another view, or reset filters to see every project." : "Create your first project with New Project, or start from a template."}</div>
            {ws.projects.length ? (
              <button type="button" onClick={resetF} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Reset filters
              </button>
            ) : (
              <button type="button" onClick={() => s.open({ kind: "np" })} style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>
                New Project
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: "11.5px", color: "#667085" }}>
        Showing {rows.length} of {liveCount} · row opens quick view · double-click opens Project 360
      </div>
    </div>
  );
}
