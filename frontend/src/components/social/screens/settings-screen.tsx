"use client";

import React from "react";
import { useSocial } from "../social-context";

export function SettingsScreen() {
  const {
    isOwner,
    autopilot,
    setAutopilot,
    apColors,
    autoSettings,
    toggleAutoSetting,
    goToScreen,
    flash,
  } = useSocial();

  if (!isOwner) {
    return (
      <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#FEF6E7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>Social settings are restricted</div>
        <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5, maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>
          Social automation policies, safety rules, and connection configurations are restricted to the business owner and managers.
        </div>
      </div>
    );
  }

  const apModes = [
    { k: "Off", note: "Nothing automated — you create and publish everything" },
    { k: "Assisted", note: "AI suggests, you do the rest" },
    { k: "Approval mode", note: "AI creates and schedules, you approve before publishing" },
    { k: "Autopilot", note: "AI publishes low-risk content within your rules" },
  ];

  const safetyRules = [
    "Never publish a product that is out of stock",
    "Never publish an expired offer",
    "Never publish a price that does not match Products",
    "Never auto-reply to a complaint or refund request",
    "Never auto-reply below high confidence",
    "Never guess a name, email, phone or address",
    "Never merge a customer record automatically",
  ];

  const providers = [
    { n: "Anthropic Claude", task: "Caption, hook, variants", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
    { n: "Adobe Firefly", task: "Image generation", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
    { n: "Canva", task: "Brand templates", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
    { n: "OpenAI", task: "Fallback text", st: "Not connected", bg: "#F2F4F7", fg: "#475467" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Social Autopilot Selector */}
      <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0F172A" }}>Social autopilot</h3>
          <span style={{ fontSize: 11, fontWeight: 800, color: apColors.fg, background: apColors.bg, borderRadius: 20, padding: "4px 11px" }}>
            {autopilot}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {apModes.map((m) => {
            const isSel = autopilot === m.k;
            return (
              <button
                key={m.k}
                onClick={() => setAutopilot(m.k)}
                style={{
                  textAlign: "left",
                  border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                  background: isSel ? "#F7FCF9" : "#fff",
                  borderRadius: 12,
                  padding: 13,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: isSel ? "#0E8442" : "#475467" }}>{m.k}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#667085", marginTop: 4, lineHeight: 1.5 }}>{m.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Automation Settings Toggles */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Automation</h3>
        </div>
        <div style={{ padding: "6px 0" }}>
          {autoSettings.map((a, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 17px", borderBottom: "1px solid #F2F4F7", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{a.l}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 3 }}>{a.note}</span>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#475467" }}>{a.v}</span>
              <button
                type="button"
                role="switch"
                aria-label={`Toggle ${a.l}`}
                aria-checked={a.on}
                onClick={() => toggleAutoSetting(idx)}
                style={{
                  width: 40,
                  height: 22,
                  border: 0,
                  borderRadius: 20,
                  background: a.on ? "#12A150" : "#D5DCE4",
                  position: "relative",
                  cursor: "pointer",
                  minHeight: 44,
                  padding: "11px 0",
                  backgroundClip: "content-box",
                  flex: "0 0 40px",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "calc(50% - 9px)",
                    left: a.on ? undefined : 2,
                    right: a.on ? 2 : undefined,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Rules That Cannot Be Turned Off */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Rules that cannot be turned off</h3>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "3px 8px" }}>
            Fixed policy
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {safetyRules.map((r, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid #D5EFE0", background: "#F7FCF9", borderRadius: 11, padding: 11 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2.4" strokeLinecap="round" style={{ flex: "0 0 15px", marginTop: 2 }}>
                <path d="m5 13 4 4L19 7" />
              </svg>
              <span style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 12, lineHeight: 1.55 }}>
          These hold even on full autopilot. If a rule blocks something, it appears in the queue with the reason rather than being dropped.
        </div>
      </div>

      {/* AI Providers Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>AI providers</h3>
        </div>
        <div style={{ padding: "6px 0" }}>
          {providers.map((pv, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 17px", borderBottom: "1px solid #F2F4F7", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{pv.n}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 3 }}>{pv.task}</span>
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: pv.bg, color: pv.fg, whiteSpace: "nowrap" }}>
                {pv.st}
              </span>
            </div>
          ))}
          <div style={{ padding: "12px 17px", fontSize: 11.5, color: "#98A2B3", lineHeight: 1.55 }}>
            If the primary image provider fails, you are told and offered a fallback — providers are never switched silently, because cost and quality differ.
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button
          onClick={() => goToScreen("accounts")}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}
        >
          Manage accounts
        </button>
        <button
          onClick={() => flash("Social settings saved.")}
          style={{ marginLeft: "auto", border: 0, background: "#12A150", borderRadius: 11, padding: "12px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
        >
          Save settings
        </button>
      </div>
    </div>
  );
}
