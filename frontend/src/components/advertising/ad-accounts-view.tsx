"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Rocket, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchAdAccounts,
  createCampaign,
  AD_PROVIDERS,
  AD_PROVIDER_LABELS,
  type AdProvider,
} from "@/lib/ads-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** The exact `meta` field(s) each real connector reads — see `Connector.createCampaign`'s own `meta` param in each connector file. */
const META_FIELDS: Record<AdProvider, { key: string; label: string }[]> = {
  google_ads: [{ key: "customerId", label: "Google Ads Customer ID" }],
  meta_ads: [{ key: "adAccountId", label: "Meta Ad Account ID" }],
  tiktok_ads: [{ key: "advertiserId", label: "TikTok Advertiser ID" }],
  linkedin_ads: [{ key: "adAccountId", label: "LinkedIn Ad Account ID" }],
  pinterest_ads: [{ key: "adAccountId", label: "Pinterest Ad Account ID" }],
  snapchat_ads: [{ key: "adAccountId", label: "Snapchat Ad Account ID" }],
  microsoft_ads: [
    { key: "accountId", label: "Microsoft Advertising Account ID" },
    { key: "customerId", label: "Microsoft Advertising Customer ID" },
  ],
  amazon_ads: [{ key: "profileId", label: "Amazon Advertising Profile ID" }],
  reddit_ads: [{ key: "adAccountId", label: "Reddit Ad Account ID" }],
};

const GOALS = ["traffic", "leads", "awareness", "sales", "engagement"];

export function AdAccountsView() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["ad-accounts"], queryFn: fetchAdAccounts });
  const byProvider = new Map((data ?? []).map((r) => [r.provider, r]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Ad Accounts</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Real connection status per platform, and a real campaign create — paused by default, pushed to the provider when connected.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Rocket className="h-4 w-4" aria-hidden />
          Create campaign
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load ad accounts" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AD_PROVIDERS.map((provider) => {
            const row = byProvider.get(provider);
            const connected = row?.connected ?? false;
            return (
              <div key={provider} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-fg">{AD_PROVIDER_LABELS[provider]}</p>
                  {connected ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden /> Connected
                    </Badge>
                  ) : (
                    <Badge tone="neutral">
                      <XCircle className="h-3 w-3" aria-hidden /> Not connected
                    </Badge>
                  )}
                </div>
                {row?.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}
                {!connected && (
                  <p className="mt-2 text-xs text-fg-faint">
                    <Link href="/integrations" className="text-primary hover:underline">
                      Connect from Integrations →
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateCampaignDialog open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function CreateCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<AdProvider>("meta_ads");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [dailyBudget, setDailyBudget] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      const meta = Object.fromEntries(Object.entries(metaValues).filter(([, v]) => v.trim()));
      return createCampaign(provider, { name, goal, dailyBudget: Number(dailyBudget), meta });
    },
    onSuccess: (campaign) => {
      toast.success(campaign.externalId ? "Campaign created and pushed to the provider, paused." : "Campaign created as a local draft.");
      void queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this campaign."),
  });

  function handleClose() {
    setStep(1);
    setProvider("meta_ads");
    setName("");
    setGoal(GOALS[0]);
    setDailyBudget("");
    setMetaValues({});
    onClose();
  }

  if (!open) return null;

  const canNext = step === 1 ? true : step === 2 ? name.trim() && Number(dailyBudget) > 0 : true;

  return (
    <Dialog
      open
      onClose={handleClose}
      title={`Create campaign — step ${step} of 3`}
      footer={
        <>
          <Button variant="ghost" onClick={step === 1 ? handleClose : () => setStep(step - 1)} disabled={mutation.isPending}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              Next
            </Button>
          ) : (
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create campaign"}
            </Button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <Select label="Platform" value={provider} onChange={(e) => setProvider(e.target.value as AdProvider)}>
            {AD_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {AD_PROVIDER_LABELS[p]}
              </option>
            ))}
          </Select>
          {META_FIELDS[provider].map((f) => (
            <Input
              key={f.key}
              label={`${f.label} (optional — leave blank to create a local draft only)`}
              value={metaValues[f.key] ?? ""}
              onChange={(e) => setMetaValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Select label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </option>
            ))}
          </Select>
          <Input label="Daily budget ($)" type="number" min={1} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
        </div>
      )}
      {step === 3 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <p>
            <span className="text-fg-muted">Platform:</span> <span className="font-medium text-fg">{AD_PROVIDER_LABELS[provider]}</span>
          </p>
          <p>
            <span className="text-fg-muted">Name:</span> <span className="font-medium text-fg">{name}</span>
          </p>
          <p>
            <span className="text-fg-muted">Goal:</span> <span className="font-medium text-fg">{goal}</span>
          </p>
          <p>
            <span className="text-fg-muted">Daily budget:</span> <span className="font-medium text-fg">${dailyBudget}</span>
          </p>
          <p className="mt-2 text-xs text-fg-faint">Always created paused — never launches real spend automatically.</p>
        </div>
      )}
    </Dialog>
  );
}
