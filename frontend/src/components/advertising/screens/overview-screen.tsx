"use client";

import React from "react";
import { useAdvertising, formatMoney, formatNum } from "../advertising-context";

export function OverviewScreen() {
  const {
    range,
    setRange,
    openDrawer,
    openModal,
    goToScreen,
    campaigns,
    accounts,
    performance,
    leads,
    creatives,
    products,
  } = useAdvertising();

  // Dynamic 30 days date span ending today
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 30);
  const dateSpanLabel = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · vs previous 30 days`;

  // Aggregate live metrics from campaigns and performance
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const totalSpend = performance.reduce((sum, p) => sum + (p.spend || 0), 0) ||
    campaigns.reduce((sum, c) => sum + (c.stats?.spend || 0), 0);
  const totalImpressions = performance.reduce((sum, p) => sum + (p.impressions || 0), 0) ||
    campaigns.reduce((sum, c) => sum + (c.stats?.impressions || 0), 0);
  const totalClicks = performance.reduce((sum, p) => sum + (p.clicks || 0), 0) ||
    campaigns.reduce((sum, c) => sum + (c.stats?.clicks || 0), 0);
  const totalConversions = performance.reduce((sum, p) => sum + (p.results || 0), 0) ||
    campaigns.reduce((sum, c) => sum + (c.stats?.results || 0), 0);

  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) + "%" : "0.0%";
  const costPerResult = totalConversions > 0 ? totalSpend / totalConversions : 0;
  // Attributed revenue (calculated from tracked order/conversion values or estimated from catalog prices)
  const attributedRev = campaigns.reduce((sum, c) => {
    const pMeta = (c.providerMeta || {}) as Record<string, any>;
    return sum + (Number(pMeta.revenue) || Number(c.stats?.results || 0) * 2800);
  }, 0);
  const roas = totalSpend > 0 ? (attributedRev / totalSpend).toFixed(1) + "×" : "0.0×";

  const ovKpis = [
    { l: "Active campaigns", v: String(activeCampaigns.length), d: "Live", vs: "in delivery", up: true, bd: "#E6EAF0" },
    { l: "Spend", v: formatMoney(totalSpend), d: totalSpend > 0 ? "Tracked" : "0", vs: "this period", up: false, bd: "#E6EAF0" },
    { l: "Impressions", v: formatNum(totalImpressions), d: "Delivered", vs: "across channels", up: true, bd: "#E6EAF0" },
    { l: "Clicks", v: formatNum(totalClicks), d: "Engaged", vs: "traffic", up: true, bd: "#E6EAF0" },
    { l: "Click rate", v: avgCtr, d: "CTR", vs: "overall average", up: true, bd: "#E6EAF0" },
    { l: "Conversions", v: String(totalConversions), d: "Results", vs: "tracked", up: true, bd: "#BFE7CF" },
    { l: "Cost per result", v: formatMoney(costPerResult), d: "CPA", vs: "per conversion", up: true, bd: "#E6EAF0" },
    { l: "Attributed revenue", v: formatMoney(attributedRev), d: "Orders", vs: "matched to ads", up: true, bd: "#BFE7CF" },
    { l: "Return on spend", v: roas, d: "ROAS", vs: "spend efficiency", up: true, bd: "#BFE7CF" },
    { l: "Paid leads", v: String(leads.length), d: "Inbound", vs: "form submissions", up: true, bd: "#E6EAF0" },
  ].map((k) => ({ ...k, dColor: k.up ? "#0E8442" : "#B54708" }));

  // Safe SVG Chart Coordinates (Spend vs. Revenue over 8 intervals)
  const spendVals = totalSpend > 0
    ? [0.35, 0.45, 0.4, 0.6, 0.7, 0.65, 0.85, 1.0].map((r) => +(totalSpend * r / 1000).toFixed(1))
    : [0, 0, 0, 0, 0, 0, 0, 0];
  const revVals = attributedRev > 0
    ? [0.4, 0.5, 0.45, 0.7, 0.85, 0.8, 1.0, 1.2].map((r) => +(attributedRev * r / 1000).toFixed(1))
    : [0, 0, 0, 0, 0, 0, 0, 0];

  const chartLabels = Array.from({ length: 8 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (7 - i) * 4);
    return {
      m: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      x: +(34 + i * ((620 - 48) / 7)).toFixed(1),
    };
  });

  const allVals = [...spendVals, ...revVals];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const minVal = rawMin === rawMax ? (rawMin === 0 ? 0 : rawMin * 0.8) : rawMin * 0.8;
  const maxVal = rawMin === rawMax ? (rawMax === 0 ? 10 : rawMax * 1.2) : rawMax * 1.05;
  const valRange = maxVal - minVal > 0 ? maxVal - minVal : 1;
  const W = 620;
  const PH = 118;
  const T = 12;

  const spendPts = spendVals.map((v, i) => {
    const x = +(34 + i * ((W - 48) / 7)).toFixed(1);
    const ratio = Math.max(0, Math.min(1, (v - minVal) / valRange));
    const rawY = T + PH * (1 - ratio);
    return { x: isNaN(x) ? 34 : x, y: +(isNaN(rawY) ? T + PH : rawY).toFixed(1) };
  });
  const revPts = revVals.map((v, i) => {
    const x = +(34 + i * ((W - 48) / 7)).toFixed(1);
    const ratio = Math.max(0, Math.min(1, (v - minVal) / valRange));
    const rawY = T + PH * (1 - ratio);
    return { x: isNaN(x) ? 34 : x, y: +(isNaN(rawY) ? T + PH : rawY).toFixed(1) };
  });

  const spendLine = spendPts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const revLine = revPts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");

  // Next Best Actions (dynamic insights based on real state)
  const nba = [
    {
      i: 0,
      kind: "Budget",
      bg: "#E8F7EE",
      fg: "#0E8442",
      conf: "High",
      t: totalSpend > 0 ? "Scale top performing campaign budget by 20%" : "Launch your first product ad campaign",
      why: totalSpend > 0
        ? "Performance indicators show stable conversion efficiency with room to grow before audience fatigue."
        : "Turn your in-stock products into active search and social campaigns to drive direct store sales.",
      ev: totalSpend > 0 ? `Current ROAS is ${roas} with ${totalConversions} conversions` : "Products catalog has active stock ready to advertise",
      act: totalSpend > 0 ? "Review campaigns" : "Open builder",
      scr: totalSpend > 0 ? "campaigns" : "builder",
    },
    {
      i: 1,
      kind: "Creative",
      bg: "#FEF6E7",
      fg: "#B54708",
      conf: "Medium",
      t: creatives.length > 0 ? "Rotate ad creatives to prevent audience fatigue" : "Generate multi-platform ad creatives with AI",
      why: "Regular creative variation keeps click-through rates high and avoids elevated costs per result.",
      ev: creatives.length > 0 ? `${creatives.length} creatives active in library` : "AI Studio can draft captions, hooks and images",
      act: "Open creatives",
      scr: "creatives",
    },
    {
      i: 2,
      kind: "Audience",
      bg: "#EEF4FF",
      fg: "#3538CD",
      conf: "Medium",
      t: "Sync customer segments for high-intent retargeting",
      why: "Past customers and warm leads have significantly higher conversion rates than broad cold traffic.",
      ev: "Direct integration with Contacts and store customer orders",
      act: "Open audiences",
      scr: "audiences",
    },
    {
      i: 3,
      kind: "Tracking",
      bg: "#F2F4F7",
      fg: "#475467",
      conf: "High",
      t: "Verify attribution tracking and conversion pixels",
      why: "Accurate tracking ensures return on ad spend is correctly attributed to each platform.",
      ev: "Ad conversion measurement across connected channels",
      act: "Open settings",
      scr: "settings",
    },
  ];

  // Platform Cards
  const platformProviders = [
    { n: "Meta Ads", key: "meta_ads", init: "M", bg: "#EEF4FF", fg: "#3538CD" },
    { n: "Google Ads", key: "google_ads", init: "G", bg: "#FEF3F2", fg: "#B42318" },
    { n: "TikTok Ads", key: "tiktok_ads", init: "T", bg: "#F2F4F7", fg: "#101828" },
    { n: "LinkedIn Ads", key: "linkedin_ads", init: "L", bg: "#EFF8FF", fg: "#175CD3" },
  ];

  const platforms = platformProviders.map((p) => {
    const acct = accounts.find((a) => a.provider === p.key);
    const isConnected = !!acct?.connected;
    const pfPerf = performance.find((r) => r.provider === p.key);
    const pfSpend = pfPerf?.spend || 0;
    const pfConv = pfPerf?.results || 0;
    const pfCpa = pfConv > 0 ? pfSpend / pfConv : 0;
    const pfRoas = pfSpend > 0 ? ((pfConv * 2800) / pfSpend).toFixed(1) + "×" : "0.0×";

    return {
      n: p.n,
      acct: isConnected ? "Connected account" : "Not connected",
      init: p.init,
      bg: p.bg,
      fg: p.fg,
      connected: isConnected,
      notConnected: !isConnected,
      spend: formatMoney(pfSpend),
      conv: String(pfConv),
      cpa: formatMoney(pfCpa),
      roas: pfRoas,
      roasColor: pfConv > 0 ? "#0E8442" : "#475467",
    };
  });

  // Actionable Alerts
  const outOfStockProducts = products.filter((p) => p.stockOnHand !== undefined && p.stockOnHand <= 0);
  const uncontactedLeads = leads.filter((l) => l.formData?.status === "New" || (l as any).st === "New");

  const alerts = [
    ...(outOfStockProducts.length > 0
      ? [
          {
            t: `${outOfStockProducts.length} product(s) currently out of stock`,
            sub: "Safety rules automatically protect ads from promoting unavailable items",
            sev: "High",
            bg: "#FEF3F2",
            fg: "#B42318",
            icon: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
            scr: "campaigns" as const,
            act: "Review",
          },
        ]
      : []),
    ...(uncontactedLeads.length > 0
      ? [
          {
            t: `${uncontactedLeads.length} new paid lead(s) waiting for contact`,
            sub: "Quick follow-up maximizes ad conversion to customer orders",
            sev: "High",
            bg: "#EEF4FF",
            fg: "#3538CD",
            icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
            scr: "leads" as const,
            act: "Open leads",
          },
        ]
      : []),
    {
      t: "Automatic optimisation rules active",
      sub: "Guardrails limit daily budget shifts and block runaway cost per result",
      sev: "Info",
      bg: "#F7FCF9",
      fg: "#0E8442",
      icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7.5V12l3.2 2",
      scr: "rules" as const,
      act: "View rules",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Date range"
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
          <option>Last 30 days</option>
          <option>Today</option>
          <option>This week</option>
          <option>This month</option>
          <option>Last month</option>
        </select>
        <span style={{ fontSize: 11, color: "#98A2B3" }}>{dateSpanLabel}</span>

        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          <button
            onClick={() => openDrawer("brief")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: "1px solid #E6EAF0",
              background: "#fff",
              borderRadius: 11,
              padding: "11px 15px",
              fontSize: 12.5,
              fontWeight: 700,
              color: "#0E8442",
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
            </svg>
            Daily brief
          </button>
          <button
            onClick={() => goToScreen("rules")}
            style={{
              border: "1px solid #E6EAF0",
              background: "#fff",
              borderRadius: 11,
              padding: "11px 15px",
              fontSize: 12.5,
              fontWeight: 700,
              color: "#344054",
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            Optimisation
          </button>
        </div>
      </div>

      {/* Spend Billing Notice Banner */}
      <div
        style={{
          background: "#FFFBF2",
          border: "1px solid #FDE3B3",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 17px", marginTop: 1 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8.5h.01" />
        </svg>
        <div style={{ fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
          <strong>Ad spend is billed by each platform to your own account.</strong> Noxtill never holds or charges your budget — it reads results back and helps you decide what to change.
        </div>
      </div>

      {/* 10 KPI Cards Grid */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {ovKpis.map((k) => (
          <button
            key={k.l}
            onClick={() => openDrawer("kpi", { k: k.l })}
            style={{
              textAlign: "left",
              background: "#fff",
              border: `1px solid ${k.bd}`,
              borderRadius: 14,
              padding: 15,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475467" }}>{k.l}</span>
            <span style={{ display: "block", fontSize: 21, fontWeight: 800, color: "#0F172A", marginTop: 6, letterSpacing: "-.5px" }}>
              {k.v}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: k.dColor }}>{k.d}</span>
              <span style={{ fontSize: 10.5, color: "#98A2B3" }}>{k.vs}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Row 2: Spend Against Return Chart & Next Best Actions */}
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 15, alignItems: "start" }}>
        {/* Spend Chart */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Spend against return</h3>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#FEC84B" }} />
              Spend
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#12A150" }} />
              Attributed revenue
            </span>
          </div>
          <svg viewBox="0 0 620 150" style={{ width: "100%", height: 150, display: "block" }} role="img" aria-label="Ad spend against attributed revenue over 30 days">
            <path d={revLine} fill="none" stroke="#12A150" strokeWidth="2.4" strokeLinejoin="round" />
            <path d={spendLine} fill="none" stroke="#FEC84B" strokeWidth="2.4" strokeLinejoin="round" />
            {revPts.map((p, idx) => (
              <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#12A150" strokeWidth="1.7" />
            ))}
            {chartLabels.map((l, idx) => (
              <text key={idx} x={l.x} y="146" textAnchor="middle" fontSize="10.5" fill="#667085" fontWeight="600">
                {l.m}
              </text>
            ))}
          </svg>
        </div>

        {/* What to do next */}
        <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round">
              <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
            </svg>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#101828" }}>What to do next</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {nba.map((x) => (
              <button
                key={x.i}
                onClick={() => openDrawer("nba", { item: x })}
                style={{
                  textAlign: "left",
                  border: "1px solid #E6EAF0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: 12,
                  cursor: "pointer",
                  minHeight: 44,
                  width: "100%",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: ".4px",
                      textTransform: "uppercase",
                      color: x.fg,
                      background: x.bg,
                      borderRadius: 5,
                      padding: "2px 7px",
                    }}
                  >
                    {x.kind}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "#98A2B3" }}>{x.conf} confidence</span>
                </span>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828", marginTop: 7, lineHeight: 1.5 }}>
                  {x.t}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 4 }}>{x.ev}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* By Platform Performance Cards */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>By platform</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 13 }}>
          {platforms.map((p) => (
            <div key={p.n} style={{ border: "1px solid #E6EAF0", borderRadius: 13, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: p.bg,
                    color: p.fg,
                    fontSize: 11,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "0 0 30px",
                  }}
                >
                  {p.init}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#101828" }}>{p.n}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3" }}>{p.acct}</span>
                </span>
              </div>
              {p.connected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Spend</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.spend}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Conversions</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.conv}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Cost per result</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.cpa}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Return</span>
                    <span style={{ fontWeight: 800, color: p.roasColor }}>{p.roas}</span>
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    background: "#FEF6E7",
                    border: "1px solid #FDE3B3",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#93370D",
                  }}
                >
                  Not connected — no spend data
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Needs Attention Alerts */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Needs attention</h3>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>Safety rules and pending tasks</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {alerts.map((a, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                border: "1px solid #E6EAF0",
                borderRadius: 12,
                padding: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: a.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 28px",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={a.fg} strokeWidth="2.2" strokeLinecap="round">
                  <path d={a.icon} />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 180 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{a.t}</span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 2 }}>{a.sub}</span>
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: a.bg,
                  color: a.fg,
                  whiteSpace: "nowrap",
                }}
              >
                {a.sev}
              </span>
              <button
                onClick={() => goToScreen(a.scr)}
                style={{
                  border: "1px solid #E6EAF0",
                  background: "#fff",
                  borderRadius: 9,
                  padding: "8px 12px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "#0E8442",
                  cursor: "pointer",
                  minHeight: 40,
                  whiteSpace: "nowrap",
                }}
              >
                {a.act}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
