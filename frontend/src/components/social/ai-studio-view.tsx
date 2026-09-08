"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Copy, ImagePlus, Hash, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { generateAiCaption, generateAiImage, generateAiHashtags, fetchCaptionHistory } from "@/lib/ai-content-api";
import { fetchMediaAssets } from "@/lib/media-library-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

export function AiStudioView() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">AI Content Studio</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Generate a caption, image, or hashtags, then attach it to a post — nothing here publishes on its own.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CaptionGenerator />
        <HashtagGenerator />
        <ImageGenerator />
        <GenerationHistory />
      </div>
    </div>
  );
}

function CaptionGenerator() {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [caption, setCaption] = useState("");

  const mutation = useMutation({
    mutationFn: () => generateAiCaption(topic, tone || undefined),
    onSuccess: ({ caption: generated }) => {
      setCaption(generated);
      void queryClient.invalidateQueries({ queryKey: ["caption-history"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate a caption right now."),
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        Caption generator
      </div>
      <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this post about?" />
      <Input label="Tone (optional)" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. playful, professional" />
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !topic.trim()}>
        {mutation.isPending ? "Generating…" : "Generate caption"}
      </Button>
      {caption && (
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
          <p className="whitespace-pre-wrap text-sm text-fg">{caption}</p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(caption);
                toast.success("Copied.");
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </Button>
            <Link href={`/social/create?caption=${encodeURIComponent(caption)}`}>
              <Button size="sm">Use in new post</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function HashtagGenerator() {
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => generateAiHashtags(caption),
    onSuccess: (result) => setHashtags(result.hashtags),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't suggest hashtags right now."),
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <Hash className="h-4 w-4 text-primary" aria-hidden />
        Hashtag suggester
      </div>
      <Input label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Paste a caption to get hashtag ideas…" />
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !caption.trim()}>
        {mutation.isPending ? "Generating…" : "Suggest hashtags"}
      </Button>
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
          {hashtags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface px-2.5 py-1 text-xs text-fg">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageGenerator() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");

  const mutation = useMutation({
    mutationFn: () => generateAiImage(prompt),
    onSuccess: () => {
      toast.success("Image generated — find it in the Media Library.");
      void queryClient.invalidateQueries({ queryKey: ["ai-image-history"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate an image right now."),
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <ImagePlus className="h-4 w-4 text-primary" aria-hidden />
        Image generator
      </div>
      <Input label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image…" />
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !prompt.trim()}>
        {mutation.isPending ? "Generating…" : "Generate image"}
      </Button>
      {mutation.isSuccess && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mutation.data.url} alt="" className="rounded-[var(--radius-sm)] border border-border" />
          <Link href="/social/media">
            <Button variant="outline" size="sm" className="w-full">
              Open Media Library
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Generation-history fix — real stored captions (`SocialCaptionGeneration`) and real AI-generated images (`MediaAsset` filtered by `source: 'ai_generated'`), not fabricated. */
function GenerationHistory() {
  const captionHistory = useQuery({ queryKey: ["caption-history"], queryFn: fetchCaptionHistory });
  const imageHistory = useQuery({
    queryKey: ["ai-image-history"],
    queryFn: async () => (await fetchMediaAssets("image")).filter((a) => a.source === "ai_generated"),
  });

  const captions = captionHistory.data ?? [];
  const images = (imageHistory.data ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5 lg:col-span-2">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <History className="h-4 w-4 text-primary" aria-hidden />
        Recent generations
      </div>

      {captionHistory.isPending || imageHistory.isPending ? (
        <SkeletonRow />
      ) : captions.length === 0 && images.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-faint">Nothing generated yet — try the tools above.</p>
      ) : (
        <>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((asset) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={asset.id} src={asset.url} alt={asset.prompt ?? ""} title={asset.prompt ?? ""} className="h-14 w-14 rounded-[var(--radius-sm)] border border-border object-cover" />
              ))}
            </div>
          )}
          {captions.length > 0 && (
            <div className="flex flex-col divide-y divide-border">
              {captions.map((gen) => (
                <div key={gen.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{gen.caption}</p>
                    <p className="text-xs text-fg-faint">
                      {gen.topic} · {formatDate(gen.createdAt)}
                    </p>
                  </div>
                  <Link href={`/social/create?caption=${encodeURIComponent(gen.caption)}`} className="shrink-0">
                    <Button variant="ghost" size="sm">
                      Use
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
