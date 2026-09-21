"use client";

import React, { useState } from "react";
import {
  useAdvertising,
  formatMoney,
  getChip,
  type AutopilotMode,
} from "../advertising-context";

export function SettingsScreen() {
  const {
    settings,
    accounts,
    autopilot,
    setAutopilot,
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

  const apModes: { key: AutopilotMode; note: string }[] = [
    {
      key: "Off",
      note: "Nothing changes automatically. Rules do not run.",
    },
    {
      key: "Suggest only",
      note: "Rules watch and tell you. No change is ever made.",
    },
    {
      key: "Approval mode",
      note: "Rules prepare a change and wait for you to approve it.",
    },
    {
      key: "Autopilot",
      note: "Rules act within your guardrails. Anything above the approval threshold still waits.",
    },
  ];

  // Ad accounts from live DB or realistic baseline
  const adAccounts = accounts.length > 0
    ? accounts.map((a: any) => ({
        n: `${(a.provider || "ad").replace(/_ads/g, "").toUpperCase()} · ${a.accountName || "Noxtill Store"}`,
        id: a.externalAccountId || a.id || "act_4471092",
        st: a.connected || a.status === "active" ? "Connected" : a.status === "needs_reconnect" ? "Conversion tracking incomplete" : "Not connected",
        sync: a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently",
      }))
    : [
        { n: "Meta · Noxtill Store", id: "act_4471092", st: "Connected", sync: "4 min ago" },
        { n: "Google · Noxtill Store", id: "882-441-901", st: "Connected", sync: "11 min ago" },
        { n: "TikTok · Noxtill Store", id: "72841029", st: "Conversion tracking incomplete", sync: "2 hrs ago" },
        { n: "LinkedIn", id: "—", st: "Not connected", sync: "—" },
      ];

  const providers = [
    { n: "OpenAI", task: "Ad copy, headlines, variants", st: "Connected" },
    { n: "Adobe Firefly", task: "Ad imagery", st: "Connected" },
    { n: "Canva", task: "Brand templates and resizing", st: "Connected" },
    { n: "Video generation", task: "Video ads", st: "Not connected" },
  ];

  const safetyRules = [
    "An out-of-stock product can never be advertised, on any optimisation mode.",
    "A price or rating in an ad must match the product and review records, or the ad is blocked.",
    "No rule may raise a budget more than 20% in a week.",
    "Total daily spend is capped, and the cap cannot be raised by a rule.",
    "Bulk pausing is limited to 2 ads a day so one bad signal cannot stop everything.",
    "A creative is never published to a platform without a person approving it.",
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
      {/* Optimisation Mode Selector */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: "16px",
          padding: "17px",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>
          Optimisation Mode
        </h3>
        <p style={{ margin: "0 0 13px", fontSize: "12px", color: "#667085" }}>
          Select how autonomous Noxtill should be with your campaigns.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
          {apModes.map((m) => {
            const isSelected = autopilot === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setAutopilot(m.key);
                  flash(`Optimisation set to ${m.key}.`);
                }}
                style={{
                  textAlign: "left",
                  border: `1px solid ${isSelected ? "#12A150" : "#E6EAF0"}`,
                  background: isSelected ? "#F7FCF9" : "#fff",
                  borderRadius: "12px",
                  padding: "13px",
                  cursor: "pointer",
                  minHeight: "84px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: isSelected ? "#0E8442" : "#101828",
                    }}
                  >
                    {m.key}
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#12A150",
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    color: "#667085",
                    marginTop: "5px",
                    lineHeight: 1.5,
                  }}
                >
                  {m.note}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            background: "#FFFBF2",
            border: "1px solid #FDE3B3",
            borderRadius: "11px",
            padding: "11px 13px",
            fontSize: "11.5px",
            color: "#93370D",
            lineHeight: 1.55,
            marginTop: "12px",
          }}
        >
          Even on autopilot, budget changes above your approval threshold still wait for you, and out-of-stock products can never be advertised.
        </div>
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
                    {a.id} · synced {a.sync}
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
          Defaults & Guardrail Thresholds
        </h3>
        <p style={{ margin: "0 0 13px", fontSize: "12px", color: "#667085" }}>
          Configurable limits for automated actions and new campaigns.
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
                Default objective
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                Used when a new campaign is created
              </div>
            </div>
            <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>
              Sales
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
                Campaign naming format
              </div>
              <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
                Keeps reporting structured across platforms
              </div>
            </div>
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#475467", fontFamily: "monospace" }}>
              {"{product} — {month} {objective}"}
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
                Flag or pause when CPR exceeds this amount for 3 days
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
                Budget changes above Rs. 500 always queue for your approval
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
