"use client";

import { useEffect } from "react";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { NewProjectWizard, QuickView, TaskDrawer } from "./overlays-core";
import { ApprovalDrawer, ApprovalNewDrawer, FileDrawer, MilestoneDrawer, MilestoneNewDrawer, RejectModal } from "./overlays-work";
import { AiDrawer, CommandPalette, TemplateBuilderDrawer, TemplatePreviewDrawer } from "./overlays-extra";

export function ProjectsOverlays() {
  const { data: ws } = useWorkspace();
  const drawer = useProjectsStore((s) => s.drawer);
  const palette = useProjectsStore((s) => s.palette);
  const confirm = useProjectsStore((s) => s.confirm);
  const rejectIds = useProjectsStore((s) => s.rejectIds);
  const toast = useProjectsStore((s) => s.toast);

  // Esc closes the top-most layer first: confirm → reject → palette → drawer (guarding unsaved wizards).
  const closeTop = () => {
    const s = useProjectsStore.getState();
    if (s.confirm) return s.ask(null);
    if (s.rejectIds) return s.setRejectIds(null);
    if (s.palette) return s.setPalette(false);
    if (s.drawer?.kind === "np" && s.npDirty) {
      return s.ask({ title: "You have unsaved changes", body: "Leaving now discards this project’s changes.", ok: "Discard", cancel: "Continue editing", danger: true, run: () => s.close() });
    }
    if (s.drawer) s.close();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && closeTop();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const anyLayer = !!drawer || palette;
  return (
    <>
      {anyLayer && <div onClick={closeTop} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.32)", zIndex: 90 }} />}
      {ws && drawer?.kind === "qp" && <QuickView ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "task" && <TaskDrawer key={drawer.id} ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "np" && <NewProjectWizard key={drawer.editId ?? drawer.templateId ?? "new"} ws={ws} templateId={drawer.templateId} type={drawer.type} editId={drawer.editId} />}
      {ws && drawer?.kind === "ms" && <MilestoneDrawer ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "msnew" && <MilestoneNewDrawer ws={ws} projectId={drawer.projectId} />}
      {ws && drawer?.kind === "file" && <FileDrawer ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "ap" && <ApprovalDrawer ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "apnew" && <ApprovalNewDrawer ws={ws} projectId={drawer.projectId} />}
      {ws && drawer?.kind === "tpl" && <TemplatePreviewDrawer ws={ws} id={drawer.id} />}
      {ws && drawer?.kind === "tplnew" && <TemplateBuilderDrawer ws={ws} />}
      {ws && drawer?.kind === "ai" && <AiDrawer ws={ws} tab={drawer.tab} projectId={drawer.projectId} />}
      {ws && palette && <CommandPalette ws={ws} />}
      {rejectIds && <RejectModal ids={rejectIds} />}
      {confirm && (
        <div role="alertdialog" aria-label={confirm.title} style={{ position: "fixed", inset: 0, zIndex: 98, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", background: "rgba(10,27,42,.35)" }}>
          <div style={{ width: "100%", maxWidth: "440px", background: "#fff", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 30px 80px rgba(16,24,40,.25)", animation: "nxin .2s ease" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>{confirm.title}</div>
            <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.6 }}>{confirm.body}</div>
            {(confirm.items ?? []).map((i, k) => (
              <div key={k} style={{ fontSize: "12.5px", color: "#B42318", fontWeight: 600, display: "flex", gap: "7px" }}>
                • {i}
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => useProjectsStore.getState().ask(null)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                {confirm.cancel ?? "Cancel"}
              </button>
              {confirm.altRun && (
                <button
                  type="button"
                  onClick={() => {
                    const r = confirm.altRun;
                    useProjectsStore.getState().ask(null);
                    void r?.();
                  }}
                  style={{ border: "1px solid #12A150", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#0E8442", cursor: "pointer" }}
                >
                  {confirm.alt}
                </button>
              )}
              {confirm.run && (
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    const r = confirm.run;
                    useProjectsStore.getState().ask(null);
                    void r?.();
                  }}
                  style={{ border: 0, background: confirm.danger ? "#D92D20" : "#12A150", color: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}
                >
                  {confirm.ok}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: "22px", transform: "translateX(-50%)", zIndex: 99, background: "#0A1B2A", color: "#fff", borderRadius: "11px", padding: "11px 16px", fontSize: "12.5px", fontWeight: 600, boxShadow: "0 12px 30px rgba(0,0,0,.25)", animation: "nxin .2s ease", maxWidth: "90vw" }}>
          {toast}
        </div>
      )}
    </>
  );
}
