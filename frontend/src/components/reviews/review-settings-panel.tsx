"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchReviewSettings, updateReviewSettings, type ReviewSettings } from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const PLATFORM_OPTIONS = [
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "yelp", label: "Yelp" },
  { value: "other", label: "Other" },
];

export function ReviewSettingsPanel() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent>
          <ErrorBanner title="Couldn't load review settings" onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  return <ReviewSettingsForm data={data} />;
}

function ReviewSettingsForm({ data }: { data: ReviewSettings }) {
  const queryClient = useQueryClient();

  const [publicReviewUrl, setPublicReviewUrl] = useState(data.publicReviewUrl ?? "");
  const [publicReviewPlatform, setPublicReviewPlatform] = useState(data.publicReviewPlatform ?? "google");
  const [reminderDayOffsets, setReminderDayOffsets] = useState<number[]>(
    data.reminderDayOffsets && data.reminderDayOffsets.length > 0 ? data.reminderDayOffsets : [3, 7],
  );
  const [replyTemplates, setReplyTemplates] = useState<{ lang: string; text: string }[]>(() => {
    const entries = Object.entries(data.replyTemplates ?? {}).map(([lang, text]) => ({ lang, text }));
    return entries.length > 0 ? entries : [{ lang: "en", text: "" }];
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReviewSettings({
        publicReviewUrl,
        publicReviewPlatform,
        reminderDayOffsets: reminderDayOffsets.filter((n) => n > 0),
        replyTemplates: Object.fromEntries(replyTemplates.filter((t) => t.lang.trim() && t.text.trim()).map((t) => [t.lang.trim(), t.text.trim()])),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      toast.success("Review settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-3.5 p-5">
          <p className="text-sm font-medium text-fg">Public review destination</p>
          <p className="text-xs text-fg-faint">
            Where a 4-5★ rating gets redirected to post publicly. Leave the URL blank to keep every rating private for now.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Select value={publicReviewPlatform} onChange={(e) => setPublicReviewPlatform(e.target.value)} className="w-40">
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Input
              value={publicReviewUrl}
              onChange={(e) => setPublicReviewUrl(e.target.value)}
              placeholder="https://g.page/your-business/review"
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-fg">Reminder timing</p>
          <p className="text-xs text-fg-faint">Days after the original request that an unanswered review request gets a follow-up (max 2 reminders).</p>
          <div className="flex flex-wrap items-center gap-2">
            {reminderDayOffsets.map((day, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={day}
                  onChange={(e) =>
                    setReminderDayOffsets((prev) => prev.map((d, idx) => (idx === i ? Number(e.target.value) : d)))
                  }
                  className="w-20"
                />
                <span className="text-xs text-fg-faint">days</span>
                {reminderDayOffsets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setReminderDayOffsets((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove reminder"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {reminderDayOffsets.length < 3 && (
              <Button variant="ghost" size="sm" onClick={() => setReminderDayOffsets((prev) => [...prev, 10])}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add reminder
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-fg">Reply templates</p>
          <p className="text-xs text-fg-faint">Pre-fills the reply box in your inbox — never sent automatically.</p>
          {replyTemplates.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                value={t.lang}
                onChange={(e) => setReplyTemplates((prev) => prev.map((x, idx) => (idx === i ? { ...x, lang: e.target.value } : x)))}
                placeholder="en"
                className="w-20"
              />
              <textarea
                value={t.text}
                onChange={(e) => setReplyTemplates((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                rows={2}
                placeholder="Thanks so much for your kind words!"
                className="flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              {replyTemplates.length > 1 && (
                <button
                  type="button"
                  onClick={() => setReplyTemplates((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove template"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setReplyTemplates((prev) => [...prev, { lang: "", text: "" }])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add language
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
