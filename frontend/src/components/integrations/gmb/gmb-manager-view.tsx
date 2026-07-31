"use client";

import { useState } from "react";
import { Check, X, Eye, Search, Phone, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateListingWizard } from "./create-listing-wizard";
import { PROFILE_HEALTH_CHECKLIST, GMB_POSTS, GMB_PHOTOS, GMB_INSIGHTS, GMB_QNA, HAS_LISTING } from "@/lib/gmb";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function GmbManagerView() {
  const [postDraft, setPostDraft] = useState("");

  if (!HAS_LISTING) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <CreateListingWizard />
      </div>
    );
  }

  function handlePublishPost() {
    toast.success("Post published to Google. Live post wires up in INT-013.");
    setPostDraft("");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Google My Business</h1>

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Profile health</p>
        <div className="flex flex-col gap-2">
          {PROFILE_HEALTH_CHECKLIST.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 text-sm">
              {item.done ? (
                <Check className="h-4 w-4 shrink-0 text-whatsapp" aria-hidden />
              ) : (
                <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span className={item.done ? "text-fg" : "text-fg-muted"}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-fg-faint"><Eye className="h-3.5 w-3.5" aria-hidden />Profile views</p>
          <p className="mt-1 font-display text-xl font-bold text-fg">{GMB_INSIGHTS.views.toLocaleString()}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-fg-faint"><Search className="h-3.5 w-3.5" aria-hidden />Searches</p>
          <p className="mt-1 font-display text-xl font-bold text-fg">{GMB_INSIGHTS.searches.toLocaleString()}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-fg-faint"><Phone className="h-3.5 w-3.5" aria-hidden />Calls</p>
          <p className="mt-1 font-display text-xl font-bold text-fg">{GMB_INSIGHTS.calls}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-fg-faint"><Navigation className="h-3.5 w-3.5" aria-hidden />Directions</p>
          <p className="mt-1 font-display text-xl font-bold text-fg">{GMB_INSIGHTS.directionRequests}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-medium text-fg">New post</p>
          <textarea
            value={postDraft}
            onChange={(e) => setPostDraft(e.target.value)}
            rows={3}
            placeholder="What's new at your business?"
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={handlePublishPost} disabled={!postDraft.trim()}>
              Publish
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
            {GMB_POSTS.map((p) => (
              <div key={p.id} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.accentColor }} />
                <div>
                  <p className="text-fg">{p.text}</p>
                  <p className="text-xs text-fg-faint">{formatDate(p.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-fg">Photos</p>
          <div className="grid grid-cols-3 gap-2">
            {GMB_PHOTOS.map((photo) => (
              <div key={photo.id} className="flex aspect-square flex-col items-center justify-center rounded-[6px] text-[10px] font-medium text-white" style={{ backgroundColor: photo.color }}>
                {photo.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Questions &amp; answers</p>
        <div className="flex flex-col gap-3">
          {GMB_QNA.map((qna) => (
            <div key={qna.id} className="text-sm">
              <p className="font-medium text-fg">{qna.question}</p>
              {qna.answer ? (
                <p className="text-fg-muted">{qna.answer}</p>
              ) : (
                <button onClick={() => toast.info("Reply flow wires up in INT-013.")} className="text-xs font-medium text-primary hover:underline">
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
