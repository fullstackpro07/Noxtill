"use client";

import React from "react";
import { useSocial } from "../social-context";

export function MediaScreen() {
  const { media, q, setQ, openDrawer, goToScreen, uploadMediaFile } = useSocial();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadMediaFile(file);
  };

  const query = (q || "").toLowerCase();
  const filtered = media.filter((m) => !query || m.n.toLowerCase().includes(query) || m.prod.toLowerCase().includes(query));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {/* Search Bar & Action */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <svg style={{ position: "absolute", left: 12, top: 12, color: "#98A2B3" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search assets…"
            aria-label="Search media"
            style={{ width: "100%", padding: "11px 12px 11px 36px", border: "1px solid #E6EAF0", borderRadius: 10, fontSize: 12.5, background: "#F9FAFB", minHeight: 44 }}
          />
        </span>
        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
          >
            Upload file
          </button>
          <button
            onClick={() => goToScreen("studio")}
            style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
          >
            Generate an asset
          </button>
        </div>
      </div>

      {/* Media Grid */}
      {filtered.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: "52px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No media assets found</div>
          <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Upload product images or generate creatives in the AI Studio.</div>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 16 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer" }}
            >
              Upload file
            </button>
            <button
              onClick={() => goToScreen("studio")}
              style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "10px 18px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer" }}
            >
              Generate AI asset
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          {filtered.map((m) => {
            const provBg = m.prov === "Upload" ? "#F2F4F7" : "#F7FCF9";
            const provFg = m.prov === "Upload" ? "#475467" : "#0E8442";
            const usedLabel = m.used ? `${m.used} posts` : "Not used yet";

            return (
              <button
                key={m.id}
                onClick={() => openDrawer("media", { m })}
                style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden", cursor: "pointer", minHeight: 44, padding: 0 }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 130, background: "linear-gradient(150deg,#EDF0F4,#DDE3EA)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="1.9" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="8.8" cy="9.5" r="1.6" />
                    <path d="m21 16-4.5-4.5L5 20" />
                  </svg>
                </span>
                <span style={{ display: "block", padding: 13 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.n}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: provFg, background: provBg, borderRadius: 5, padding: "2px 7px" }}>
                      {m.prov}
                    </span>
                    {m.ai && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 7px" }}>
                        AI
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 10.5, color: "#98A2B3" }}>{m.dim}</span>
                    <span style={{ fontSize: 10.5, color: "#98A2B3" }}>{usedLabel}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
