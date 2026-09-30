"use client";

import { useState, type ReactNode } from "react";
import type { PortalArticle, PortalArticleCard } from "@/lib/helpdesk-portal-api";

export const box = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "18px" } as const;
export const inp = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", minHeight: "42px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", background: "#fff" };
export const primary = { border: 0, background: "#12A150", color: "#fff", borderRadius: "10px", padding: "10px 16px", fontSize: "13px", fontWeight: 800, cursor: "pointer", minHeight: "42px" } as const;
export const ghost = { border: "1px solid #E6EAF0", background: "#fff", color: "#344054", borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", minHeight: "40px" } as const;

export function SupportFrame({ business, sub, children }: { business: string; sub: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: "#101828" }}>
      <header style={{ background: "#0A1B2A", color: "#fff", padding: "18px 16px" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#12A150", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 14v-2a9 9 0 0 1 18 0v2M3 14h3v6H4a1 1 0 0 1-1-1ZM21 14h-3v6h2a1 1 0 0 0 1-1Z" />
            </svg>
          </span>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-.3px" }}>{business}</div>
            <div style={{ fontSize: "12px", color: "#AFC0CE" }}>{sub}</div>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "18px 16px 40px", display: "flex", flexDirection: "column", gap: "14px" }}>{children}</main>
    </div>
  );
}

export function ArticleList({ items, onOpen, empty }: { items: PortalArticleCard[]; onOpen: (slug: string) => void; empty: string }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const L = items.filter((a) => !ql || `${a.title} ${a.summary} ${a.category}`.toLowerCase().includes(ql));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.length > 4 ? <input type="search" placeholder="Search help articles" aria-label="Search help articles" value={q} onChange={(e) => setQ(e.target.value)} style={inp} /> : null}
      {L.map((a) => (
        <button key={a.slug} type="button" onClick={() => onOpen(a.slug)} style={{ textAlign: "left", border: "1px solid #F2F4F7", background: "#FAFBFC", borderRadius: "10px", padding: "10px 12px", cursor: "pointer", font: "inherit" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{a.title}</div>
          <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>
            {a.category}
            {a.summary ? " · " + a.summary : ""}
          </div>
        </button>
      ))}
      {!L.length ? <div style={{ fontSize: "12.5px", color: "#667085" }}>{items.length ? "No articles match." : empty}</div> : null}
    </div>
  );
}

export function ArticleView({ a, onBack, onOpen, vote }: { a: PortalArticle; onBack: () => void; onOpen: (slug: string) => void; vote: (helpful: boolean, comment?: string) => Promise<unknown> }) {
  const [voted, setVoted] = useState<null | boolean>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  return (
    <section style={box}>
      <button type="button" onClick={onBack} style={{ border: 0, background: "transparent", padding: 0, color: "#0E8442", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>
        ← All articles
      </button>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "#0E8442", textTransform: "uppercase", letterSpacing: ".5px", marginTop: "12px" }}>{a.category}</div>
      <h1 style={{ margin: "4px 0 6px", fontSize: "22px", fontWeight: 800, letterSpacing: "-.4px" }}>{a.title}</h1>
      {a.summary ? <p style={{ margin: "0 0 12px", color: "#475467", fontSize: "13.5px" }}>{a.summary}</p> : null}
      <div style={{ fontSize: "14px", lineHeight: 1.65, color: "#1D2939", whiteSpace: "pre-wrap" }}>{a.body}</div>
      {a.related.length ? (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "6px" }}>Related</div>
          {a.related.map((r) => (
            <button key={r.slug} type="button" onClick={() => onOpen(r.slug)} style={{ display: "block", border: 0, background: "transparent", padding: "3px 0", color: "#0E8442", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              {r.title}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: "18px", borderTop: "1px solid #F2F4F7", paddingTop: "14px" }}>
        {voted == null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Was this article helpful?</span>
            <input aria-label="Comment (optional)" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} style={inp} />
            <div style={{ display: "flex", gap: "8px" }}>
              {[true, false].map((h) => (
                <button
                  key={String(h)}
                  type="button"
                  style={ghost}
                  onClick={() =>
                    void vote(h, comment.trim() || undefined).then(
                      () => setVoted(h),
                      (e: Error) => setErr(e.message),
                    )
                  }
                >
                  {h ? "👍 Yes" : "👎 No"}
                </button>
              ))}
            </div>
            {err ? <span style={{ fontSize: "12px", color: "#B42318" }}>{err}</span> : null}
          </div>
        ) : (
          <span style={{ fontSize: "13px", color: "#0E8442", fontWeight: 700 }}>Thanks for the feedback.</span>
        )}
      </div>
    </section>
  );
}
