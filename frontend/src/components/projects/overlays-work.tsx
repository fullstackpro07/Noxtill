"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  archiveFile,
  cancelApproval,
  completeMilestone,
  createApproval,
  createMilestone,
  decideApproval,
  decideTime,
  fetchApprovals,
  fetchFiles,
  fileDownload,
  readyMilestone,
  remindApproval,
  restoreFileVersion,
  resubmitApproval,
  setFileAccess,
  uploadProjectFile,
  type Delivery,
  type Workspace,
} from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore } from "./projects-store";
import { ACCESS, Badge, Drawer, aps, errLine, errorText, fieldInput, fieldLabel, fieldSelect, fileSize, fmt, footBtnGhost, footBtnPrimary, left } from "./projects-ui";

function useRun() {
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  return async (fn: () => Promise<unknown>, msg?: string | ((r: unknown) => string)) => {
    try {
      const r = await fn();
      if (msg) flash(typeof msg === "string" ? msg : msg(r));
      await invalidate();
      return true;
    } catch (e) {
      flash(errorText(e));
      return false;
    }
  };
}
const deliveryMsg = (d: Delivery | null | undefined, sent: string) => (!d ? sent : d.emailed ? `${sent} · emailed` : `${sent} · not emailed — ${d.reason ?? ""}`);

/* ── Milestone detail ──────────────────────────────────────────────── */

export function MilestoneDrawer({ ws, id }: { ws: Workspace; id: string }) {
  const close = useProjectsStore((s) => s.close);
  const open = useProjectsStore((s) => s.open);
  const ask = useProjectsStore((s) => s.ask);
  const run = useRun();
  const m = ws.milestones.find((x) => x.id === id);
  if (!m) return null;
  const p = ws.projects.find((x) => x.id === m.projectId);
  const [lt, lfg] = left(m.plannedDate, ws.today, m.status === "Completed");
  const linked = m.taskIds.map((t) => ws.tasks.find((x) => x.id === t)).filter((x): x is NonNullable<typeof x> => !!x);
  const openT = linked.filter((t) => t.status !== "Done" && t.status !== "Cancelled");
  const canEdit = ws.me.can["Edit projects"];
  const complete = () => {
    if (openT.length) return ask({ title: "Linked tasks are still open", body: `${m.name} can’t be completed until its linked tasks are done.`, items: openT.map((t) => `${t.number} · ${t.title} (${t.status})`), cancel: "Got it" });
    if (m.approvalMode !== "not_required" && m.approval !== "Approved")
      return ask({ title: m.approvalMode === "client" ? "Client approval is still pending" : "Internal approval is still pending", body: m.approvalMode === "client" ? "This milestone requires client approval. It can only complete after the client approves — never on their behalf." : "This milestone needs its internal approval first.", cancel: "Got it" });
    ask({ title: `Complete “${m.name}”?`, body: "Status becomes Completed with today as the actual date. This is recorded in the audit log.", ok: "Complete milestone", cancel: "Cancel", run: () => void run(() => completeMilestone(m.id), "Milestone completed") });
  };
  return (
    <Drawer
      label="Milestone detail"
      width={440}
      kicker={`${m.number} · ${p?.name ?? ""}`}
      title={m.name}
      onClose={close}
      footer={
        canEdit ? (
          <>
            <button type="button" className="pt-primary" disabled={m.status === "Completed"} onClick={complete} style={{ ...footBtnPrimary, opacity: m.status === "Completed" ? 0.6 : 1 }}>
              {m.status === "Completed" ? "Completed" : "Complete milestone"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const ok = await run(() => readyMilestone(m.id), "Marked Ready for Approval");
                if (ok && m.approvalMode !== "not_required" && ws.me.can["Request approvals"]) open({ kind: "apnew", projectId: m.projectId });
              }}
              style={footBtnGhost}
            >
              Mark ready for approval
            </button>
          </>
        ) : undefined
      }
    >
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <Badge s={m.status} />
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "6px", padding: "3px 7px" }}>Approval: {m.approval}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px", fontSize: "12px" }}>
        <div style={{ border: "1px solid #F0F2F5", borderRadius: "10px", padding: "9px 11px" }}>
          <div style={{ color: "#98A2B3", fontWeight: 600 }}>Deadline</div>
          <div style={{ fontWeight: 800, color: "#101828" }}>{fmt(m.plannedDate)}</div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: lfg }}>{lt}</div>
        </div>
        <div style={{ border: "1px solid #F0F2F5", borderRadius: "10px", padding: "9px 11px" }}>
          <div style={{ color: "#98A2B3", fontWeight: 600 }}>Owner</div>
          <div style={{ fontWeight: 800, color: "#101828" }}>{ws.people.find((x) => x.id === m.ownerId)?.name ?? "Unassigned"}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ flex: 1, height: "8px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: m.pct + "%", background: "#12A150" }} />
        </div>
        <b style={{ fontSize: "12.5px" }}>{m.pct}%</b>
      </div>
      <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{m.description || "No deliverables written yet."}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>
          Linked tasks · {linked.filter((t) => t.status === "Done").length} / {linked.length} done
        </div>
        {linked.map((t) => (
          <button key={t.id} type="button" onClick={() => open({ kind: "task", id: t.id })} style={{ border: 0, background: "none", padding: "7px 0", cursor: "pointer", display: "flex", gap: "9px", alignItems: "center", textAlign: "left", borderBottom: "1px solid #F4F5F7" }}>
            <span style={{ fontSize: "11px", color: "#98A2B3", width: "72px" }}>{t.number}</span>
            <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{t.title}</span>
            <Badge s={t.status} pad="2px 7px" />
          </button>
        ))}
        {!linked.length && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No tasks linked yet.</div>}
      </div>
    </Drawer>
  );
}

/* ── New milestone ─────────────────────────────────────────────────── */

export function MilestoneNewDrawer({ ws, projectId }: { ws: Workspace; projectId?: string }) {
  const close = useProjectsStore((s) => s.close);
  const run = useRun();
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const [mf, setMf] = useState({ name: "", projectId: projectId ?? live[0]?.id ?? "", ownerId: ws.me.personId ?? "", date: ws.today, desc: "", mode: "not_required", taskIds: [] as string[] });
  const [tried, setTried] = useState(false);
  const err = tried && !mf.name.trim();
  const tasks = ws.tasks.filter((t) => t.projectId === mf.projectId && t.status !== "Cancelled");
  return (
    <Drawer
      label="New milestone"
      title="New milestone"
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close} style={footBtnGhost}>
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!mf.name.trim()) return setTried(true);
              const ok = await run(() => createMilestone({ projectId: mf.projectId, name: mf.name, ownerId: mf.ownerId || null, plannedDate: mf.date, description: mf.desc, approvalMode: mf.mode, taskIds: mf.taskIds }), (r) => `${(r as { number: string }).number} added`);
              if (ok) close();
            }}
            style={footBtnPrimary}
          >
            Add milestone
          </button>
        </>
      }
    >
      <label style={fieldLabel}>
        Milestone name *
        <input value={mf.name} onChange={(e) => setMf({ ...mf, name: e.target.value })} placeholder="e.g. Client UAT sign-off" style={{ ...fieldInput, border: `1px solid ${err ? "#F04438" : "#E6EAF0"}` }} autoFocus />
      </label>
      {err && (
        <div role="alert" style={errLine}>
          Milestone name is required.
        </div>
      )}
      <label style={fieldLabel}>
        Project
        <select value={mf.projectId} onChange={(e) => setMf({ ...mf, projectId: e.target.value, taskIds: [] })} style={fieldSelect}>
          {live.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        Owner
        <select value={mf.ownerId} onChange={(e) => setMf({ ...mf, ownerId: e.target.value })} style={fieldSelect}>
          <option value="">Project manager</option>
          {ws.people.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        Planned date
        <input type="date" value={mf.date} onChange={(e) => setMf({ ...mf, date: e.target.value })} style={fieldSelect} />
      </label>
      <label style={fieldLabel}>
        Approval
        <select value={mf.mode} onChange={(e) => setMf({ ...mf, mode: e.target.value })} style={fieldSelect}>
          <option value="not_required">Not required</option>
          <option value="internal">Internal approval</option>
          <option value="client">Client approval (portal)</option>
        </select>
      </label>
      <label style={fieldLabel}>
        Deliverables
        <textarea value={mf.desc} onChange={(e) => setMf({ ...mf, desc: e.target.value })} rows={3} style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "13px" }} />
      </label>
      {tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#344054" }}>Linked tasks</div>
          {tasks.map((t) => (
            <label key={t.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
              <input type="checkbox" checked={mf.taskIds.includes(t.id)} onChange={() => setMf({ ...mf, taskIds: mf.taskIds.includes(t.id) ? mf.taskIds.filter((x) => x !== t.id) : [...mf.taskIds, t.id] })} />
              {t.number} · {t.title}
            </label>
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* ── File preview ──────────────────────────────────────────────────── */

export function FileDrawer({ ws, id }: { ws: Workspace; id: string }) {
  const close = useProjectsStore((s) => s.close);
  const ask = useProjectsStore((s) => s.ask);
  const flash = useProjectsStore((s) => s.flash);
  const run = useRun();
  const files = useQuery({ queryKey: ["projects-files"], queryFn: fetchFiles });
  const f = files.data?.find((x) => x.id === id);
  if (!f) return null;
  const p = ws.projects.find((x) => x.id === f.projectId);
  const can = ws.me.can["Manage files"];
  const linkLabel = f.linkType === "task" ? ws.tasks.find((t) => t.id === f.linkId)?.number ?? "Task" : f.linkType === "milestone" ? ws.milestones.find((m) => m.id === f.linkId)?.name ?? "Milestone" : "Project";
  const shared = f.access === "client_shared";
  const isImg = f.mime.startsWith("image/");
  return (
    <Drawer
      label="File preview"
      width={440}
      kicker={`${p?.name ?? ""} · ${f.folder}`}
      title={<span style={{ fontSize: "15px" }}>{f.name}</span>}
      onClose={close}
      footer={
        <>
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await fileDownload(f.id);
                window.open(r.url, "_blank", "noopener");
              } catch (e) {
                flash(errorText(e));
              }
            }}
            style={footBtnPrimary}
          >
            Download
          </button>
          {can && (
            <button
              type="button"
              onClick={() =>
                ask({
                  title: shared ? "Stop sharing with the client?" : "Share this file with the client?",
                  body: shared ? "The client loses access immediately." : `${f.name} will appear in the client portal for ${p?.name ?? "this project"}.`,
                  ok: shared ? "Unshare" : "Share file",
                  cancel: "Cancel",
                  run: () => void run(() => setFileAccess(f.id, shared ? "internal" : "client_shared"), "Access updated"),
                })
              }
              style={footBtnGhost}
            >
              {shared ? "Unshare" : "Share with client"}
            </button>
          )}
          {can && (
            <button
              type="button"
              onClick={() =>
                ask({
                  title: `Archive ${f.name}?`,
                  body: "It leaves project views but its versions and the audit log are kept.",
                  ok: "Archive",
                  danger: true,
                  cancel: "Cancel",
                  run: async () => {
                    if (await run(() => archiveFile(f.id), "File archived")) close();
                  },
                })
              }
              style={footBtnGhost}
            >
              Archive
            </button>
          )}
        </>
      }
    >
      <PreviewBox fileId={f.id} ext={f.ext} isImg={isImg} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "9px", fontSize: "12px" }}>
        {[
          ["Uploaded by", f.by],
          ["Size", fileSize(f.size)],
          ["Access", ACCESS[f.access].label],
          ["Linked to", linkLabel],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ color: "#98A2B3", fontWeight: 600 }}>{l}</div>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {can && (
        <label style={{ ...footBtnGhost, alignSelf: "flex-start", fontSize: "12px", padding: "7px 12px" }}>
          Upload new version
          <input
            type="file"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await run(() => uploadProjectFile(file, { projectId: f.projectId, fileId: f.id, note: "New version" }), "New version uploaded");
            }}
          />
        </label>
      )}
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Version history</div>
      {f.versions.map((v, i) => (
        <div key={v.n} style={{ display: "flex", gap: "9px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F4F5F7", fontSize: "12px" }}>
          <b style={{ width: "30px" }}>v{v.n}</b>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#101828", fontWeight: 600 }}>{v.note}</div>
            <div style={{ color: "#98A2B3", fontSize: "11px" }}>
              {v.by} · {fmt(v.when)} · {fileSize(v.size)}
            </div>
          </div>
          {i === 0 ? (
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#067647" }}>Current</span>
          ) : (
            can && (
              <button
                type="button"
                onClick={() => ask({ title: `Restore version ${v.n}?`, body: `This creates a new version from v${v.n}. Nothing is deleted — the current version stays in history.`, ok: "Restore", cancel: "Cancel", run: () => void run(() => restoreFileVersion(f.id, v.n), "Restored as a new version") })}
                style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "7px", padding: "4px 9px", fontSize: "11px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
              >
                Restore
              </button>
            )
          )}
        </div>
      ))}
    </Drawer>
  );
}

function PreviewBox({ fileId, ext, isImg }: { fileId: string; ext: string; isImg: boolean }) {
  const url = useQuery({ queryKey: ["projects-file-url", fileId], queryFn: () => fileDownload(fileId), enabled: isImg, staleTime: 30 * 60000 });
  return (
    <div style={{ height: "150px", borderRadius: "12px", background: "#F7F8FA", border: "1px solid #F0F2F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#98A2B3", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {isImg && url.data ? <img src={url.data.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : `${ext} · download to view · served via signed link`}
    </div>
  );
}

/* ── Approval detail ───────────────────────────────────────────────── */

export function ApprovalDrawer({ ws, id }: { ws: Workspace; id: string }) {
  const router = useRouter();
  const close = useProjectsStore((s) => s.close);
  const ask = useProjectsStore((s) => s.ask);
  const run = useRun();
  const q = useQuery({ queryKey: ["projects-approvals"], queryFn: fetchApprovals });
  const [comment, setComment] = useState("");
  const [err, setErr] = useState(false);
  const a = q.data?.find((x) => x.id === id);
  if (!a) return null;
  const p = ws.projects.find((x) => x.id === a.projectId);
  const openSt = a.status === "Sent" || a.status === "Viewed";
  const [, lfg] = left(a.dueDate, ws.today, !openSt);
  const s = aps(a.status);
  const canReq = ws.me.can["Request approvals"];
  const canDecide = a.kind === "internal" && openSt && (a.isMine || ws.me.role === "Owner");
  const decide = (d: string) => {
    if (d !== "Approved" && !comment.trim()) return setErr(true);
    void run(() => decideApproval(a.id, d, comment.trim()), "Decision recorded").then((ok) => ok && setComment(""));
  };
  return (
    <Drawer
      label="Approval detail"
      width={460}
      kicker={`${a.number} · ${a.type} · ${p?.name ?? ""}`}
      title={<span style={{ fontSize: "15px" }}>{a.item}</span>}
      onClose={close}
      footer={
        <>
          {openSt && canReq && (
            <button type="button" onClick={() => void run(() => remindApproval(a.id), (r) => deliveryMsg((r as { delivery: Delivery }).delivery, "Reminder sent"))} style={footBtnPrimary}>
              Send reminder
            </button>
          )}
          {a.status === "Changes Requested" && canReq && (
            <button type="button" onClick={() => void run(() => resubmitApproval(a.id), (r) => deliveryMsg((r as { delivery: Delivery }).delivery, "Resubmitted to " + a.from))} style={footBtnPrimary}>
              Resubmit
            </button>
          )}
          {a.kind === "client" && (
            <button
              type="button"
              onClick={() => {
                close();
                router.push("/projects/client-portal");
              }}
              style={footBtnGhost}
            >
              View as client
            </button>
          )}
          {["Draft", "Sent", "Viewed", "Changes Requested"].includes(a.status) && canReq && (
            <button
              type="button"
              onClick={() => ask({ title: "Cancel this approval request?", body: "The approver can no longer respond. The request stays in the audit history.", ok: "Cancel request", danger: true, cancel: "Keep it", run: () => void run(() => cancelApproval(a.id), "Request cancelled") })}
              style={{ ...footBtnGhost, border: "1px solid #FECDCA", color: "#B42318" }}
            >
              Cancel
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: s.fg, background: s.bg, borderRadius: "6px", padding: "3px 7px" }}>{a.status}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "6px", padding: "3px 7px" }}>From {a.from}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: openSt ? lfg : "#667085", background: "#F9FAFB", borderRadius: "6px", padding: "3px 7px" }}>Due {fmt(a.dueDate)}</span>
      </div>
      <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6, background: "#FAFBFC", borderRadius: "10px", padding: "10px 12px" }}>{a.message || "No message."}</div>
      <div style={{ fontSize: "12px" }}>
        <span style={{ color: "#98A2B3", fontWeight: 600 }}>Evidence · </span>
        <b>{a.evidence}</b>
      </div>
      {canDecide && (
        <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Your decision (internal approver)</div>
          <textarea value={comment} onChange={(e) => { setComment(e.target.value); setErr(false); }} rows={2} placeholder="Comment — required to reject or request changes" aria-label="Decision comment" style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "12.5px" }} />
          {err && (
            <div role="alert" style={errLine}>
              Add a comment first.
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => decide("Approved")} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
              Approve
            </button>
            <button type="button" onClick={() => decide("Changes Requested")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Request changes
            </button>
            <button type="button" onClick={() => decide("Rejected")} style={{ border: "1px solid #FECDCA", background: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 700, color: "#B42318", cursor: "pointer" }}>
              Reject
            </button>
          </div>
        </div>
      )}
      {a.kind === "internal" && openSt && !canDecide && <div style={{ fontSize: "12px", color: "#475467", background: "#EFF4FF", borderRadius: "10px", padding: "10px 12px", lineHeight: 1.5 }}>Only {a.from.replace(" (internal)", "")} can decide this request.</div>}
      {a.kind === "client" && openSt && <div style={{ fontSize: "12px", color: "#475467", background: "#EFF4FF", borderRadius: "10px", padding: "10px 12px", lineHeight: 1.5 }}>Only the client can approve this, from their portal. Staff can’t record a decision for them.</div>}
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Audit history</div>
      {a.audit.map((h, i) => (
        <div key={i} style={{ display: "flex", gap: "9px", padding: "6px 0", borderBottom: "1px solid #F4F5F7", fontSize: "12px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#12A150", marginTop: "5px", flex: "0 0 8px" }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#101828" }}>
              <b>{h.who}</b> {h.what}
            </div>
            {h.note && <div style={{ color: "#475467", fontStyle: "italic" }}>“{h.note}”</div>}
            <div style={{ color: "#98A2B3", fontSize: "11px" }}>{new Date(h.t).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          </div>
        </div>
      ))}
    </Drawer>
  );
}

/* ── New approval request ──────────────────────────────────────────── */

export function ApprovalNewDrawer({ ws, projectId }: { ws: Workspace; projectId?: string }) {
  const close = useProjectsStore((s) => s.close);
  const run = useRun();
  const files = useQuery({ queryKey: ["projects-files"], queryFn: fetchFiles });
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const first = live.find((p) => p.id === projectId) ?? live[0];
  const [af, setAf] = useState({ projectId: first?.id ?? "", type: "Deliverable", item: "", msg: "", evidence: "", approver: first?.customerId ? "client" : ws.people.find((x) => x.id !== ws.me.personId)?.id ?? "", due: "", milestoneId: "" });
  const [tried, setTried] = useState(false);
  const p = ws.projects.find((x) => x.id === af.projectId);
  const err = tried && !af.item.trim();
  const approvers: Array<[string, string]> = [...(p?.customerId ? [["client", `${p.customerName} (client)`] as [string, string]] : []), ...ws.people.map((x) => [x.id, `${x.name} (internal)`] as [string, string])];
  const send = async (draft: boolean) => {
    if (!af.item.trim()) return setTried(true);
    const ok = await run(
      () => createApproval({ projectId: af.projectId, type: af.type, item: af.item, message: af.msg, evidenceFileId: af.evidence || null, milestoneId: af.milestoneId || null, approver: af.approver, dueDate: af.due || null, draft }),
      (r) => {
        const x = r as { number: string; delivery: Delivery | null };
        return draft ? `${x.number} saved as draft` : deliveryMsg(x.delivery, `${x.number} sent`);
      },
    );
    if (ok) close();
  };
  const L = (n: number, l: string) => `${n} · ${l}`;
  return (
    <Drawer
      label="New approval request"
      width={460}
      title="New approval request"
      onClose={close}
      footer={
        <>
          <button type="button" onClick={() => void send(true)} style={footBtnGhost}>
            Save draft
          </button>
          <button type="button" onClick={() => void send(false)} style={footBtnPrimary}>
            8 · Review &amp; send
          </button>
        </>
      }
    >
      <label style={fieldLabel}>
        {L(1, "Project")}
        <select
          value={af.projectId}
          onChange={(e) => {
            const np = ws.projects.find((x) => x.id === e.target.value);
            setAf({ ...af, projectId: e.target.value, evidence: "", milestoneId: "", approver: np?.customerId ? "client" : af.approver === "client" ? ws.people[0]?.id ?? "" : af.approver });
          }}
          style={fieldSelect}
        >
          {live.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        {L(2, "Approval type")}
        <select value={af.type} onChange={(e) => setAf({ ...af, type: e.target.value })} style={fieldSelect}>
          {["Milestone", "Deliverable", "Design", "Scope Change", "Budget Change", "Project Completion", "Other"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      {af.type === "Milestone" && (
        <label style={fieldLabel}>
          Milestone being approved
          <select value={af.milestoneId} onChange={(e) => setAf({ ...af, milestoneId: e.target.value, item: af.item || ws.milestones.find((m) => m.id === e.target.value)?.name || "" })} style={fieldSelect}>
            <option value="">Not linked to a milestone</option>
            {ws.milestones
              .filter((m) => m.projectId === af.projectId && m.status !== "Completed")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label style={fieldLabel}>
        {L(3, "Item to approve *")}
        <input value={af.item} onChange={(e) => setAf({ ...af, item: e.target.value })} placeholder="e.g. Homepage design v3" style={{ ...fieldInput, border: `1px solid ${err ? "#F04438" : "#E6EAF0"}` }} />
      </label>
      <label style={fieldLabel}>
        {L(4, "Message")}
        <textarea value={af.msg} onChange={(e) => setAf({ ...af, msg: e.target.value })} rows={3} style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "13px" }} />
      </label>
      <label style={fieldLabel}>
        {L(5, "Evidence (project file)")}
        <select value={af.evidence} onChange={(e) => setAf({ ...af, evidence: e.target.value })} style={fieldSelect}>
          <option value="">None attached</option>
          {(files.data ?? [])
            .filter((f) => f.projectId === af.projectId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <label style={fieldLabel}>
        {L(6, "Approver")}
        <select value={af.approver} onChange={(e) => setAf({ ...af, approver: e.target.value })} style={fieldSelect}>
          {approvers.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        {L(7, "Due date")}
        <input type="date" value={af.due} onChange={(e) => setAf({ ...af, due: e.target.value })} style={fieldSelect} />
      </label>
      {err && (
        <div role="alert" style={errLine}>
          Name the item that needs approval.
        </div>
      )}
      {af.approver === "client" && <div style={{ fontSize: "11.5px", color: "#667085" }}>The client answers in their portal. If they have an email address, a fresh portal link is emailed when you send.</div>}
    </Drawer>
  );
}

/* ── Reject time entry ─────────────────────────────────────────────── */

export function RejectModal({ ids }: { ids: string[] }) {
  const setRejectIds = useProjectsStore((s) => s.setRejectIds);
  const run = useRun();
  const [reason, setReason] = useState("");
  return (
    <div role="alertdialog" aria-label="Reject time entry" style={{ position: "fixed", inset: 0, zIndex: 98, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", background: "rgba(10,27,42,.35)" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "#fff", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>Reject time entry?</div>
        <div style={{ fontSize: "12.5px", color: "#475467" }}>A reason is required. It is sent to the person who logged the time.</div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason" aria-label="Reason" autoFocus style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "12.5px" }} />
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setRejectIds(null)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={async () => {
              if (await run(() => decideTime(ids, "rejected", reason.trim()), "Entry rejected — reason sent")) setRejectIds(null);
            }}
            style={{ border: 0, background: "#D92D20", color: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", opacity: reason.trim() ? 1 : 0.5 }}
          >
            Reject entry
          </button>
        </div>
      </div>
    </div>
  );
}
