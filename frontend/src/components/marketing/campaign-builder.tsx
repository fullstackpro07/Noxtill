"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuotaModal } from "@/components/shared/quota-modal";
import { AUDIENCE_OPTIONS, VARIABLE_CHIPS, type AudienceKey } from "@/lib/campaigns";
import { fetchAudienceCount, fetchQuotaUsage, createCampaign } from "@/lib/campaigns-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

type Step = 1 | 2 | 3 | 4;

export function CampaignBuilder({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [audience, setAudience] = useState<AudienceKey>("all");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Hi {{customerName}}, ");
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);

  const audienceCounts = useQueries({
    queries: AUDIENCE_OPTIONS.map((opt) => ({
      queryKey: ["audience-count", opt.key],
      queryFn: () => fetchAudienceCount(opt.key),
    })),
  });
  const countByKey = new Map(AUDIENCE_OPTIONS.map((opt, i) => [opt.key, audienceCounts[i].data ?? 0]));
  const selectedCount = countByKey.get(audience) ?? 0;

  const { data: quotaUsage } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage });
  const used = quotaUsage?.used ?? 0;
  const quota = quotaUsage?.quota ?? 0;
  const remaining = quota - used;
  const insufficientQuota = selectedCount > remaining;

  const sendMutation = useMutation({
    mutationFn: () => createCampaign({ segment: audience, body: message }),
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["quota-usage"] });
      toast.success(`"${name || campaign.segment}" sent to ${campaign.sentCount} customers.`);
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CAMPAIGN_QUOTA_EXCEEDED") {
        setQuotaModalOpen(true);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't send this campaign — please try again.");
    },
  });

  function insertVariable(token: string) {
    setMessage((m) => `${m}${token}`);
  }

  function goToQuotaStep() {
    if (insufficientQuota) {
      setQuotaModalOpen(true);
      return;
    }
    setStep(4);
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="mb-5 flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 w-10 rounded-full ${n <= step ? "bg-primary" : "bg-surface-2"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-fg">Choose your audience</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAudience(opt.key)}
                className={`rounded-[var(--radius-sm)] border px-3 py-2.5 text-start text-sm transition-colors ${
                  audience === opt.key ? "border-primary bg-primary/6" : "border-border hover:bg-surface-2"
                }`}
              >
                <span className="block font-medium text-fg">{opt.label}</span>
                <span className="text-xs text-fg-faint">{countByKey.get(opt.key) ?? 0} customers</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)}>
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label htmlFor="campaign-message" className="mb-1.5 block text-sm font-medium text-fg">
              Message
            </label>
            <textarea
              id="campaign-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
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
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!name.trim() || !message.trim()}>
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-fg">Quota check</p>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-fg-muted">This campaign needs</span>
              <span className="font-medium text-fg">{selectedCount} messages</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-fg-muted">Remaining this month</span>
              <span className={insufficientQuota ? "font-medium text-destructive" : "font-medium text-fg"}>{remaining} of {quota}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className={`h-full rounded-full ${insufficientQuota ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${quota > 0 ? Math.min(100, (used / quota) * 100) : 0}%` }}
              />
            </div>
            {insufficientQuota && (
              <Badge tone="danger" className="mt-3">
                Not enough quota for this audience
              </Badge>
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button onClick={goToQuotaStep}>
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-fg">Review &amp; send</p>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-4 text-sm">
            <p className="text-fg-muted">
              Sending <span className="font-medium text-fg">{name}</span> to{" "}
              <span className="font-medium text-fg">{selectedCount} customers</span> (
              {AUDIENCE_OPTIONS.find((a) => a.key === audience)!.label})
            </p>
            <p className="mt-2 whitespace-pre-wrap text-fg">{message}</p>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)} disabled={sendMutation.isPending}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              <Send className="h-4 w-4" aria-hidden />
              {sendMutation.isPending ? "Sending…" : "Send campaign"}
            </Button>
          </div>
        </div>
      )}

      <QuotaModal
        open={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        onUpgrade={() => {
          setQuotaModalOpen(false);
          router.push("/settings/billing");
        }}
        used={used}
        quota={quota}
      />
    </div>
  );
}
