"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocial, getChip } from "../social-context";
import type { AdLeadStatus } from "@/lib/ads-api";

const STATUS_LABEL: Record<AdLeadStatus, string> = { new: "New", contacted: "Contacted", converted: "Converted" };

export function LeadsScreen() {
  const { leads, capturePolicy, openDrawer, flash, updateLeadStatusAction } = useSocial();
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string | number; status: AdLeadStatus }) => updateLeadStatusAction(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ad-leads"] }),
  });

  const leadKpis = [
    { l: "Captured", v: String(leads.length), color: "#101828" },
    { l: "New", v: String(leads.filter((l) => l.status === "new").length), color: "#3538CD" },
    { l: "Contacted", v: String(leads.filter((l) => l.status === "contacted").length), color: "#B54708" },
    { l: "Converted", v: String(leads.filter((l) => l.status === "converted").length), color: "#0E8442" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Privacy Notice Banner */}
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3538CD" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 17px", marginTop: 1 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8.5h.01" />
        </svg>
        <div style={{ fontSize: 12, color: "#3538CD", lineHeight: 1.55 }}>
          Only fields the person actually gave you are stored. Blank means blank — no name, email, phone or location is ever inferred, and nothing is scraped.
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {leadKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Captured Leads Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Captured leads</h3>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 20, padding: "3px 9px" }}>
            Auto-capture {capturePolicy}
          </span>
          <button
            onClick={() => flash("Lead export initiated — CSV will download shortly.")}
            style={{ marginLeft: "auto", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 42 }}
          >
            Export leads
          </button>
        </div>

        {leads.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No customer leads captured yet</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Inquiries from comments, direct messages and social campaigns will appear here.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Name</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Email</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Phone</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Source</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Captured</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const sc = getChip(l.st);

                  return (
                    <tr
                      key={l.id}
                      onClick={() => openDrawer("lead", { l })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px" }}>
                        {l.name !== "—" ? (
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{l.name}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        {l.email !== "—" ? (
                          <span style={{ fontSize: 12, color: "#475467" }}>{l.email}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        {l.phone !== "—" ? (
                          <span style={{ fontSize: 12, color: "#475467" }}>{l.phone}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>
                        {l.pf} · {l.src}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#475467" }}>{l.when}</td>
                      <td style={{ padding: 12 }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={l.status}
                          onChange={(e) => statusMutation.mutate({ id: l.id, status: e.target.value as AdLeadStatus })}
                          aria-label={`Status for ${l.name !== "—" ? l.name : "lead"}`}
                          style={{ fontSize: 11, fontWeight: 800, padding: "5px 8px", borderRadius: 8, background: sc.bg, color: sc.fg, border: "none", cursor: "pointer" }}
                        >
                          {(Object.keys(STATUS_LABEL) as AdLeadStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          A possible duplicate is never merged automatically. You decide whether it is the same person.
        </div>
      </div>
    </div>
  );
}
