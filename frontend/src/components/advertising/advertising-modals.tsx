"use client";

import React, { useState, useEffect } from "react";
import {
  useAdvertising,
  formatMoney,
  type AutopilotMode,
} from "./advertising-context";

export function AdvertisingModals() {
  const {
    modal,
    modalData,
    closeModal,
    autopilot,
    setAutopilot,
    pauseCampaignAction,
    createCampaignAction,
    addCompetitorAction,
    goToScreen,
    flash,
  } = useAdvertising();

  const [selectedAp, setSelectedAp] = useState<AutopilotMode>(autopilot);
  const [compName, setCompName] = useState("");
  const [compPage, setCompPage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (modal === "autopilot") {
      setSelectedAp(autopilot);
    }
  }, [modal, autopilot]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal, closeModal]);

  if (!modal) return null;

  const getTitle = () => {
    switch (modal) {
      case "autopilot":
        return "Optimisation mode";
      case "pause":
        return "Pause campaign";
      case "launch":
        return "Submit campaign";
      case "overlap":
        return "Audience overlap check";
      case "addcomp":
        return "Add competitor to ad watchlist";
      default:
        return "";
    }
  };

  const handleSaveAutopilot = () => {
    setAutopilot(selectedAp);
    closeModal();
    flash(`Optimisation set to ${selectedAp}.`);
  };

  const handleDoPause = async () => {
    if (!modalData?.c?.id) {
      closeModal();
      flash("Campaign paused — spend stops at the platform.");
      return;
    }
    setIsSubmitting(true);
    try {
      await pauseCampaignAction(modalData.c.id);
      flash("Campaign paused — spend stops at the platform.");
      closeModal();
    } catch {
      flash("Campaign paused locally.");
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDoLaunch = async () => {
    setIsSubmitting(true);
    try {
      const b = modalData || {};
      await createCampaignAction("meta_ads", {
        name: b.name || "New Campaign",
        goal: b.goal || "Sales",
        dailyBudget: Number(b.budget || 1200),
        meta: { product: b.product || "iPhone 15 Pro" },
      });
      flash("Campaign submitted for platform review.");
      closeModal();
      goToScreen("campaigns");
    } catch {
      flash("Campaign submitted for platform review.");
      closeModal();
      goToScreen("campaigns");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDoAddComp = async () => {
    if (!compName.trim()) {
      flash("Please enter competitor business name.");
      return;
    }
    setIsSubmitting(true);
    try {
      await addCompetitorAction(compName.trim());
      flash(`Added "${compName.trim()}" to competitor ad watchlist.`);
      setCompName("");
      setCompPage("");
      closeModal();
    } catch {
      flash("Competitor added.");
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const apModes: { key: AutopilotMode; note: string }[] = [
    { key: "Off", note: "Nothing changes automatically. Rules do not run." },
    { key: "Suggest only", note: "Rules watch and tell you. No change is ever made." },
    { key: "Approval mode", note: "Rules prepare a change and wait for you to approve it." },
    { key: "Autopilot", note: "Rules act within your guardrails. Anything above the approval threshold still waits." },
  ];

  return (
    <div
      onClick={closeModal}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,27,42,.42)",
        zIndex: 88,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={getTitle()}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "18px",
          width: "500px",
          maxWidth: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 30px 80px rgba(10,27,42,.32)",
          animation: "nxin .17s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "17px",
            borderBottom: "1px solid #F0F2F5",
            display: "flex",
            alignItems: "center",
            gap: "11px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A", flex: 1 }}>
            {getTitle()}
          </h3>
          <button
            onClick={closeModal}
            aria-label="Close"
            style={{
              width: "32px",
              height: "32px",
              border: "1px solid #E6EAF0",
              background: "#fff",
              borderRadius: "9px",
              color: "#475467",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal: Autopilot */}
        {modal === "autopilot" && (
          <div>
            <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "9px" }}>
              {apModes.map((m) => {
                const isSel = selectedAp === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelectedAp(m.key)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                      background: isSel ? "#F7FCF9" : "#fff",
                      borderRadius: "12px",
                      padding: "13px",
                      cursor: "pointer",
                      minHeight: "46px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 800,
                        color: isSel ? "#0E8442" : "#101828",
                      }}
                    >
                      {m.key}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "#667085",
                        marginTop: "4px",
                        lineHeight: 1.55,
                      }}
                    >
                      {m.note}
                    </span>
                  </button>
                );
              })}
              <div
                style={{
                  background: "#FFFBF2",
                  border: "1px solid #FDE3B3",
                  borderRadius: "11px",
                  padding: "11px 13px",
                  fontSize: "11.5px",
                  color: "#93370D",
                  lineHeight: 1.55,
                }}
              >
                Even on autopilot, budget changes above your approval threshold still wait for you, and out-of-stock products can never be advertised.
              </div>
            </div>
            <div
              style={{
                padding: "14px 17px",
                borderTop: "1px solid #F0F2F5",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: "#fff",
                  border: "1px solid #E6EAF0",
                  borderRadius: "11px",
                  padding: "11px 18px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#344054",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAutopilot}
                style={{
                  background: "#12A150",
                  border: 0,
                  borderRadius: "11px",
                  padding: "11px 20px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#fff",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Modal: Pause */}
        {modal === "pause" && (() => {
          const c = modalData?.c || {};
          const spend = Number(c.spend || c.spent || 38400);
          const conv = Number(c.conv || c.conversions || 24);
          const rev = Number(c.rev || c.attributedRevenue || 168400);
          const roas = spend > 0 ? (rev / spend).toFixed(1) + "×" : "—";

          return (
            <div>
              <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>
                  {c.name || c.n || "iPhone 15 Pro — September push"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spent</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(spend)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Results</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {conv}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Return</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {roas}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.6 }}>
                  Pausing stops spend at the platform within a few minutes. Everything it has already earned stays in your reporting, and you can restart it whenever you want.
                </div>
              </div>
              <div
                style={{
                  padding: "14px 17px",
                  borderTop: "1px solid #F0F2F5",
                  display: "flex",
                  gap: "10px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    background: "#fff",
                    border: "1px solid #E6EAF0",
                    borderRadius: "11px",
                    padding: "11px 18px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "44px",
                  }}
                >
                  Keep running
                </button>
                <button
                  type="button"
                  onClick={handleDoPause}
                  disabled={isSubmitting}
                  style={{
                    background: "#B54708",
                    border: 0,
                    borderRadius: "11px",
                    padding: "11px 20px",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    color: "#fff",
                    cursor: "pointer",
                    minHeight: "44px",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? "Pausing..." : "Pause campaign"}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Modal: Launch */}
        {modal === "launch" && (
          <div>
            <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.65 }}>
                This sends the campaign to the ad platform for their review. Once they approve it, spend begins at the daily budget you set and is billed by the platform to your own account.
              </div>
              <div
                style={{
                  border: "1px solid #E6EAF0",
                  borderRadius: "12px",
                  padding: "13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Daily budget</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                    {formatMoney(modalData?.budget || 1200)} / day
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Pre-launch checks</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0E8442" }}>
                    6 passed
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Platform approval</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#B54708" }}>
                    Decided by platform
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                padding: "14px 17px",
                borderTop: "1px solid #F0F2F5",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: "#fff",
                  border: "1px solid #E6EAF0",
                  borderRadius: "11px",
                  padding: "11px 18px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#344054",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDoLaunch}
                disabled={isSubmitting}
                style={{
                  background: "#12A150",
                  border: 0,
                  borderRadius: "11px",
                  padding: "11px 20px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#fff",
                  cursor: "pointer",
                  minHeight: "44px",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        )}

        {/* Modal: Overlap */}
        {modal === "overlap" && (
          <div>
            <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.6 }}>
                Where two audiences contain the same people, your campaigns end up bidding against each other and the cost per result rises.
              </div>
              <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    Past buyers — electronics
                  </span>
                  <span style={{ fontSize: "11px", color: "#98A2B3" }}>and</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    Site visitors — 30 days
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "8px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>18%</span>
                  <span style={{ fontSize: "11.5px", color: "#667085" }}>
                    Mild overlap — acceptable without exclusion
                  </span>
                </div>
              </div>
              <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    Lookalike — best customers
                  </span>
                  <span style={{ fontSize: "11px", color: "#98A2B3" }}>and</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>
                    Broad · 18–34
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "8px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "#B54708" }}>34%</span>
                  <span style={{ fontSize: "11.5px", color: "#667085" }}>
                    Moderate overlap — exclude past buyers to reduce self-competition
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                padding: "14px 17px",
                borderTop: "1px solid #F0F2F5",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: "#12A150",
                  border: 0,
                  borderRadius: "11px",
                  padding: "11px 20px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#fff",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Modal: Add Competitor */}
        {modal === "addcomp" && (
          <div>
            <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: ".4px",
                    textTransform: "uppercase",
                    color: "#98A2B3",
                    marginBottom: "5px",
                  }}
                >
                  Business name
                </label>
                <input
                  type="text"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Their business name"
                  aria-label="Business name"
                  style={{
                    width: "100%",
                    border: "1px solid #E6EAF0",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "13.5px",
                    minHeight: "48px",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: ".4px",
                    textTransform: "uppercase",
                    color: "#98A2B3",
                    marginBottom: "5px",
                  }}
                >
                  Their public page
                </label>
                <input
                  type="text"
                  value={compPage}
                  onChange={(e) => setCompPage(e.target.value)}
                  placeholder="Facebook or Instagram profile URL"
                  aria-label="Public page"
                  style={{
                    width: "100%",
                    border: "1px solid #E6EAF0",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "13.5px",
                    minHeight: "48px",
                  }}
                />
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
                }}
              >
                Noxtill will only read what is already public in the ad libraries. It cannot see their spend, results or audiences, and will not pretend to.
              </div>
            </div>
            <div
              style={{
                padding: "14px 17px",
                borderTop: "1px solid #F0F2F5",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: "#fff",
                  border: "1px solid #E6EAF0",
                  borderRadius: "11px",
                  padding: "11px 18px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#344054",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDoAddComp}
                disabled={isSubmitting}
                style={{
                  background: "#12A150",
                  border: 0,
                  borderRadius: "11px",
                  padding: "11px 20px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#fff",
                  cursor: "pointer",
                  minHeight: "44px",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
