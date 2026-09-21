"use client";

import React from "react";
import { useSocial, getChip } from "../social-context";

export function QueueScreen() {
  const { posts, approvePost, openDrawer, openModal, flash } = useSocial();

  const qRows = posts.filter((p) => ["Scheduled", "Needs approval", "Failed"].includes(p.st));

  const qKpis = [
    { l: "Ready to publish", v: String(posts.filter((p) => p.st === "Scheduled").length), color: "#0E8442" },
    { l: "Needs approval", v: String(posts.filter((p) => p.st === "Needs approval").length), color: "#B54708" },
    { l: "AI scheduled", v: String(posts.filter((p) => p.ai && p.st === "Scheduled").length), color: "#101828" },
    { l: "Failed", v: String(posts.filter((p) => p.st === "Failed").length), color: "#B42318" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 4 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {qKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Queue Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Publishing queue</h3>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>Every item runs a pre-flight check before it goes out</span>
        </div>

        {qRows.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>Nothing in the queue</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Scheduled and pending posts appear here.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Post</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Publish at</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Origin</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {qRows.map((p) => {
                  const chip = getChip(p.st);
                  const isScheduled = p.st === "Scheduled";
                  const needsApproval = p.st === "Needs approval";
                  const hasFailed = p.st === "Failed";

                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{p.t}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{p.pf}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#98A2B3", whiteSpace: "nowrap" }}>{p.when}</td>
                      <td style={{ padding: 12 }}>
                        {p.ai ? (
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 7px" }}>AI</span>
                        ) : (
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#475467", background: "#F2F4F7", borderRadius: 5, padding: "2px 7px" }}>Manual</span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                          {p.st}
                        </span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {isScheduled && (
                            <button
                              onClick={() => openDrawer("preflight", { p })}
                              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                            >
                              Pre-flight
                            </button>
                          )}
                          {needsApproval && (
                            <button
                              onClick={() => approvePost(p.id)}
                              style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}
                            >
                              Approve
                            </button>
                          )}
                          {hasFailed && (
                            <button
                              onClick={() => openModal("failure", { p })}
                              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 40 }}
                            >
                              Why?
                            </button>
                          )}
                          {hasFailed && (
                            <button
                              onClick={() => flash(`Reconnect ${p.pf} first — the retry will fail again until the channel connection is verified.`)}
                              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                            >
                              Retry
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          A failed publish is never retried silently. If the cause is a broken connection, the retry is blocked until it is fixed.
        </div>
      </div>
    </div>
  );
}
