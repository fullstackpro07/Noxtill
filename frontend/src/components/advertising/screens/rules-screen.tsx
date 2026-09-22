"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdvertising } from "../advertising-context";
import { fetchAdRules, toggleAdRule, type AdRuleRecord, type AdRulesResponse } from "@/lib/ads-api";

export function RulesScreen() {
  const { flash, goToScreen } = useAdvertising();
  const queryClient = useQueryClient();

  const { data: rulesData, isLoading } = useQuery<AdRulesResponse>({
    queryKey: ["adRules"],
    queryFn: fetchAdRules,
  });

  const toggleMutation = useMutation({
    mutationFn: toggleAdRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adRules"] });
      flash("Rule updated.");
    },
    onError: (err: unknown) => {
      flash(err instanceof Error ? err.message : "Could not update the rule.");
    },
  });

  const rules: AdRuleRecord[] = rulesData?.rules ?? [];
  const ruleKpis = rulesData?.kpis ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        {ruleKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "15px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#667085" }}>{k.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: k.color, marginTop: "6px" }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Rules</h3>
          <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "#98A2B3" }}>
            The only automation Noxtill actually runs for your ads. Nothing else has been built yet — it isn&apos;t shown as if it had.
          </p>
        </div>
        <div>
          {isLoading ? (
            <div style={{ padding: "17px", fontSize: "12.5px", color: "#98A2B3" }}>Loading…</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: "17px", fontSize: "12.5px", color: "#98A2B3" }}>No rules available.</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} style={{ padding: "14px 17px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: "13px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{r.name}</span>
                  <div style={{ fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6 }}>
                    <strong style={{ color: "#344054" }}>When</strong> {r.when} → <strong style={{ color: "#344054" }}>then</strong> {r.then}
                  </div>
                  <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "5px" }}>
                    {r.guard} · fired {r.fired} time{r.fired === 1 ? "" : "s"} in the last 7 days
                  </div>
                </div>
                <button
                  onClick={() => toggleMutation.mutate(r.id)}
                  disabled={toggleMutation.isPending}
                  role="switch"
                  aria-checked={r.on}
                  aria-label={`Turn ${r.name} on or off`}
                  style={{
                    width: "40px",
                    height: "22px",
                    border: 0,
                    borderRadius: "20px",
                    background: r.on ? "#12A150" : "#D5DCE4",
                    position: "relative",
                    cursor: toggleMutation.isPending ? "not-allowed" : "pointer",
                    flex: "0 0 40px",
                    marginTop: "2px",
                    transition: "background 0.2s ease",
                  }}
                >
                  <span style={{ position: "absolute", top: "2px", left: r.on ? "20px" : "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "16px", padding: "17px" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: "13.5px", fontWeight: 800, color: "#0E8442" }}>How the threshold is set</h3>
        <p style={{ margin: 0, fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>
          Turning this rule on sets a starting cost-per-result threshold. To choose your own number, set it in{" "}
          <button onClick={() => goToScreen("settings")} style={{ border: 0, background: "none", padding: 0, color: "#0E8442", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
            Advertising settings
          </button>
          .
        </p>
      </div>
    </div>
  );
}
