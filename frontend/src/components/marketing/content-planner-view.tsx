"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { MarketingDrawer, DrawerLabel } from "@/components/marketing/marketing-drawer";
import {
  fetchContentItems,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  fetchContentIdeas,
  CONTENT_ITEM_TYPES,
  CONTENT_ITEM_TYPE_LABELS,
  CONTENT_ITEM_CHANNELS,
  CONTENT_ITEM_CHANNEL_LABELS,
  CONTENT_ITEM_STATUSES,
  CONTENT_ITEM_STATUS_LABELS,
  type ContentItem,
  type ContentItemType,
  type ContentItemChannel,
  type ContentItemStatus,
} from "@/lib/content-items-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<ContentItemStatus, { bg: string; fg: string }> = {
  draft: { bg: "#F2F4F7", fg: "#475467" },
  needs_approval: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  scheduled: { bg: "#EEF4FF", fg: "#3538CD" },
  published: { bg: "#E8F7EE", fg: "#0E8442" },
  failed: { bg: "#FEF3F2", fg: "#B42318" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ContentPlannerView() {
  const [view, setView] = useState<"Calendar" | "List">("Calendar");
  const [statusFilter, setStatusFilter] = useState<"All" | ContentItemStatus>("All");
  const [channelFilter, setChannelFilter] = useState<"All" | ContentItemChannel>("All");
  const [creating, setCreating] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({ queryKey: ["content-items"], queryFn: fetchContentItems });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContentItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-items"] });
      toast.success("Content item deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this item."),
  });

  const filtered = useMemo(
    () => items.filter((i) => (statusFilter === "All" || i.status === statusFilter) && (channelFilter === "All" || i.channel === channelFilter)),
    [items, statusFilter, channelFilter],
  );

  const counts = {
    published: items.filter((i) => i.status === "published").length,
    scheduled: items.filter((i) => i.status === "scheduled").length,
    draft: items.filter((i) => i.status === "draft").length,
    approval: items.filter((i) => i.status === "needs_approval").length,
  };

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const itemsByDay = new Map<number, ContentItem[]>();
  for (const item of filtered) {
    if (!item.scheduledFor) continue;
    const d = new Date(item.scheduledFor);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      itemsByDay.set(d.getDate(), [...(itemsByDay.get(d.getDate()) ?? []), item]);
    }
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="flex gap-1.5">
          {(["Calendar", "List"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="rounded-full text-[12px] font-bold"
              style={{ border: `1px solid ${view === v ? "var(--app-sidebar-bg)" : "var(--app-border)"}`, background: view === v ? "var(--app-sidebar-bg)" : "var(--app-surface)", color: view === v ? "#fff" : "var(--app-text-faint)", padding: "9px 16px", minHeight: 42 }}
            >
              {v}
            </button>
          ))}
        </span>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Status" className="rounded-[11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}>
          <option value="All">All statuses</option>
          {CONTENT_ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>{CONTENT_ITEM_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)} aria-label="Channel" className="rounded-[11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}>
          <option value="All">All channels</option>
          {CONTENT_ITEM_CHANNELS.map((c) => (
            <option key={c} value={c}>{CONTENT_ITEM_CHANNEL_LABELS[c]}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setIdeasOpen(true)} className="flex items-center gap-[7px] rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-success-text)", background: "var(--app-surface)", padding: "11px 15px", minHeight: 44 }}>
            <Sparkles className="h-[15px] w-[15px]" aria-hidden />
            Content ideas
          </button>
          <button type="button" onClick={() => setCreating(true)} className="rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}>
            Create Content
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Published</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-primary)" }}>{counts.published}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Scheduled</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{counts.scheduled}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Draft</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{counts.draft}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1.5px solid var(--app-warning-border)", padding: 15 }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-warning-text)" }}>Needs Approval</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{counts.approval}</div>
        </div>
      </div>

      {view === "Calendar" ? (
        <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{monthLabel}</h3>
          <div className="mb-1.5 grid gap-1.5" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>{w}</div>
            ))}
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} style={{ minHeight: 76 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayItems = itemsByDay.get(day) ?? [];
              const first = dayItems[0];
              const tone = first ? STATUS_TONE[first.status] : null;
              return (
                <div key={day} className="rounded-[10px]" style={{ minHeight: 76, border: "1px solid var(--app-border)", padding: 7, background: tone?.bg ?? "var(--app-surface)" }}>
                  <div className="text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{day}</div>
                  {first && (
                    <div className="mt-1.5">
                      <div className="text-[9.5px] font-extrabold leading-tight" style={{ color: tone?.fg }}>{first.title.length > 16 ? `${first.title.slice(0, 16)}…` : first.title}</div>
                      <div className="mt-0.5 text-[9px] opacity-80" style={{ color: tone?.fg }}>{CONTENT_ITEM_CHANNEL_LABELS[first.channel]}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          {filtered.length === 0 ? (
            <div className="text-center" style={{ padding: "52px 18px" }}>
              <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing planned yet</p>
              <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>
                Create Content
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 860 }}>
                <thead>
                  <tr style={{ background: "var(--app-surface-2)" }}>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Date</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Content</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Type</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Channel</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Owner</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const tone = STATUS_TONE[item.status];
                    return (
                      <tr key={item.id} onClick={() => setEditing(item)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td style={{ padding: "12px 17px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", whiteSpace: "nowrap" }}>{item.scheduledFor ? formatDate(item.scheduledFor) : "—"}</td>
                        <td style={{ padding: 12 }}>
                          <span className="flex items-center gap-2">
                            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{item.title}</span>
                            {item.aiGenerated && <span className="rounded-full text-[9.5px] font-extrabold" style={{ background: "#F5EBFE", color: "#7E22CE", padding: "2px 7px" }}>AI draft</span>}
                          </span>
                        </td>
                        <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{CONTENT_ITEM_TYPE_LABELS[item.type]}</td>
                        <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{CONTENT_ITEM_CHANNEL_LABELS[item.channel]}</td>
                        <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-disabled)" }}>{item.ownerUser?.user.name ?? "—"}</td>
                        <td style={{ padding: "12px 17px" }}>
                          <span className="whitespace-nowrap rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: tone.bg, color: tone.fg }}>{CONTENT_ITEM_STATUS_LABELS[item.status]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <ContentFormDialog
          item={editing ?? undefined}
          initialBody={editing ? undefined : draftBody}
          onDelete={editing ? () => { deleteMutation.mutate(editing.id); setEditing(null); } : undefined}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setDraftBody("");
          }}
        />
      )}
      {ideasOpen && (
        <IdeasDialog
          onClose={() => setIdeasOpen(false)}
          onUse={(text) => {
            setDraftBody(text);
            setCreating(true);
            setIdeasOpen(false);
          }}
        />
      )}
    </main>
  );
}

function ContentFormDialog({ item, initialBody, onDelete, onClose }: { item?: ContentItem; initialBody?: string; onDelete?: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [type, setType] = useState<ContentItemType>(item?.type ?? "social_post");
  const [channel, setChannel] = useState<ContentItemChannel>(item?.channel ?? "instagram");
  const [body, setBody] = useState(item?.body ?? initialBody ?? "");
  const [scheduledFor, setScheduledFor] = useState(item?.scheduledFor ? item.scheduledFor.slice(0, 16) : "");
  const queryClient = useQueryClient();
  const isAiDraft = !item && !!initialBody;

  const mutation = useMutation({
    mutationFn: () =>
      item
        ? updateContentItem(item.id, { title, type, channel, body, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined })
        : createContentItem({ title, type, channel, body, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined, aiGenerated: isAiDraft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-items"] });
      toast.success(item ? "Content updated." : "Content saved to the planner.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this content."),
  });

  return (
    <MarketingDrawer
      title={item ? "Content" : "New content"}
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <button type="button" onClick={onDelete} aria-label="Delete" className="flex items-center justify-center rounded-[11px]" style={{ width: 46, border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "#B42318" }}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={onClose} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 16px", minHeight: 46 }}>
              Cancel
            </button>
          )}
          <button type="button" onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending} className="flex-1 rounded-[11px] text-[12.5px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Title</DrawerLabel>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this piece?" className="w-full rounded-[11px] text-[13.5px]" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Type</DrawerLabel>
          <select value={type} onChange={(e) => setType(e.target.value as ContentItemType)} className="w-full rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48, color: "var(--app-text-muted)" }}>
            {CONTENT_ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{CONTENT_ITEM_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <DrawerLabel>Channel</DrawerLabel>
          <select value={channel} onChange={(e) => setChannel(e.target.value as ContentItemChannel)} className="w-full rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48, color: "var(--app-text-muted)" }}>
            {CONTENT_ITEM_CHANNELS.map((c) => (
              <option key={c} value={c}>{CONTENT_ITEM_CHANNEL_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <DrawerLabel>Body</DrawerLabel>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write the post…" className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 11, resize: "vertical" }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Scheduled for</DrawerLabel>
          <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-[11px] text-[12.5px]" style={{ border: "1px solid var(--app-border)", padding: 11, minHeight: 48 }} />
        </div>
      </div>
      {item?.aiGenerated && (
        <div className="rounded-[11px] text-[11.5px] leading-relaxed" style={{ background: "#F5EBFE", color: "#7E22CE", padding: "11px 13px" }}>
          This was drafted by AI from your product and review data. Read it before approving — nothing publishes without a person.
        </div>
      )}
    </MarketingDrawer>
  );
}

function IdeasDialog({ onClose, onUse }: { onClose: () => void; onUse: (text: string) => void }) {
  const { data, isPending, isError } = useQuery({ queryKey: ["content-ideas"], queryFn: fetchContentIdeas });

  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Content ideas from your data</h3>
        </div>
        <div className="flex flex-col gap-2.5 p-[17px]">
          {isPending && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Thinking…</p>}
          {isError && <p className="m-0 text-[12.5px]" style={{ color: "#B42318" }}>Couldn&apos;t load ideas right now.</p>}
          {data?.ideas.map((idea, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
              <p className="m-0 flex-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text)" }}>{idea}</p>
              <button type="button" onClick={() => onUse(idea)} className="shrink-0 rounded-[9px] px-3 py-2 text-[11.5px] font-extrabold" style={{ border: "1px solid var(--app-border)", color: "var(--app-primary)" }}>
                Use this
              </button>
            </div>
          ))}
          <p className="m-0 rounded-[10px] p-[10px_12px] text-[11px]" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
            Ideas come from your own sales and reviews. No claims, prices or stock figures are invented.
          </p>
        </div>
        <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
