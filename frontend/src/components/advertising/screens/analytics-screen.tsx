"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAdvertising, formatMoney } from "../advertising-context";
import {
  fetchAdFunnel,
  fetchProductProfitability,
  fetchAdAttribution,
  type FunnelStage,
  type ProductProfitabilityRow,
  type AdAttributionRow,
} from "@/lib/ads-api";

export function AnalyticsScreen() {
  const [windowFilter, setWindowFilter] = useState("7-day click, 1-day view");

  const { data: funnel = [] } = useQuery<FunnelStage[]>({
    queryKey: ["adFunnel"],
    queryFn: fetchAdFunnel,
  });

  const { data: prodRows = [] } = useQuery<ProductProfitabilityRow[]>({
    queryKey: ["adProductProfitability"],
    queryFn: fetchProductProfitability,
  });

  const { data: attributionLogs = [] } = useQuery<AdAttributionRow[]>({
    queryKey: ["adAttribution"],
    queryFn: fetchAdAttribution,
  });

  const defaultFunnel = [
    { l: "Impressions", v: "412,000", w: "100%", color: "#C7D7FE" },
    { l: "Clicks", v: "9,840", w: "72%", color: "#A4BCFD" },
    { l: "Landing page views", v: "8,120", w: "58%", color: "#8098F9" },
    { l: "Leads and add-to-carts", v: "312", w: "34%", color: "#BFE7CF" },
    { l: "Orders and bookings", v: "79", w: "20%", color: "#6CD49A" },
    { l: "Paid and settled", v: "74", w: "17%", color: "#12A150" },
  ];

  const activeFunnel = funnel.length > 0 ? funnel : defaultFunnel;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Attribution Window Selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <select
          value={windowFilter}
          onChange={(e) => setWindowFilter(e.target.value)}
          aria-label="Attribution window"
          style={{
            border: "1px solid #E6EAF0",
            borderRadius: 11,
            padding: "10px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#344054",
            background: "#fff",
            minHeight: 44,
          }}
        >
          <option value="7-day click, 1-day view">7-day click, 1-day view</option>
          <option value="28-day click">28-day click</option>
          <option value="1-day click only">1-day click only</option>
        </select>
        <span style={{ fontSize: 11, color: "#98A2B3" }}>
          Orders are matched to clicks within the chosen window
        </span>
      </div>

      {/* 6-Stage Funnel Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: 16,
          padding: 17,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>
            Conversion Funnel
          </h3>
          <span style={{ fontSize: 11.5, color: "#667085" }}>
            From ad impression through to settled payment
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {activeFunnel.map((f, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: "0 0 190px", fontSize: 12.5, fontWeight: 600, color: "#344054" }}>
                {f.l}
              </span>
              <div style={{ flex: 1, minWidth: 140, background: "#F2F4F7", borderRadius: 6, height: 18, overflow: "hidden" }}>
                <div
                  style={{
                    width: f.w,
                    height: "100%",
                    background: f.color,
                    borderRadius: 6,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <span style={{ flex: "0 0 70px", textAlign: "right", fontSize: 12.5, fontWeight: 800, color: "#101828" }}>
                {f.v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Product Profitability Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>
            Product Profitability After Ad Spend
          </h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Product or service
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Ad spend
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Attributed revenue
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Return (ROAS)
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Profit after ad spend
                </th>
              </tr>
            </thead>
            <tbody>
              {prodRows.map((p, idx) => {
                const roasNum = p.spend > 0 ? p.rev / p.spend : 0;
                const roasLabel = roasNum > 0 ? `${roasNum.toFixed(1)}×` : "—";
                const isLoss = p.profit < 0;

                return (
                  <tr key={idx} style={{ borderTop: "1px solid #F2F4F7" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>
                      {p.n}
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>
                      {formatMoney(p.spend)}
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>
                      {formatMoney(p.rev)}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: roasNum >= 2 ? "#0E8442" : roasNum >= 1 ? "#B54708" : "#B42318",
                        textAlign: "right",
                      }}
                    >
                      {roasLabel}
                    </td>
                    <td
                      style={{
                        padding: "12px 17px",
                        fontSize: 13,
                        fontWeight: 800,
                        color: isLoss ? "#B42318" : "#0E8442",
                        textAlign: "right",
                      }}
                    >
                      {isLoss ? "− " : ""}
                      {formatMoney(Math.abs(p.profit))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          A high return can still lose money once cost of goods is taken off. Profit shown calculates revenue minus COGS minus total platform ad spend.
        </div>
      </div>

      {/* Attribution Table Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>
            Traced Back to the Sale
          </h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Campaign
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Ad
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Customer
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Touchpoint
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Record
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {attributionLogs.map((a, idx) => (
                <tr key={idx} style={{ borderTop: "1px solid #F2F4F7" }}>
                  <td style={{ padding: "12px 17px", fontSize: 12, fontWeight: 700, color: "#0E8442" }}>
                    {a.c}
                  </td>
                  <td style={{ padding: 12, fontSize: 12, color: "#475467" }}>{a.ad}</td>
                  <td style={{ padding: 12, fontSize: 12, color: "#475467" }}>{a.cust}</td>
                  <td style={{ padding: 12, fontSize: 11.5, color: "#98A2B3" }}>{a.touch}</td>
                  <td style={{ padding: 12, fontSize: 12, fontWeight: 700, color: "#101828" }}>
                    {a.order}
                  </td>
                  <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>
                    {a.rev}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          These are sales that followed an ad click within seven days.
        </div>
      </div>
    </div>
  );
}
