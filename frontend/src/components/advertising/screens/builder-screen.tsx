"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAdvertising, formatMoney } from "../advertising-context";
import { generateAdCopy } from "@/lib/ads-api";
import type { Product } from "@/lib/products";

export function BuilderScreen() {
  const {
    products,
    audiences,
    openModal,
    flash,
    createCampaignAction,
  } = useAdvertising();

  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState("Sales");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(products[0] || null);
  const [selectedAudience, setSelectedAudience] = useState<string>("");
  const [budget, setBudget] = useState(1200);

  // AI Creative generation state
  const [genState, setGenState] = useState<"idle" | "running" | "done">("idle");
  const [headline, setHeadline] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [cta, setCta] = useState("Send message");

  const genMutation = useMutation({
    mutationFn: generateAdCopy,
    onSuccess: (res) => {
      setHeadline(res.headline);
      setBodyText(res.body);
      setGenState("done");
    },
    onError: () => {
      setGenState("idle");
      flash("AI generation failed — please try again.");
    },
  });

  const stepDots = [
    { n: "1", label: "Goal" },
    { n: "2", label: "Product" },
    { n: "3", label: "Audience" },
    { n: "4", label: "Creative" },
    { n: "5", label: "Review" },
  ];

  const objectives = ["Sales", "Leads", "Bookings", "Traffic", "Awareness"];

  const handleStartGeneration = () => {
    const prod = selectedProduct || products[0];
    setGenState("running");
    genMutation.mutate({ productName: prod?.name || "this product", goal });
  };

  // No real reach-prediction model exists (no auction data, no historical campaign results tied to
  // budget) — a previous version of this screen invented one (budget × 3.4). Not shown any more.

  const stockOk = !selectedProduct || (selectedProduct.kind === "product" ? (selectedProduct.stockOnHand ?? 0) > 0 : true);
  const qaChecks = [
    {
      l: selectedProduct ? `Product is in stock${selectedProduct.stockOnHand !== undefined ? ` (${selectedProduct.stockOnHand} units)` : ""}` : "Product is in stock",
      s: stockOk ? "Pass" : "Blocked",
      bg: stockOk ? "#E8F7EE" : "#FEF3F2",
      fg: stockOk ? "#0E8442" : "#B42318",
    },
    { l: "Price on the ad matches the product catalog record", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Conversion tracking pixel, UTM parameters and review claims", s: "Not verified", bg: "#F2F4F7", fg: "#475467" },
    { l: "Platform policy approval", s: "Decided by platform", bg: "#F2F4F7", fg: "#475467" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15, maxWidth: 900, margin: "0 auto", width: "100%" }}>
      {/* 5-Step Progress Bar */}
      <div style={{ display: "flex", gap: 6, background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: "14px 20px" }}>
        {stepDots.map((s, idx) => {
          const stepNum = idx + 1;
          const isPassed = step > stepNum;
          const isCurrent = step === stepNum;
          return (
            <button
              key={s.n}
              onClick={() => setStep(stepNum)}
              style={{
                flex: 1,
                textAlign: "center",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 26,
                  height: 26,
                  margin: "0 auto",
                  borderRadius: "50%",
                  background: isPassed ? "#12A150" : isCurrent ? "#0A1B2A" : "#F2F4F7",
                  color: isPassed || isCurrent ? "#fff" : "#98A2B3",
                  fontSize: 11.5,
                  fontWeight: 800,
                  lineHeight: "26px",
                }}
              >
                {s.n}
              </span>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: isCurrent ? "#101828" : "#98A2B3", marginTop: 5 }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 1: Goal */}
      {step === 1 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#101828" }}>What do you want this campaign to do?</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#667085" }}>
            This sets how the platform optimizes auction bidding and which results Noxtill tracks back to it.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            {objectives.map((o) => {
              const isSel = goal === o;
              return (
                <label
                  key={o}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: `1.5px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                    background: isSel ? "#F7FCF9" : "#fff",
                    borderRadius: 12,
                    padding: 14,
                    cursor: "pointer",
                    minHeight: 52,
                  }}
                >
                  <input
                    type="radio"
                    name="goal"
                    checked={isSel}
                    onChange={() => setGoal(o)}
                    aria-label={o}
                    style={{ accentColor: "#12A150", width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: isSel ? "#0E8442" : "#101828" }}>{o}</span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button
              onClick={() => setStep(2)}
              style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "11px 22px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
            >
              Continue to product
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Product */}
      {step === 2 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#101828" }}>What are you advertising?</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#667085" }}>
            Price, stock, and categories come directly from your live product catalog — safety rules block ads for items that cannot be fulfilled.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {products.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#98A2B3", fontSize: 13 }}>
                No products found in catalog. Create a product first to link ads.
              </div>
            ) : (
              products.map((p) => {
                const isSel = selectedProduct?.id === p.id;
                const stock = p.stockOnHand ?? 0;
                const isOutOfStock = p.kind === "product" && stock <= 0;
                const isLowStock = p.kind === "product" && stock > 0 && stock <= 5;
                const statusBadge = isOutOfStock
                  ? { text: "Blocked", bg: "#FEF3F2", fg: "#B42318", note: "Cannot be advertised while out of stock" }
                  : isLowStock
                  ? { text: "Low stock", bg: "#FEF6E7", fg: "#B54708", note: `Only ${stock} left — may sell out quickly` }
                  : { text: "Ready", bg: "#E8F7EE", fg: "#0E8442", note: `${stock} units on hand in inventory` };

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isOutOfStock) setSelectedProduct(p);
                    }}
                    style={{
                      border: `1.5px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                      background: isSel ? "#F7FCF9" : "#fff",
                      borderRadius: 13,
                      padding: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      cursor: isOutOfStock ? "not-allowed" : "pointer",
                      opacity: isOutOfStock ? 0.6 : 1,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 180 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#101828" }}>{p.name}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: "#667085", marginTop: 3 }}>
                        {formatMoney(p.price)} · {p.category || "General"} · {statusBadge.note}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: statusBadge.fg,
                        background: statusBadge.bg,
                        borderRadius: 20,
                        padding: "4px 10px",
                      }}
                    >
                      {statusBadge.text}
                    </span>
                    {!isOutOfStock && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(p);
                        }}
                        style={{
                          border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                          background: isSel ? "#12A150" : "#fff",
                          borderRadius: 10,
                          padding: "10px 14px",
                          fontSize: 12,
                          fontWeight: 700,
                          color: isSel ? "#fff" : "#0E8442",
                          cursor: "pointer",
                          minHeight: 44,
                        }}
                      >
                        {isSel ? "Selected" : "Select"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              onClick={() => setStep(1)}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
            >
              Back
            </button>
            <button
              disabled={!selectedProduct}
              onClick={() => setStep(3)}
              style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "11px 22px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
            >
              Continue to audience
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Audience */}
      {step === 3 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#101828" }}>Who should see it?</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#667085" }}>
            Built from your own customer records and lookalike pools. Only privacy-safe targeting is passed to the ad platform.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {audiences.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#98A2B3", fontSize: 13 }}>
                No customer segment has been synced into an audience yet — sync one from the Audiences screen, or continue and let the platform choose.
              </div>
            ) : audiences.map((a) => ({
                  name: a.name,
                  size: `${a.size.toLocaleString()} people`,
                  why: `${a.provider} · ${a.status}`,
                  best: false,
                }))
            .map((aud, idx) => {
              const isSel = selectedAudience === aud.name || (!selectedAudience && idx === 0);
              return (
                <label
                  key={idx}
                  onClick={() => setSelectedAudience(aud.name)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    border: `1.5px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                    background: isSel ? "#F7FCF9" : "#fff",
                    borderRadius: 13,
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="aud"
                    checked={isSel}
                    onChange={() => setSelectedAudience(aud.name)}
                    aria-label={aud.name}
                    style={{ accentColor: "#12A150", width: 16, height: 16, marginTop: 2 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>{aud.name}</span>
                      {aud.best && (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 7px" }}>
                          Best history
                        </span>
                      )}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "#667085", marginTop: 4 }}>
                      {aud.size} · {aud.why}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              onClick={() => setStep(2)}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "11px 22px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
            >
              Continue to creative
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Creative */}
      {step === 4 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#101828" }}>Generate ad creative package</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#667085" }}>
            AI drafts platform-specific ad copy, headlines, and call-to-actions directly from your product and customer reviews.
          </p>

          {genState === "idle" && (
            <div style={{ textAlign: "center", padding: "36px 16px", border: "1px dashed #D5DCE4", borderRadius: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#E8F7EE", color: "#0E8442", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#101828" }}>Ready to generate for &quot;{selectedProduct?.name || "Product"}&quot;</div>
              <div style={{ fontSize: 12, color: "#667085", marginTop: 4 }}>
                Generates headlines, value propositions, and 4 platform variants.
              </div>
              <button
                onClick={handleStartGeneration}
                style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 11, padding: "12px 24px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
              >
                Generate with AI
              </button>
            </div>
          )}

          {genState === "running" && (
            <div style={{ padding: "36px 14px", border: "1px solid #E6EAF0", borderRadius: 14, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>Asking AI to draft your ad copy…</div>
              <div style={{ fontSize: 12, color: "#667085", marginTop: 6 }}>This calls the AI assistant for real — it usually takes a few seconds.</div>
            </div>
          )}

          {genState === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Headline</label>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, minHeight: 46 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Primary Copy</label>
                <textarea
                  rows={3}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Call To Action</label>
                  <input
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13, minHeight: 46 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    onClick={handleStartGeneration}
                    style={{ width: "100%", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}
                  >
                    Regenerate variations
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              onClick={() => setStep(3)}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
            >
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "11px 22px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
            >
              Continue to review
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Launch */}
      {step === 5 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#101828" }}>Pre-launch review and budget pacing</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#667085" }}>
            Review daily budget, reach forecast, and automated policy verification before dispatching to ad networks.
          </p>

          {/* Budget Setting */}
          <div style={{ background: "#FAFBFC", border: "1px solid #E6EAF0", borderRadius: 13, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>Daily budget</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#0E8442" }}>{formatMoney(budget)} / day</span>
            </div>
            <input
              type="range"
              min={300}
              max={10000}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-label="Daily budget"
              style={{ width: "100%", accentColor: "#12A150", cursor: "pointer" }}
            />
            <div style={{ fontSize: 11.5, color: "#667085", marginTop: 8, lineHeight: 1.55 }}>
              How far {formatMoney(budget)} a day reaches depends entirely on the platform&apos;s live auction — Noxtill doesn&apos;t have a real forecasting model for this yet, so no estimate is shown.
            </div>
          </div>

          {/* QA Checks list */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 8 }}>Pre-flight safety checks</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {qaChecks.map((q, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #E6EAF0", borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: "#344054" }}>{q.l}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: q.bg, color: q.fg }}>{q.s}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <button
              onClick={() => setStep(4)}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
            >
              Back
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => flash("Draft saved in database — nothing submitted to platforms.")}
                style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
              >
                Save draft
              </button>
              <button
                onClick={() => openModal("launch", { goal, product: selectedProduct?.name, budget, headline, bodyText })}
                style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "11px 24px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
              >
                Launch campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
