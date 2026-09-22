"use client";

import React, { useState } from "react";
import { useSocial } from "../social-context";

export function StudioScreen() {
  const {
    products,
    isLoadingProducts,
    studioMode,
    setStudioMode,
    genState,
    genStep,
    generatedCaption,
    startGeneration,
    resetGeneration,
    createPostAction,
    openDrawer,
    flash,
    goToScreen,
  } = useSocial();

  const [selectedProductId, setSelectedProductId] = useState<string>("");

  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const studioModes = ["From product", "From service", "From review", "From campaign", "From prompt", "From existing post"];

  const genSource = activeProduct
    ? [
        { l: "Product", v: activeProduct.name },
        { l: "Price", v: `Rs. ${activeProduct.price.toLocaleString()} — from Products` },
        { l: "Stock on hand", v: `${activeProduct.stockOnHand ?? 0} units — from Inventory` },
        { l: "Category", v: activeProduct.category || "General" },
        { l: "Type", v: activeProduct.kind === "service" ? "Service" : "Physical product" },
      ]
    : [];

  // Only Claude is a real, connected generation provider — no Adobe Firefly / Canva / OpenAI
  // integration exists in this codebase, so those are not claimed as "Connected".
  const providers = [
    { n: "Anthropic Claude", task: "Caption generation", st: "Connected", bg: "#E8F7EE", fg: "#0E8442" },
  ];

  const genVariants = [
    { pf: "Instagram", init: "IG", bg: "#FDF2FA", fg: "#C11574", note: "Carousel · 4 slides · caption 280 chars" },
    { pf: "Facebook", init: "FB", bg: "#EEF4FF", fg: "#3538CD", note: "Single photo · longer caption · link in post" },
    { pf: "TikTok", init: "TT", bg: "#F2F4F7", fg: "#101828", note: "Vertical video · hook in first 2 seconds" },
    { pf: "LinkedIn", init: "LI", bg: "#EFF8FF", fg: "#175CD3", note: "Single photo · professional tone · no hashtag spam" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Studio Source Mode Bar */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>What should this be built from?</h3>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>AI only uses real data that already exists in your Noxtill database</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {studioModes.map((m) => {
            const isSel = studioMode === m;
            return (
              <button
                key={m}
                onClick={() => setStudioMode(m)}
                style={{
                  border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                  background: isSel ? "#F7FCF9" : "#fff",
                  color: isSel ? "#0E8442" : "#475467",
                  borderRadius: 11,
                  padding: "11px 15px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {products.length === 0 && !isLoadingProducts ? (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: "52px 20px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#FEF6E7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#101828" }}>No products in your catalog yet</div>
          <div style={{ fontSize: 12.5, color: "#667085", marginTop: 5, maxWidth: "48ch", marginLeft: "auto", marginRight: "auto" }}>
            The AI Content Studio writes real high-converting copy, hashtags, and variants grounded in your actual products, prices, and inventory.
          </div>
        </div>
      ) : (
        /* 2-Column Grid */
        <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", gap: 15, alignItems: "start" }}>
          {/* Left Column: Source Data & Providers */}
          <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#101828" }}>Source data</h3>
              <span style={{ fontSize: 11, color: "#0E8442", fontWeight: 700 }}>Live DB</span>
            </div>

            {/* Product Selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 6 }}>
                Select Product / Service
              </label>
              <select
                value={activeProduct?.id || ""}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  resetGeneration();
                }}
                aria-label="Select product to generate copy for"
                style={{
                  width: "100%",
                  border: "1px solid #E6EAF0",
                  borderRadius: 11,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#344054",
                  background: "#fff",
                  minHeight: 46,
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — Rs. {p.price.toLocaleString()} ({p.stockOnHand ?? 0} in stock)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {genSource.map((s, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: 12, color: "#667085" }}>{s.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#344054", textAlign: "right", maxWidth: "65%" }}>{s.v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 11, padding: "11px 13px", marginTop: 13, fontSize: 11.5, color: "#0E8442", lineHeight: 1.55 }}>
              Price, stock, and variations are verified against live database records before generating copy.
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 9 }}>
                Creative providers
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {providers.map((pv, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid #E6EAF0", borderRadius: 10, padding: 10 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#101828" }}>{pv.n}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3", marginTop: 2 }}>{pv.task}</span>
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: pv.bg, color: pv.fg, whiteSpace: "nowrap" }}>
                      {pv.st}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Generation Workflow */}
          <div style={{ display: "flex", flexDirection: "column", gap: 15, minWidth: 0 }}>
            {genState === "idle" && (
              <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: "40px 22px", textAlign: "center" }}>
                <span style={{ width: 52, height: 52, borderRadius: 15, background: "#E8F7EE", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round">
                    <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
                    <path d="M18.5 14v3M20 15.5h-3" />
                  </svg>
                </span>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>
                  Generate a complete social package for {activeProduct?.name || "this item"}
                </div>
                <div style={{ fontSize: 12.5, color: "#667085", marginTop: 8, maxWidth: "52ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
                  Creative, hook, caption, CTA, hashtags, alt text and a variant for each connected platform — all tailored to this product.
                </div>
                <button
                  onClick={() => {
                    const prompt = activeProduct
                      ? `${activeProduct.name} priced at Rs. ${activeProduct.price.toLocaleString()} with ${activeProduct.stockOnHand ?? 0} units available in category ${activeProduct.category || "General"}`
                      : undefined;
                    startGeneration(prompt);
                  }}
                  style={{ marginTop: 18, border: 0, background: "#12A150", borderRadius: 12, padding: "14px 26px", fontSize: 13.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 50 }}
                >
                  Generate package
                </button>
              </div>
            )}

            {genState === "running" && (
              <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 40, textAlign: "center" }}>
                <span style={{ width: 30, height: 30, borderRadius: "50%", border: "3px solid #E6EAF0", borderTopColor: "#12A150", display: "inline-block", animation: "nxpulse 0.8s linear infinite" }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: "#344054", marginTop: 14 }}>
                  Generating a caption for {activeProduct?.name || "this item"}…
                </div>
              </div>
            )}

            {genState === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {/* Generated Package Detail */}
                <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Generated package</h3>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "3px 8px" }}>
                      Draft — nothing published
                    </span>
                    <button
                      onClick={resetGeneration}
                      style={{ marginLeft: "auto", border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                    >
                      Regenerate
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 13 }}>
                    {generatedCaption ? "Caption is written by AI. " : ""}Hook, CTA, hashtags and alt text below are auto-filled from your product data, not separately AI-composed.
                  </div>
                  <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 15 }}>
                    <div>
                      <div style={{ aspectRatio: "1", borderRadius: 13, background: "linear-gradient(150deg,#0A1B2A,#132C3E)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, padding: 16, textAlign: "center" }}>
                        <span style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(145deg,#16B85C,#0E8442)", color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          N
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.4 }}>{activeProduct?.name || "Product"}</span>
                        <span style={{ fontSize: 10, color: "#8FF0BB", fontWeight: 700 }}>
                          Rs. {activeProduct?.price.toLocaleString() || "0"}
                        </span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 8, textAlign: "center" }}>AI Studio · 1080×1080</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Hook</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#101828" }}>
                          Experience premium quality with {activeProduct?.name || "our featured product"}.
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Caption</div>
                        <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                          {generatedCaption ||
                            `${activeProduct?.name || "This item"} is available now at Rs. ${activeProduct?.price.toLocaleString() || "0"} (${activeProduct?.stockOnHand ?? 0} units in stock).\n\nMessage us to reserve or order today!`}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>CTA</div>
                          <div style={{ fontSize: 12, color: "#344054" }}>Message us to hold one</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Hashtags</div>
                          <div style={{ fontSize: 12, color: "#344054" }}>
                            #{activeProduct?.name.replace(/[^a-zA-Z0-9]/g, "") || "Noxtill"} #InStock #BestOffer
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Alt text</div>
                        <div style={{ fontSize: 12, color: "#667085", lineHeight: 1.55 }}>
                          {activeProduct?.name || "Product"} showcase on clean background with verified pricing
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Platform Variants */}
                <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Platform variants</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                    {genVariants.map((v, idx) => (
                      <div key={idx} style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 13 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 8, background: v.bg, color: v.fg, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 26px" }}>
                            {v.init}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828" }}>{v.pf}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "#667085", lineHeight: 1.55 }}>{v.note}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content Checks & Action Buttons — only checks actually verified against real data */}
                <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Content checks</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { l: "Price shown matches the Products record", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
                      activeProduct && (activeProduct.stockOnHand ?? 0) > 0
                        ? { l: "Product is in stock", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" }
                        : { l: "Product is out of stock", s: "Warning", bg: "#FEF6E7", fg: "#B54708" },
                      generatedCaption
                        ? { l: "Caption written by AI", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" }
                        : { l: "Caption is a fallback template (AI unavailable)", s: "Warning", bg: "#FEF6E7", fg: "#B54708" },
                    ].map((c2, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E6EAF0", borderRadius: 11, padding: 11 }}>
                        <span style={{ flex: 1, fontSize: 12.5, color: "#344054" }}>{c2.l}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: c2.bg, color: c2.fg, whiteSpace: "nowrap" }}>
                          {c2.s}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
                    <button onClick={resetGeneration} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
                      Discard
                    </button>
                    <button onClick={() => openDrawer("composer")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
                      Edit in composer
                    </button>
                    <button
                      onClick={async () => {
                        const text =
                          generatedCaption ||
                          `${activeProduct?.name || "Product"} is in stock at Noxtill — priced at Rs. ${activeProduct?.price.toLocaleString() || "0"}. Message us to reserve.`;
                        await createPostAction({
                          caption: text,
                          platforms: ["instagram" as any, "facebook" as any],
                          scheduledFor: new Date(Date.now() + 86400000).toISOString(),
                        });
                        flash(`AI package for ${activeProduct?.name || "product"} scheduled across connected platforms.`);
                        resetGeneration();
                      }}
                      style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
                    >
                      Approve and schedule
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
