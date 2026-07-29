"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEFAULT_REFERRAL_SETTINGS, REFERRAL_STATS } from "@/lib/referrals";
import { toast } from "@/lib/toast";

export function ReferralSettingsCard() {
  const [settings, setSettings] = useState(DEFAULT_REFERRAL_SETTINGS);

  function handleSave() {
    toast.success("Referral settings saved. Live save wires up in INT-010.");
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-medium text-fg">Referral rewards</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-fg-faint">Referred</p>
          <p className="font-display text-lg font-bold text-fg">{REFERRAL_STATS.totalReferred}</p>
        </div>
        <div>
          <p className="text-xs text-fg-faint">Converted</p>
          <p className="font-display text-lg font-bold text-fg">{REFERRAL_STATS.converted}</p>
        </div>
        <div>
          <p className="text-xs text-fg-faint">Rewards issued</p>
          <p className="font-display text-lg font-bold text-fg">{REFERRAL_STATS.rewardsIssued}</p>
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
        <Button size="sm" onClick={handleSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
