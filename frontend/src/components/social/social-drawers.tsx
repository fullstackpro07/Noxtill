"use client";

import React, { useState } from "react";
import { useSocial, getChip, formatNum, getInitials, type PostItem, type CommentItem, type LeadItem, type AccountItem, type MediaItem, type CompItem } from "./social-context";

export function SocialDrawers() {
  const { drawer, drawerItem, closeAll, openModal, goToScreen, flash, accounts, posts } = useSocial();

  if (!drawer) return null;

  const drawerTitleMap: Record<string, string> = {
    composer: "Create post",
    post: "Post detail",
    kpi: "Figure detail",
    intel: "Why this matters",
    comment: "Conversation",
    lead: "Lead detail",
    account: "Account detail",
    media: "Asset detail",
    comp: "Competitor detail",
    preflight: "Pre-flight check",
  };

  const drawerTitle = drawerTitleMap[drawer] || "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeAll}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,27,42,.36)",
          zIndex: 80,
        }}
      />

      {/* Drawer Panel */}
      <aside
        data-drawer="1"
        role="dialog"
        aria-modal="true"
        aria-label={drawerTitle}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 500,
          maxWidth: "100%",
          background: "#fff",
          zIndex: 85,
          boxShadow: "-18px 0 46px rgba(10,27,42,.18)",
          display: "flex",
          flexDirection: "column",
          animation: "nxslide .22s ease",
        }}
      >
        {/* Drawer Header */}
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{drawerTitle}</h3>
          <button
            onClick={closeAll}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
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

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 17 }}>
          {drawer === "composer" && <ComposerDrawerContent />}
          {drawer === "post" && <PostDrawerContent post={drawerItem?.p} />}
          {drawer === "kpi" && <KpiDrawerContent kpiKey={drawerItem?.k} />}
          {drawer === "intel" && <IntelDrawerContent intel={drawerItem?.intel} intelIndex={drawerItem?.i} />}
          {drawer === "comment" && <CommentDrawerContent comment={drawerItem?.c} />}
          {drawer === "lead" && <LeadDrawerContent lead={drawerItem?.l} />}
          {drawer === "account" && <AccountDrawerContent account={drawerItem?.a} />}
          {drawer === "media" && <MediaDrawerContent media={drawerItem?.m} />}
          {drawer === "comp" && <CompDrawerContent comp={drawerItem?.c} />}
          {drawer === "preflight" && <PreflightDrawerContent post={drawerItem?.p} />}
        </div>
      </aside>
    </>
  );
}

function ComposerDrawerContent() {
  const { closeAll, goToScreen, createPostAction, products } = useSocial();
  const [platform, setPlatform] = useState("Instagram");
  const [contentType, setContentType] = useState("Photo");
  const [caption, setCaption] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [hashtags, setHashtags] = useState("#Noxtill #NewArrivals");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveDraft = async () => {
    if (!caption.trim()) return;
    setIsSubmitting(true);
    await createPostAction({
      caption: caption + (hashtags ? `\n\n${hashtags}` : ""),
      platforms: [platform.toLowerCase() as any],
    });
    setIsSubmitting(false);
  };

  const handleSchedule = async () => {
    if (!caption.trim()) return;
    setIsSubmitting(true);
    await createPostAction({
      caption: caption + (hashtags ? `\n\n${hashtags}` : ""),
      platforms: [platform.toLowerCase() as any],
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : new Date(Date.now() + 86400000).toISOString(),
    });
    setIsSubmitting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
            Platform
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Platform"
            style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", background: "#fff", minHeight: 48 }}
          >
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="TikTok">TikTok</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Twitter">X (Twitter)</option>
            <option value="YouTube">YouTube</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
            Type
          </label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            aria-label="Content type"
            style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", background: "#fff", minHeight: 48 }}
          >
            <option value="Photo">Photo</option>
            <option value="Carousel">Carousel</option>
            <option value="Video">Reel / video</option>
            <option value="Story">Story</option>
            <option value="Text">Text only</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
          Product or service — optional
        </label>
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          aria-label="Product"
          style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", background: "#fff", minHeight: 48 }}
        >
          <option value="">None</option>
          {products.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name} — Rs. {p.price.toLocaleString()}{p.stockOnHand !== undefined ? ` (${p.stockOnHand} in stock)` : ""}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 5 }}>
          Selecting a product links live stock and pricing from your inventory.
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 7 }}>
          Media
        </label>
        <div style={{ border: "1px dashed #D5DCE4", borderRadius: 12, padding: 22, textAlign: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round">
            <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16" />
          </svg>
          <div style={{ fontSize: 12, color: "#667085", marginTop: 8 }}>Drop an asset, choose from the library, or generate one</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 11, flexWrap: "wrap" }}>
            <button
              onClick={() => goToScreen("media")}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 13px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 42 }}
            >
              Library
            </button>
            <button
              onClick={() => goToScreen("studio")}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "9px 13px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 42 }}
            >
              Generate AI
            </button>
          </div>
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
          Caption
        </label>
        <textarea
          rows={5}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write the post caption, announcement or discount offer…"
          aria-label="Caption"
          style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
            Call to action
          </label>
          <input placeholder="e.g. Message us to reserve" aria-label="CTA" style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13, minHeight: 48 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
            Publish at
          </label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            aria-label="Publish time"
            style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 11, fontSize: 12.5, minHeight: 48 }}
          />
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
          Hashtags
        </label>
        <input
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          placeholder="#Noxtill #Store #Discount"
          aria-label="Hashtags"
          style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 12, fontSize: 13, minHeight: 48 }}
        />
      </div>
      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#0E8442", lineHeight: 1.55 }}>
        Saving creates this post in the database. A pre-flight safety check runs before it dispatches.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button
          disabled={isSubmitting || !caption.trim()}
          onClick={handleSaveDraft}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1, minHeight: 46 }}
        >
          {isSubmitting ? "Saving…" : "Save draft"}
        </button>
        <button
          disabled={isSubmitting || !caption.trim()}
          onClick={handleSchedule}
          style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1, minHeight: 46 }}
        >
          {isSubmitting ? "Scheduling…" : "Schedule"}
        </button>
      </div>
    </div>
  );
}

function PostDrawerContent({ post }: { post?: PostItem }) {
  const { closeAll, openDrawer, openModal, deletePostItem } = useSocial();
  if (!post) return <div style={{ color: "#98A2B3" }}>No post selected.</div>;
  const chip = getChip(post.st);
  const isPublished = post.st === "Published";
  const rate = post.reach ? ((post.eng / post.reach) * 100).toFixed(1) + "%" : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", flex: 1, minWidth: 0 }}>{post.t}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg }}>{post.st}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 5 }}>
          {post.pf} · {post.type} · {post.when}
        </div>
      </div>
      <div style={{ height: 170, borderRadius: 13, background: "linear-gradient(150deg,#EDF0F4,#DDE3EA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="1.9" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.8" cy="9.5" r="1.6" />
          <path d="m21 16-4.5-4.5L5 20" />
        </svg>
      </div>
      {isPublished && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 10 }}>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#667085" }}>Reach</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{formatNum(post.reach)}</div>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#667085" }}>Engagement</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{formatNum(post.eng)}</div>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#667085" }}>Rate</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0E8442", marginTop: 4 }}>{rate}</div>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#667085" }}>Leads</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0E8442", marginTop: 4 }}>{post.leads || "—"}</div>
          </div>
        </div>
      )}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Campaign</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{post.camp}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Product</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{post.prod}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Origin</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{post.ai ? "AI generated" : "Created manually"}</span>
        </div>
      </div>
      {post.ai && (
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442" }}>Built from</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#344054" }}>· Product record — name, price, description</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Inventory — stock on hand at generation time</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Reviews — average rating and count</span>
            <span style={{ fontSize: 12, color: "#344054" }}>· Firefly — generated creative</span>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14, flexWrap: "wrap" }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button
          onClick={() => {
            openModal("repurpose", { p: post });
          }}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}
        >
          Repurpose
        </button>
        <button
          onClick={() => deletePostItem(post.id)}
          style={{ border: "1px solid #FEE4E2", background: "#FEF3F2", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 46 }}
        >
          Delete
        </button>
        <button
          onClick={() => openDrawer("composer")}
          style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function KpiDrawerContent({ kpiKey }: { kpiKey?: string }) {
  const { goToScreen, accounts } = useSocial();
  const connected = accounts.filter((a) => a.st === "Connected").map((a) => a.pf);
  const unlinked = accounts.filter((a) => a.st !== "Connected").map((a) => a.pf);

  const startD = new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endD = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const rows = [
    { l: "Period", v: `${startD} – ${endD}` },
    { l: "Accounts included", v: connected.length > 0 ? connected.join(", ") : "None connected" },
    { l: "Excluded", v: unlinked.length > 0 ? `${unlinked.join(", ")} — not connected` : "None" },
    { l: "Source", v: "Platform analytics APIs" },
    { l: "Last synced", v: "Live database sync" },
    { l: "Definition", v: "Aggregated performance across connected channels" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{kpiKey || "Figure detail"}</div>
      <div>
        {rows.map((r, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>{r.l}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054", textAlign: "right", maxWidth: "58%" }}>{r.v}</span>
          </div>
        ))}
      </div>
      {unlinked.length > 0 && (
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D", lineHeight: 1.55 }}>
          {unlinked.length} platform{unlinked.length > 1 ? "s are" : " is"} not connected, so content from them is excluded.
        </div>
      )}
      <button onClick={() => goToScreen("analytics")} style={{ border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
        Open analytics
      </button>
    </div>
  );
}

function IntelDrawerContent({ intel, intelIndex }: { intel?: any; intelIndex?: number }) {
  const { goToScreen, posts, accounts, comments, comps } = useSocial();
  const failedPost = posts.find((p) => p.st === "Failed");
  const pendingPosts = posts.filter((p) => p.st === "Needs approval");
  const unansweredComments = comments.filter((c) => c.st === "New" || c.st === "AI suggested");

  const fallbackIntel = [
    {
      t: "Short-form video is outperforming your other formats",
      why: "Across recent posts, short-form reels and video formats generated higher reach and engagement than static photos. Video algorithms continue to reward vertical video content.",
      ev: `${posts.filter((p) => p.type === "Reel" || p.type === "Video").length} video posts against ${posts.filter((p) => p.type === "Photo").length} photo posts recorded`,
      conf: "High",
      act: "Generate video content",
      scr: "studio",
    },
    {
      t: failedPost ? `A post failed delivery on ${failedPost.pf}` : `${pendingPosts.length} post(s) pending review`,
      why: failedPost
        ? `Delivery failed during dispatch. Account connection credentials or rate limits should be verified.`
        : `Safe approval mode holds generated content for your review before publishing.`,
      ev: failedPost ? `Status: Failed on ${failedPost.pf}` : `${pendingPosts.length} posts awaiting approval`,
      conf: "High",
      act: failedPost ? "Review queue" : "Review posts",
      scr: failedPost ? "queue" : "content",
    },
    {
      t: unansweredComments.length > 0 ? `${unansweredComments.length} unanswered customer inquiries` : "Weekend content schedule review",
      why: unansweredComments.length > 0
        ? "Prompt replies directly boost customer conversion and customer satisfaction."
        : "Checking open slots in your weekly schedule keeps audience engagement consistent.",
      ev: unansweredComments.length > 0 ? `${unansweredComments.length} active messages in inbox` : "Weekly calendar analysis",
      conf: "Medium",
      act: unansweredComments.length > 0 ? "Open inbox" : "Open calendar",
      scr: unansweredComments.length > 0 ? "inbox" : "calendar",
    },
    {
      t: comps.length > 0 ? `${comps.length} competitor(s) monitored on watchlist` : "Active channel monitoring",
      why: comps.length > 0
        ? "Public post frequency tracking helps assess category competition and timing."
        : "Social channels are monitored for mentions, interactions and post performance.",
      ev: comps.length > 0 ? `${comps.length} competitors in database` : "Connected account sync",
      conf: "Medium",
      act: comps.length > 0 ? "Open competitors" : "Manage accounts",
      scr: comps.length > 0 ? "competitors" : "accounts",
    },
  ];

  const item = intel || fallbackIntel[intelIndex ?? 0] || fallbackIntel[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", lineHeight: 1.45 }}>{item.t}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 7 }}>Why</div>
        <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.7 }}>{item.why}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 7 }}>Evidence</div>
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: 12, fontSize: 12, color: "#475467", lineHeight: 1.55 }}>{item.ev}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: "1px solid #F2F4F7", borderBottom: "1px solid #F2F4F7" }}>
        <span style={{ fontSize: 12.5, color: "#667085" }}>Confidence</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#344054" }}>{item.conf}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#98A2B3", lineHeight: 1.55 }}>This is a pattern in your own data, not a prediction. Acting on it may help — no specific outcome is guaranteed.</div>
      <button onClick={() => goToScreen(item.scr || "studio")} style={{ border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
        {item.act || "Take action"}
      </button>
    </div>
  );
}

function CommentDrawerContent({ comment }: { comment?: CommentItem }) {
  const { closeAll, captureLeadFromComment, sendInboxReply } = useSocial();
  const [replyText, setReplyText] = useState(comment?.reply || "");
  const [isSending, setIsSending] = useState(false);

  if (!comment) return <div style={{ color: "#98A2B3" }}>No comment selected.</div>;
  const chip = getChip(comment.st);
  const isEscalated = comment.st === "Escalated";

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    await sendInboxReply(comment.id, replyText);
    setIsSending(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px", overflow: "hidden" }}>
          {getInitials(comment.who)}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{comment.who}</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 2 }}>
            {comment.pf} · {comment.when}
          </span>
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg }}>{comment.st}</span>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>On: {comment.post}</div>
        <div style={{ fontSize: 13, color: "#344054", marginTop: 7, lineHeight: 1.6 }}>{comment.msg}</div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Detected intent</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{comment.intent}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Confidence</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{comment.conf}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Customer match</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{comment.match}</span>
        </div>
      </div>
      {isEscalated && (
        <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#912018" }}>Held for a human</div>
          <div style={{ fontSize: 12, color: "#B42318", marginTop: 5, lineHeight: 1.6 }}>
            This reads as a complaint about an order. The assistant will not answer it — it has no verified order status for this person, and guessing would make things worse.
          </div>
        </div>
      )}
      {comment.reply && (
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", marginBottom: 8 }}>Suggested reply</div>
          <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.65 }}>{comment.reply}</div>
          <div style={{ fontSize: 11, color: "#0E8442", marginTop: 8 }}>{comment.replySrc}</div>
        </div>
      )}
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>Your reply</label>
        <textarea
          rows={3}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Edit the suggestion or write your own…"
          aria-label="Reply"
          style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14, flexWrap: "wrap" }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        {comment.lead && (
          <button onClick={() => captureLeadFromComment(comment)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 46 }}>
            Capture lead
          </button>
        )}
        <button
          disabled={isSending || !replyText.trim()}
          onClick={handleSend}
          style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: isSending ? "not-allowed" : "pointer", opacity: isSending ? 0.6 : 1, minHeight: 46 }}
        >
          {isSending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}

function LeadDrawerContent({ lead }: { lead?: LeadItem }) {
  const { closeAll, goToScreen, flash } = useSocial();
  if (!lead) return <div style={{ color: "#98A2B3" }}>No lead selected.</div>;
  const chip = getChip(lead.st);
  const hasName = lead.name !== "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {hasName ? (
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", flex: 1, minWidth: 0 }}>{lead.name}</span>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 800, color: "#98A2B3", flex: 1, minWidth: 0, fontStyle: "italic" }}>Name not provided</span>
        )}
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg }}>{lead.st}</span>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 9 }}>What this person gave you</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Email</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Phone</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.phone}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Location</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.loc}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Source</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.pf} · {lead.src}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Interested in</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.interest}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
            <span style={{ fontSize: 12.5, color: "#667085" }}>Captured</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{lead.when}</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#3538CD" }}>Detected intent — {lead.intent}</div>
        <div style={{ fontSize: 12, color: "#3538CD", marginTop: 6, lineHeight: 1.6 }}>Read from what they wrote, not from anything about who they are. Score is {lead.score} based on how directly they asked.</div>
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D", lineHeight: 1.55 }}>
        Blank fields stay blank. Nothing here was looked up, inferred or scraped.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14, flexWrap: "wrap" }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button
          onClick={() => flash("Customers opens with this context — that module is not part of this build.")}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}
        >
          Open customer
        </button>
        <button onClick={() => goToScreen("inbox")} style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Reply now
        </button>
      </div>
    </div>
  );
}

function AccountDrawerContent({ account }: { account?: AccountItem }) {
  const { closeAll, openModal } = useSocial();
  if (!account) return <div style={{ color: "#98A2B3" }}>No account selected.</div>;
  const chip = getChip(account.st);
  const caps = [
    { l: "Publishing", ok: account.pub },
    { l: "Comments", ok: account.com },
    { l: "Messages", ok: account.msg },
    { l: "Analytics", ok: account.ana },
    { l: "Monitoring", ok: account.mon },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "#F2F4F7", color: "#101828", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px" }}>
          {account.init}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{account.pf}</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 2 }}>{account.handle}</span>
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg }}>{account.st}</span>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Branch</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{account.branch}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Last synced</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{account.sync}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: 9 }}>What this connection allows</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {caps.map((c, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E6EAF0", borderRadius: 11, padding: 11 }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "#344054" }}>{c.l}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: c.ok ? "#E8F7EE" : "#F2F4F7", color: c.ok ? "#0E8442" : "#98A2B3" }}>
                {c.ok ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#667085", lineHeight: 1.55 }}>
        This account is used by Social Media, Marketing and Unified Inbox. Disconnecting pauses everything scheduled against it.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button onClick={closeAll} style={{ flex: 1, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button
          onClick={() => openModal("disconnect", { a: account })}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "#667085", cursor: "pointer", minHeight: 46 }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function MediaDrawerContent({ media }: { media?: MediaItem }) {
  const { closeAll, goToScreen } = useSocial();
  if (!media) return <div style={{ color: "#98A2B3" }}>No asset selected.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ height: 200, borderRadius: 13, background: "linear-gradient(150deg,#EDF0F4,#DDE3EA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="1.9" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.8" cy="9.5" r="1.6" />
          <path d="m21 16-4.5-4.5L5 20" />
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", wordBreak: "break-all" }}>{media.n}</div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Type</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{media.type}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Dimensions</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{media.dim}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Origin</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{media.prov}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Product</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{media.prod}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Used in</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{media.used ? `${media.used} posts` : "Not used yet"}</span>
        </div>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#667085", lineHeight: 1.55 }}>
        Editing creates a new version. The original is never overwritten unless you delete it explicitly.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14, flexWrap: "wrap" }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button onClick={() => goToScreen("studio")} style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Create a variation
        </button>
      </div>
    </div>
  );
}

function CompDrawerContent({ comp }: { comp?: CompItem }) {
  const { closeAll, goToScreen } = useSocial();
  if (!comp) return <div style={{ color: "#98A2B3" }}>No competitor selected.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{comp.n}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#667085" }}>Followers</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{comp.followers}</div>
        </div>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#667085" }}>Posting</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{comp.freq}</div>
        </div>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#667085" }}>Engagement</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{comp.eng}</div>
        </div>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#667085" }}>Top format</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{comp.top}</div>
        </div>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Observed change</div>
        <div style={{ fontSize: 12.5, color: "#344054", marginTop: 6, lineHeight: 1.6 }}>{comp.trend} over the last 14 days, weighted toward short-form video.</div>
      </div>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#3538CD" }}>Not knowable</div>
        <div style={{ fontSize: 12, color: "#3538CD", marginTop: 6, lineHeight: 1.6 }}>
          Their revenue, customer numbers, ad spend and strategy are private. Nothing here estimates them — only visible post counts, formats and public engagement.
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button onClick={() => goToScreen("studio")} style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Create video content
        </button>
      </div>
    </div>
  );
}

function PreflightDrawerContent({ post }: { post?: PostItem }) {
  const { closeAll } = useSocial();
  const checks = [
    { l: "Account connected and authorised", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Media meets platform requirements", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Caption within character limit", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Product in stock", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Offer still valid", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Link reachable", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
    { l: "Approval recorded", s: "Pass", bg: "#E8F7EE", fg: "#0E8442" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{post?.t || "Pre-flight check"}</div>
        <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 4 }}>
          {post?.pf} · publishes {post?.when}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {checks.map((c, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E6EAF0", borderRadius: 11, padding: 11 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "#344054" }}>{c.l}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: c.bg, color: c.fg }}>{c.s}</span>
          </div>
        ))}
      </div>
      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#0E8442", lineHeight: 1.55 }}>
        All checks pass, so this will publish at the scheduled time. A critical failure blocks the publish rather than warning and going ahead.
      </div>
      <button onClick={closeAll} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
        Close
      </button>
    </div>
  );
}
