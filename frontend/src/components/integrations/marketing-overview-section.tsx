"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketingOverview } from "@/lib/marketing-overview-api";
import { formatCurrency } from "@/lib/format";

const CHANNEL_HREF: Record<string, string> = {
  "Google Ads": "/integrations/google-ads",
  "Meta Ads": "/integrations/meta-ads",
  "TikTok Ads": "/integrations/tiktok-ads",
  Email: "/integrations/email",
  WhatsApp: "/marketing",
};

export function MarketingOverviewSection({ currency }: { currency: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["marketing-overview"],
    queryFn: fetchMarketingOverview,
  });
  const rows = data?.channels ?? [];
  const totalSpend = data?.totals.spend ?? 0;

  return (
    <div className="mt-8 flex flex-col gap-5">
      <h2 className="font-display text-lg font-semibold text-fg">Cross-channel overview</h2>

      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Channel</th>
              <th className="px-4 py-3 text-start">Spend</th>
              <th className="px-4 py-3 text-start">Results</th>
              <th className="px-4 py-3 text-start">Cost/result</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-fg-faint">
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.channel} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-fg">
                    {CHANNEL_HREF[row.channel] ? (
                      <Link href={CHANNEL_HREF[row.channel]} className="hover:underline">
                        {row.channel}
                      </Link>
                    ) : (
                      row.channel
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(row.spend, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{row.results}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {row.costPerResult != null ? formatCurrency(row.costPerResult, currency) : "—"}
                  </td>
                </tr>
              ))
            )}
            {!isPending && (
              <tr className="bg-surface-2/50">
                <td className="px-4 py-3 font-semibold text-fg">Total</td>
                <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(totalSpend, currency)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
