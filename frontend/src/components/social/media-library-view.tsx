"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Sparkles, Trash2, Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchMediaAssets,
  uploadMediaAsset,
  generateMediaImage,
  deleteMediaAsset,
  type MediaAsset,
} from "@/lib/media-library-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function MediaLibraryView() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["media-assets"], queryFn: () => fetchMediaAssets() });

  const uploadMutation = useMutation({
    mutationFn: uploadMediaAsset,
    onSuccess: () => {
      toast.success("Uploaded.");
      void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't upload this file."),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateMediaImage(prompt),
    onSuccess: () => {
      toast.success("Image generated.");
      setGenOpen(false);
      setPrompt("");
      void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate an image right now."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMediaAsset,
    onSuccess: () => {
      toast.success("Deleted.");
      void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this asset."),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Media Library</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Photos and videos ready to attach to a post.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            Upload
          </Button>
          <Button onClick={() => setGenOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden />
            AI generate
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load your media library" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Images} title="No media yet" description="Upload a file or generate one with AI." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((asset) => (
            <MediaCard key={asset.id} asset={asset} onDelete={() => deleteMutation.mutate(asset.id)} />
          ))}
        </div>
      )}

      <Dialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate an image"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generateMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !prompt.trim()}>
              {generateMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </>
        }
      >
        <Input label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image…" autoFocus />
      </Dialog>
    </div>
  );
}

function MediaCard({ asset, onDelete }: { asset: MediaAsset; onDelete: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <div className="aspect-square bg-surface-2">
        {asset.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-faint">Video</div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-2">
        <Badge tone={asset.source === "ai_generated" ? "primary" : "neutral"} className="truncate">
          {asset.source === "ai_generated" ? "AI" : "Upload"} · used {asset.usageCount}×
        </Badge>
        <button onClick={onDelete} aria-label="Delete" className="text-fg-faint hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
