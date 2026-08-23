"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
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

const TONE_TONE: Record<CreditReminderTone, "primary" | "warning" | "danger"> = {
  gentle: "primary",
  firm: "warning",
  final: "danger",
};

export function CreditRemindersPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<CreditReminderRule | null>(null);

  const { data: rules, isPending, isError, refetch } = useQuery({ queryKey: ["credit-reminder-rules"], queryFn: fetchCreditReminderRules });
  const { data: stages } = useQuery({ queryKey: ["credit-recovery-rate-by-stage"], queryFn: fetchRecoveryRateByStage });

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

  return (
    <div className="flex flex-col gap-5">
      {stages && stages.some((s) => s.remindedCount > 0) && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-fg">Recovery rate by stage</p>
            <p className="mb-3 text-xs text-fg-muted">Of customers ever reminded at each stage, the share who have since paid off.</p>
            <div className="flex flex-col gap-2">
              {stages
                .filter((s) => s.remindedCount > 0)
                .map((s) => (
                  <div key={s.ruleId} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-fg-muted">{s.daysOverdueTrigger}d ({s.tone})</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${s.recoveryRate}%`, background: "var(--chart-1)" }} />
                    </div>
                    <span className="w-28 shrink-0 text-end text-xs tabular-nums text-fg-muted">
                      {formatPercent(s.recoveryRate)} · {s.recoveredCount}/{s.remindedCount}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add rule
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load reminder rules" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {rules && rules.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Bell} title="No staged reminders yet" description="Add a rule to automatically remind debtors as they cross a days-overdue threshold." />
          </CardContent>
        </Card>
      )}
      {rules && rules.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-fg">{rule.daysOverdueTrigger}+ days overdue</p>
                    <Badge tone={TONE_TONE[rule.tone]}>{rule.tone}</Badge>
                    <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "active" : "paused"}</Badge>
                  </div>
                  <p className="truncate text-xs text-fg-muted">
                    {rule.customMessage ? `"${rule.customMessage}"` : (CREDIT_REMINDER_TEMPLATE_OPTIONS.find((t) => t.tone === rule.tone)?.label ?? rule.tone)}
                    {rule.channel ? ` · ${rule.channel}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setTesting(rule)}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Test send
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: rule.id, active: !rule.active })}>
                    {rule.active ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(rule.id)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateRuleDialog open={creating} onClose={() => setCreating(false)} />
      {testing && <TestSendDialog rule={testing} onClose={() => setTesting(null)} />}
    </div>
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
