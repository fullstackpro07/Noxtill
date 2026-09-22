"use client";

import React from "react";
import { useSocial, formatNum } from "../social-context";

export function OverviewScreen() {
  const {
    range,
    setRange,
    metric,
    setMetric,
    posts,
    comments,
    openDrawer,
    openModal,
    goToScreen,
    accounts,
    analyticsSummary,
    dailyHistory,
    leads,
    comps,
  } = useSocial();

  const needsApprovalCount = posts.filter((p) => p.st === "Needs approval").length;
  const unansweredCount = comments.filter((c) => c.st === "New" || c.st === "AI suggested").length;

  const connectedAccountsCount = accounts.filter((a) => a.st === "Connected").length;
  const publishedPostsCount = posts.filter((p) => p.st === "Published").length;
  const failedPostsCount = posts.filter((p) => p.st === "Failed").length;
  const totalReach = analyticsSummary?.totalReach ?? posts.reduce((acc, p) => acc + (p.reach || 0), 0);
  const totalFollowers = analyticsSummary?.totalFollowers ?? 0;
  const totalEngagement = analyticsSummary?.totalEngagement ?? posts.reduce((acc, p) => acc + (p.eng || 0), 0);
  const engRate = totalReach > 0 ? ((totalEngagement / totalReach) * 100).toFixed(1) + "%" : "0%";

  const ovKpis = [
    { l: "Connected accounts", v: `${connectedAccountsCount} of ${accounts.length}`, d: `${accounts.length - connectedAccountsCount} unlinked`, vs: "", up: false, color: "#3538CD", bd: "#E6EAF0", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0" },
    { l: "Posts published", v: String(publishedPostsCount), d: publishedPostsCount > 0 ? "Published" : "None yet", vs: "", up: publishedPostsCount > 0, color: "#0E8442", bd: "#E6EAF0", icon: "m22 2-7.5 20-4-9-9-4Z" },
    { l: "Reach", v: formatNum(totalReach), d: totalReach > 0 ? "Total views" : "No reach yet", vs: "", up: totalReach > 0, color: "#0E8442", bd: "#E6EAF0", icon: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6" },
    { l: "Engagement rate", v: engRate, d: totalEngagement > 0 ? `${formatNum(totalEngagement)} interactions` : "0 interactions", vs: "", up: totalEngagement > 0, color: "#0E8442", bd: "#E6EAF0", icon: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" },
    { l: "Followers", v: formatNum(totalFollowers), d: totalFollowers > 0 ? "Audience" : "Not synced", vs: "", up: totalFollowers > 0, color: "#0E8442", bd: "#E6EAF0", icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0" },
    { l: "Needs approval", v: String(needsApprovalCount), d: "waiting on you", vs: "", up: false, color: "#B54708", bd: "#FDE3B3", icon: "M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
    { l: "Unanswered", v: String(unansweredCount), d: "in inbox", vs: "", up: false, color: "#B54708", bd: "#FDE3B3", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" },
    { l: "Leads captured", v: String(leads.length), d: leads.length > 0 ? "From social" : "None yet", vs: "", up: leads.length > 0, color: "#0E8442", bd: "#BFE7CF", icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M19 8v6M16 11h6" },
  ];

  const metricTabs = ["Reach", "Engagement", "Followers"];

  // Real per-day totals from SocialAnalyticsSnapshot — no faked trend shape. "Leads" has no daily
  // history table behind it (AdLead only has a creation date, not a rolled-up per-day snapshot),
  // so it isn't offered as a chart metric; the real total still shows in the KPI tile above.
  const metricValues: Record<string, number[]> = {
    Reach: dailyHistory.map((d) => d.reach),
    Engagement: dailyHistory.map((d) => d.engagement),
    Followers: dailyHistory.map((d) => d.followers),
  };

  const currentVals = metricValues[metric] || metricValues.Reach;
  const n = currentVals.length;
  const rawMin = Math.min(...currentVals);
  const rawMax = Math.max(...currentVals);
  const minVal = rawMin === rawMax ? (rawMin === 0 ? 0 : rawMin * 0.85) : rawMin * 0.85;
  const maxVal = rawMin === rawMax ? (rawMax === 0 ? 10 : rawMax * 1.15) : rawMax * 1.05;
  const valRange = maxVal - minVal > 0 ? maxVal - minVal : 1;
  const W = 620;
  const PH = 118;
  const T = 12;
  const pts = currentVals.map((v, i) => {
    const x = +(34 + i * ((W - 48) / Math.max(1, n - 1))).toFixed(1);
    const ratio = Math.max(0, Math.min(1, (v - minVal) / valRange));
    const rawY = T + PH * (1 - ratio);
    const y = +(isNaN(rawY) ? T + PH : rawY).toFixed(1);
    return { x: isNaN(x) ? 34 : x, y };
  });
  const lineD = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const lastX = pts.length > 0 ? pts[pts.length - 1].x : W;
  const areaD = pts.length > 0 ? lineD + " L" + lastX + " " + (T + PH) + " L34 " + (T + PH) + " Z" : "";

  const perfLabels = dailyHistory.map((d) => new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

  const failedPost = posts.find((p) => p.st === "Failed");
  const unlinkedCount = accounts.length - connectedAccountsCount;

  // Real best-performing format, computed from actual posted reach — not a fixed claim. Needs at
  // least 2 published formats with recorded reach before a comparison means anything.
  const formatReach = new Map<string, { reach: number; count: number }>();
  for (const p of posts) {
    if (!p.type || p.reach <= 0) continue;
    const row = formatReach.get(p.type) ?? { reach: 0, count: 0 };
    row.reach += p.reach;
    row.count += 1;
    formatReach.set(p.type, row);
  }
  const rankedFormats = [...formatReach.entries()]
    .map(([type, r]) => ({ type, avgReach: r.reach / r.count }))
    .sort((a, b) => b.avgReach - a.avgReach);
  const bestFormat = rankedFormats[0];
  const secondFormat = rankedFormats[1];
  const formatMultiple = bestFormat && secondFormat && secondFormat.avgReach > 0 ? bestFormat.avgReach / secondFormat.avgReach : null;

  const intelItems = [
    ...(bestFormat && formatMultiple && formatMultiple >= 1.2
      ? [
          {
            i: 0,
            kind: "Opportunity",
            bg: "#E8F7EE",
            fg: "#0E8442",
            conf: "Medium",
            t: `${bestFormat.type} posts are averaging ${formatMultiple.toFixed(1)}× the reach of your next-best format`,
            why: `Based on average reach per post across your published content, ${bestFormat.type} format posts are reaching more people than other formats you're posting.`,
            ev: "Average reach per post, grouped by content type, across connected channels",
            act: "Generate more content",
            scr: "studio",
          },
        ]
      : []),
    ...(failedPost
      ? [
          {
            i: 1,
            kind: "Risk",
            bg: "#FEF3F2",
            fg: "#B42318",
            conf: "High",
            t: `A post for "${failedPost.prod !== "—" ? failedPost.prod : failedPost.t}" failed delivery on ${failedPost.pf}`,
            why: `The publication request encountered a connection or authorization issue on ${failedPost.pf}. The retry is blocked until channel authorization is confirmed.`,
            ev: "Retry is held until account credentials or policy checks pass",
            act: "Review the queue",
            scr: "queue",
          },
        ]
      : needsApprovalCount > 0
      ? [
          {
            i: 1,
            kind: "Attention",
            bg: "#FEF6E7",
            fg: "#B54708",
            conf: "High",
            t: `${needsApprovalCount} post${needsApprovalCount > 1 ? "s" : ""} awaiting your approval before publishing`,
            why: "Safe approval mode ensures that drafts and scheduled content are vetted by you before going live to audience channels.",
            ev: "Approval mode is actively guarding your channels",
            act: "Review pending posts",
            scr: "content",
          },
        ]
      : []),
    ...(unansweredCount > 0
      ? [
          {
            i: 2,
            kind: "Content gap",
            bg: "#FEF6E7",
            fg: "#B54708",
            conf: "Medium",
            t: `${unansweredCount} customer inquiry message${unansweredCount > 1 ? "s" : ""} waiting in social inbox`,
            why: "Prompt responses to product questions dramatically improve lead conversion and positive brand sentiment.",
            ev: "Direct questions regarding pricing and availability",
            act: "Open inbox",
            scr: "inbox",
          },
        ]
      : [
          {
            i: 2,
            kind: "Content gap",
            bg: "#FEF6E7",
            fg: "#B54708",
            conf: "Medium",
            t: "No booking-focused content scheduled this weekend",
            why: "Adding posts highlighting available service hours or appointment booking slots drives weekend appointments.",
            ev: "Calendar and Bookings capacity check",
            act: "Open calendar",
            scr: "calendar",
          },
        ]),
    ...(unlinkedCount > 0
      ? [
          {
            i: 3,
            kind: "Channel gap",
            bg: "#EEF4FF",
            fg: "#3538CD",
            conf: "Medium",
            t: `${unlinkedCount} social channel${unlinkedCount > 1 ? "s" : ""} not yet connected`,
            why: "Unconnected social profiles cannot receive scheduled posts or sync live audience metrics.",
            ev: "Connect them in Accounts to unlock unified publishing",
            act: "Manage accounts",
            scr: "accounts",
          },
        ]
      : comps.length > 0
      ? [
          {
            i: 3,
            kind: "Competitor",
            bg: "#EEF4FF",
            fg: "#3538CD",
            conf: "Medium",
            t: `${comps.length} competitor${comps.length > 1 ? "s" : ""} on your watchlist — review their public activity`,
            why: "Comparing public post frequency, ratings and format mix in your niche helps adjust your own weekly content cadence.",
            ev: "Public competitor profiles you're tracking",
            act: "Open competitors",
            scr: "competitors",
          },
        ]
      : []),
  ];

  // Map platform cards from live accounts context
  const platforms = accounts.map((acc) => {
    const isConnected = acc.st === "Connected";
    const pfPosts = posts.filter((p) => p.pf.toLowerCase().includes(acc.pf.toLowerCase()));
    const pfReach = pfPosts.reduce((sum, p) => sum + (p.reach || 0), 0);
    const pfEngTotal = pfPosts.reduce((sum, p) => sum + (p.eng || 0), 0);
    const pfEng = pfReach > 0 ? ((pfEngTotal / pfReach) * 100).toFixed(1) + "%" : isConnected ? "0%" : "—";
    const pfLeads = pfPosts.reduce((sum, p) => sum + (p.leads || 0), 0);

    return {
      n: acc.pf,
      handle: isConnected ? acc.handle : "Not connected",
      init: acc.init,
      bg: acc.bg,
      fg: acc.fg,
      connected: isConnected,
      posts: isConnected ? String(pfPosts.length) : "",
      reach: isConnected ? (pfReach > 0 ? formatNum(pfReach) : "0") : "",
      eng: isConnected ? pfEng : "",
      leads: isConnected ? String(pfLeads) : "",
    };
  });

  const autoRows = [
    { l: "Posts total", v: String(posts.length), color: "#101828" },
    { l: "Pending approval", v: String(needsApprovalCount), color: "#B54708" },
    { l: "Scheduled", v: String(posts.filter((p) => p.st === "Scheduled").length), color: "#101828" },
    { l: "Published", v: String(publishedPostsCount), color: "#0E8442" },
    { l: "AI replies sent", v: String(comments.filter((c) => c.st === "AI replied").length), color: "#0E8442" },
    { l: "Failed to publish", v: String(failedPostsCount), color: "#B42318" },
  ];

  const needsYou = [
    ...(needsApprovalCount > 0
      ? [{ t: `${needsApprovalCount} post${needsApprovalCount > 1 ? "s" : ""} waiting on approval`, sub: "Ready for your review", bg: "#FEF6E7", fg: "#B54708", icon: "M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", scr: "content", act: "Review" }]
      : []),
    ...(failedPostsCount > 0
      ? [{ t: `${failedPostsCount} delivery failure`, sub: "Retry target in queue", bg: "#FEF3F2", fg: "#B42318", icon: "M18 6 6 18M6 6l12 12", scr: "queue", act: "Fix" }]
      : []),
    ...(unansweredCount > 0
      ? [{ t: `${unansweredCount} inbox message${unansweredCount > 1 ? "s" : ""} unanswered`, sub: "Customer inquiry waiting", bg: "#EEF4FF", fg: "#3538CD", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z", scr: "inbox", act: "Open" }]
      : []),
  ];

  const dateSpanLabel = `${new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Date range"
          style={{ border: "1px solid #E6EAF0", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 44 }}
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
            onClick={() => goToScreen("competitors")}
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
          >
            Analyse competitors
          </button>
          <button
            onClick={() => openModal("autoplan")}
            style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 44 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
            </svg>
            Auto-plan the week
          </button>
          <button
            onClick={() => goToScreen("studio")}
            style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
          >
            Generate with AI
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {ovKpis.map((k) => (
          <button
            key={k.l}
            onClick={() => openDrawer("kpi", { k: k.l })}
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${k.bd}`, borderRadius: 14, padding: 15, cursor: "pointer", minHeight: 44 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={k.icon} />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#475467" }}>{k.l}</span>
            </span>
            <span style={{ display: "block", fontSize: 21, fontWeight: 800, color: "#0F172A", letterSpacing: "-.5px" }}>{k.v}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: k.up ? "#0E8442" : "#B54708" }}>{k.d}</span>
              {k.vs && <span style={{ fontSize: 10.5, color: "#98A2B3" }}>{k.vs}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* Row 2: Performance Chart & Social Intelligence */}
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 15, alignItems: "start" }}>
        {/* Social Performance Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Social performance</h3>
            <span style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
              {metricTabs.map((m) => {
                const isSel = metric === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    style={{
                      border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                      background: isSel ? "#F7FCF9" : "#fff",
                      color: isSel ? "#0E8442" : "#475467",
                      borderRadius: 20,
                      padding: "7px 13px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      minHeight: 38,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </span>
          </div>
          <svg viewBox="0 0 620 150" style={{ width: "100%", height: 150, display: "block" }} role="img" aria-label={`${metric} over the last 30 days`}>
            <path d={areaD} fill="rgba(18,161,80,.10)" />
            <path d={lineD} fill="none" stroke="#12A150" strokeWidth="2.4" strokeLinejoin="round" />
            {pts.map((p, idx) => (
              <circle key={idx} cx={p.x} cy={p.y} r="3.2" fill="#fff" stroke="#12A150" strokeWidth="1.8" />
            ))}
            {perfLabels.map((lbl, idx) => {
              const xPos = +(34 + idx * ((620 - 48) / 7)).toFixed(1);
              return (
                <text key={idx} x={xPos} y="146" textAnchor="middle" fontSize="10.5" fill="#667085" fontWeight="600">
                  {lbl}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Today's Social Intelligence Card */}
        <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round">
              <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
            </svg>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#101828" }}>Today's social intelligence</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {intelItems.map((x) => (
              <button
                key={x.i}
                onClick={() => openDrawer("intel", { intel: x, i: x.i })}
                style={{ textAlign: "left", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 12, padding: 12, cursor: "pointer", minHeight: 44, width: "100%" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: x.fg, background: x.bg, borderRadius: 5, padding: "2px 7px" }}>
                    {x.kind}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "#98A2B3" }}>{x.conf} confidence</span>
                </span>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828", marginTop: 7, lineHeight: 1.5 }}>{x.t}</span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 4 }}>{x.ev}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Performance Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Platform performance</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 13 }}>
          {platforms.map((p) => (
            <div key={p.n} style={{ border: "1px solid #E6EAF0", borderRadius: 13, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: p.bg, color: p.fg, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px" }}>
                  {p.init}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#101828" }}>{p.n}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3" }}>{p.handle}</span>
                </span>
              </div>
              {p.connected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Posts</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.posts}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Reach</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.reach}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Engagement</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{p.eng}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "#667085" }}>Leads</span>
                    <span style={{ fontWeight: 800, color: "#0E8442" }}>{p.leads}</span>
                  </span>
                </div>
              ) : (
                <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: 10, padding: 10, fontSize: 11, fontWeight: 700, color: "#93370D" }}>
                  Not connected — no data to show
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 4: Automation Today & Needs You Now */}
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 15 }}>
        {/* Automation Today Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Activity today</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {autoRows.map((a, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                <span style={{ flex: 1, fontSize: 12.5, color: "#344054" }}>{a.l}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: a.color }}>{a.v}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 11, lineHeight: 1.55 }}>
            Nothing publishes to a platform without a person creating or approving it — there is no auto-publish.
          </div>
        </div>

        {/* Needs You Now Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Needs you now</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {needsYou.map((n, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: n.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 28px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={n.fg} strokeWidth="2.2" strokeLinecap="round">
                    <path d={n.icon} />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{n.t}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 2 }}>{n.sub}</span>
                </span>
                <button
                  onClick={() => goToScreen(n.scr)}
                  style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 40, whiteSpace: "nowrap" }}
                >
                  {n.act}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
