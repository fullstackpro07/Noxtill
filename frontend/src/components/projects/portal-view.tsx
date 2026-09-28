"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPortalPreview, fileDownload, invitePortal, revokePortal, type ClientView } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { ErrorBox, Loading, aps, card, errorText, fileSize, fmt, ini, money, st } from "./projects-ui";

const PT: Array<[string, string]> = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["ms", "Milestones"],
  ["files", "Files"],
  ["appr", "Approvals"],
  ["inv", "Invoices"],
  ["msg", "Messages"],
];

export interface PortalHandlers {
  mode: "preview" | "live";
  onDecide?: (id: string, decision: string, comment: string) => Promise<void>;
  onDownload?: (id: string) => Promise<void>;
  onMessage?: (body: string) => Promise<boolean>;
  onOpenInbox?: () => void;
}

/** Exactly what the client sees — used by the in-app preview and the public portal. */
export function PortalBody({ v, h }: { v: ClientView; h: PortalHandlers }) {
  const [tab, setTab] = useState("overview");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errId, setErrId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [msgNote, setMsgNote] = useState("");
  const live = h.mode === "live";
  const c = v.cards;
  const cardsL = [
    { l: "Project progress", v: c.progress + "%", s: "Status: " + c.status },
    { l: "Next milestone", v: c.nextMilestone ? c.nextMilestone.name : "None scheduled", s: c.nextMilestone ? fmt(c.nextMilestone.date) : "" },
    { l: "Waiting on you", v: String(c.waiting), s: "Approvals to review" },
    { l: "Shared files", v: String(c.sharedFiles), s: "Latest versions" },
    { l: "Target launch", v: fmt(c.target), s: "Project end date" },
    { l: "Outstanding invoice", v: !c.invoicesShared ? "Not shared" : c.outstanding ? money(c.outstanding, v.currency) : "None", s: !c.invoicesShared ? "Invoices aren’t shared in this portal" : "" },
  ];
  const row = { display: "flex", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F4F5F7" } as const;
  return (
    <div style={{ background: "#F7F9F8", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "#0A1B2A", color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{ini(v.business)}</div>
        <div>
          <div style={{ fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>{v.project.name}</div>
          <div style={{ fontSize: "11.5px", color: "#667085" }}>
            Project portal for {v.project.client} · {v.business}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11.5px", color: "#667085" }}>Signed in as {v.project.client} · secure link</div>
      </div>
      <div style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 16px", display: "flex", gap: "2px", overflowX: "auto" }}>
        {PT.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ border: 0, background: "none", padding: "11px 12px", fontSize: "12.5px", fontWeight: tab === k ? 800 : 600, color: tab === k ? "#0E8442" : "#475467", borderBottom: `2.5px solid ${tab === k ? "#12A150" : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {tab === "overview" && (
          <>
            <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "12px" }}>
              {cardsL.map((x) => (
                <div key={x.l} style={{ ...card, borderRadius: "13px", padding: "13px 15px" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{x.l}</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>{x.v}</div>
                  <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>{x.s}</div>
                </div>
              ))}
            </div>
            <div style={{ ...card, borderRadius: "13px", padding: "14px 16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828", marginBottom: "6px" }}>Recent updates</div>
              {v.updates.map((u, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #F4F5F7", fontSize: "12.5px", color: "#344054" }}>
                  {u.t}
                  <div style={{ fontSize: "10.5px", color: "#98A2B3" }}>{fmt(u.when)}</div>
                </div>
              ))}
              {!v.updates.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No updates yet.</div>}
            </div>
          </>
        )}
        {tab === "tasks" && (
          <div style={{ ...card, borderRadius: "13px", padding: "6px 16px" }}>
            {v.tasks.map((t) => (
              <div key={t.id} style={row}>
                <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{t.title}</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: st(t.status).fg, background: st(t.status).bg, borderRadius: "6px", padding: "2px 7px" }}>{t.status}</span>
                <span style={{ fontSize: "11.5px", color: "#667085" }}>Due {fmt(t.due)}</span>
              </div>
            ))}
            <div style={{ padding: "10px 0", fontSize: "11.5px", color: "#98A2B3" }}>{v.tasks.length ? "Only tasks your project team has shared with you appear here." : "No tasks have been shared with you yet."}</div>
          </div>
        )}
        {tab === "ms" && (
          <div style={{ ...card, borderRadius: "13px", padding: "6px 16px" }}>
            {v.milestones.map((m) => (
              <div key={m.id} style={row}>
                <span style={{ width: "9px", height: "9px", transform: "rotate(45deg)", background: st(m.status).fg }} />
                <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{m.name}</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: st(m.status).fg, background: st(m.status).bg, borderRadius: "6px", padding: "2px 7px" }}>{m.status}</span>
                <span style={{ fontSize: "11.5px", color: "#667085" }}>{fmt(m.date)}</span>
              </div>
            ))}
            {!v.milestones.length && <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No milestones yet.</div>}
          </div>
        )}
        {tab === "files" && (
          <div style={{ ...card, borderRadius: "13px", padding: "6px 16px" }}>
            {v.files.map((f) => (
              <div key={f.id} style={row}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#2F4FB3", background: "#EFF4FF", borderRadius: "6px", padding: "4px 6px" }}>{f.ext}</span>
                <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{f.name}</span>
                <span style={{ fontSize: "11.5px", color: "#667085" }}>
                  v{f.version} · {fileSize(f.size)}
                </span>
                <button type="button" onClick={() => void h.onDownload?.(f.id)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                  Download
                </button>
              </div>
            ))}
            {!v.files.length && <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No files have been shared with you yet.</div>}
          </div>
        )}
        {tab === "appr" && (
          <>
            {v.approvals.map((a) => {
              const s = aps(a.status);
              return (
                <div key={a.id} style={{ ...card, borderRadius: "13px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "9px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{a.item}</span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: s.fg, background: s.bg, borderRadius: "6px", padding: "2px 7px" }}>{a.status}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "#667085" }}>Due {fmt(a.due)}</span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.55 }}>{a.message || "No message."}</div>
                  {a.open && (
                    <>
                      <textarea value={drafts[a.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [a.id]: e.target.value })} disabled={!live} rows={2} placeholder="Comment (required to request changes or reject)" aria-label="Comment" style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "12.5px" }} />
                      {errId === a.id && (
                        <div role="alert" style={{ fontSize: "11.5px", color: "#B42318", fontWeight: 700 }}>
                          Please add a comment first.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        {(
                          [
                            ["Approved", "Approve", { border: 0, background: "#12A150", color: "#fff", fontWeight: 800 }],
                            ["Changes Requested", "Request changes", { border: "1px solid #E6EAF0", background: "#fff", color: "#344054", fontWeight: 700 }],
                            ["Rejected", "Reject", { border: "1px solid #FECDCA", background: "#fff", color: "#B42318", fontWeight: 700 }],
                          ] as const
                        ).map(([act, label, sty]) => (
                          <button
                            key={act}
                            type="button"
                            disabled={!live}
                            onClick={async () => {
                              const cm = (drafts[a.id] ?? "").trim();
                              if (act !== "Approved" && !cm) return setErrId(a.id);
                              setErrId(null);
                              await h.onDecide?.(a.id, act, cm);
                              setDrafts({ ...drafts, [a.id]: "" });
                            }}
                            style={{ ...sty, borderRadius: "9px", padding: "9px 14px", fontSize: "12.5px", cursor: live ? "pointer" : "not-allowed", opacity: live ? 1 : 0.55 }}
                          >
                            {label}
                          </button>
                        ))}
                        {!live && <span style={{ fontSize: "11.5px", color: "#667085" }}>Preview only — the client decides from their own portal.</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!v.approvals.length && <div style={{ ...card, borderRadius: "13px", padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>Nothing needs your approval right now.</div>}
          </>
        )}
        {tab === "inv" && (
          <div style={{ ...card, borderRadius: "13px", padding: "6px 16px" }}>
            {v.invoices ? (
              v.invoices.map((i) => (
                <div key={i.no} style={row}>
                  <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>Order {i.no}</span>
                  <span style={{ fontSize: "12.5px", color: "#344054" }}>{money(i.amount, v.currency)}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: i.paid ? "#067647" : "#B54708", background: i.paid ? "#ECFDF3" : "#FEF6E7", borderRadius: "6px", padding: "2px 7px" }}>{i.status}</span>
                </div>
              ))
            ) : (
              <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>Invoices aren’t shared in this portal. Ask your project team.</div>
            )}
            {v.invoices && !v.invoices.length && <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No invoices since this project started.</div>}
            <div style={{ padding: "10px 0", fontSize: "11.5px", color: "#98A2B3" }}>Invoices come from your orders with {v.business}. Payment isn’t taken in this portal.</div>
          </div>
        )}
        {tab === "msg" && (
          <div style={{ ...card, borderRadius: "13px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "12.5px", color: "#475467" }}>Messages go to your project team{live ? "" : " and arrive in Unified Inbox when the client has an email address"}.</div>
            {v.messages.map((m) => (
              <div key={m.id} style={{ background: "#FAFBFC", borderRadius: "10px", padding: "9px 11px" }}>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#101828" }}>
                  {m.who} <span style={{ fontWeight: 500, color: "#98A2B3" }}>· {fmt(m.when.slice(0, 10))}</span>
                </div>
                <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "2px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))}
            {live ? (
              <>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Write a message to your project team" aria-label="Message" style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "12.5px" }} />
                <button
                  type="button"
                  disabled={!msg.trim()}
                  onClick={async () => {
                    const ok = await h.onMessage?.(msg.trim());
                    setMsg("");
                    setMsgNote(ok ? "Sent — your team will reply by email." : "Sent to your project team.");
                  }}
                  style={{ alignSelf: "flex-start", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", opacity: msg.trim() ? 1 : 0.6 }}
                >
                  Send message
                </button>
                {msgNote && <div style={{ fontSize: "11.5px", color: "#067647", fontWeight: 700 }}>{msgNote}</div>}
              </>
            ) : (
              <button type="button" onClick={h.onOpenInbox} style={{ alignSelf: "flex-start", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
                Open conversation
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PortalPreviewView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const flash = useProjectsStore((s) => s.flash);
  const ask = useProjectsStore((s) => s.ask);
  const invalidate = useProjectsInvalidate();
  const [pid, setPid] = useState("");
  const [link, setLink] = useState<{ link: string; reason?: string } | null>(null);
  const clientProjects = (ws?.projects ?? []).filter((p) => p.customerId && !p.archivedAt);
  const id = pid || clientProjects[0]?.id || "";
  const pv = useQuery({ queryKey: ["projects-portal", id], queryFn: () => fetchPortalPreview(id), enabled: !!id });
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  if (!clientProjects.length)
    return <div style={{ ...card, padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No project is linked to a customer yet. Link one to a customer (Edit on the project) to preview and share its client portal.</div>;
  const d = pv.data;
  const activeLinks = d?.access.filter((a) => a.active) ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", background: "#FEF6E7", border: "1px solid #FEDF89", borderRadius: "12px", padding: "10px 14px", fontSize: "12px", color: "#7A2E0E" }}>
        <b>Client preview</b>
        <span>This is exactly what the client sees. Internal notes, costs, rates, risk scores and unshared tasks are hidden.</span>
        <select value={id} onChange={(e) => setPid(e.target.value)} aria-label="Client project" style={{ marginLeft: "auto", height: "34px", border: "1px solid #FEDF89", borderRadius: "8px", padding: "0 8px", fontSize: "12px", background: "#fff" }}>
          {clientProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {ws.me.can["Manage client portal"] && (
          <button
            type="button"
            disabled={!d || !d.portalOn}
            onClick={() =>
              d &&
              ask({
                title: `Invite ${d.project.client} to the portal?`,
                body: `They get a secure sign-in link that expires in ${d.inviteExp}${d.requireCode ? ", with an emailed code on each sign-in" : ""}. Every visit is logged.${d.emailReady ? "" : " Email isn’t configured, so you’ll get a link to send yourself."}`,
                ok: "Create invite",
                cancel: "Cancel",
                run: async () => {
                  try {
                    const r = await invitePortal(id);
                    if (r.emailed) flash("Invite emailed to the client");
                    if (r.link) setLink({ link: r.link, reason: r.emailed ? undefined : r.reason });
                    await invalidate();
                  } catch (e) {
                    flash(errorText(e));
                  }
                },
              })
            }
            style={{ height: "34px", border: 0, background: "#0A1B2A", color: "#fff", borderRadius: "8px", padding: "0 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: d && d.portalOn ? 1 : 0.6 }}
          >
            Share portal
          </button>
        )}
      </div>
      {d && !d.portalOn && <div style={{ fontSize: "12px", color: "#B54708", fontWeight: 700 }}>The client portal is switched off in Settings → Client Portal, so clients can’t sign in.</div>}
      {link && (
        <div style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {link.reason && <div style={{ fontSize: "12px", color: "#B54708", fontWeight: 700 }}>{link.reason}</div>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input readOnly value={link.link} aria-label="Portal link" style={{ flex: 1, height: "36px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12px" }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link.link).then(
                  () => flash("Link copied"),
                  () => flash("Copy not available — select the link manually"),
                );
              }}
              style={{ height: "36px", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
            >
              Copy link
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "#98A2B3" }}>This link is shown once. Anyone with it can open the portal until it expires or you revoke it.</div>
        </div>
      )}
      {activeLinks.length > 0 && (
        <div style={{ fontSize: "11.5px", color: "#475467", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <b>Active links:</b>
          {activeLinks.map((a) => (
            <span key={a.id} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "3px 4px 3px 10px", display: "inline-flex", gap: "6px", alignItems: "center" }}>
              {a.email ?? "Copied link"} · expires {fmt(a.expiresAt.slice(0, 10))} · {a.visits} visit{a.visits === 1 ? "" : "s"}
              {ws.me.can["Manage client portal"] && (
                <button
                  type="button"
                  onClick={async () => {
                    await revokePortal(a.id).catch((e) => flash(errorText(e)));
                    flash("Link revoked");
                    await invalidate();
                  }}
                  style={{ border: 0, background: "#FEF3F2", color: "#B42318", borderRadius: "20px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                >
                  Revoke
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {pv.isLoading && <Loading />}
      {pv.error && <ErrorBox error={pv.error} />}
      {d && <PortalBody v={d} h={{ mode: "preview", onDownload: async (fid) => { try { const r = await fileDownload(fid); window.open(r.url, "_blank", "noopener"); } catch (e) { flash(errorText(e)); } }, onOpenInbox: () => window.location.assign("/unified-inbox") }} />}
    </div>
  );
}
