"use client";

import { useQuery } from "@tanstack/react-query";
import { archiveTemplate, duplicateTemplate, fetchTemplates, publishTemplate, type TemplateRow } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { ErrorBox, Loading, btnPrimary, card, errorText } from "./projects-ui";

const TS: Record<string, [string, string]> = { Published: ["#ECFDF3", "#067647"], Draft: ["#FEF6E7", "#B54708"], Archived: ["#F2F4F7", "#667085"] };
export const tplMeta = (t: TemplateRow) => `${t.phases.length} phases · ${t.phases.reduce((a, p) => a + p.tasks.length, 0)} tasks · ${t.milestones.length} milestones · ${t.phases.reduce((a, p) => a + p.days, 0)} days`;
export const tplType = (cat: string) => (cat === "Marketing" ? "Campaign" : cat === "Operations" ? "Operations" : cat === "Development" ? "Implementation" : cat === "Internal" ? "Internal" : "Client");

export function useTemplateActions() {
  const flash = useProjectsStore((s) => s.flash);
  const ask = useProjectsStore((s) => s.ask);
  const close = useProjectsStore((s) => s.close);
  const invalidate = useProjectsInvalidate();
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      flash(msg);
      await invalidate();
    } catch (e) {
      flash(errorText(e));
    }
  };
  return {
    publish: (id: string) => ask({ title: "Publish this template?", body: "Published templates can be used by anyone who can create projects.", ok: "Publish", cancel: "Cancel", run: () => run(() => publishTemplate(id), "Template published").then(close) }),
    duplicate: (id: string) => run(() => duplicateTemplate(id), "Duplicated as a draft"),
    archive: (id: string) => ask({ title: "Archive this template?", body: "Projects already created from it are not affected.", ok: "Archive", danger: true, cancel: "Cancel", run: () => run(() => archiveTemplate(id), "Template archived") }),
  };
}

export function TemplatesView() {
  const { data: ws } = useWorkspace();
  const q = useQuery({ queryKey: ["projects-templates"], queryFn: fetchTemplates });
  const open = useProjectsStore((s) => s.open);
  const a = useTemplateActions();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = (q.data ?? []).filter((t) => t.status !== "Archived");
  const canCreate = !!ws?.me.can["Create projects"];
  const canManage = !!ws?.me.can["Manage settings"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "9px", alignItems: "center" }}>
        <div style={{ fontSize: "12.5px", color: "#475467" }}>Start projects from proven plans — phases, tasks, milestones, dependencies and roles included.</div>
        {canCreate && (
          <button type="button" className="pt-primary" onClick={() => open({ kind: "tplnew" })} style={{ ...btnPrimary, marginLeft: "auto" }}>
            + New template
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: "12px" }}>
        {list.map((t) => (
          <div key={t.id} style={{ ...card, padding: "15px 16px", display: "flex", flexDirection: "column", gap: "9px" }}>
            <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#0E8442", background: "#E7F6EE", borderRadius: "5px", padding: "2px 7px" }}>{t.category}</span>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: TS[t.status][1], background: TS[t.status][0], borderRadius: "5px", padding: "2px 7px" }}>{t.status}</span>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>{t.name}</div>
            <div style={{ fontSize: "12px", color: "#667085" }}>{tplMeta(t)}</div>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
              {t.phases.map((p, i) => (
                <span key={i} style={{ fontSize: "11px", color: "#344054", background: "#F2F4F7", borderRadius: "6px", padding: "2px 7px" }}>
                  {p.name}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "auto", paddingTop: "6px", flexWrap: "wrap" }}>
              {t.status === "Published" && canCreate && (
                <button type="button" onClick={() => open({ kind: "np", templateId: t.id, type: tplType(t.category) })} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                  Create project
                </button>
              )}
              {t.status === "Draft" && canManage && (
                <button type="button" onClick={() => a.publish(t.id)} style={{ border: 0, background: "#0A1B2A", color: "#fff", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                  Publish
                </button>
              )}
              <button type="button" onClick={() => open({ kind: "tpl", id: t.id })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Preview
              </button>
              {canCreate && (
                <button type="button" onClick={() => void a.duplicate(t.id)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                  Duplicate
                </button>
              )}
              {canManage && (
                <button type="button" onClick={() => a.archive(t.id)} style={{ border: 0, background: "none", padding: "7px 6px", fontSize: "12px", fontWeight: 700, color: "#667085", cursor: "pointer" }}>
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div style={{ ...card, padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No templates yet. Build one with + New template, or save a proven project plan as a template.</div>}
    </div>
  );
}
