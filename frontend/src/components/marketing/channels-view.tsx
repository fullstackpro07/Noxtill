"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { fetchCampaigns, fetchQuotaUsage } from "@/lib/campaigns-api";
import { fetchEmailCampaigns, fetchEmailListHealth } from "@/lib/email-marketing-api";
import { MarketingDrawer } from "@/components/marketing/marketing-drawer";

interface ChannelCard {
  name: string;
  state: "Available" | "Not available";
  campaigns: number;
  sync: string;
}

export function ChannelsView() {
  const [detail, setDetail] = useState<ChannelCard | null>(null);
  const { data: waCampaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns });
  const { data: emailCampaigns = [] } = useQuery({ queryKey: ["email-campaigns"], queryFn: fetchEmailCampaigns });
  const { data: quota } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage });
  const { data: listHealth } = useQuery({ queryKey: ["email-list-health"], queryFn: fetchEmailListHealth });

  const cards: ChannelCard[] = [
    { name: "WhatsApp", state: "Available", campaigns: waCampaigns.length, sync: "Real-time" },
    { name: "Email", state: "Available", campaigns: emailCampaigns.length, sync: "Real-time" },
    { name: "SMS", state: "Not available", campaigns: 0, sync: "Never" },
    { name: "Facebook", state: "Not available", campaigns: 0, sync: "Never" },
    { name: "Instagram", state: "Not available", campaigns: 0, sync: "Never" },
    { name: "Telegram", state: "Not available", campaigns: 0, sync: "Never" },
    { name: "LinkedIn", state: "Not available", campaigns: 0, sync: "Never" },
    { name: "TikTok", state: "Not available", campaigns: 0, sync: "Never" },
  ];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex items-start gap-2.5 rounded-[12px]" style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", padding: "12px 14px" }}>
        <Info className="mt-0.5 h-[17px] w-[17px] shrink-0" style={{ color: "#3538CD" }} aria-hidden />
        <div className="text-[12px] leading-relaxed" style={{ color: "#3538CD" }}>
          <strong>Only genuinely available send paths can send.</strong> A channel shown as not available has no real send path wired up yet, produces no figures, and is not offered when building a campaign.
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
        {cards.map((c) => {
          const available = c.state === "Available";
          return (
            <div key={c.name} className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 16 }}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="min-w-0 flex-1 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                <span className="whitespace-nowrap rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: available ? "var(--app-success-bg)" : "var(--app-surface-2)", color: available ? "var(--app-success-text)" : "var(--app-text-faint)" }}>{c.state}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Stat label="Campaigns" value={String(c.campaigns)} />
                <Stat label="Reach" value="—" />
                <Stat label="Engagement" value="—" />
                <Stat label="Attributed revenue" value="—" highlight={false} />
              </div>
              <div className="mt-[11px] text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Last sync {c.sync}</div>
              <div className="mt-3 flex gap-2">
                {available ? (
                  <button
                    type="button"
                    onClick={() => setDetail(c)}
                    className="flex-1 rounded-[10px] text-[12px] font-bold"
                    style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: 10, minHeight: 44 }}
                  >
                    View detail
                  </button>
                ) : (
                  <button type="button" disabled className="flex-1 rounded-[10px] text-[12px] font-bold opacity-50" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-disabled)", padding: 10, minHeight: 44, cursor: "not-allowed" }}>
                    Not available
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detail && <ChannelDetailDrawer channel={detail} quota={quota} listHealth={listHealth} onClose={() => setDetail(null)} />}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{label}</span>
      <span className="mt-0.5 block text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{value}</span>
    </div>
  );
}

function ChannelDetailDrawer({
  channel,
  quota,
  listHealth,
  onClose,
}: {
  channel: ChannelCard;
  quota?: { used: number; quota: number; percent: number };
  listHealth?: { subscribed: number; unsubscribed: number };
  onClose: () => void;
}) {
  return (
    <MarketingDrawer title={channel.name} onClose={onClose} footer={
      <button type="button" onClick={onClose} className="flex-1 rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: 12, minHeight: 46 }}>
        Close
      </button>
    }>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[12px]" style={{ border: "1px solid var(--app-border)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Campaigns</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{channel.campaigns}</div>
        </div>
        <div className="rounded-[12px]" style={{ border: "1.5px solid var(--app-success-border)", background: "var(--app-bg)", padding: 12 }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Connection state</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{channel.state}</div>
        </div>
      </div>
      {channel.name === "WhatsApp" && quota && (
        <div className="rounded-[12px]" style={{ background: "var(--app-surface-2)", padding: 13 }}>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Monthly quota</div>
          <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{quota.used} of {quota.quota} used ({quota.percent}%)</div>
        </div>
      )}
      {channel.name === "Email" && listHealth && (
        <div className="rounded-[12px]" style={{ background: "var(--app-surface-2)", padding: 13 }}>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>List health</div>
          <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{listHealth.subscribed} subscribed · {listHealth.unsubscribed} unsubscribed</div>
        </div>
      )}
      <div className="rounded-[12px] text-[11.5px] leading-relaxed" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faintest)", padding: 13 }}>
        Figures are read back from {channel.name} in real time. Reach, engagement and per-channel revenue are not tracked yet — shown honestly as unavailable rather than estimated.
      </div>
    </MarketingDrawer>
  );
}
