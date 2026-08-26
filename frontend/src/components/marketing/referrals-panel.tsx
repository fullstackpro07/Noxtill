"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Settings2, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchReferralSettings, saveReferralSettings, fetchReferralStats } from "@/lib/referrals-api";
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from "@/lib/referrals";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-fg-faint">{label}</span>
        <span className="font-display text-xl font-bold tabular-nums text-fg">{value}</span>
      </CardContent>
    </Card>
  );
}

export function ReferralsPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: settings } = useQuery({ queryKey: ["referral-settings"], queryFn: fetchReferralSettings });
  const { data: stats } = useQuery({ queryKey: ["referral-stats"], queryFn: fetchReferralStats });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => saveReferralSettings({ ...(settings ?? DEFAULT_REFERRAL_SETTINGS), enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success("Referral program updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  const conversionRate = stats && stats.totalReferred > 0 ? Math.round((stats.converted / stats.totalReferred) * 100) : 0;
  const rewardAmount = settings?.rewardAmount ?? DEFAULT_REFERRAL_SETTINGS.rewardAmount;
  const shareMessage = `Hey! Come check out ${session.business.name} 🙌 Just mention my name when you visit for the first time and I'll get ${
    settings?.rewardType === "discount" ? `${formatCurrency(rewardAmount, session.business.currency)} off my next visit` : `${formatCurrency(rewardAmount, session.business.currency)} credit`
  } as a thank-you!`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      toast.success("Share message copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <Gift className="h-4 w-4 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-medium text-fg">Referral program</p>
              <p className="text-xs text-fg-faint">{settings?.enabled ? "Live — customers can earn rewards for referrals" : "Off — no rewards are being issued"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={settings?.enabled ?? false}
              onClick={() => toggleMutation.mutate(!(settings?.enabled ?? false))}
              disabled={toggleMutation.isPending}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings?.enabled ? "bg-whatsapp" : "bg-surface-2"}`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${settings?.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Reward settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Referred" value={stats ? String(stats.totalReferred) : "…"} />
        <StatTile label="Converted" value={stats ? String(stats.converted) : "…"} />
        <StatTile label="Conversion rate" value={stats ? `${conversionRate}%` : "…"} />
        <StatTile label="Rewards issued" value={stats ? String(stats.rewardsIssued) : "…"} />
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-1.5 text-sm font-medium text-fg">Share message preview</p>
          <p className="mb-3 text-xs text-fg-faint">What a customer could send friends — staff link the referral by mentioning the referrer&apos;s name at checkout.</p>
          <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 p-3">
            <p className="whitespace-pre-wrap text-sm text-fg">{shareMessage}</p>
          </div>
          <button type="button" onClick={handleCopy} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copied ? "Copied" : "Copy message"}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
            <Trophy className="h-3.5 w-3.5 text-accent-foreground" aria-hidden />
            Top referrers
          </p>
          {!stats || stats.leaderboard.length === 0 ? (
            <EmptyState icon={Trophy} title="No referrals yet" description="Once customers start referring friends, your top referrers show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                    <th className="px-2 py-2 text-start">Rank</th>
                    <th className="px-2 py-2 text-start">Customer</th>
                    <th className="px-2 py-2 text-end">Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.leaderboard.map((row, i) => (
                    <tr key={row.customerId} className="border-b border-border last:border-0">
                      <td className="px-2 py-2 text-fg-faint">#{i + 1}</td>
                      <td className="px-2 py-2 font-medium text-fg">{row.name}</td>
                      <td className="px-2 py-2 text-end tabular-nums text-fg">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {settingsOpen && <RewardSettingsDialog settings={settings ?? DEFAULT_REFERRAL_SETTINGS} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function RewardSettingsDialog({ settings, onClose }: { settings: ReferralSettings; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);

  const mutation = useMutation({
    mutationFn: () => saveReferralSettings(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success("Reward settings saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reward settings"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Select label="Reward type" value={form.rewardType} onChange={(e) => setForm((s) => ({ ...s, rewardType: e.target.value as "credit" | "discount" }))}>
          <option value="credit">Account credit</option>
          <option value="discount">Discount on next visit</option>
        </Select>
        <Input
          label="Amount"
          type="number"
          min={0}
          value={form.rewardAmount}
          onChange={(e) => setForm((s) => ({ ...s, rewardAmount: Number(e.target.value) }))}
        />
      </div>
    </Dialog>
  );
}
