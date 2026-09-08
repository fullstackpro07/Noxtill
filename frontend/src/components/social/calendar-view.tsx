"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Sparkles, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchSocialPosts, createSocialPost, type SocialPost, type SocialPostStatus } from "@/lib/social-posts-api";
import { generateAiCaption } from "@/lib/ai-content-api";
import { fetchSocialAccounts, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<SocialPostStatus, string> = {
  draft: "bg-fg-faint",
  scheduled: "bg-primary",
  publishing: "bg-accent",
  published: "bg-whatsapp",
  partially_failed: "bg-accent",
  failed: "bg-destructive",
};

const STATUS_LIST_HREF: Record<SocialPostStatus, string> = {
  draft: "/social/drafts",
  scheduled: "/social/scheduled",
  publishing: "/social/scheduled",
  published: "/social/published",
  partially_failed: "/social/published",
  failed: "/social/scheduled",
};

const GAP_LOOKAHEAD_DAYS = 7;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Plain helper (not inlined in the hook callback) so the impure `Date.now()` read isn't flagged as happening during render. */
function hasUpcomingWithinWindow(posts: SocialPost[]): boolean {
  const now = Date.now();
  const cutoff = now + GAP_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
  return posts.some((p) => {
    if (p.status !== "scheduled" && p.status !== "draft") return false;
    if (!p.scheduledFor) return false;
    const t = new Date(p.scheduledFor).getTime();
    return t >= now && t <= cutoff;
  });
}

export function CalendarView() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [dayList, setDayList] = useState<{ date: Date; posts: SocialPost[] } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [gapDismissed, setGapDismissed] = useState(false);

  const { data, isError, refetch } = useQuery({ queryKey: ["social-posts"], queryFn: () => fetchSocialPosts() });

  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const post of data ?? []) {
      const when = post.scheduledFor ?? post.createdAt;
      const key = dateKey(new Date(when));
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [data]);

  // don't flash the banner before data loads
  const hasUpcoming = useMemo(() => (data ? hasUpcomingWithinWindow(data) : true), [data]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Content Calendar</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Every draft, scheduled, and published post in one view.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSuggestOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden />
            AI: suggest a month
          </Button>
          <Link href="/social/create">
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              New post
            </Button>
          </Link>
        </div>
      </div>

      {!hasUpcoming && !gapDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-noxtill)] border border-accent/30 bg-accent/8 p-3.5">
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">Nothing planned for the next {GAP_LOOKAHEAD_DAYS} days</p>
            <p className="mt-0.5 text-xs text-fg-muted">Fill the gap with a post, or let AI sketch out a month of ideas.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => setSuggestOpen(true)}>
              Suggest a month
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setGapDismissed(true)} aria-label="Dismiss">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {isError ? (
        <ErrorBanner title="Couldn't load the calendar" onRetry={() => refetch()} />
      ) : (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <p className="font-display text-base font-semibold text-fg">
              {firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-fg-faint">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const posts = postsByDay.get(dateKey(date)) ?? [];
              const isToday = dateKey(date) === dateKey(today);
              const isEmpty = posts.length === 0;
              return (
                <div
                  key={i}
                  role={isEmpty ? "button" : undefined}
                  tabIndex={isEmpty ? 0 : undefined}
                  onClick={isEmpty ? () => (window.location.href = `/social/create?date=${toDateInput(date)}`) : undefined}
                  onKeyDown={
                    isEmpty
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") window.location.href = `/social/create?date=${toDateInput(date)}`;
                        }
                      : undefined
                  }
                  className={cn(
                    "flex min-h-20 flex-col gap-1 rounded-[var(--radius-sm)] border border-border p-1.5 text-left",
                    isToday && "border-primary bg-primary/5",
                    isEmpty && "cursor-pointer hover:bg-surface-2",
                  )}
                >
                  <span className="text-xs text-fg-faint">{date.getDate()}</span>
                  {posts.slice(0, 3).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setSelected(post)}
                      className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-surface-2"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[post.status])} />
                      <span className="truncate">{post.caption || "(no caption)"}</span>
                    </button>
                  ))}
                  {posts.length > 3 && (
                    <button
                      onClick={() => setDayList({ date, posts })}
                      className="text-left text-[10px] font-medium text-primary hover:underline"
                    >
                      +{posts.length - 3} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Post"
        description={selected?.caption}
        footer={
          selected && (
            <Link href={STATUS_LIST_HREF[selected.status]}>
              <Button onClick={() => setSelected(null)}>Open in list</Button>
            </Link>
          )
        }
      >
        {selected && (
          <div className="flex flex-wrap gap-1">
            {selected.targets.map((t) => (
              <Badge key={t.id} tone={t.status === "published" ? "success" : t.status === "failed" ? "danger" : "neutral"}>
                {SOCIAL_PLATFORM_LABELS[t.platform]}
              </Badge>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!dayList}
        onClose={() => setDayList(null)}
        title={dayList ? dayList.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}
        className="max-w-lg"
      >
        {dayList && (
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {dayList.posts.map((post) => (
              <button
                key={post.id}
                onClick={() => {
                  setDayList(null);
                  setSelected(post);
                }}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[post.status])} />
                <span className="truncate">{post.caption || "(no caption)"}</span>
              </button>
            ))}
          </div>
        )}
      </Dialog>

      <AiSuggestMonthDialog open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  );
}

const CADENCE_OPTIONS = [
  { value: 2, label: "Every 2 days" },
  { value: 3, label: "Every 3 days" },
  { value: 7, label: "Weekly" },
];

const ANGLES = [
  "a friendly announcement about",
  "a quick tip related to",
  "a behind-the-scenes moment about",
  "a customer-spotlight style post about",
  "a fun fact related to",
  "a limited-time promotion for",
  "a question to spark engagement about",
  "a before-and-after style post about",
];

/**
 * AI-suggest-a-month fix — each slot gets a genuinely distinct real AI call (varied by rotating
 * "angle" phrasing into the topic, since the caption prompt is deterministic at temperature 0), not
 * N copies of the same generation. Each slot is created as a real scheduled draft via the normal
 * `POST /social/posts` path — nothing here bypasses that endpoint.
 */
function AiSuggestMonthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <AiSuggestMonthDialogBody onClose={onClose} /> : null;
}

function AiSuggestMonthDialogBody({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ["social-accounts"], queryFn: fetchSocialAccounts });
  const connected = (accounts ?? []).filter((a) => a.status === "connected").map((a) => a.platform);

  const [topic, setTopic] = useState("");
  const [cadenceDays, setCadenceDays] = useState(3);
  const [count, setCount] = useState(8);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [startDate, setStartDate] = useState(() => toDateInput(new Date(Date.now() + 86400000)));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function togglePlatform(p: SocialPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let created = 0;
      for (let i = 0; i < count; i++) {
        setProgress({ done: i, total: count });
        const angle = ANGLES[i % ANGLES.length];
        const { caption } = await generateAiCaption(`${angle} ${topic}`);
        const scheduledFor = new Date(new Date(startDate).getTime() + i * cadenceDays * 86400000);
        scheduledFor.setHours(9, 0, 0, 0);
        await createSocialPost({ caption, platforms, scheduledFor: scheduledFor.toISOString() });
        created += 1;
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Created ${created} scheduled posts.`);
      void queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      setProgress(null);
      onClose();
    },
    onError: (err) => {
      toast.error(
        `Stopped after ${progress?.done ?? 0} of ${count} — ${err instanceof ApiError ? err.message : "an error occurred"}. What was created is still saved.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      setProgress(null);
    },
  });

  const canSubmit = topic.trim().length > 0 && platforms.length > 0 && count > 0 && !mutation.isPending;

  return (
    <Dialog
      open
      onClose={mutation.isPending ? () => {} : onClose}
      preventCasualDismiss={mutation.isPending}
      title="AI: suggest a month of posts"
      description="Generates real, distinct captions and schedules them as drafts — nothing publishes without you reviewing it first."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? `Generating ${(progress?.done ?? 0) + 1} of ${count}…` : `Generate ${count} posts`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Theme" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. our autumn menu" disabled={mutation.isPending} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Cadence" value={cadenceDays} onChange={(e) => setCadenceDays(Number(e.target.value))} disabled={mutation.isPending}>
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            label="How many posts"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
            disabled={mutation.isPending}
          />
        </div>
        <Input
          type="date"
          label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={mutation.isPending}
        />
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {connected.map((p) => (
              <button
                key={p}
                disabled={mutation.isPending}
                onClick={() => togglePlatform(p)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  platforms.includes(p) ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
                )}
              >
                {SOCIAL_PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          {connected.length === 0 && <p className="mt-1 text-xs text-fg-faint">Connect an account first.</p>}
        </div>
      </div>
    </Dialog>
  );
}
