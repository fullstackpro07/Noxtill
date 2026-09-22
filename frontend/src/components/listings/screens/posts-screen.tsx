"use client";

import React, { useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { useListings } from "../listings-context";

export function PostsScreen() {
  const { gmbPosts, createPostAction, publishPostAction, deletePostAction, notify } = useListings();

  const [isComposing, setIsComposing] = useState(false);
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const chipClass = (tone: string) => {
    switch (tone) {
      case "green":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "red":
        return "bg-[#FEF3F2] border-[#FBD5D2] text-[#B42318]";
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  const statusLabel: Record<string, string> = { draft: "Draft", published: "Published", failed: "Failed" };
  const statusTone: Record<string, string> = { draft: "neutral", published: "green", failed: "red" };

  const handleCreate = async () => {
    if (!text.trim()) {
      notify("Post text is required", "Write something before saving a draft.");
      return;
    }
    setIsSaving(true);
    try {
      await createPostAction({ text: text.trim() });
      setText("");
      setIsComposing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#E6E8EC] bg-white p-4 shadow-sm">
        <Info className="h-4 w-4 flex-shrink-0 text-[#7A8798]" />
        <div className="min-w-[220px] flex-1 text-[11.5px] leading-relaxed text-[#5B6675]">
          These are Google Business Profile updates, not organic social posts. Social Media Management owns those. Only Google supports posts among the connected directories — Bing and Apple have no posts API.
        </div>
        <button
          onClick={() => setIsComposing((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 text-[12px] font-bold text-white hover:bg-[#15803D]"
        >
          {isComposing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span>{isComposing ? "Cancel" : "New post"}</span>
        </button>
      </div>

      {isComposing && (
        <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-[#5B6675]">
            Post text
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's the update?"
              className="rounded-lg border border-[#D5DAE2] px-3 py-2 text-[12.5px] text-[#0F172A]"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setIsComposing(false)} className="flex h-9 items-center rounded-lg border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]">
              Cancel
            </button>
            <button disabled={isSaving} onClick={handleCreate} className="flex h-9 items-center rounded-lg bg-[#16A34A] px-4 text-[12.5px] font-bold text-white hover:bg-[#15803D] disabled:opacity-60">
              {isSaving ? "Saving…" : "Save as draft"}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-[#94A3B8]">Saved as a draft first — publish it from the table below when ready.</div>
        </div>
      )}

      {/* Posts Table Card */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        {gmbPosts.length === 0 ? (
          <div className="p-10 text-center text-[12.5px] text-[#94A3B8]">
            No posts yet. Create one above — it publishes to whichever Google Business Profile location is connected for this branch.
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A8798]">
                  <th className="pl-4 py-3">Post</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Scheduled for</th>
                  <th className="pr-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {gmbPosts.map((p) => (
                  <tr key={p.id} className="border-b border-[#F3F4F7] bg-white">
                    <td className="pl-4 py-3 max-w-[360px]">
                      <div className="truncate text-[12.5px] font-bold text-[#0F172A]">{p.text}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(statusTone[p.status])}`}>
                        {statusLabel[p.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-[#94A3B8] whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-[#94A3B8] whitespace-nowrap">
                      {p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString() : "Not scheduled"}
                    </td>
                    <td className="pr-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1.5">
                        {p.status === "draft" && (
                          <button
                            onClick={() => publishPostAction(p.id)}
                            className="inline-flex h-[30px] items-center rounded-lg bg-[#16A34A] px-2.5 text-[12px] font-bold text-white hover:bg-[#15803D]"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          onClick={() => deletePostAction(p.id)}
                          className="inline-flex h-[30px] items-center rounded-lg border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
          View counts aren&apos;t reported by the Google Business Profile posts API, so they aren&apos;t shown here.
        </div>
      </div>
    </div>
  );
}
