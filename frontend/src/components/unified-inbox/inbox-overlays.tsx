"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { fetchOrder } from "@/lib/orders-api";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/store/auth-store";
import {
  addCustomerNote,
  addInternalNote,
  assignConversation,
  composeMessage,
  createCustomerFromConversation,
  createReplyFolder,
  createRule,
  createSavedReply,
  deleteRule,
  fetchAttention,
  fetchConversation,
  fetchInboxOverview,
  fetchInboxSettings,
  fetchRuleHistory,
  fetchSavedReplies,
  fillSavedReply,
  setAwayMessage,
  setConversationTags,
  snoozeConversation,
  updateInboxSettings,
  updateRule,
  updateSavedReply,
  type InboxSettingsView,
  type RuleInput,
  type RuleRow,
} from "@/lib/inbox-api";
import { useInboxStore, type InboxModal } from "./inbox-store";
import { errorText, useInboxInvalidate } from "./inbox-ui";

const input: React.CSSProperties = { width: "100%", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px 12px", fontSize: "13px", minHeight: "44px", background: "#fff", color: "#101828", fontFamily: "inherit" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "5px" };

function Modal({ title, sub, children, footer, onClose, wide }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.42)", zIndex: 88, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "18px", width: wide ? "620px" : "480px", maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(10,27,42,.32)", animation: "nxin .18s ease" }}
      >
        <div style={{ padding: "17px 18px 12px", display: "flex", alignItems: "flex-start", gap: "12px", borderBottom: "1px solid #F0F2F5" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>{title}</h3>
            {sub && <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "#98A2B3", lineHeight: 1.5 }}>{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: "34px", height: "34px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer", flex: "0 0 auto" }}>
            ✕
          </button>
        </div>
        <div style={{ padding: "16px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #F0F2F5", display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, danger }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: primary ? 0 : `1px solid ${danger ? "#FDD9D6" : "#E6EAF0"}`,
        background: primary ? "#12A150" : "#fff",
        color: primary ? "#fff" : danger ? "#B42318" : "#344054",
        borderRadius: "11px",
        padding: "10px 16px",
        fontSize: "12.5px",
        fontWeight: primary ? 800 : 700,
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: "42px",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", fontWeight: 700, color: "#912018" }}>{errorText(error)}</div>;
}

export function InboxOverlays() {
  const modal = useInboxStore((s) => s.modal);
  const close = useInboxStore((s) => s.closeModal);
  const toast = useInboxStore((s) => s.toast);
  return (
    <>
      <style>{`@keyframes nxin{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      {modal && <ModalBody modal={modal} onClose={close} />}
      {toast && (
        <div role="status" style={{ position: "fixed", bottom: "22px", left: "50%", transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", padding: "11px 18px", borderRadius: "11px", fontSize: "12.5px", fontWeight: 600, boxShadow: "0 14px 34px rgba(10,27,42,.3)", zIndex: 98, maxWidth: "90vw" }}>
          {toast}
        </div>
      )}
    </>
  );
}

function ModalBody({ modal, onClose }: { modal: InboxModal; onClose: () => void }) {
  switch (modal.type) {
    case "compose":
      return <ComposeModal onClose={onClose} />;
    case "assign":
      return <AssignModal conversationId={modal.conversationId} suggested={modal.suggestedUserId} onClose={onClose} />;
    case "snooze":
      return <SnoozeModal conversationId={modal.conversationId} onClose={onClose} />;
    case "create-customer":
      return <CreateCustomerModal conversationId={modal.conversationId} onClose={onClose} />;
    case "add-tag":
      return <TagModal conversationId={modal.conversationId} tags={modal.tags} onClose={onClose} />;
    case "add-note":
      return <NoteModal conversationId={modal.conversationId} kind={modal.kind} onClose={onClose} />;
    case "saved-reply-picker":
      return <ReplyPicker conversationId={modal.conversationId} onClose={onClose} />;
    case "reply-editor":
      return <ReplyEditor replyId={modal.replyId} folder={modal.folder} initial={modal.initial} onClose={onClose} />;
    case "new-folder":
      return <FolderModal onClose={onClose} />;
    case "rule-editor":
      return <RuleEditor rule={modal.rule} onClose={onClose} />;
    case "rule-history":
      return <RuleHistory ruleId={modal.ruleId} onClose={onClose} />;
    case "hours-editor":
      return <HoursEditor onClose={onClose} />;
    case "targets-editor":
      return <TargetsEditor onClose={onClose} />;
    case "away-editor":
      return <AwayEditor onClose={onClose} />;
    case "order":
      return <OrderModal orderId={modal.orderId} onClose={onClose} />;
    case "filters":
      return <FiltersModal onClose={onClose} />;
  }
}

/** Runs a mutation, flashes, refetches every inbox query, closes. */
function useDone(onClose: () => void) {
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  return (msg: string) => {
    flash(msg);
    void invalidate();
    onClose();
  };
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const done = useDone(onClose);
  const select = useInboxStore((s) => s.select);
  const router = useRouter();
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const { data: results } = useQuery({ queryKey: ["inbox-compose-search", q], queryFn: () => searchCustomers(q), enabled: q.trim().length >= 2 && !customer });
  const send = useMutation({
    mutationFn: () =>
      composeMessage({
        channel,
        text,
        ...(customer ? { customerId: customer.id } : channel === "email" ? { email: contact, name } : { phone: contact, name }),
      }),
    onSuccess: (r) => {
      select(r.id);
      done("Message sent");
      router.push("/unified-inbox");
    },
  });
  return (
    <Modal
      title="New message"
      sub="Starts (or continues) a conversation. It goes out through your normal WhatsApp, SMS or email sending, and counts against your message quota."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!text.trim() || (!customer && !contact.trim()) || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? "Sending…" : "Send"}
          </Btn>
        </>
      }
    >
      <div>
        <label style={lbl}>Channel</label>
        <div style={{ display: "flex", gap: "7px" }}>
          {(["whatsapp", "sms", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              style={{ border: `1px solid ${channel === c ? "#12A150" : "#E6EAF0"}`, background: channel === c ? "#F7FCF9" : "#fff", color: channel === c ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 13px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "38px" }}
            >
              {c === "whatsapp" ? "WhatsApp" : c === "sms" ? "SMS" : "Email"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Customer</label>
        {customer ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", border: "1px solid #D5EFE0", background: "#F7FCF9", borderRadius: "11px", padding: "10px 12px" }}>
            <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
              {customer.name} <span style={{ color: "#98A2B3", fontWeight: 400 }}>{customer.phone}</span>
            </span>
            <button type="button" onClick={() => setCustomer(null)} style={{ border: 0, background: "none", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
              Change
            </button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your customers by name or phone…" style={input} />
            {(results ?? []).slice(0, 6).map((r) => (
              <button key={r.id} type="button" onClick={() => setCustomer(r)} className="nx-row" style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #F2F4F7", background: "#fff", padding: "9px 4px", fontSize: "12.5px", cursor: "pointer" }}>
                {r.name} <span style={{ color: "#98A2B3" }}>{r.phone}</span>
              </button>
            ))}
            <div style={{ fontSize: "11px", color: "#98A2B3", margin: "8px 0 5px" }}>…or someone who is not a customer yet:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={channel === "email" ? "Email address" : "Phone, with country code"} style={input} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" style={input} />
            </div>
          </>
        )}
      </div>
      <div>
        <label style={lbl}>Message</label>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…" style={{ ...input, resize: "vertical" }} />
      </div>
      {channel === "whatsapp" && <div style={{ fontSize: "11px", color: "#93370D", lineHeight: 1.5 }}>WhatsApp only delivers a free-form message inside 24 hours of the customer last writing to you. Outside that window it may not arrive.</div>}
      <ErrorLine error={send.error} />
    </Modal>
  );
}

function AssignModal({ conversationId, suggested, onClose }: { conversationId: string; suggested?: string; onClose: () => void }) {
  const done = useDone(onClose);
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const { data: conv } = useQuery({ queryKey: ["inbox-conversation", conversationId], queryFn: () => fetchConversation(conversationId) });
  const [userId, setUserId] = useState<string>(suggested ?? "");
  const [reason, setReason] = useState("");
  const current = conv?.assigneeUserId ?? null;
  const chosen = userId || (overview?.canManage ? (overview.people[0]?.userId ?? "") : (overview?.me.userId ?? ""));
  const assign = useMutation({ mutationFn: (to: string | null) => assignConversation(conversationId, to, reason.trim() || undefined), onSuccess: (d) => done(d.assigneeUserId ? `Assigned to ${d.owner}` : "Unassigned") });
  const canManage = overview?.canManage ?? false;
  return (
    <Modal
      title={`Assign ${conv?.name ?? "conversation"}`}
      sub="The new owner is told, the previous owner is told, and the hand-over is written into the conversation."
      onClose={onClose}
      footer={
        <>
          {current && (canManage || current === overview?.me.userId) && (
            <Btn onClick={() => assign.mutate(null)} disabled={assign.isPending}>
              Unassign
            </Btn>
          )}
          <Btn primary disabled={!chosen || chosen === current || assign.isPending} onClick={() => assign.mutate(chosen)}>
            {assign.isPending ? "Assigning…" : "Assign"}
          </Btn>
        </>
      }
    >
      <div>
        <label style={lbl}>Person</label>
        <select value={chosen} onChange={(e) => setUserId(e.target.value)} style={input} disabled={!canManage}>
          {(canManage ? (overview?.people ?? []) : overview ? [overview.me] : []).map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name} — {p.roleLabel}
              {p.userId === suggested ? " (suggested)" : ""}
              {p.userId === current ? " (current)" : ""}
            </option>
          ))}
        </select>
        {!canManage && <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "6px" }}>You can take unassigned conversations yourself. Handing one to someone else needs an Owner or Manager.</div>}
      </div>
      <div>
        <label style={lbl}>Why</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional — shown to the new owner" style={input} />
      </div>
      <ErrorLine error={assign.error} />
    </Modal>
  );
}

function SnoozeModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const done = useDone(onClose);
  const snooze = useMutation({ mutationFn: (minutes: number) => snoozeConversation(conversationId, minutes), onSuccess: () => done("Snoozed — it comes back to the queue by itself") });
  const tomorrow9 = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return Math.round((t.getTime() - new Date().getTime()) / 60000);
  };
  const options = [
    { l: "1 hour", m: () => 60 },
    { l: "3 hours", m: () => 180 },
    { l: "Tomorrow, 9 AM", m: tomorrow9 },
    { l: "Next week", m: () => 7 * 24 * 60 },
  ];
  return (
    <Modal title="Snooze until…" sub="The conversation leaves the Open view and comes back on its own. A new customer message brings it back sooner." onClose={onClose}>
      {options.map((o) => (
        <button key={o.l} type="button" disabled={snooze.isPending} onClick={() => snooze.mutate(o.m())} className="nx-row" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "11px", padding: "12px 14px", fontSize: "13px", fontWeight: 700, color: "#344054", cursor: "pointer", textAlign: "left" }}>
          {o.l}
        </button>
      ))}
      <ErrorLine error={snooze.error} />
    </Modal>
  );
}

function CreateCustomerModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const done = useDone(onClose);
  const { data: conv } = useQuery({ queryKey: ["inbox-conversation", conversationId], queryFn: () => fetchConversation(conversationId) });
  const phoneChannel = conv?.channel === "whatsapp" || conv?.channel === "sms";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const create = useMutation({
    mutationFn: () => createCustomerFromConversation(conversationId, { name: name.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined }),
    onSuccess: () => done("Customer record ready and linked"),
  });
  return (
    <Modal
      title="Create a customer record"
      sub="Links this conversation to a real customer, so orders, bookings and credit show up here. If someone already has this phone number, the conversation is linked to them instead of creating a duplicate."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={create.isPending || (!phoneChannel && !phone.trim())} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Create and link"}
          </Btn>
        </>
      }
    >
      <div>
        <label style={lbl}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={conv?.name ?? ""} style={input} />
      </div>
      <div>
        <label style={lbl}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={phoneChannel ? conv?.handle : "Required — a customer record needs a phone number"} style={input} />
      </div>
      <div>
        <label style={lbl}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={conv?.channel === "email" ? conv.handle : "Optional"} style={input} />
      </div>
      <ErrorLine error={create.error} />
    </Modal>
  );
}

function TagModal({ conversationId, tags, onClose }: { conversationId: string; tags: string[]; onClose: () => void }) {
  const done = useDone(onClose);
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const [current, setCurrent] = useState<string[]>(tags);
  const [draft, setDraft] = useState("");
  const save = useMutation({ mutationFn: () => setConversationTags(conversationId, current), onSuccess: () => done("Tags saved") });
  const add = (t: string) => {
    const v = t.trim();
    if (v && !current.includes(v)) setCurrent([...current, v]);
    setDraft("");
  };
  return (
    <Modal
      title="Tags"
      sub="Tags drive the Analytics topic breakdown and the Money priority. They are yours to set — rules can add them too."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={save.isPending} onClick={() => save.mutate()}>
            Save tags
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {current.length === 0 && <span style={{ fontSize: "12px", color: "#98A2B3" }}>No tags yet.</span>}
        {current.map((t) => (
          <button key={t} type="button" onClick={() => setCurrent(current.filter((x) => x !== t))} style={{ fontSize: "11px", fontWeight: 700, color: "#0E8442", background: "#E8F7EE", border: 0, borderRadius: "20px", padding: "5px 11px", cursor: "pointer" }}>
            {t} ✕
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(draft)} placeholder="New tag, e.g. Money" style={input} maxLength={40} />
        <Btn onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Btn>
      </div>
      {(overview?.tags ?? []).filter((t) => !current.includes(t)).length > 0 && (
        <div>
          <label style={lbl}>Already in use</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(overview?.tags ?? [])
              .filter((t) => !current.includes(t))
              .map((t) => (
                <button key={t} type="button" onClick={() => add(t)} style={{ fontSize: "11px", fontWeight: 700, color: "#475467", background: "#F2F4F7", border: 0, borderRadius: "20px", padding: "5px 11px", cursor: "pointer" }}>
                  + {t}
                </button>
              ))}
          </div>
        </div>
      )}
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function NoteModal({ conversationId, kind, onClose }: { conversationId: string; kind: "internal" | "customer"; onClose: () => void }) {
  const done = useDone(onClose);
  const [text, setText] = useState("");
  const save = useMutation({ mutationFn: () => (kind === "internal" ? addInternalNote(conversationId, text) : addCustomerNote(conversationId, text)), onSuccess: () => done("Note saved — the customer never sees it") });
  return (
    <Modal
      title={kind === "internal" ? "Internal note" : "Note about this customer"}
      sub={kind === "internal" ? "Added to the conversation thread. Only your team sees it." : "Kept on the customer record (Customers → Memory notes). If there is no customer record yet, it is added to the conversation instead."}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>
            Save note
          </Btn>
        </>
      }
    >
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Prefers afternoon deliveries" style={{ ...input, resize: "vertical", background: "#FFFBF2", borderColor: "#FDE3B3" }} />
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function ReplyPicker({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const stage = useInboxStore((s) => s.stageComposer);
  const flash = useInboxStore((s) => s.flash);
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["inbox-replies", "All replies", q], queryFn: () => fetchSavedReplies(undefined, q) });
  const fill = useMutation({
    mutationFn: (id: string) => fillSavedReply(id, conversationId),
    onSuccess: (r) => {
      stage({ conversationId, text: r.text, savedReplyId: r.id });
      flash(r.unfilled.length ? `Still to fill by hand: ${r.unfilled.join(", ")}` : "Filled from the real records — check it, then send");
      onClose();
    },
  });
  return (
    <Modal title="Saved replies" sub="Bracketed parts are filled from this customer’s real order or booking. Anything without a value stays bracketed." onClose={onClose} wide>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved replies…" style={input} autoFocus />
      {data?.replies.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No saved replies{q ? " match" : " yet — add some in Saved Replies"}.</div>}
      {data?.replies.map((r) => (
        <button key={r.id} type="button" disabled={fill.isPending} onClick={() => fill.mutate(r.id)} className="nx-row" style={{ textAlign: "left", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "12px", padding: "12px", cursor: "pointer" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{r.t}</span>
            <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: "5px", padding: "2px 6px" }}>/{r.slug}</span>
          </div>
          <div style={{ fontSize: "11.5px", color: "#475467", marginTop: "5px", lineHeight: 1.5 }}>{r.text}</div>
        </button>
      ))}
      <ErrorLine error={fill.error} />
    </Modal>
  );
}

function ReplyEditor({ replyId, folder, initial, onClose }: { replyId?: string; folder?: string; initial?: { title: string; folder: string; slug: string; body: string }; onClose: () => void }) {
  const done = useDone(onClose);
  const { data } = useQuery({ queryKey: ["inbox-replies", "All replies", ""], queryFn: () => fetchSavedReplies() });
  const [title, setTitle] = useState(initial?.title ?? "");
  const [fold, setFold] = useState(initial?.folder ?? folder ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const save = useMutation({
    mutationFn: () => (replyId ? updateSavedReply(replyId, { title, folder: fold, slug, body }) : createSavedReply({ title, folder: fold, slug, body })),
    onSuccess: () => done(replyId ? "Saved reply updated" : "Saved reply added"),
  });
  const folders = (data?.folders ?? []).map((f) => f.k).filter((k) => k !== "All replies");
  return (
    <Modal
      title={replyId ? "Edit saved reply" : "New saved reply"}
      sub="Use [order number], [order total], [amount], [promised time], [dispatch time], [service], [staff], [date], [time], [customer name], [business name] or [product] — they fill from real records."
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!title.trim() || !fold.trim() || !slug.trim() || !body.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Btn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        <div>
          <label style={lbl}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
        </div>
        <div>
          <label style={lbl}>Folder</label>
          <input value={fold} onChange={(e) => setFold(e.target.value)} list="inbox-folders" style={input} />
          <datalist id="inbox-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div>
          <label style={lbl}>Shortcut</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="eta" style={input} />
        </div>
      </div>
      <div>
        <label style={lbl}>Reply</label>
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} style={{ ...input, resize: "vertical" }} />
      </div>
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function FolderModal({ onClose }: { onClose: () => void }) {
  const done = useDone(onClose);
  const [name, setName] = useState("");
  const save = useMutation({ mutationFn: () => createReplyFolder(name), onSuccess: () => done("Folder added") });
  return (
    <Modal
      title="New folder"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Add folder
          </Btn>
        </>
      }
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Returns" style={input} maxLength={40} autoFocus />
      <ErrorLine error={save.error} />
    </Modal>
  );
}

const TRIGGERS = [
  { k: "keyword", l: "A message mentions certain words" },
  { k: "unanswered", l: "Nobody has replied for a while" },
  { k: "out_of_hours", l: "A message arrives outside working hours" },
] as const;

function RuleEditor({ rule, onClose }: { rule?: RuleRow; onClose: () => void }) {
  const done = useDone(onClose);
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const [name, setName] = useState(rule?.t ?? "");
  const [trigger, setTrigger] = useState<RuleRow["trigger"]>(rule?.trigger ?? "keyword");
  const [keywords, setKeywords] = useState((rule?.keywords ?? []).join(", "));
  const [minutes, setMinutes] = useState(String(rule?.minutes ?? 15));
  const [tag, setTag] = useState(rule?.tag ?? "");
  const [pin, setPin] = useState(rule?.pinToTop ?? false);
  const [assignee, setAssignee] = useState(rule?.assigneeUserId ?? "");
  const [flag, setFlag] = useState(rule?.flag ?? false);
  const [message, setMessage] = useState(rule?.message ?? "Thanks for your message. We are closed right now and will reply as soon as we open.");
  const body = (): RuleInput => {
    const base: RuleInput = { name };
    if (trigger === "keyword") return { ...base, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean), tag: tag.trim() || null, pinToTop: pin, assigneeUserId: assignee || null, flag };
    if (trigger === "unanswered") return { ...base, minutes: Number(minutes) || 15, tag: tag.trim() || null };
    return { ...base, message };
  };
  const save = useMutation({ mutationFn: () => (rule ? updateRule(rule.id, body()) : createRule({ ...body(), trigger })), onSuccess: () => done(rule ? "Rule updated" : "Rule added") });
  const del = useMutation({ mutationFn: () => deleteRule(rule!.id), onSuccess: () => done("Rule deleted") });
  const check = (on: boolean, set: (v: boolean) => void, text: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#344054", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "#12A150" }} />
      {text}
    </label>
  );
  return (
    <Modal
      title={rule ? "Edit rule" : "New rule"}
      sub="Rules only tag, sort, assign or flag. The away message is the one thing that reaches a customer by itself — a fixed text with no customer detail."
      onClose={onClose}
      wide
      footer={
        <>
          {rule && (
            <Btn danger onClick={() => window.confirm("Delete this rule?") && del.mutate()} disabled={del.isPending}>
              Delete
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Save rule
          </Btn>
        </>
      }
    >
      <div>
        <label style={lbl}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Money questions go to the top" style={input} />
      </div>
      <div>
        <label style={lbl}>When</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as RuleRow["trigger"])} disabled={!!rule} style={input}>
          {TRIGGERS.map((t) => (
            <option key={t.k} value={t.k}>
              {t.l}
            </option>
          ))}
        </select>
      </div>
      {trigger === "keyword" && (
        <>
          <div>
            <label style={lbl}>Words to match (comma separated)</label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="payment, refund, invoice, balance" style={input} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div>
              <label style={lbl}>Tag it</label>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. Money (optional)" style={input} />
            </div>
            <div>
              <label style={lbl}>Assign to</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={input}>
                <option value="">Nobody (leave as is)</option>
                {(overview?.people ?? []).map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {check(pin, setPin, "Move it to the top of the queue")}
          {check(flag, setFlag, "Flag it on Attention")}
        </>
      )}
      {trigger === "unanswered" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={lbl}>Minutes without a reply</label>
            <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={input} />
          </div>
          <div>
            <label style={lbl}>Also tag it</label>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="optional" style={input} />
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: "11px", color: "#98A2B3" }}>Counted on the working-hours clock. Flags it on Attention and notifies the assigned person, or Owners and Managers if nobody has it.</div>
        </div>
      )}
      {trigger === "out_of_hours" && (
        <div>
          <label style={lbl}>Away message</label>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...input, resize: "vertical" }} />
          <div style={{ fontSize: "11px", color: "#93370D", marginTop: "6px" }}>This sends on its own, once per conversation, outside your working hours.</div>
        </div>
      )}
      <ErrorLine error={save.error ?? del.error} />
    </Modal>
  );
}

function RuleHistory({ ruleId, onClose }: { ruleId: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["inbox-rule-history", ruleId], queryFn: () => fetchRuleHistory(ruleId) });
  const select = useInboxStore((s) => s.select);
  const router = useRouter();
  return (
    <Modal title={data ? `${data.name} — run history` : "Run history"} sub="Every time this rule did something, newest first." onClose={onClose} wide>
      {data?.runs.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>This rule has not run yet.</div>}
      {data?.runs.map((r, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (!r.conversationId) return;
            select(r.conversationId);
            onClose();
            router.push("/unified-inbox/conversation");
          }}
          className="nx-row"
          style={{ display: "flex", gap: "12px", textAlign: "left", border: 0, borderBottom: "1px solid #F2F4F7", background: "#fff", padding: "9px 2px", cursor: r.conversationId ? "pointer" : "default" }}
        >
          <span style={{ fontSize: "10.5px", color: "#98A2B3", width: "90px", flex: "0 0 auto" }}>{r.when}</span>
          <span style={{ fontSize: "12px", color: "#101828" }}>{r.t}</span>
        </button>
      ))}
    </Modal>
  );
}

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

function HoursEditor({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["inbox-settings"], queryFn: fetchInboxSettings });
  if (!data) return null;
  return <HoursForm data={data} onClose={onClose} />;
}

function HoursForm({ data, onClose }: { data: InboxSettingsView; onClose: () => void }) {
  const done = useDone(onClose);
  const [hours, setHours] = useState<Record<string, [string, string] | null>>(() => Object.fromEntries(DAYS.map(([k]) => [k, data.rawHours[k]?.[0] ?? null])));
  const save = useMutation({
    mutationFn: (reset: boolean) =>
      updateInboxSettings({ workingHours: reset ? null : Object.fromEntries(Object.entries(hours ?? {}).map(([k, v]) => [k, v ? [v] : []])) }),
    onSuccess: () => done("Working hours saved"),
  });
  return (
    <Modal
      title="Working hours"
      sub={`These hours are for the inbox only (promise times and the away message) and do not change your booking hours. Times are in ${data?.timezone ?? "your timezone"}.`}
      onClose={onClose}
      footer={
        <>
          {data?.hoursSource === "inbox" && (
            <Btn onClick={() => save.mutate(true)} disabled={save.isPending}>
              Follow business hours
            </Btn>
          )}
          <Btn primary disabled={!hours || save.isPending} onClick={() => save.mutate(false)}>
            Save hours
          </Btn>
        </>
      }
    >
      {hours &&
        DAYS.map(([k, label]) => {
          const v = hours[k];
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ width: "110px", display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                <input type="checkbox" checked={!!v} onChange={(e) => setHours({ ...hours, [k]: e.target.checked ? ["10:00", "20:00"] : null })} style={{ accentColor: "#12A150" }} />
                {label}
              </label>
              {v ? (
                <>
                  <input type="time" value={v[0]} onChange={(e) => setHours({ ...hours, [k]: [e.target.value, v[1]] })} style={{ ...input, width: "130px" }} />
                  <span style={{ color: "#98A2B3" }}>–</span>
                  <input type="time" value={v[1]} onChange={(e) => setHours({ ...hours, [k]: [v[0], e.target.value] })} style={{ ...input, width: "130px" }} />
                </>
              ) : (
                <span style={{ fontSize: "12px", color: "#98A2B3" }}>Closed</span>
              )}
            </div>
          );
        })}
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function TargetsEditor({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["inbox-attention"], queryFn: fetchAttention });
  if (!data) return null;
  return <TargetsForm targets={data.targets} onClose={onClose} />;
}

function TargetsForm({ targets, onClose }: { targets: Record<string, number>; onClose: () => void }) {
  const done = useDone(onClose);
  const [t, setT] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, String(v)])));
  const save = useMutation({ mutationFn: () => updateInboxSettings(Object.fromEntries(Object.entries(t ?? {}).map(([k, v]) => [k, Number(v)]))), onSuccess: () => done("Targets saved") });
  const rows = [
    ["firstReplyTargetMin", "First reply — WhatsApp, SMS, social (minutes)"],
    ["emailReplyTargetMin", "First reply — email (minutes)"],
    ["moneyReplyTargetMin", "Money questions answered (minutes)"],
    ["unassignedTargetMin", "Longest anything may sit unassigned (minutes)"],
  ];
  return (
    <Modal
      title="Promise times"
      sub="What counts as late. Used by Attention, Team Inbox, Analytics and the unassigned alert."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!t || save.isPending} onClick={() => save.mutate()}>
            Save targets
          </Btn>
        </>
      }
    >
      {t &&
        rows.map(([k, l]) => (
          <div key={k}>
            <label style={lbl}>{l}</label>
            <input type="number" min={1} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} style={input} />
          </div>
        ))}
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function AwayEditor({ onClose }: { onClose: () => void }) {
  const done = useDone(onClose);
  const { data } = useQuery({ queryKey: ["inbox-settings"], queryFn: fetchInboxSettings });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? data?.awayMessage ?? "";
  const save = useMutation({ mutationFn: () => setAwayMessage(true, value), onSuccess: () => done("Away message saved") });
  return (
    <Modal
      title="Away message"
      sub="Sent once per conversation when a message arrives outside working hours. Keep it free of customer details — it goes out without a person reading it."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={!value.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Btn>
        </>
      }
    >
      <textarea rows={4} value={value} onChange={(e) => setText(e.target.value)} style={{ ...input, resize: "vertical" }} />
      <ErrorLine error={save.error} />
    </Modal>
  );
}

function OrderModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const currency = useAuthStore((s) => s.business?.currency ?? "USD");
  const router = useRouter();
  const { data: o, isLoading, error } = useQuery({ queryKey: ["inbox-order", orderId], queryFn: () => fetchOrder(orderId) });
  return (
    <Modal
      title={o ? `Order #${o.orderNo}` : "Order"}
      sub="Read-only here. Changes to an order are made in Orders."
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Close</Btn>
          <Btn primary onClick={() => router.push("/orders")}>
            Go to Orders
          </Btn>
        </>
      }
    >
      {isLoading && <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>Loading…</div>}
      <ErrorLine error={error} />
      {o && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px", color: "#475467" }}>
            <span style={{ fontWeight: 800, textTransform: "capitalize" }}>{o.status.replace("_", " ")}</span>·<span style={{ textTransform: "capitalize" }}>{o.paymentStatus}</span>·<span>{o.customerName}</span>·<span>{new Date(o.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflow: "hidden" }}>
            {o.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "10px 12px", borderTop: i ? "1px solid #F2F4F7" : 0, fontSize: "12.5px" }}>
                <span style={{ color: "#101828" }}>
                  {it.qty} × {it.name}
                </span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(it.price * it.qty, currency)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: "#667085" }}>Total</span>
            <span style={{ fontWeight: 800 }}>{formatCurrency(o.total, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: "#667085" }}>Paid</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(o.paidAmount, currency)}</span>
          </div>
          {o.balance > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "#B42318" }}>Still to pay</span>
              <span style={{ fontWeight: 800, color: "#B42318" }}>{formatCurrency(o.balance, currency)}</span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function FiltersModal({ onClose }: { onClose: () => void }) {
  const store = useInboxStore();
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  return (
    <Modal
      title="Filter conversations"
      onClose={onClose}
      footer={
        <>
          <Btn
            onClick={() => {
              store.setTag("");
              store.setAssignee("");
              store.setChannel("all");
            }}
          >
            Clear all
          </Btn>
          <Btn primary onClick={onClose}>
            Done
          </Btn>
        </>
      }
    >
      <div>
        <label style={lbl}>Channel</label>
        <select value={store.channel} onChange={(e) => store.setChannel(e.target.value)} style={input}>
          <option value="all">All channels</option>
          {(overview?.channels ?? []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.n}
              {c.warn ? ` (${c.warn})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={lbl}>Tag</label>
        <select value={store.tag} onChange={(e) => store.setTag(e.target.value)} style={input}>
          <option value="">Any tag</option>
          {(overview?.tags ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={lbl}>Assigned to</label>
        <select value={store.assignee} onChange={(e) => store.setAssignee(e.target.value)} style={input}>
          <option value="">Anyone</option>
          <option value="none">Nobody</option>
          {(overview?.people ?? []).map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
