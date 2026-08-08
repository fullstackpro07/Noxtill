"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchReferralSettings, saveReferralSettings, fetchReferralStats } from "@/lib/referrals-api";
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from "@/lib/referrals";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function ReferralSettingsCard() {
  const queryClient = useQueryClient();
  const { data: liveSettings } = useQuery({ queryKey: ["referral-settings"], queryFn: fetchReferralSettings });
  const { data: stats } = useQuery({ queryKey: ["referral-stats"], queryFn: fetchReferralStats });
  const [settings, setSettings] = useState(DEFAULT_REFERRAL_SETTINGS);
  // Once the real settings arrive, sync them into local editable state exactly once — further local
  // edits shouldn't be clobbered by refetches, so this compares by reference, not by re-running on
  // every render (React's own recommended pattern for "initialize editable state from a fetch").
  const [syncedFrom, setSyncedFrom] = useState<ReferralSettings | undefined>(undefined);
  if (liveSettings && liveSettings !== syncedFrom) {
    setSyncedFrom(liveSettings);
    setSettings(liveSettings);
  }

  const saveMutation = useMutation({
    mutationFn: () => saveReferralSettings({ ...settings, enabled: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success("Referral settings saved.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again.");
    },
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-medium text-fg">Referral rewards</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-fg-faint">Referred</p>
          <p className="font-display text-lg font-bold text-fg">{stats?.totalReferred ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-fg-faint">Converted</p>
          <p className="font-display text-lg font-bold text-fg">{stats?.converted ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-fg-faint">Rewards issued</p>
          <p className="font-display text-lg font-bold text-fg">{stats?.rewardsIssued ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Reward type"
          value={settings.rewardType}
          onChange={(e) => setSettings((s) => ({ ...s, rewardType: e.target.value as "credit" | "discount" }))}
        >
          <option value="credit">Account credit</option>
          <option value="discount">Discount on next visit</option>
        </Select>
        <Input
          label="Amount"
          type="number"
          min={0}
          value={settings.rewardAmount}
          onChange={(e) => setSettings((s) => ({ ...s, rewardAmount: Number(e.target.value) }))}
          leadingSlot={<span className="text-sm">$</span>}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
