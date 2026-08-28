"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import {
  fetchBranches,
  updateBranch,
  copyBranchSettings,
  type Branch,
  type PaymentMethodKey,
} from "@/lib/branches-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const PAYMENT_METHODS: { key: PaymentMethodKey; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "credit", label: "Credit" },
];

type WorkingHours = Record<string, [string, string][]>;

export function BranchSettingsView({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient();
  const { data: branches = [], isPending, isError, refetch } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const branch = branches.find((b) => b.id === branchId);
  const otherBranches = branches.filter((b) => b.id !== branchId);

  // Draft state, seeded once the real branch loads — edits never get clobbered by a background refetch.
  const [draft, setDraft] = useState<Partial<Branch> | null>(null);
  const [copyFromId, setCopyFromId] = useState("");

  const current = { ...branch, ...draft } as Branch | undefined;
  const dirty = draft != null && Object.keys(draft).length > 0;

  const saveMutation = useMutation({
    mutationFn: () => updateBranch(branchId, draft!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch settings saved.");
      setDraft(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  const copyMutation = useMutation({
    mutationFn: () => copyBranchSettings(branchId, copyFromId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setDraft(null);
      toast.success("Settings copied.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't copy those settings — please try again."),
  });

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setDayHours(dayKey: string, range: [string, string] | null) {
    const hours: WorkingHours = { ...(current?.workingHours ?? {}) };
    if (range) hours[dayKey] = [range];
    else delete hours[dayKey];
    set("workingHours", hours);
  }

  function togglePaymentMethod(method: PaymentMethodKey) {
    const current_ = current?.acceptedPaymentMethods ?? [];
    const next = current_.includes(method) ? current_.filter((m) => m !== method) : [...current_, method];
    set("acceptedPaymentMethods", next);
  }

  if (isError) {
    return <ErrorBanner title="Couldn't load branch settings" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending || !current) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div>
          <p className="text-sm font-medium text-fg">{current.name}</p>
          <p className="text-xs text-fg-muted">{current.parentId ? "Branch" : "Main branch"}</p>
        </div>
        <div className="flex items-center gap-2">
          {otherBranches.length > 0 && (
            <>
              <Select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} className="w-52">
                <option value="">Copy settings from…</option>
                {otherBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="sm" onClick={() => copyMutation.mutate()} disabled={!copyFromId || copyMutation.isPending}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-fg">General</p>
          <Input label="Name" value={current.name} onChange={(e) => set("name", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Country" value={current.country ?? ""} onChange={(e) => set("country", e.target.value)} />
            <Input label="Timezone" value={current.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Currency" value={current.currency} onChange={(e) => set("currency", e.target.value)} />
            <Select label="Message channel" value={current.channelPref} onChange={(e) => set("channelPref", e.target.value as Branch["channelPref"])}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </Select>
          </div>
          <Input label="Nightly close time" type="time" value={current.nightlyCloseTime} onChange={(e) => set("nightlyCloseTime", e.target.value)} />
        </div>

        <div className="flex flex-col gap-3.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-fg">Tax & payments</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tax label" value={current.taxLabel} onChange={(e) => set("taxLabel", e.target.value)} />
            <Input
              label="Tax rate (%)"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={current.taxRate}
              onChange={(e) => set("taxRate", Number(e.target.value))}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Accepted payment methods</p>
            <p className="mb-2 text-xs text-fg-faint">A stored preference — not yet enforced at the point of sale.</p>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={current.acceptedPaymentMethods.includes(m.key)}
                    onChange={() => togglePaymentMethod(m.key)}
                    className="h-4 w-4 rounded border-border-strong accent-primary"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Working hours</p>
        <div className="flex flex-col gap-2">
          {DAYS.map((day) => {
            const range = current.workingHours[day.key]?.[0];
            const open = !!range;
            return (
              <div key={day.key} className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-0">
                <label className="flex w-32 shrink-0 items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) => setDayHours(day.key, e.target.checked ? ["09:00", "17:00"] : null)}
                    className="h-4 w-4 rounded border-border-strong accent-primary"
                  />
                  {day.label}
                </label>
                {open ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={range![0]}
                      onChange={(e) => setDayHours(day.key, [e.target.value, range![1]])}
                      className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-fg"
                    />
                    <span className="text-fg-faint">–</span>
                    <input
                      type="time"
                      value={range![1]}
                      onChange={(e) => setDayHours(day.key, [range![0], e.target.value])}
                      className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-fg"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-fg-faint">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
