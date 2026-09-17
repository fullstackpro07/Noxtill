"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchReminderRules,
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
  testSendReminderRule,
  fetchReminderStats,
  REMINDER_TEMPLATE_OPTIONS,
  type ReminderRule,
  type ReminderChannel,
} from "@/lib/reminder-rules-api";
import { fetchNoShowReport } from "@/lib/bookings-api";

const OFFSET_PRESETS = [
  { label: "24 hours before", hours: 24 },
  { label: "2 hours before", hours: 2 },
  { label: "1 hour before", hours: 1 },
];

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

export function BookingRemindersPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<ReminderRule | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { data: rules } = useQuery({ queryKey: ["reminder-rules"], queryFn: fetchReminderRules });
  const { data: noShowReport } = useQuery({ queryKey: ["no-show-report"], queryFn: () => fetchNoShowReport(6) });
  const { data: stats } = useQuery({ queryKey: ["reminder-stats"], queryFn: () => fetchReminderStats(30) });

  const firstRuleCreatedAt = rules && rules.length > 0 ? rules.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), rules[0].createdAt) : undefined;
  const deliveryRate = stats && stats.sent > 0 ? (stats.delivered / stats.sent) * 100 : 0;
  const activeRules = (rules ?? []).filter((r) => r.active).length;

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateReminderRule(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-rules"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this rule."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReminderRule(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["reminder-rules"] }); toast.success("Reminder rule deleted."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this rule."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Reminders</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setPreviewing(true)} style={outlineBtn}>Preview Message</button>
          <button type="button" onClick={() => rules?.[0] && setTesting(rules[0])} disabled={!rules || rules.length === 0} style={{ ...outlineBtn, opacity: !rules || rules.length === 0 ? 0.5 : 1 }}>Test Send</button>
          <button type="button" onClick={() => setCreating(true)} style={primaryHeaderBtn}>+ Add Reminder Rule</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(195px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Reminders Sent — 30 Days</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats?.sent ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Delivered</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{stats?.delivered ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Delivery Rate</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{deliveryRate.toFixed(0)}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Active Rules</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{activeRules || "Defaults (24h + 2h)"}</div>
        </div>
      </div>

      {noShowReport && noShowReport.trend.length > 1 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>No-show rate: before vs after your first rule</h3>
          <p className="m-0 mb-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Comparison across your own bookings — not a general claim.</p>
          <BeforeAfterChart trend={noShowReport.trend} markAt={firstRuleCreatedAt} />
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Reminder rules</h3>
        </div>
        {rules && rules.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Using the default reminders — 24h and 2h before</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Add a custom rule to change the timing, channel or message.</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add Reminder Rule</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Trigger</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Channel</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Template</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Active</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rules ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{r.offsetHours}h before</td>
                    <td className="p-[12px] text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.channel ?? "Business default"}</td>
                    <td className="max-w-[340px] p-[12px] text-[12px]" style={{ color: "var(--app-text-faint)" }}>{r.customMessage ? `"${r.customMessage}"` : (REMINDER_TEMPLATE_OPTIONS.find((t) => t.key === r.templateKey)?.label ?? r.templateKey)}</td>
                    <td className="p-[12px]">
                      <button type="button" role="switch" aria-checked={r.active} onClick={() => toggleMutation.mutate({ id: r.id, active: !r.active })} className="relative rounded-full" style={{ width: 38, height: 21, border: 0, background: r.active ? "var(--app-primary)" : "var(--app-surface-2)" }}>
                        <span className="absolute top-[2px] rounded-full bg-white" style={{ width: 17, height: 17, left: r.active ? 19 : 2 }} />
                      </button>
                    </td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => setTesting(r)} style={smallOutline}>Test Send</button>
                        <button type="button" onClick={() => deleteMutation.mutate(r.id)} style={{ ...smallOutline, color: "var(--app-danger-strong)" }}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateRuleModal open={creating} onClose={() => setCreating(false)} />
      {testing && <TestSendModal rule={testing} onClose={() => setTesting(null)} />}
      {previewing && <PreviewModal rule={rules?.[0]} onClose={() => setPreviewing(false)} />}
    </main>
  );
}

function BeforeAfterChart({ trend, markAt }: { trend: { month: string; rate: number }[]; markAt?: string }) {
  const before = useMemo(() => {
    if (!markAt) return null;
    const cutoff = markAt.slice(0, 7);
    const beforePts = trend.filter((t) => t.month < cutoff);
    const afterPts = trend.filter((t) => t.month >= cutoff);
    if (beforePts.length === 0 || afterPts.length === 0) return null;
    return {
      before: beforePts.reduce((s, t) => s + t.rate, 0) / beforePts.length,
      after: afterPts.reduce((s, t) => s + t.rate, 0) / afterPts.length,
    };
  }, [trend, markAt]);

  if (!before) {
    return (
      <div>
        <p className="m-0 mb-2 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Add a reminder rule to start tracking a before/after comparison.</p>
        <TrendLine trend={trend} />
      </div>
    );
  }

  const max = Math.max(before.before, before.after, 5);
  return (
    <div className="flex flex-col gap-2.5">
      {[{ label: "Before first rule", value: before.before }, { label: "After first rule", value: before.after }].map((b) => (
        <div key={b.label}>
          <div className="mb-1 flex justify-between"><span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.label}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>{b.value.toFixed(0)}%</span></div>
          <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
            <div className="h-full rounded-[6px]" style={{ width: `${(b.value / max) * 100}%`, background: b.label.startsWith("Before") ? "#F97316" : "var(--app-primary)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendLine({ trend }: { trend: { month: string; rate: number }[] }) {
  const width = 560;
  const height = 100;
  const max = Math.max(...trend.map((t) => t.rate), 10);
  const points = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.rate / max) * height }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <path d={linePath} fill="none" stroke="#F97316" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

const VARIABLE_CHIPS = ["{{customerName}}", "{{serviceName}}", "{{dateTime}}"];

function CreateRuleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [offsetHours, setOffsetHours] = useState(24);
  const [customOffsetHours, setCustomOffsetHours] = useState(6);
  const [templateKey, setTemplateKey] = useState(REMINDER_TEMPLATE_OPTIONS[0].key);
  const [channel, setChannel] = useState<ReminderChannel | "">("");
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState("Hi {{customerName}}, your {{serviceName}} appointment is at {{dateTime}}.");
  const queryClient = useQueryClient();

  const effectiveOffsetHours = offsetHours === -1 ? customOffsetHours : offsetHours;

  const mutation = useMutation({
    mutationFn: () =>
      createReminderRule({
        offsetHours: effectiveOffsetHours,
        templateKey,
        channel: channel || undefined,
        customMessage: useCustomMessage ? customMessage : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-rules"] });
      toast.success("Reminder rule added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this rule."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Add a Reminder Rule"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save Rule"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>TIMING</span>
          <select value={offsetHours} onChange={(e) => setOffsetHours(Number(e.target.value))} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {OFFSET_PRESETS.map((p) => (
              <option key={p.hours} value={p.hours}>{p.label}</option>
            ))}
            <option value={-1}>Custom…</option>
          </select>
        </label>
        {offsetHours === -1 && (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>CUSTOM (HOURS BEFORE)</span>
            <input type="number" min={1} value={customOffsetHours} onChange={(e) => setCustomOffsetHours(Math.max(1, Number(e.target.value)))} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>CHANNEL (BLANK = BUSINESS DEFAULT)</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel | "")} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="">Business default</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </label>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{useCustomMessage ? "FALLBACK TEMPLATE" : "MESSAGE"}</span>
          <div className="flex flex-col gap-1.5">
            {REMINDER_TEMPLATE_OPTIONS.map((t) => (
              <label key={t.key} className="flex items-start gap-2 rounded-[10px] p-[9px]" style={{ border: "1px solid var(--app-border)" }}>
                <input type="radio" name="template" checked={templateKey === t.key} onChange={() => setTemplateKey(t.key)} className="mt-0.5" style={{ accentColor: "var(--app-primary)" }} />
                <span>
                  <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.label}</span>
                  <span className="block text-[11px]" style={{ color: "var(--app-text-faintest)" }}>{t.preview}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>
            <input type="checkbox" checked={useCustomMessage} onChange={(e) => setUseCustomMessage(e.target.checked)} style={{ accentColor: "var(--app-primary)" }} />
            Write a custom message instead
          </label>
          {useCustomMessage && (
            <>
              <textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={4} className="mt-2 w-full rounded-[10px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VARIABLE_CHIPS.map((v) => (
                  <button key={v} type="button" onClick={() => setCustomMessage((m) => m + v)} className="rounded-full px-3 py-1.5 font-mono text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface-2)" }}>{v}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PosModalShell>
  );
}

function TestSendModal({ rule, onClose }: { rule: ReminderRule; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () => testSendReminderRule(rule.id, { phone: phone || undefined, email: email || undefined }),
    onSuccess: () => { toast.success("Test reminder sent."); onClose(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send the test."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Send a Test Reminder"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={(!phone && !email) || mutation.isPending} style={{ ...primaryBtn, opacity: (!phone && !email) || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Sending…" : "Send Test"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PHONE</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>EMAIL</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}

function PreviewModal({ rule, onClose }: { rule: ReminderRule | undefined; onClose: () => void }) {
  const text = rule?.customMessage
    ? rule.customMessage.replace("{{customerName}}", "Emma Wilson").replace("{{serviceName}}", "Haircut & Styling").replace("{{dateTime}}", "9:00 AM tomorrow")
    : (REMINDER_TEMPLATE_OPTIONS.find((t) => t.key === rule?.templateKey)?.preview ?? REMINDER_TEMPLATE_OPTIONS[0].preview)
        .replace("{{customerName}}", "Emma Wilson")
        .replace("{{serviceName}}", "Haircut & Styling")
        .replace("{{dateTime}}", "9:00 AM tomorrow");

  return (
    <PosModalShell open onClose={onClose} title="Message Preview" footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
      <div className="flex flex-col gap-3 p-[17px]">
        <span className="text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>{rule?.channel ?? "Email"} preview</span>
        <div className="overflow-hidden rounded-[14px]" style={{ border: "1px solid var(--app-border)" }}>
          <div className="p-[11px_13px] text-[11.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>To a customer, using real variables from their actual booking</div>
          <div className="p-[15px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{text}</div>
        </div>
        <p className="m-0 rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "var(--app-warning-bg)", color: "#93370D" }}>WhatsApp and SMS previews use the same text — actual delivery depends on those channels being connected.</p>
      </div>
    </PosModalShell>
  );
}
