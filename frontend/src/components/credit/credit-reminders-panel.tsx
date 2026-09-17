"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatPercent } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import type { CreditReminderTone } from "@/lib/credit-api";
import {
  fetchCreditReminderRules,
  createCreditReminderRule,
  updateCreditReminderRule,
  deleteCreditReminderRule,
  testSendCreditReminderRule,
  fetchRecoveryRateByStage,
  CREDIT_REMINDER_TEMPLATE_OPTIONS,
  type CreditReminderRule,
} from "@/lib/credit-reminder-rules-api";

const TONE_LABEL: Record<CreditReminderTone, string> = { gentle: "Gentle", firm: "Firm", final: "Final notice" };
const TONE_TONE: Record<CreditReminderTone, { bg: string; fg: string }> = {
  gentle: { bg: "#EEF4FF", fg: "#3538CD" },
  firm: { bg: "#FEF6E7", fg: "#B54708" },
  final: { bg: "#FEF3F2", fg: "#B42318" },
};

const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

export function CreditRemindersPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<CreditReminderRule | null>(null);

  const { data: rules = [], isPending } = useQuery({ queryKey: ["credit-reminder-rules"], queryFn: fetchCreditReminderRules });
  const { data: stages = [] } = useQuery({ queryKey: ["credit-recovery-rate-by-stage"], queryFn: fetchRecoveryRateByStage });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateCreditReminderRule(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credit-reminder-rules"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this rule."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCreditReminderRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-reminder-rules"] });
      toast.success("Reminder rule deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this rule."),
  });

  const remindersSent = stages.reduce((s, st) => s + st.remindedCount, 0);
  const recoveredAfter = stages.reduce((s, st) => s + st.recoveredCount, 0);
  const overallRate = remindersSent > 0 ? Math.round((recoveredAfter / remindersSent) * 100) : 0;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Reminders &amp; Recovery</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setCreating(true)} style={primaryBtn}>Create Reminder Rule</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Reminders Sent</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{remindersSent}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers Recovered After</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{recoveredAfter}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Overall Recovery Rate</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{overallRate}%</div>
        </div>
      </div>

      {stages.some((s) => s.remindedCount > 0) && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Recovery rate by stage</h3>
          <p className="mb-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Of customers ever reminded at each stage, the share who have since paid off.</p>
          <div className="flex flex-col gap-2.5">
            {stages.filter((s) => s.remindedCount > 0).map((s) => (
              <div key={s.ruleId} className="flex items-center gap-3">
                <span className="w-[100px] shrink-0 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{s.daysOverdueTrigger}d ({s.tone})</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${s.recoveryRate}%`, background: "var(--app-primary)" }} />
                </div>
                <span className="w-[120px] shrink-0 text-end text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {formatPercent(s.recoveryRate)} · {s.recoveredCount}/{s.remindedCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Reminder rules</h3>
        </div>

        {!isPending && rules.length === 0 && (
          <div className="p-[48px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No staged reminders yet</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Add a rule so overdue balances get chased automatically.</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px]" style={{ ...primaryBtn, padding: "12px 22px", minHeight: 46 }}>Create Reminder Rule</button>
          </div>
        )}

        {rules.length > 0 && (
          <div className="flex flex-col">
            {rules.map((rule, i) => (
              <div key={rule.id} className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="m-0 text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{rule.daysOverdueTrigger}+ days overdue</p>
                    <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: TONE_TONE[rule.tone].bg, color: TONE_TONE[rule.tone].fg }}>{TONE_LABEL[rule.tone]}</span>
                    <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: rule.active ? "#E8F7EE" : "var(--app-surface-2)", color: rule.active ? "#0E8442" : "var(--app-text-muted)" }}>{rule.active ? "Active" : "Paused"}</span>
                  </div>
                  <p className="mt-1 truncate text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
                    {rule.customMessage ? `"${rule.customMessage}"` : (CREDIT_REMINDER_TEMPLATE_OPTIONS.find((t) => t.tone === rule.tone)?.label ?? rule.tone)}
                    {rule.channel ? ` · ${rule.channel}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-[7px]">
                  <button type="button" onClick={() => setTesting(rule)} style={smallOutline}><Send className="mr-1 inline h-3 w-3" aria-hidden />Test send</button>
                  <button type="button" onClick={() => toggleMutation.mutate({ id: rule.id, active: !rule.active })} style={smallOutline}>{rule.active ? "Pause" : "Resume"}</button>
                  <button type="button" onClick={() => deleteMutation.mutate(rule.id)} aria-label="Delete rule" style={{ ...smallOutline, color: "#B42318" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateRuleDialog open={creating} onClose={() => setCreating(false)} />
      {testing && <TestSendDialog rule={testing} onClose={() => setTesting(null)} />}
    </main>
  );
}

const VARIABLE_CHIPS = ["{{customerName}}", "{{balance}}"];

function CreateRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [daysOverdueTrigger, setDaysOverdueTrigger] = useState(30);
  const [tone, setTone] = useState<CreditReminderTone>("gentle");
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email" | "">("");
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState("Hi {{customerName}}, your balance of {{balance}} is still outstanding.");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createCreditReminderRule({
        daysOverdueTrigger,
        tone,
        channel: channel || undefined,
        customMessage: useCustomMessage ? customMessage : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-reminder-rules"] });
      toast.success("Reminder rule added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this rule."),
  });

  function insertVariable(token: string) {
    setCustomMessage((m) => `${m}${token}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a staged reminder"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Days overdue trigger" type="number" min={1} value={daysOverdueTrigger} onChange={(e) => setDaysOverdueTrigger(Math.max(1, Number(e.target.value)))} />
        <Select label="Channel (blank = business default)" value={channel} onChange={(e) => setChannel(e.target.value as "whatsapp" | "sms" | "email" | "")}>
          <option value="">Business default</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </Select>
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Tone</p>
          <div className="flex flex-col gap-1.5">
            {CREDIT_REMINDER_TEMPLATE_OPTIONS.map((t) => (
              <label key={t.tone} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-border-strong p-2.5 text-sm">
                <input type="radio" name="tone" checked={tone === t.tone} onChange={() => setTone(t.tone)} className="mt-0.5" />
                <span>
                  <span className="block font-medium text-fg">{t.label}</span>
                  <span className="block text-xs text-fg-muted">{t.preview}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-fg">
            <input type="checkbox" checked={useCustomMessage} onChange={(e) => setUseCustomMessage(e.target.checked)} />
            Write a custom message instead
          </label>

          {useCustomMessage && (
            <>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VARIABLE_CHIPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded-full border border-border-strong px-2.5 py-1 font-mono text-xs text-fg-muted hover:bg-surface-2"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-fg-faint">
                Sent as-is on SMS, email, and WhatsApp within an active conversation. Outside an active WhatsApp conversation, Meta requires the pre-approved tone wording above instead.
              </p>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function TestSendDialog({ rule, onClose }: { rule: CreditReminderRule; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () => testSendCreditReminderRule(rule.id, { phone: phone || undefined, email: email || undefined }),
    onSuccess: () => {
      toast.success("Test reminder sent.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send the test."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Send a test reminder"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={(!phone && !email) || mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Send test"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
    </Dialog>
  );
}
