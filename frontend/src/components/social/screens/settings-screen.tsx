"use client";

import React from "react";
import { useSocial } from "../social-context";

export function SettingsScreen() {
  const { isOwner, goToScreen } = useSocial();

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

  // What's actually real, not a list of hoped-for capabilities. A previous version of this screen
  // claimed Adobe Firefly and Canva were "Connected" — neither is integrated anywhere in this app.
  const safetyRules = [
    "Nothing publishes to a platform without a person creating or approving it first.",
    "A comment reply is drafted by AI, but only a person sends it.",
    "Noxtill never guesses a name, email, phone or address for a lead.",
  ];

  const providers = [
    { n: "AI caption & hashtag drafting", task: "Via the same assistant used elsewhere in Noxtill", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
    { n: "AI image generation", task: "Media Library \u2192 Generate", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
    { n: "Auto-scheduling / auto-publishing", task: "Choosing post times or publishing without review", st: "Not available", bg: "#F2F4F7", fg: "#475467" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* What's real vs not — the "Autopilot" mode selector and the eight automation toggles a
          previous version of this screen showed here (content ideas, auto-scheduling,
          auto-publishing, and so on) were never wired to anything: the toggle wrote a timestamp to
          a database column nothing on the backend ever reads, and every mode selected did the
          exact same nothing. Removed rather than fixed to look more convincing. */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Automation</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "#667085", lineHeight: 1.6 }}>
          Not available yet. Content ideas, auto-scheduling and auto-publishing all need a real
          suggestion/scheduling engine this app doesn&apos;t have — so nothing here claims to do that.
          What is real: AI can draft a caption, hashtags or a comment reply for you (see AI Content
          Studio and the Inbox) — a person always reviews and sends it.
        </p>
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
      </div>
    </div>
  );
}
