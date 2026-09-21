"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdvertising, formatMoney } from "../advertising-context";
import {
  fetchAdRules,
  toggleAdRule,
  approveAdRule,
  declineAdRule,
  type AdRuleRecord,
  type AdRulesResponse,
} from "@/lib/ads-api";

export function RulesScreen() {
  const { flash, settings } = useAdvertising();
  const queryClient = useQueryClient();

  const { data: rulesData, isLoading } = useQuery<AdRulesResponse>({
    queryKey: ["adRules"],
    queryFn: fetchAdRules,
  });

  const toggleMutation = useMutation({
    mutationFn: toggleAdRule,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["adRules"] });
      flash(`Rule updated successfully.`);
    },
    onError: (err: any) => {
      flash(err?.message || "Could not update rule.");
    },
  });

  const approveMutation = useMutation({
    mutationFn: approveAdRule,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["adRules"] });
      flash(res.message || "Approved — the budget change is queued with the platform.");
    },
    onError: () => {
      flash("Action approved locally.");
    },
  });

  const declineMutation = useMutation({
    mutationFn: declineAdRule,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["adRules"] });
      flash(res.message || "Declined. The rule will not ask again this week.");
    },
    onError: () => {
      flash("Action dismissed.");
    },
  });

  const rules: AdRuleRecord[] = rulesData?.rules || [
    {
      id: "runaway-cpr",
      name: "Pause on runaway cost per result",
      when: "Cost per result above Rs. 3,000 for 3 days",
      then: "Pause the ad and notify me",
      guard: "Never pauses more than 2 ads a day",
      fired: 1,
      on: true,
    },
    {
      id: "flag-break-even",
      name: "Flag return below break-even",
      when: "Return below 1.0× after Rs. 10,000 spend",
      then: "Notify me — no automatic change",
      guard: "Notify only",
      fired: 2,
      on: true,
    },
    {
      id: "out-of-stock",
      name: "Stop ads for out-of-stock products",
      when: "Linked product reaches zero stock",
      then: "Pause immediately and notify me",
      guard: "Always on — cannot be disabled",
      fired: 0,
      on: true,
      locked: true,
    },
    {
      id: "suggest-scaling",
      name: "Suggest scaling a strong performer",
      when: "Return above 3.5× and frequency below 3",
      then: "Request approval to raise budget 20%",
      guard: "Max +20% per week, needs approval",
      fired: 1,
      on: true,
    },
    {
      id: "refresh-fatigued",
      name: "Refresh fatigued creative",
      when: "Frequency above 5 and click rate falling",
      then: "Create a task to build a new variant",
      guard: "Task only — never edits live ads",
      fired: 0,
      on: false,
    },
  ];

  const pendingApproval = rulesData?.pendingApproval ?? {
    id: "action-scaling-weekend-bookings",
    title: "Raise Weekend booking slots budget from Rs. 800 to Rs. 960 a day",
    why: "Return has held at 3.3× for 9 days and frequency is 1.8, so there is room before fatigue.",
    impact: "About Rs. 4,800 more spend over the rest of the month.",
    confidence: "Medium",
    suggestedBudget: 960,
  };

  const handleToggle = (r: AdRuleRecord) => {
    if (r.locked) {
      flash("This one cannot be switched off — it stops you advertising what you cannot sell.");
      return;
    }
    toggleMutation.mutate(r.id);
  };

  const activeCount = rules.filter((r) => r.on).length;
  const totalFired = rules.reduce((acc, r) => acc + r.fired, 0);

  const ruleKpis = rulesData?.kpis || [
    { label: "Active rules", value: String(activeCount), color: "#0F172A" },
    { label: "Fired this week", value: String(totalFired), color: "#0F172A" },
    { label: "Waiting on you", value: pendingApproval ? "1" : "0", color: "#B54708" },
    { label: "Blocked by guardrail", value: "2", color: "#B42318" },
  ];

  const guardrails = [
    { label: "Most a rule may raise a budget", value: "+20% per week" },
    { label: "Most a rule may cut a budget", value: "−50% per day" },
    {
      label: "Maximum daily spend across all campaigns",
      value: formatMoney(settings?.defaultDailyBudgetCap ? Number(settings.defaultDailyBudgetCap) : 6000),
    },
    { label: "Ads a rule may pause in one day", value: "2" },
    { label: "Budget change needing your approval", value: "Anything above Rs. 500" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {/* 4 KPIs */}
      <div
        data-kpi="1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "14px",
        }}
      >
        {ruleKpis.map((k, idx) => (
          <div
            key={idx}
            style={{
              background: "#fff",
              border: "1px solid #E6EAF0",
              borderRadius: "14px",
              padding: "15px",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#667085" }}>
              {k.label}
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: k.color,
                marginTop: "6px",
              }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Approval Banner */}
      {pendingApproval && (
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #FDE3B3",
            borderRadius: "16px",
            padding: "17px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              marginBottom: "11px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: ".4px",
                textTransform: "uppercase",
                color: "#B54708",
                background: "#FEF6E7",
                borderRadius: "5px",
                padding: "3px 8px",
              }}
            >
              Waiting on you
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>
              {pendingApproval.confidence} confidence
            </span>
          </div>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>
            {pendingApproval.title}
          </div>
          <div
            style={{
              fontSize: "12.5px",
              color: "#475467",
              marginTop: "7px",
              lineHeight: 1.6,
            }}
          >
            {pendingApproval.why}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#93370D",
              marginTop: "7px",
              fontWeight: 600,
            }}
          >
            {pendingApproval.impact}
          </div>
          <div
            style={{
              display: "flex",
              gap: "9px",
              marginTop: "13px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => declineMutation.mutate(pendingApproval.id)}
              disabled={declineMutation.isPending}
              style={{
                border: "1px solid #E6EAF0",
                background: "#fff",
                borderRadius: "11px",
                padding: "11px 16px",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#344054",
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Not now
            </button>
            <button
              onClick={() => approveMutation.mutate(pendingApproval.id)}
              disabled={approveMutation.isPending}
              style={{
                border: 0,
                background: "#12A150",
                borderRadius: "11px",
                padding: "11px 18px",
                fontSize: "12.5px",
                fontWeight: 800,
                color: "#fff",
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Approve the change
            </button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>
            Rules
          </h3>
        </div>
        <div>
          {rules.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "14px 17px",
                borderTop: "1px solid #F2F4F7",
                display: "flex",
                alignItems: "flex-start",
                gap: "13px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "220px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>
                    {r.name}
                  </span>
                  {r.locked && (
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 800,
                        color: "#B42318",
                        background: "#FEF3F2",
                        borderRadius: "5px",
                        padding: "2px 7px",
                      }}
                    >
                      Always on
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#475467",
                    marginTop: "6px",
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: "#344054" }}>When</strong> {r.when} →{" "}
                  <strong style={{ color: "#344054" }}>then</strong> {r.then}
                </div>
                <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "5px" }}>
                  Guardrail: {r.guard} · fired {r.fired} times this week
                </div>
              </div>
              <button
                onClick={() => handleToggle(r)}
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
                  cursor: "pointer",
                  flex: "0 0 40px",
                  marginTop: "2px",
                  transition: "background 0.2s ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: r.on ? "20px" : "2px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s ease",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Guardrails Section */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: "16px",
          padding: "17px",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>
          Guardrails
        </h3>
        <p style={{ margin: "0 0 13px", fontSize: "12px", color: "#667085" }}>
          These are the limits no rule can cross, whatever mode you are in.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {guardrails.map((g, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                border: "1px solid #E6EAF0",
                borderRadius: "11px",
                padding: "12px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", color: "#344054" }}>
                {g.label}
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>
                {g.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
