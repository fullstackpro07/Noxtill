"use client";

import React, { useState, useMemo } from "react";
import { useSocial } from "./social-context";

export function SocialModals() {
  const { modal, modalData, closeModal, closeAll, flash, autopilot, setAutopilot, bulkApprove, disconnectAccount, addCompetitor, goToScreen } = useSocial();

  if (!modal) return null;

  const modalTitleMap: Record<string, string> = {
    autopilot: "Social autopilot",
    autoplan: "AI content plan",
    repurpose: "Repurpose for other platforms",
    bulkapprove: "Approve selected posts",
    failure: "Why this failed",
    capture: "Capture this as a lead",
    dupe: "Possible duplicate",
    disconnect: "Disconnect account",
    addcomp: "Add competitor",
  };

  const modalTitle = modalTitleMap[modal] || "";

  return (
    <div
      onClick={closeAll}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,27,42,.42)",
        zIndex: 88,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          width: 520,
          maxWidth: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 30px 80px rgba(10,27,42,.32)",
          animation: "nxin .17s ease",
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 11 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{modalTitle}</h3>
          <button
            onClick={closeAll}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              border: "1px solid #E6EAF0",
              background: "#fff",
              borderRadius: 9,
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

        {/* Modal Content */}
        {modal === "autopilot" && <AutopilotModalContent />}
        {modal === "autoplan" && <AutoplanModalContent />}
        {modal === "repurpose" && <RepurposeModalContent post={modalData?.p} />}
        {modal === "bulkapprove" && <BulkApproveModalContent />}
        {modal === "failure" && <FailureModalContent post={modalData?.p} />}
        {modal === "capture" && <CaptureModalContent comment={modalData?.c} />}
        {modal === "dupe" && <DupeModalContent lead={modalData?.l} />}
        {modal === "disconnect" && <DisconnectModalContent account={modalData?.a} />}
        {modal === "addcomp" && <AddCompModalContent />}
      </div>
    </div>
  );
}

function AutopilotModalContent() {
  const { autopilot, setAutopilot, closeModal, flash } = useSocial();
  const [selected, setSelected] = useState(autopilot);

  const apModes = [
    { k: "Off", note: "Nothing automated — you create and publish everything" },
    { k: "Assisted", note: "AI suggests, you do the rest" },
    { k: "Approval mode", note: "AI creates and schedules, you approve before publishing" },
    { k: "Autopilot", note: "AI publishes low-risk content within your rules" },
  ];

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 9 }}>
        {apModes.map((m) => {
          const isSel = selected === m.k;
          return (
            <button
              key={m.k}
              onClick={() => setSelected(m.k)}
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
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D", lineHeight: 1.55 }}>
          Even on autopilot, the fixed safety rules apply — out-of-stock products, expired offers, complaints and low-confidence content never go out unattended.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button
          onClick={() => {
            setAutopilot(selected);
            closeModal();
            flash(`Autopilot set to ${selected}.`);
          }}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Save mode
        </button>
      </div>
    </div>
  );
}

function AutoplanModalContent() {
  const { closeModal, flash, createPostAction, products } = useSocial();
  const [isDrafting, setIsDrafting] = useState(false);

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();

  const planRows = useMemo<{ d: string; t: string; pf: string; time: string; why: string }[]>(() => {
    if (products.length > 0) {
      return products.slice(0, 5).map((p, idx) => {
        const dNum = now.getDate() + idx;
        const dName = days[(now.getDay() + idx) % 7];
        const platforms = ["Instagram", "Facebook", "TikTok", "LinkedIn"];
        const pf = platforms[idx % platforms.length];
        const times = ["6:30 PM", "7:00 PM", "8:00 PM", "12:30 PM", "5:00 PM"];
        const time = times[idx % times.length];
        return {
          d: `${dName} ${dNum}`,
          t: `${p.name} — Rs. ${p.price.toLocaleString()}`,
          pf,
          time,
          why: p.stockOnHand !== undefined
            ? `Active inventory (${p.stockOnHand} units on hand) in category ${p.category || "General"}`
            : `Featured catalog spotlight for ${p.name}`,
        };
      });
    }
    return [
      { d: "Mon 8", t: "Store updates & new arrivals", pf: "Instagram", time: "6:30 PM", why: "Audience engagement slot" },
      { d: "Wed 10", t: "Customer spotlight & reviews", pf: "Facebook", time: "7:00 PM", why: "Community social proof" },
      { d: "Fri 12", t: "Weekend service hours", pf: "TikTok", time: "8:00 PM", why: "Weekend foot traffic promotion" },
    ];
  }, [products]);

  const handleDraftAll = async () => {
    setIsDrafting(true);
    for (const r of planRows) {
      await createPostAction({
        caption: `${r.t}\n\n${r.why}`,
        platforms: [r.pf.toLowerCase() as any],
      });
    }
    setIsDrafting(false);
    closeModal();
    flash(`${planRows.length} posts drafted and placed in the pipeline — waiting on your approval.`);
  };

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.6 }}>Five posts drafted from your products, reviews and booking availability. Nothing is scheduled until you approve.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {planRows.map((r, idx) => (
            <div key={idx} style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 8px" }}>{r.d}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828", flex: 1, minWidth: 0 }}>{r.t}</span>
                <span style={{ fontSize: 10.5, color: "#98A2B3", whiteSpace: "nowrap" }}>
                  {r.pf} · {r.time}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#667085", marginTop: 6, lineHeight: 1.5 }}>{r.why}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Discard plan
        </button>
        <button
          disabled={isDrafting}
          onClick={handleDraftAll}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: isDrafting ? "not-allowed" : "pointer", opacity: isDrafting ? 0.6 : 1, minHeight: 44 }}
        >
          {isDrafting ? "Drafting…" : "Draft all 5"}
        </button>
      </div>
    </div>
  );
}

function RepurposeModalContent({ post }: { post?: any }) {
  const { closeModal, flash, createPostAction } = useSocial();
  const [selectedPfs, setSelectedPfs] = useState<Record<string, boolean>>({
    Instagram: true,
    Facebook: true,
    TikTok: true,
    LinkedIn: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variants = [
    { pf: "Instagram", init: "IG", bg: "#FDF2FA", fg: "#C11574", note: "Carousel · 4 slides · caption 280 chars" },
    { pf: "Facebook", init: "FB", bg: "#EEF4FF", fg: "#3538CD", note: "Single photo · longer caption · link in post" },
    { pf: "TikTok", init: "TT", bg: "#F2F4F7", fg: "#101828", note: "Vertical video · hook in first 2 seconds" },
    { pf: "LinkedIn", init: "LI", bg: "#EFF8FF", fg: "#175CD3", note: "Single photo · professional tone · no hashtag spam" },
  ];

  const togglePlatform = (pf: string) => {
    setSelectedPfs((prev) => ({ ...prev, [pf]: !prev[pf] }));
  };

  const handleCreateVariants = async () => {
    const chosen = Object.keys(selectedPfs).filter((k) => selectedPfs[k]);
    if (chosen.length === 0) return;
    setIsSubmitting(true);
    for (const p of chosen) {
      await createPostAction({
        caption: `${post?.t || "Draft post"} (${p} variant)`,
        platforms: [p.toLowerCase() as any],
      });
    }
    setIsSubmitting(false);
    closeModal();
    flash(`${chosen.length} platform variants drafted from this post.`);
  };

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>{post?.t || "Post title"}</div>
        <div style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.6 }}>Each platform gets its own variant rather than the same caption pasted everywhere.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {variants.map((v, idx) => (
            <label key={idx} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, cursor: "pointer", minHeight: 46 }}>
              <input
                type="checkbox"
                checked={!!selectedPfs[v.pf]}
                onChange={() => togglePlatform(v.pf)}
                aria-label={v.pf}
                style={{ width: 16, height: 16, accentColor: "#12A150" }}
              />
              <span style={{ width: 26, height: 26, borderRadius: 8, background: v.bg, color: v.fg, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 26px" }}>
                {v.init}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{v.pf}</span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 2 }}>{v.note}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button
          disabled={isSubmitting}
          onClick={handleCreateVariants}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1, minHeight: 44 }}
        >
          {isSubmitting ? "Creating…" : "Create variants"}
        </button>
      </div>
    </div>
  );
}

function BulkApproveModalContent() {
  const { closeModal, bulkApprove, posts } = useSocial();
  const pendingPosts = posts.filter((p) => p.st === "Needs approval");
  const pendingAiCount = pendingPosts.filter((p) => p.ai).length;

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#101828" }}>Approve {pendingPosts.length} pending post{pendingPosts.length !== 1 ? "s" : ""}?</div>
        <div style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.6 }}>
          Each post has passed safety and format checks. Approving schedules them at their planned times — you can still edit or pull any of them afterwards.
        </div>
        {pendingAiCount > 0 && (
          <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: 12, fontSize: 12, color: "#667085", lineHeight: 1.6 }}>
            {pendingAiCount} {pendingAiCount === 1 ? "is" : "are"} AI-generated, citing the live product and review data they were built from.
          </div>
        )}
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button onClick={bulkApprove} style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}>
          Approve all
        </button>
      </div>
    </div>
  );
}

function FailureModalContent({ post }: { post?: any }) {
  const { closeModal, goToScreen, flash } = useSocial();
  const platformName = post?.pf || "Platform";
  const postTitle = post?.t || "Social post";

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>{postTitle}</div>
        <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#912018" }}>Publish failed</div>
          <div style={{ fontSize: 12.5, color: "#344054", marginTop: 7, lineHeight: 1.6 }}>
            The {platformName} delivery failed during publication. Channel authorization may have expired or channel API returned a delivery error. The post was not published and nothing was posted partially.
          </div>
        </div>
        {post?.prod && post.prod !== "—" && (
          <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B54708" }}>Linked Product</div>
            <div style={{ fontSize: 12, color: "#93370D", marginTop: 6, lineHeight: 1.6 }}>
              Promoting &quot;{post.prod}&quot;. Check stock availability and channel credentials before triggering a retry.
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Close
        </button>
        <button
          onClick={() => {
            closeModal();
            goToScreen("studio");
          }}
          style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
        >
          Open Studio
        </button>
        <button onClick={() => goToScreen("accounts")} style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}>
          Reconnect account
        </button>
      </div>
    </div>
  );
}

function CaptureModalContent({ comment }: { comment?: any }) {
  const { closeModal, flash } = useSocial();
  const c = comment || {};

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#98A2B3" }}>
            {c.who || "User"} · {c.pf || "Social"}
          </div>
          <div style={{ fontSize: 12.5, color: "#344054", marginTop: 6, lineHeight: 1.55 }}>{c.msg || "Inquiry"}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 9 }}>What will be saved</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Handle</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>{c.who || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Interest</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>{c.post || "General"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Intent</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>{c.intent || "Product inquiry"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Name</span>
              <span style={{ fontSize: 12, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Email</span>
              <span style={{ fontSize: 12, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>Phone</span>
              <span style={{ fontSize: 12, color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>
            </div>
          </div>
        </div>
        <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#3538CD", lineHeight: 1.55 }}>
          Only the handle and what they wrote are available. Ask them directly for contact details — nothing will be looked up or guessed.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button
          onClick={() => {
            closeModal();
            flash("Lead captured with only the fields this person actually provided.");
          }}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Capture lead
        </button>
      </div>
    </div>
  );
}

function DupeModalContent({ lead }: { lead?: any }) {
  const { closeModal, flash } = useSocial();
  const contactInfo = lead?.phone || lead?.email || lead?.who || "Customer identifier";
  const matchedCustomer = lead?.match && lead.match !== "—" ? lead.match : "Matched customer profile";

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.6 }}>This inquiry matches an existing customer identifier, but other fields are unconfirmed. Merging on one field alone risks joining two different people.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>This lead</div>
            <div style={{ fontSize: 12, color: "#344054", marginTop: 7, lineHeight: 1.6 }}>
              Name — {lead?.name && lead.name !== "—" ? lead.name : "not provided"}
              <br />
              {contactInfo}
              <br />
              {lead?.pf || "Social"} inquiry
            </div>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Existing customer</div>
            <div style={{ fontSize: 12, color: "#344054", marginTop: 7, lineHeight: 1.6 }}>
              {matchedCustomer}
              <br />
              {contactInfo}
              <br />
              Verified customer record
            </div>
          </div>
        </div>
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D", lineHeight: 1.55 }}>
          Shared identifiers are common. Keeping them separate is safe — you can always merge later once identity is confirmed.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button
          onClick={() => {
            closeModal();
            flash("Kept separate — nothing was merged.");
          }}
          style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
        >
          Keep separate
        </button>
        <button
          onClick={() => {
            closeModal();
            flash(`Merged into ${matchedCustomer}.`);
          }}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Same person — merge
        </button>
      </div>
    </div>
  );
}

function DisconnectModalContent({ account }: { account?: any }) {
  const { closeModal, disconnectAccount, posts } = useSocial();
  const scheduledCount = posts.filter((p) => p.pf === account?.pf && p.st === "Scheduled").length;

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#101828" }}>Disconnect {account?.pf || "Account"}?</div>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 9 }}>What stops working</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, color: "#344054" }}>· {scheduledCount} scheduled post{scheduledCount !== 1 ? "s" : ""} will be paused, not deleted</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Comments and DMs stop arriving in the inbox</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Analytics stops updating from today</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Mention monitoring for this platform stops</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Marketing campaigns using it will show a connection error</span>
          </div>
        </div>
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#0E8442", lineHeight: 1.55 }}>
          Past posts, historical analytics and captured leads are all kept. Reconnecting picks up where it left off.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button onClick={() => disconnectAccount(account?.id)} style={{ background: "#B42318", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}>
          Disconnect
        </button>
      </div>
    </div>
  );
}

function AddCompModalContent() {
  const { closeModal, addCompetitorItem } = useSocial();
  const [compName, setCompName] = useState("");
  const [compHandle, setCompHandle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    const finalName = compName.trim();
    if (!finalName) return;
    setIsAdding(true);
    await addCompetitorItem(finalName);
    setIsAdding(false);
  };

  return (
    <div>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Business name</label>
          <input
            value={compName}
            onChange={(e) => setCompName(e.target.value)}
            placeholder="Search or enter business name…"
            aria-label="Business name"
            style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Social handle</label>
          <input
            value={compHandle}
            onChange={(e) => setCompHandle(e.target.value)}
            placeholder="@handle"
            aria-label="Handle"
            style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 }}
          />
        </div>
        {compName.trim() && (
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "#FDF2FA", color: "#C11574", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>IG</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{compName.trim()}</span>
              <span style={{ display: "block", fontSize: 11, color: "#98A2B3" }}>{compHandle.trim() || `@${compName.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}`} · Public profile</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#0E8442" }}>Public profile</span>
          </div>
        )}
        <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#3538CD", lineHeight: 1.55 }}>
          Only public profile data is tracked — post counts, formats and visible engagement. Nothing private is accessed.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={closeModal} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button
          disabled={isAdding || !compName.trim()}
          onClick={handleAdd}
          style={{ background: "#12A150", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: isAdding || !compName.trim() ? "not-allowed" : "pointer", opacity: isAdding || !compName.trim() ? 0.6 : 1, minHeight: 44 }}
        >
          {isAdding ? "Adding…" : "Add to watchlist"}
        </button>
      </div>
    </div>
  );
}
