"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdFunnel, type FunnelStage } from "@/lib/ads-api";

const FUNNEL_COLORS = ["#C7D7FE", "#A4BCFD", "#BFE7CF", "#12A150"];

export function AnalyticsScreen() {
  const { data: funnel = [], isLoading } = useQuery<FunnelStage[]>({
    queryKey: ["adFunnel"],
    queryFn: fetchAdFunnel,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Funnel Card — real numbers only: impressions/clicks from connected accounts, leads and
          completed orders from their own real records. No landing-page-view or click-to-order
          tracking exists, so the funnel stops where real measurement stops. */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>
            Conversion Funnel
          </h3>
          <span style={{ fontSize: 11.5, color: "#667085" }}>
            From ad impression to a completed order — only what&apos;s actually measured
          </span>
        </div>
        {isLoading ? (
          <div style={{ fontSize: 12.5, color: "#98A2B3" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {funnel.map((f, idx) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ flex: "0 0 190px", fontSize: 12.5, fontWeight: 600, color: "#344054" }}>
                  {f.label}
                </span>
                <div style={{ flex: 1, minWidth: 140, background: "#F2F4F7", borderRadius: 6, height: 18, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${f.widthPercent}%`,
                      height: "100%",
                      background: FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
                      borderRadius: 6,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span style={{ flex: "0 0 70px", textAlign: "right", fontSize: 12.5, fontWeight: 800, color: "#101828" }}>
                  {f.value.toLocaleString("en-US")}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 13, fontSize: 11.5, color: "#98A2B3", lineHeight: 1.55 }}>
          This does not include landing-page views or a click-to-order match — neither is tracked yet, so neither is estimated here.
        </div>
      </div>

      {/* Product profitability after ad spend and click-to-order attribution both need data this
          app doesn't collect: no ad campaign is linked to a specific product, and there's no
          click/pixel tracking connecting an ad click to a later order. A previous version of this
          screen showed both anyway, using invented numbers (including four entirely made-up
          example products) — removed rather than fixed to fabricate less. */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>
          Product profitability &amp; sale attribution
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "#667085", lineHeight: 1.6 }}>
          Not available yet. Showing which product an ad sold, or which sale an ad click led to, needs
          two things Noxtill doesn&apos;t track today: a link between a campaign and a specific product,
          and click-level tracking through to the order. Neither exists, so this isn&apos;t shown as if it did.
        </p>
      </div>
    </div>
  );
}
