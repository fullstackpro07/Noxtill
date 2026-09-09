"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, Sparkles, Upload, TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchKeywords,
  addKeyword,
  removeKeyword,
  triggerKeywordCheck,
  bulkAddKeywords,
  suggestKeywords,
  fetchKeywordHistory,
  MAX_TRACKED_KEYWORDS,
  type TrackedKeywordRow,
} from "@/lib/keywords-api";
import { fetchCompetitorsRaw } from "@/lib/competitors-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const BUCKETS = [
  { label: "Top 3", test: (r: number | null) => r != null && r <= 3 },
  { label: "4–10", test: (r: number | null) => r != null && r > 3 && r <= 10 },
  { label: "11–20", test: (r: number | null) => r != null && r > 10 && r <= 20 },
  { label: "Unranked", test: (r: number | null) => r == null },
];

export function KeywordRankingsView() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [historyKeyword, setHistoryKeyword] = useState<TrackedKeywordRow | null>(null);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["keywords"], queryFn: fetchKeywords });
  const { data: competitors } = useQuery({ queryKey: ["competitors"], queryFn: fetchCompetitorsRaw });
  const trackedNames = new Set((competitors ?? []).map((c) => c.name.trim().toLowerCase()));

  const addMutation = useMutation({
    mutationFn: addKeyword,
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["keywords"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't track this keyword."),
  });

  const removeMutation = useMutation({
    mutationFn: removeKeyword,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["keywords"] }),
  });

  const checkMutation = useMutation({
    mutationFn: triggerKeywordCheck,
    onSuccess: () => {
      toast.success("Rank check complete.");
      void queryClient.invalidateQueries({ queryKey: ["keywords"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't check this keyword's rank right now."),
  });

  const atLimit = (data?.length ?? 0) >= MAX_TRACKED_KEYWORDS;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Keyword Rankings</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Track up to {MAX_TRACKED_KEYWORDS} local-search keywords and your Google rank for each.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSuggestOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden />
            AI suggest
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden />
            Bulk import
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load tracked keywords" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Plus} title="No keywords tracked yet" description="Add one below, or let AI suggest some." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {BUCKETS.map((b) => (
              <div key={b.label} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-3 text-center">
                <p className="font-display text-xl font-bold text-fg">{data.filter((k) => b.test(k.latestRank)).length}</p>
                <p className="text-xs text-fg-faint">{b.label}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Keyword</th>
                  <th className="px-4 py-2 font-medium">Position</th>
                  <th className="px-4 py-2 font-medium">Change</th>
                  <th className="px-4 py-2 font-medium">Search interest</th>
                  <th className="px-4 py-2 font-medium">Top result</th>
                  <th className="px-4 py-2 font-medium">Last checked</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.map((k) => {
                  const isTrackedCompetitor = k.topResultTitle != null && trackedNames.has(k.topResultTitle.trim().toLowerCase());
                  return (
                    <tr key={k.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <button onClick={() => setHistoryKeyword(k)} className="text-fg hover:underline">
                          {k.keyword}
                        </button>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-fg">{k.latestRank != null ? `#${k.latestRank}` : "Not ranked"}</td>
                      <td className="px-4 py-2">
                        <RankChange latest={k.latestRank} previous={k.previousRank} />
                      </td>
                      <td className="px-4 py-2">
                        {k.searchInterest != null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${k.searchInterest}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-fg-muted">{k.searchInterest}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {k.topResultTitle ? (
                          <span className="inline-flex max-w-40 items-center gap-1 truncate text-xs text-fg-muted" title={k.topResultTitle}>
                            {isTrackedCompetitor && <Trophy className="h-3 w-3 shrink-0 text-accent-foreground" aria-hidden />}
                            <span className="truncate">{k.topResultTitle}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-fg-faint">{k.lastCheckedAt ? new Date(k.lastCheckedAt).toLocaleDateString() : "Never"}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => checkMutation.mutate(k.id)} disabled={checkMutation.isPending} aria-label={`Check rank for ${k.keyword}`}>
                            <RefreshCw className={cn("h-3.5 w-3.5", checkMutation.isPending && "animate-spin")} aria-hidden />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(k.id)} aria-label={`Remove ${k.keyword}`}>
                            <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mb-4 text-xs text-fg-faint">
            Search interest is Google Trends&apos; relative 0–100 index, not an exact search-volume count — no freely accessible API
            provides that. Top result is whoever currently ranks #1 organically (
            <Trophy className="inline h-3 w-3 text-accent-foreground" aria-hidden /> marks one of your tracked competitors); a true
            keyword-difficulty score would need proprietary backlink data no API exposes, so it isn&apos;t shown.
          </p>
        </>
      )}

      {!atLimit && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft.trim() && addMutation.mutate(draft.trim()))}
            placeholder="Add a keyword to track…"
            className="flex-1"
          />
          <Button onClick={() => draft.trim() && addMutation.mutate(draft.trim())} disabled={!draft.trim() || addMutation.isPending}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        </div>
      )}

      <BulkImportDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <SuggestDialog open={suggestOpen} onClose={() => setSuggestOpen(false)} />
      <HistoryDialog keyword={historyKeyword} onClose={() => setHistoryKeyword(null)} />
    </div>
  );
}

function RankChange({ latest, previous }: { latest: number | null; previous: number | null }) {
  if (latest == null || previous == null) return <Minus className="h-3.5 w-3.5 text-fg-faint" aria-hidden />;
  const delta = previous - latest;
  if (delta === 0) return <Minus className="h-3.5 w-3.5 text-fg-faint" aria-hidden />;
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-whatsapp">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden /> {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-destructive">
      <TrendingDown className="h-3.5 w-3.5" aria-hidden /> {Math.abs(delta)}
    </span>
  );
}

function BulkImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      bulkAddKeywords(
        text
          .split(/[\n,]/)
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    onSuccess: (result) => {
      toast.success(
        result.skipped.length > 0
          ? `Added ${result.created.length}, skipped ${result.skipped.length} (already tracked or over the cap).`
          : `Added ${result.created.length} keywords.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["keywords"] });
      setText("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't import these keywords."),
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Bulk import keywords"
      description="One per line, or comma-separated."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!text.trim() || mutation.isPending}>
            {mutation.isPending ? "Importing…" : "Import"}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"best pizza near me\npizza delivery downtown\n..."}
        className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </Dialog>
  );
}

function SuggestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [seedTopic, setSeedTopic] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suggestMutation = useMutation({
    mutationFn: () => suggestKeywords(seedTopic || undefined),
    onSuccess: (result) => {
      setSuggestions(result.suggestions);
      if (result.suggestions.length === 0) toast.info("No suggestions came back — try a different focus topic.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate suggestions right now."),
  });

  const addMutation = useMutation({
    mutationFn: () => bulkAddKeywords([...selected]),
    onSuccess: (result) => {
      toast.success(`Added ${result.created.length} keyword${result.created.length === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["keywords"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add these keywords."),
  });

  function toggle(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  }

  function handleClose() {
    setSeedTopic("");
    setSuggestions([]);
    setSelected(new Set());
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="AI keyword suggestions"
      description="Grounded in your business name and listed categories."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => addMutation.mutate()} disabled={selected.size === 0 || addMutation.isPending}>
            {addMutation.isPending ? "Adding…" : `Add ${selected.size || ""} selected`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input value={seedTopic} onChange={(e) => setSeedTopic(e.target.value)} placeholder="Focus topic (optional)" className="flex-1" />
          <Button onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending}>
            {suggestMutation.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((kw) => (
              <button
                key={kw}
                onClick={() => toggle(kw)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  selected.has(kw) ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
                )}
              >
                {kw}
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function HistoryDialog({ keyword, onClose }: { keyword: TrackedKeywordRow | null; onClose: () => void }) {
  return keyword ? <HistoryDialogBody keyword={keyword} onClose={onClose} /> : null;
}

function HistoryDialogBody({ keyword, onClose }: { keyword: TrackedKeywordRow; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["keyword-history", keyword.id], queryFn: () => fetchKeywordHistory(keyword.id) });
  const points = (data ?? []).filter((p) => p.rank != null) as { rank: number; capturedAt: string }[];

  return (
    <Dialog open onClose={onClose} title={keyword.keyword} description="Position history, most recent checks">
      {points.length < 2 ? (
        <p className="py-4 text-center text-sm text-fg-faint">Not enough checks yet to chart a trend.</p>
      ) : (
        <PositionHistoryChart points={points} />
      )}
    </Dialog>
  );
}

function PositionHistoryChart({ points }: { points: { rank: number; capturedAt: string }[] }) {
  const width = 400;
  const height = 120;
  const ranks = points.map((p) => p.rank);
  const min = Math.min(...ranks, 1);
  const max = Math.max(...ranks, 10);
  const span = max - min || 1;
  // Inverted: rank 1 (best) at the top.
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: ((p.rank - min) / span) * height,
  }));
  const path = coords.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Rank position over time">
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>#{points[0].rank}</span>
        <span>
          #{points[points.length - 1].rank} · {new Date(points[points.length - 1].capturedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
