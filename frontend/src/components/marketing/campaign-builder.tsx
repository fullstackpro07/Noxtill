"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuotaModal } from "@/components/shared/quota-modal";
import { AUDIENCE_OPTIONS, VARIABLE_CHIPS, type AudienceKey } from "@/lib/campaigns";
import { toast } from "@/lib/toast";

const PLAN_MSG_QUOTA = 1000;
const PLAN_MSG_USED = 640;

type Step = 1 | 2 | 3 | 4;

export function CampaignBuilder({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [audience, setAudience] = useState<AudienceKey>("all");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Hi {{customerName}}, ");
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);

  const selectedAudience = AUDIENCE_OPTIONS.find((a) => a.key === audience)!;
  const remaining = PLAN_MSG_QUOTA - PLAN_MSG_USED;
  const insufficientQuota = selectedAudience.count > remaining;

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

  function handleSend() {
    toast.success(`"${name}" sent to ${selectedAudience.count} customers. Live send wires up in INT-010.`);
    onDone();
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
                <span className="text-xs text-fg-faint">{opt.count} customers</span>
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
              <span className="font-medium text-fg">{selectedAudience.count} messages</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-fg-muted">Remaining this month</span>
              <span className={insufficientQuota ? "font-medium text-destructive" : "font-medium text-fg"}>{remaining} of {PLAN_MSG_QUOTA}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className={`h-full rounded-full ${insufficientQuota ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (PLAN_MSG_USED / PLAN_MSG_QUOTA) * 100)}%` }}
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
              <span className="font-medium text-fg">{selectedAudience.count} customers</span> ({selectedAudience.label})
            </p>
            <p className="mt-2 whitespace-pre-wrap text-fg">{message}</p>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button onClick={handleSend}>
              <Send className="h-4 w-4" aria-hidden />
              Send campaign
            </Button>
          </div>
        </div>
      )}

      <QuotaModal
        open={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        onUpgrade={() => {
          setQuotaModalOpen(false);
          toast.info("Upgrade flow wires up in INT-014.");
        }}
        used={PLAN_MSG_USED}
        quota={PLAN_MSG_QUOTA}
      />
    </div>
  );
}
