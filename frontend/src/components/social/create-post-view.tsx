"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Sparkles, Hash, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { MediaPickerDialog } from "@/components/social/media-picker-dialog";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  fetchSocialAccounts,
  type SocialPlatform,
} from "@/lib/social-accounts-api";
import { createSocialPost, updateSocialPost, fetchSocialPost, type SocialPost } from "@/lib/social-posts-api";
import { generateAiCaption, generateAiHashtags } from "@/lib/ai-content-api";
import { fetchMediaAssets, type MediaAsset } from "@/lib/media-library-api";
import { fetchSocialSettings, type SocialSettings } from "@/lib/social-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const CAPTION_MAX = 2000;

export function CreatePostView() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const prefillDate = searchParams.get("date");

  const postQuery = useQuery({
    queryKey: ["social-post", editId],
    queryFn: () => fetchSocialPost(editId!),
    enabled: !!editId,
  });
  const mediaListQuery = useQuery({ queryKey: ["media-assets"], queryFn: () => fetchMediaAssets(), enabled: !!editId });
  const settingsQuery = useQuery({ queryKey: ["social-settings"], queryFn: fetchSocialSettings });
  const accountsQuery = useQuery({ queryKey: ["social-accounts"], queryFn: fetchSocialAccounts });

  const stillLoading =
    (!!editId && (postQuery.isPending || mediaListQuery.isPending)) || settingsQuery.isPending || accountsQuery.isPending;

  if (editId && postQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="Couldn't load this post" onRetry={() => postQuery.refetch()} />
      </div>
    );
  }

  if (stillLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  const editingPost = postQuery.data;
  if (editId && editingPost && editingPost.status !== "draft") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="This post can no longer be edited" description="Only drafts can be edited — it's since been scheduled or published." />
      </div>
    );
  }

  const initialMedia = editingPost
    ? editingPost.mediaKeys.map((key) => (mediaListQuery.data ?? []).find((a) => a.key === key)).filter((a): a is MediaAsset => !!a)
    : [];

  return (
    <PostForm
      key={editingPost?.id ?? "new"}
      editingPost={editingPost ?? null}
      initialMedia={initialMedia}
      settings={settingsQuery.data!}
      connectedPlatforms={new Set((accountsQuery.data ?? []).filter((a) => a.status === "connected").map((a) => a.platform))}
      prefillDate={prefillDate}
    />
  );
}

function PostForm({
  editingPost,
  initialMedia,
  settings,
  connectedPlatforms,
  prefillDate,
}: {
  editingPost: SocialPost | null;
  initialMedia: MediaAsset[];
  settings: SocialSettings;
  connectedPlatforms: Set<SocialPlatform>;
  prefillDate: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const rules = settings.autoPostRules as { defaultPlatforms?: SocialPlatform[]; defaultHashtagSet?: string };

  const [caption, setCaption] = useState(() => {
    if (editingPost) return editingPost.caption;
    return (searchParams.get("caption") ?? "").slice(0, CAPTION_MAX);
  });
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(() =>
    editingPost ? editingPost.targets.map((t) => t.platform) : (rules.defaultPlatforms ?? []),
  );
  const [media, setMedia] = useState<MediaAsset[]>(initialMedia);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(() => {
    if (editingPost?.scheduledFor) return toDatetimeLocal(editingPost.scheduledFor);
    if (prefillDate) return `${prefillDate}T09:00`;
    return "";
  });
  const [aiTopic, setAiTopic] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);

  const captionMutation = useMutation({
    mutationFn: () => generateAiCaption(aiTopic || "our business today"),
    onSuccess: ({ caption: generated }) => {
      setCaption(generated);
      setAiOpen(false);
      toast.success("Caption generated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate a caption right now."),
  });

  const hashtagMutation = useMutation({
    mutationFn: () => generateAiHashtags(caption),
    onSuccess: ({ hashtags }) => setHashtagSuggestions(hashtags),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't suggest hashtags right now."),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        caption,
        mediaKeys: media.map((m) => m.key),
        platforms,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      };
      return editingPost ? updateSocialPost(editingPost.id, input) : createSocialPost(input);
    },
    onSuccess: (post) => {
      toast.success(post.status === "scheduled" ? "Post scheduled." : "Saved as draft.");
      void queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["social-posts-queue"] });
      router.push(post.status === "scheduled" ? "/social/scheduled" : "/social/drafts");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this post — please try again."),
  });

  function togglePlatform(p: SocialPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function toggleMedia(asset: MediaAsset) {
    setMedia((prev) => (prev.some((m) => m.key === asset.key) ? prev.filter((m) => m.key !== asset.key) : [...prev, asset]));
  }

  function appendHashtag(tag: string) {
    if (caption.includes(tag)) return;
    setCaption((prev) => (prev.trim().length ? `${prev.trim()} ${tag}` : tag).slice(0, CAPTION_MAX));
  }

  function applyDefaultHashtagSet() {
    const setName = rules.defaultHashtagSet;
    if (!setName) return;
    const tags = settings.hashtagSets[setName] ?? [];
    if (tags.length === 0) return;
    setCaption((prev) => `${prev.trim()} ${tags.join(" ")}`.trim().slice(0, CAPTION_MAX));
    toast.success(`Added your "${setName}" hashtags.`);
  }

  const canSubmit = caption.trim().length > 0 && platforms.length > 0 && !saveMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">{editingPost ? "Edit Draft" : "Create Post"}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Compose once, publish to every platform you select.</p>
      </div>

      <div className="flex flex-col gap-5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="post-caption" className="text-sm font-medium text-fg">
              Caption
            </label>
            <div className="flex gap-1">
              {rules.defaultHashtagSet && (
                <Button variant="ghost" size="sm" onClick={applyDefaultHashtagSet}>
                  <Hash className="h-3.5 w-3.5" aria-hidden />
                  Add brand hashtags
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setAiOpen((v) => !v)}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                AI generate
              </Button>
            </div>
          </div>
          {aiOpen && (
            <div className="mb-2 flex gap-2">
              <Input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="What's this post about?"
                className="flex-1"
              />
              <Button size="sm" onClick={() => captionMutation.mutate()} disabled={captionMutation.isPending}>
                {captionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Generate"}
              </Button>
            </div>
          )}
          <textarea
            id="post-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
            rows={5}
            placeholder="Write your caption…"
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <div className="mt-1 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => hashtagMutation.mutate()} disabled={hashtagMutation.isPending || !caption.trim()}>
              {hashtagMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Hash className="h-3.5 w-3.5" aria-hidden />}
              Suggest hashtags
            </Button>
            <p className="text-end text-xs text-fg-faint">
              {caption.length} / {CAPTION_MAX}
            </p>
          </div>
          {hashtagSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hashtagSuggestions.map((tag) => (
                <button
                  key={tag}
                  onClick={() => appendHashtag(tag)}
                  className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-fg hover:bg-surface-2"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-fg">Media</p>
          <div className="flex flex-wrap gap-2">
            {media.map((asset) => (
              <div key={asset.id} className="relative h-16 w-16 overflow-hidden rounded-[var(--radius-sm)] border border-border">
                {asset.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-fg-faint">Video</div>
                )}
                <button
                  onClick={() => toggleMedia(asset)}
                  aria-label="Remove"
                  className="absolute end-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            ))}
            <button
              onClick={() => setPickerOpen(true)}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-border-strong text-fg-faint hover:bg-surface-2"
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
              <span className="text-[10px]">Add</span>
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-fg">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const connected = connectedPlatforms.has(p);
              const selected = platforms.includes(p);
              return (
                <button
                  key={p}
                  disabled={!connected}
                  onClick={() => togglePlatform(p)}
                  title={connected ? undefined : "Not connected yet"}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    !connected && "cursor-not-allowed opacity-40",
                    selected ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
                  )}
                >
                  {SOCIAL_PLATFORM_LABELS[p]}
                </button>
              );
            })}
          </div>
          {connectedPlatforms.size === 0 && (
            <p className="mt-2 text-xs text-fg-faint">
              No accounts connected yet — <a href="/social" className="text-primary underline">connect one first</a>.
            </p>
          )}
        </div>

        <Input
          type="datetime-local"
          label="Schedule for (optional)"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          hint="Leave empty to save as a draft — you can publish it immediately from Drafts."
        />

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex flex-wrap gap-1">
            {platforms.map((p) => (
              <Badge key={p} tone="primary">
                {SOCIAL_PLATFORM_LABELS[p]}
              </Badge>
            ))}
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSubmit}>
            {saveMutation.isPending ? "Saving…" : scheduledFor ? "Schedule post" : "Save as draft"}
          </Button>
        </div>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedKeys={media.map((m) => m.key)}
        onToggle={toggleMedia}
      />
    </div>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
