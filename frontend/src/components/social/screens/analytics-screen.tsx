"use client";

import React from "react";
import { useSocial, formatNum } from "../social-context";

export function AnalyticsScreen() {
  const { posts, openDrawer, analyticsSummary, leads } = useSocial();

  const totalReach = analyticsSummary?.totalReach ?? posts.reduce((acc, p) => acc + (p.reach || 0), 0);
  const totalFollowers = analyticsSummary?.totalFollowers ?? 0;
  const totalEngagement = analyticsSummary?.totalEngagement ?? posts.reduce((acc, p) => acc + (p.eng || 0), 0);
  const totalImpressions = analyticsSummary?.totalImpressions ?? 0;
  const leadsCount = leads.length;

  const anKpis = [
    { l: "Reach", v: formatNum(totalReach), d: totalReach > 0 ? "Total audience views" : "No reach yet", up: totalReach > 0 },
    { l: "Impressions", v: formatNum(totalImpressions), d: totalImpressions > 0 ? "Content impressions" : "Not reported by this channel", up: totalImpressions > 0 },
    { l: "Engagement", v: formatNum(totalEngagement), d: totalEngagement > 0 ? "Likes, comments, shares" : "0 interactions", up: totalEngagement > 0 },
    { l: "Engagement rate", v: `${totalReach > 0 ? ((totalEngagement / totalReach) * 100).toFixed(1) : "0"}%`, d: "Interactions per view", up: totalEngagement > 0 },
    { l: "Followers total", v: formatNum(totalFollowers), d: totalFollowers > 0 ? "Connected channels" : "Channels not connected", up: totalFollowers > 0 },
    { l: "Leads captured", v: String(leadsCount), d: leadsCount > 0 ? "Customer inquiries" : "No inquiries yet", up: leadsCount > 0 },
    { l: "Attributed orders", v: "Not tracked", d: "No order-to-post link exists yet", up: false },
    { l: "Attributed revenue", v: "Not tracked", d: "No order-to-post link exists yet", up: false },
  ];

  const formats = [
    { l: "Video / Reel", key: "Video" },
    { l: "Carousel", key: "Carousel" },
    { l: "Photo", key: "Photo" },
    { l: "Text only", key: "Text" },
  ];

  const typePerf = formats.map((fmt) => {
    const matching = posts.filter((p) => p.type.toLowerCase().includes(fmt.key.toLowerCase()));
    const fReach = matching.reduce((sum, p) => sum + (p.reach || 0), 0);
    const fEng = matching.reduce((sum, p) => sum + (p.eng || 0), 0);
    const engPct = fReach > 0 ? ((fEng / fReach) * 100).toFixed(1) + "%" : "0%";
    const w = totalReach > 0 ? `${Math.min(100, Math.round((fReach / totalReach) * 100))}%` : "0%";
    return {
      l: fmt.l,
      reachLabel: formatNum(fReach),
      eng: engPct,
      w,
      color: fReach > 0 ? "#12A150" : "#E6EAF0",
    };
  });

  const funnel = [
    { l: "Reach", v: formatNum(totalReach), w: totalReach > 0 ? "100%" : "0%", color: "#BFE7CF" },
    { l: "Engaged", v: formatNum(totalEngagement), w: totalReach > 0 ? `${Math.min(100, Math.round((totalEngagement / totalReach) * 100))}%` : "0%", color: "#BFE7CF" },
    { l: "Leads captured", v: String(leadsCount), w: totalReach > 0 ? `${Math.min(100, Math.round((leadsCount / totalReach) * 100))}%` : leadsCount > 0 ? "100%" : "0%", color: "#12A150" },
  ];

  const topPosts = posts
    .filter((p) => p.reach > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 8 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {anKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#0F172A", marginTop: 6, letterSpacing: "-.4px" }}>{k.v}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: k.up ? "#0E8442" : "#98A2B3", marginTop: 4 }}>{k.d}</div>
          </div>
        ))}
      </div>

      {/* Row: By Content Type & Funnel */}
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 15 }}>
        {/* By Content Type Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>By content type</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {typePerf.map((t, idx) => (
              <div key={idx}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{t.l}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>
                    {t.reachLabel} · {t.eng}
                  </span>
                </div>
                <div style={{ height: 11, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: t.color, width: t.w }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 12, lineHeight: 1.55 }}>
            Breakdown derived from active posts published across connected accounts.
          </div>
        </div>

        {/* Social Funnel Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Social funnel</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {funnel.map((f, idx) => (
              <div key={idx}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{f.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#101828" }}>{f.v}</span>
                </div>
                <div style={{ height: 12, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: f.color, width: f.w }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 12, lineHeight: 1.55 }}>
            Reach, engagement and leads captured are real. Order/revenue attribution isn&apos;t tracked yet — no link exists between an order and the post or channel it came from.
          </div>
        </div>
      </div>

      {/* Best-Performing Posts Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Best-performing posts</h3>
        </div>
        {topPosts.length === 0 ? (
          <div style={{ padding: "44px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#344054" }}>No performance data yet</div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 4 }}>Posts with recorded views and engagements will appear here ranked by reach.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Post</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Reach</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Engagement</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Rate</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Leads</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => {
                  const rate = p.reach > 0 ? ((p.eng / p.reach) * 100).toFixed(1) + "%" : "0%";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openDrawer("post", { p })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{p.t}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{p.pf}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{p.type}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatNum(p.reach)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{formatNum(p.eng)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#0E8442", textAlign: "right" }}>{rate}</td>
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442", textAlign: "right" }}>{p.leads || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
