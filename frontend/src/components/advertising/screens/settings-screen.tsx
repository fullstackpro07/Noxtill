"use client";

import React, { useState } from "react";
import { useAdvertising, getChip } from "../advertising-context";

export function SettingsScreen() {
  const {
    settings,
    accounts,
    goToScreen,
    updateSettingsAction,
    flash,
  } = useAdvertising();

  const [saving, setSaving] = useState(false);
  const [dailyBudgetCap, setDailyBudgetCap] = useState<number>(
    settings?.defaultDailyBudgetCap ? Number(settings.defaultDailyBudgetCap) : 800
  );
  const [autoPauseThreshold, setAutoPauseThreshold] = useState<number>(
    settings?.autoPauseCostPerResult ? Number(settings.autoPauseCostPerResult) : 3000
  );
  const [requireApproval, setRequireApproval] = useState<boolean>(
    settings?.requireApproval ?? true
  );

  // Real connected accounts only — an account that isn't connected simply isn't listed as one.
  const adAccounts = accounts
    .filter((a) => a.connected)
    .map((a) => ({
      n: a.provider.replace(/_ads/g, "").toUpperCase(),
      st: a.error ? "Needs reconnect" : "Connected",
      detail: a.error || "Connected",
    }));

  // The only real AI capability this module has is ad-copy generation, via the same assistant
  // used elsewhere in Noxtill (Claude, through AiInfraService) — not OpenAI, Adobe Firefly or
  // Canva, none of which are integrated here. A previous version of this screen listed all three
  // as "Connected".
  const providers = [
    { n: "AI ad copy", task: "Headlines and body copy in the Ad Builder", st: "Connected" },
    { n: "Ad imagery", task: "Generating creative images", st: "Not connected" },
    { n: "Video generation", task: "Video ads", st: "Not connected" },
  ];

  // What's actually enforced today — a previous version of this list included limits (a 20%
  // weekly-change cap, a hard daily-spend cap, a 2-ads-a-day pause limit, out-of-stock blocking on
  // every mode) that don't exist anywhere in the backend. Only what's real is listed here.
  const safetyRules = [
    "A new campaign is always created paused — it never starts spending on its own.",
    "When \u201cApproval required\u201d is on below, only the owner can move a campaign to active.",
    "Pausing or resuming applies at the real ad platform, not just in Noxtill's own records.",
    "The Ad Builder wizard won't let you pick an out-of-stock product to advertise.",
    "Noxtill never holds or charges your ad budget — each platform bills you directly.",
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettingsAction({
        defaultDailyBudgetCap: dailyBudgetCap,
        autoPauseCostPerResult: autoPauseThreshold,
        requireApproval,
      });
      flash("Advertising settings saved successfully.");
    } catch {
      flash("Advertising settings updated locally.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {/* Automation — the one real rule lives on its own screen */}
      <div
        style={{
          background: "#F7FCF9",
          border: "1px solid #D5EFE0",
          borderRadius: "16px",
          padding: "17px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Automation</h3>
          <p style={{ margin: 0, fontSize: "12px", color: "#667085" }}>
            The auto-pause rule and its threshold live on the Rules screen, with a real count of how often it has actually fired.
          </p>
        </div>
        <button
          type="button"
          onClick={() => goToScreen("rules")}
          style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "42px" }}
        >
          Open Rules
        </button>
      </div>

      {/* Ad accounts */}
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
            Ad accounts
          </h3>
        </div>
        <div>
          {adAccounts.length === 0 && (
            <div style={{ padding: "24px 17px", textAlign: "center", color: "#98A2B3", fontSize: "12.5px" }}>
              No ad account is connected yet.
            </div>
          )}
          {adAccounts.map((a, idx) => {
            const chip = getChip(a.st);
            return (
              <div
                key={idx}
                style={{
                  padding: "13px 17px",
                  borderTop: idx > 0 ? "1px solid #F2F4F7" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    {a.n}
                  </span>
                  <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                    {a.detail}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: chip.bg,
                    color: chip.fg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.st}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Creative providers */}
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
            Creative providers
          </h3>
        </div>
        <div>
          {providers.map((p, idx) => {
            const chip = getChip(p.st);
            return (
              <div
                key={idx}
                style={{
                  padding: "13px 17px",
                  borderTop: idx > 0 ? "1px solid #F2F4F7" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    {p.n}
                  </span>
                  <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                    {p.task}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: chip.bg,
                    color: chip.fg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.st}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Defaults & Thresholds */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: "16px",
          padding: "17px",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>
          Defaults & thresholds
        </h3>
        <p style={{ margin: "0 0 13px", fontSize: "12px", color: "#667085" }}>
          These are the only campaign-level defaults Noxtill actually applies.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "12px",
              borderBottom: "1px solid #F2F4F7",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                Default daily budget
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                Starting point for campaign builder
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#667085" }}>Rs.</span>
              <input
                type="number"
                value={dailyBudgetCap}
                onChange={(e) => setDailyBudgetCap(Number(e.target.value) || 0)}
                aria-label="Default daily budget"
                style={{
                  width: "100px",
                  border: "1px solid #E6EAF0",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#101828",
                  textAlign: "right",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "12px",
              borderBottom: "1px solid #F2F4F7",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                Auto-pause cost per result threshold
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                A campaign is paused the moment its own cost per result crosses this, checked hourly
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#667085" }}>Rs.</span>
              <input
                type="number"
                value={autoPauseThreshold}
                onChange={(e) => setAutoPauseThreshold(Number(e.target.value) || 0)}
                aria-label="Auto-pause CPR threshold"
                style={{
                  width: "100px",
                  border: "1px solid #E6EAF0",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#101828",
                  textAlign: "right",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "12px",
              borderBottom: "1px solid #F2F4F7",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                Approval required for budget scaling
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                Only the owner can move a campaign to active while this is on
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRequireApproval(!requireApproval)}
              role="switch"
              aria-checked={requireApproval}
              style={{
                width: "40px",
                height: "22px",
                border: 0,
                borderRadius: "20px",
                background: requireApproval ? "#12A150" : "#D5DCE4",
                position: "relative",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: requireApproval ? "20px" : "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s ease",
                }}
              />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                Attribution window & UTM tagging
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                7-day click, 1-day view · Automatic UTM parameters
              </div>
            </div>
            <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>
              Active
            </div>
          </div>
        </div>
      </div>

      {/* What Noxtill will never do with your ads */}
      <div
        style={{
          background: "#fff",
          border: "1.5px solid #BFE7CF",
          borderRadius: "16px",
          padding: "17px",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>
          What Noxtill will never do with your ads
        </h3>
        <p style={{ margin: "0 0 13px", fontSize: "12px", color: "#667085" }}>
          These are fixed. They cannot be switched off from any screen.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {safetyRules.map((r, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0E8442"
                strokeWidth="2.4"
                strokeLinecap="round"
                style={{ flex: "0 0 15px", marginTop: "2px" }}
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
              <span style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>
                {r}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Save Settings Button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            border: 0,
            background: "#12A150",
            borderRadius: "12px",
            padding: "12px 22px",
            fontSize: "13px",
            fontWeight: 800,
            color: "#fff",
            cursor: "pointer",
            minHeight: "46px",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}
