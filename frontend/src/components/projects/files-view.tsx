"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFiles, toggleFilePin, uploadProjectFile } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { ACCESS, ErrorBox, Loading, addD, card, errorText, ext, fileSize, fmt, inputSt, selectSt, theadRow, th } from "./projects-ui";

export function FilesView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const files = useQuery({ queryKey: ["projects-files"], queryFn: fetchFiles });
  const open = useProjectsStore((s) => s.open);
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const [folder, setFolder] = useState("all");
  const [fq, setFq] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [upFolder, setUpFolder] = useState("Uploads");
  if (isLoading || files.isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  if (files.error) return <ErrorBox error={files.error} />;
  const list = files.data ?? [];
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const pname = new Map(ws.projects.map((p) => [p.id, p.name]));
  const weekAgo = addD(ws.today, -7);
  const FF: Record<string, (f: (typeof list)[number]) => boolean> = { all: () => true, pinned: (f) => f.pinned, recent: (f) => f.modified.slice(0, 10) >= weekAgo, shared: (f) => f.access === "client_shared" };
  const folders = [
    ...[
      ["all", "All files"],
      ["pinned", "Pinned"],
      ["recent", "Recent"],
      ["shared", "Shared with client"],
    ].map(([k, label]) => ({ k, label, n: list.filter(FF[k]).length, pl: "10px" })),
    ...live.map((p) => ({ k: p.id, label: p.name, n: list.filter((f) => f.projectId === p.id).length, pl: "18px" })),
  ];
  const ql = fq.trim().toLowerCase();
  const rows = list.filter(FF[folder] ?? ((f) => f.projectId === folder)).filter((f) => !ql || (f.name + (pname.get(f.projectId) ?? "")).toLowerCase().includes(ql));
  const inProject = live.some((p) => p.id === folder);
  const uploadTo = inProject ? folder : target || live[0]?.id || "";
  const canManage = ws.me.can["Manage files"];

  return (
    <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "14px" }}>
      <aside style={{ ...card, padding: "10px", display: "flex", flexDirection: "column", gap: "2px", alignSelf: "start" }}>
        {folders.map((f) => (
          <button key={f.k} type="button" onClick={() => setFolder(f.k)} style={{ border: 0, textAlign: "left", background: folder === f.k ? "#E7F6EE" : "transparent", color: folder === f.k ? "#0E8442" : "#475467", borderRadius: "8px", padding: "8px 10px", paddingLeft: f.pl, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", display: "flex", gap: "8px" }}>
            <span style={{ flex: 1 }}>{f.label}</span>
            <span style={{ fontSize: "11px", opacity: 0.7 }}>{f.n}</span>
          </button>
        ))}
      </aside>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", alignItems: "center" }}>
          <input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Search files" aria-label="Search files" style={{ ...inputSt, flex: 1, minWidth: "200px" }} />
          {canManage && !inProject && (
            <select value={uploadTo} onChange={(e) => setTarget(e.target.value)} aria-label="Upload to project" style={selectSt}>
              {live.map((p) => (
                <option key={p.id} value={p.id}>
                  Upload to {p.name}
                </option>
              ))}
            </select>
          )}
          {canManage && (
            <>
              <input list="pt-upload-folders" value={upFolder} onChange={(e) => setUpFolder(e.target.value)} aria-label="Upload into folder" placeholder="Folder" style={{ ...inputSt, width: "140px" }} />
              <datalist id="pt-upload-folders">
                {[...new Set(["Contracts", "Design", "Deliverables", "Invoices", "Uploads", ...list.map((x) => x.folder)])].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
          {canManage && (
            <label style={{ display: "flex", alignItems: "center", gap: "7px", height: "40px", border: 0, background: "#12A150", borderRadius: "10px", padding: "0 14px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: uploadTo && !busy ? "pointer" : "not-allowed", opacity: uploadTo && !busy ? 1 : 0.6 }}>
              {busy ? "Uploading…" : "+ Upload"}
              <input
                type="file"
                multiple
                disabled={!uploadTo || busy}
                onChange={async (e) => {
                  const fl = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!fl.length || !uploadTo) return;
                  setBusy(true);
                  let ok = 0;
                  for (const f of fl) {
                    try {
                      await uploadProjectFile(f, { projectId: uploadTo, folder: upFolder.trim() || "Uploads" });
                      ok++;
                    } catch (er) {
                      flash(`${f.name}: ${errorText(er)}`);
                    }
                  }
                  setBusy(false);
                  if (ok) flash(`${ok} file${ok > 1 ? "s" : ""} linked to ${pname.get(uploadTo)}`);
                  await invalidate();
                }}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
        <div style={{ fontSize: "11.5px", color: "#667085" }}>Files are stored with the project they belong to. There is no Documents, Contracts &amp; eSign module yet, so signatures aren’t tracked here.</div>
        <div style={{ ...card, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "820px" }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ padding: "10px 12px" }}>File</th>
                {["Project", "Folder", "Uploaded by", "Version", "Size", "Modified", "Access", ""].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const e = ext(f.ext);
                const ac = ACCESS[f.access];
                return (
                  <tr key={f.id} className="pt-row" onClick={() => open({ kind: "file", id: f.id })} style={{ borderTop: "1px solid #F0F2F5", cursor: "pointer" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: "9px", alignItems: "center" }}>
                        <span style={{ width: "32px", height: "32px", borderRadius: "8px", background: e[0], color: e[1], fontSize: "9.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>{f.ext.slice(0, 4)}</span>
                        <div style={{ fontWeight: 700, color: "#101828" }}>{f.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#344054" }}>{pname.get(f.projectId)}</td>
                    <td style={{ padding: "10px 8px", color: "#475467" }}>{f.folder}</td>
                    <td style={{ padding: "10px 8px", color: "#475467" }}>{f.by}</td>
                    <td style={{ padding: "10px 8px", color: "#344054", fontWeight: 700 }}>v{f.version}</td>
                    <td style={{ padding: "10px 8px", color: "#475467" }}>{fileSize(f.size)}</td>
                    <td style={{ padding: "10px 8px", color: "#475467", whiteSpace: "nowrap" }}>{fmt(f.modified)}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: ac.fg, background: ac.bg, borderRadius: "6px", padding: "3px 7px" }}>{ac.label}</span>
                    </td>
                    <td style={{ padding: "10px 8px" }} onClick={(ev) => ev.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Pin"
                        disabled={!canManage}
                        onClick={async () => {
                          await toggleFilePin(f.id).catch((er) => flash(errorText(er)));
                          await invalidate();
                        }}
                        style={{ border: 0, background: "none", cursor: canManage ? "pointer" : "default", fontSize: "13px", color: f.pinned ? "#101828" : "#D0D5DD", filter: f.pinned ? undefined : "grayscale(1) opacity(.45)" }}
                      >
                        📌
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div style={{ padding: "36px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No files in this folder yet. Upload one to link it to a project.</div>}
        </div>
      </div>
    </div>
  );
}
