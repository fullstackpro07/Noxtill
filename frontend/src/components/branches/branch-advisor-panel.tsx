"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Sparkles, ShieldAlert, Send } from "lucide-react";
import { askBranchAdvisor } from "@/lib/branches-api";
import { useBranchesScope } from "@/components/branches/branches-context";
import { ApiError } from "@/lib/api-client";
import { BR } from "@/components/branches/branches-ui";

const SUGGESTED = "Which branch needs attention, and why?";

/** Real AI Q&A — answers only for whichever branch is scoped by the module's own Scope pill
 * (via X-Branch, same mechanism the branch switcher uses), never a fabricated cross-branch
 * ranking the backend can't actually produce for "All branches" scope in one call. */
export function BranchAdvisorPanel({ onClose }: { onClose: () => void }) {
  const { scopeBranchId, periodLabel } = useBranchesScope();
  const [question, setQuestion] = useState(SUGGESTED);
  const [asked, setAsked] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (q: string) => askBranchAdvisor(q),
    onSuccess: () => setAsked(question),
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#94A3B8" }}>AI branch assistant</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", marginTop: 4 }}>Ask about {scopeBranchId ? "this branch" : "your branches"}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: BR.textDim, cursor: "pointer", border: 0, background: "transparent" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "14px 20px", background: "#FBFAFF", borderBottom: "1px solid #F0F2F5", display: "flex", gap: 8 }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={SUGGESTED}
            style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid #D5DAE2", padding: "0 12px", fontSize: 13 }}
          />
          <button
            type="button"
            onClick={() => question.trim() && mutation.mutate(question.trim())}
            disabled={mutation.isPending || !question.trim()}
            style={{ height: 40, width: 40, flex: "0 0 40px", borderRadius: 10, background: BR.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: 0, cursor: "pointer", opacity: mutation.isPending ? 0.6 : 1 }}
          >
            <Send size={16} />
          </button>
        </div>

        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!asked && !mutation.isPending && (
            <div style={{ fontSize: 12.5, color: BR.textFaint }}>Scoped to {scopeBranchId ? "the branch selected in the Scope pill" : "your whole group"} · {periodLabel.toLowerCase()}.</div>
          )}
          {mutation.isPending && <div style={{ fontSize: 13, color: BR.textMuted }}>Thinking…</div>}
          {mutation.isError && (
            <div style={{ fontSize: 13, color: "#B42318" }}>{mutation.error instanceof ApiError ? mutation.error.message : "Couldn't reach the advisor — please try again."}</div>
          )}
          {mutation.data && asked && (
            <div style={{ border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={14} style={{ color: "#6D28D9" }} />
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6D28D9" }}>Answer</div>
              </div>
              <div style={{ fontSize: 13, color: BR.text, lineHeight: 1.6, marginTop: 8 }}>{mutation.data.answer}</div>
            </div>
          )}
          <div style={{ marginTop: "auto", display: "flex", gap: 9, fontSize: 11.5, color: BR.textFaint, lineHeight: 1.5 }}>
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{mutation.data?.disclaimer ?? "Based on your own branch data only — never a competitor's or another business's numbers."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
