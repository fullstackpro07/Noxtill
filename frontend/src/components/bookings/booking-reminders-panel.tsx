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
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchReminderRules,
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
  testSendReminderRule,
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

export function BookingRemindersPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<ReminderRule | null>(null);

  const { data: rules, isPending, isError, refetch } = useQuery({ queryKey: ["reminder-rules"], queryFn: fetchReminderRules });
  const { data: noShowReport } = useQuery({ queryKey: ["no-show-report"], queryFn: () => fetchNoShowReport(6) });

  const firstRuleCreatedAt = rules && rules.length > 0 ? rules.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), rules[0].createdAt) : undefined;

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateReminderRule(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-rules"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this rule."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReminderRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-rules"] });
      toast.success("Reminder rule deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this rule."),
  });

  return (
    <div className="flex flex-col gap-5">
      {noShowReport && noShowReport.trend.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 text-sm font-medium text-fg">No-show rate before / after your first rule</p>
            <p className="mb-3 text-xs text-fg-muted">
              {firstRuleCreatedAt ? `First rule configured ${new Date(firstRuleCreatedAt).toLocaleDateString()}` : "No rules configured yet — showing the raw trend."}
            </p>
            <NoShowRateChart trend={noShowReport.trend} markAt={firstRuleCreatedAt} />
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
            <EmptyState icon={Bell} title="Using the default reminders" description="No custom rules yet — appointments get reminded 24h and 2h before, automatically." />
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
                    <p className="text-sm font-medium text-fg">{rule.offsetHours}h before appointment</p>
                    <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "active" : "paused"}</Badge>
                  </div>
                  <p className="truncate text-xs text-fg-muted">
                    {rule.customMessage ? `"${rule.customMessage}"` : (REMINDER_TEMPLATE_OPTIONS.find((t) => t.key === rule.templateKey)?.label ?? rule.templateKey)}
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

function NoShowRateChart({ trend, markAt }: { trend: { month: string; rate: number }[]; markAt?: string }) {
  const width = 560;
  const height = 130;
  const max = Math.max(...trend.map((t) => t.rate), 10);
  const points = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.rate / max) * height }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const markIndex = markAt ? trend.findIndex((t) => t.month >= markAt.slice(0, 7)) : -1;
  const markX = markIndex >= 0 ? (markIndex / (trend.length - 1)) * width : undefined;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="No-show rate before and after reminder rules">
      <path d={linePath} fill="none" stroke="var(--destructive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {markX != null && <line x1={markX} y1={0} x2={markX} y2={height} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 3" />}
    </svg>
  );
}

const VARIABLE_CHIPS = ["{{customerName}}", "{{serviceName}}", "{{dateTime}}"];

function CreateRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  function insertVariable(token: string) {
    setCustomMessage((m) => `${m}${token}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a reminder rule"
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
        <Select label="Timing" value={offsetHours} onChange={(e) => setOffsetHours(Number(e.target.value))}>
          {OFFSET_PRESETS.map((p) => (
            <option key={p.hours} value={p.hours}>
              {p.label}
            </option>
          ))}
          <option value={-1}>Custom…</option>
        </Select>
        {offsetHours === -1 && (
          <Input label="Custom (hours before)" type="number" min={1} value={customOffsetHours} onChange={(e) => setCustomOffsetHours(Math.max(1, Number(e.target.value)))} />
        )}
        <Select label="Channel (blank = business default)" value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel | "")}>
          <option value="">Business default</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </Select>
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">
            {useCustomMessage ? "Fallback template" : "Message"}
          </p>
          <div className="flex flex-col gap-1.5">
            {REMINDER_TEMPLATE_OPTIONS.map((t) => (
              <label key={t.key} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-border-strong p-2.5 text-sm">
                <input type="radio" name="template" checked={templateKey === t.key} onChange={() => setTemplateKey(t.key)} className="mt-0.5" />
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

          {useCustomMessage ? (
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
                Sent as-is on SMS, email, and WhatsApp within an active conversation. If WhatsApp needs to reach outside an
                active 24-hour conversation, Meta requires the pre-approved template above instead — this only affects that one case.
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-fg-faint">
              Business-initiated WhatsApp messages outside an active conversation must use pre-approved wording — check
              &quot;Write a custom message&quot; to send your own text on SMS, email, or an active WhatsApp conversation.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function TestSendDialog({ rule, onClose }: { rule: ReminderRule; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () => testSendReminderRule(rule.id, { phone: phone || undefined, email: email || undefined }),
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
