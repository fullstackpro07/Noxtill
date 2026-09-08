"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Check, ImageOff, Images } from "lucide-react";
import { fetchMediaAssets, type MediaAsset } from "@/lib/media-library-api";
import { cn } from "@/lib/utils";

export function MediaPickerDialog({
  open,
  onClose,
  selectedKeys,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  selectedKeys: string[];
  onToggle: (asset: MediaAsset) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["media-assets"],
    queryFn: () => fetchMediaAssets(),
    enabled: open,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose media"
      description="Select one or more images or videos from your library."
      className="max-w-2xl"
      footer={<Button onClick={onClose}>Done ({selectedKeys.length} selected)</Button>}
    >
      {isPending ? (
        <div className="flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load your media library.</p>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={ImageOff} title="No media yet" description="Upload or AI-generate an image from the Media Library." />
      ) : (
        <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {data.map((asset) => {
            const selected = selectedKeys.includes(asset.key);
            return (
              <button
                key={asset.id}
                onClick={() => onToggle(asset)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-[var(--radius-sm)] border-2",
                  selected ? "border-primary" : "border-transparent",
                )}
              >
                {asset.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-2">
                    <Images className="h-6 w-6 text-fg-faint" aria-hidden />
                  </div>
                )}
                {selected && (
                  <span className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
