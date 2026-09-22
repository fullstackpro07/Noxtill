"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdvertising, getChip } from "../advertising-context";
import { updateAdLeadStatus, type AdLeadStatus } from "@/lib/ads-api";

const STATUS_LABEL: Record<AdLeadStatus, string> = { new: "New", contacted: "Contacted", converted: "Converted" };

export function LeadsScreen() {
  const { leads, openDrawer, goToScreen, flash } = useAdvertising();
  const queryClient = useQueryClient();
  const [lFilter, setLFilter] = useState("All");

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdLeadStatus }) => updateAdLeadStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adLeads"] });
    },
    onError: () => flash("Couldn't update this lead's status."),
  });

  const lRows = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    src: l.provider.replace(/_ads/g, "").toUpperCase(),
    status: l.status,
    when: new Date(l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    raw: l,
  }));

  const leadTabs = ["All", "New", "Contacted", "Converted"].map((k) => ({
    k,
    n: k === "All" ? lRows.length : lRows.filter((l) => STATUS_LABEL[l.status] === k).length,
  }));

  const filtered = lRows.filter((l) => lFilter === "All" || STATUS_LABEL[l.status] === lFilter);

  const leadKpis = [
    { l: "Leads", v: String(lRows.length), color: "#0F172A" },
    { l: "New", v: String(lRows.filter((l) => l.status === "new").length), color: "#3538CD" },
    { l: "Converted", v: String(lRows.filter((l) => l.status === "converted").length), color: "#12A150" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {leadKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {leadTabs.map((t) => {
          const isSel = lFilter === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setLFilter(t.k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                background: isSel ? "#F7FCF9" : "#fff",
                color: isSel ? "#0E8442" : "#475467",
                borderRadius: 20,
                padding: "9px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 42,
              }}
            >
              {t.k}
              <span style={{ fontSize: 10.5, opacity: 0.75 }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No paid leads captured yet</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>
              Inbound inquiries from instant lead forms and landing pages appear here.
            </div>
            <button
              onClick={() => goToScreen("builder")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Launch lead campaign
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Lead</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Contact</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Source</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Captured</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const sc = getChip(STATUS_LABEL[l.status]);
                  return (
                    <tr key={l.id} onClick={() => openDrawer("lead", { l: l.raw })} style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}>
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>
                        {l.name || <span style={{ color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#475467" }}>{l.phone || l.email || "—"}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{l.src}</td>
                      <td style={{ padding: 12 }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={l.status}
                          disabled={statusMutation.isPending}
                          onChange={(e) => statusMutation.mutate({ id: l.id, status: e.target.value as AdLeadStatus })}
                          aria-label={`Status for ${l.name || "this lead"}`}
                          style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.fg, border: 0, cursor: "pointer" }}
                        >
                          {(Object.keys(STATUS_LABEL) as AdLeadStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#98A2B3", textAlign: "right" }}>{l.when}</td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer("lead", { l: l.raw });
                          }}
                          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 38 }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Inbound leads from ad forms contain only what the user explicitly entered. Contact information is never scraped or enriched. Status is set here by you — Noxtill never guesses it.
        </div>
      </div>
    </div>
  );
}
