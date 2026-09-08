"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UploadCloud, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchListingPhotos,
  createListingPhoto,
  deleteListingPhoto,
  updateListingPhoto,
  pushListingPhoto,
  type ListingPhoto,
  type ListingPhotoCategory,
} from "@/lib/listing-photos-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const CATEGORIES: { key: ListingPhotoCategory; label: string }[] = [
  { key: "exterior", label: "Exterior" },
  { key: "interior", label: "Interior" },
  { key: "team", label: "Team" },
  { key: "products", label: "Products" },
  { key: "logo", label: "Logo" },
];

export function ListingPhotosView() {
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<ListingPhotoCategory | "all">("all");
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["listing-photos"], queryFn: fetchListingPhotos });

  const filtered = filter === "all" ? data : data?.filter((p) => p.category === filter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Photos &amp; Media</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Manage photos once, push them to every connected directory.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add photo
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {CATEGORIES.map((c) => (
          <FilterChip key={c.key} label={c.label} active={filter === c.key} onClick={() => setFilter(c.key)} />
        ))}
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load photos" onRetry={() => refetch()} />
      ) : isPending || !filtered ? (
        <div className="flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No photos yet" description="Add a photo and push it out to every connected directory." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      )}

      {addOpen && <AddPhotoDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "bg-surface-2 text-fg-muted hover:text-fg"}`}
    >
      {label}
    </button>
  );
}

function PhotoCard({ photo }: { photo: ListingPhoto }) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["listing-photos"] });
  }

  const categoryMutation = useMutation({
    mutationFn: (category: ListingPhotoCategory) => updateListingPhoto(photo.id, category),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this photo."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteListingPhoto(photo.id),
    onSuccess: invalidate,
  });

  const pushMutation = useMutation({
    mutationFn: () => pushListingPhoto(photo.id),
    onSuccess: (results) => {
      invalidate();
      if (results.length === 0) {
        toast.info("No connected directory currently supports pushing photos.");
      } else {
        const failed = results.filter((r) => r.status === "failed").length;
        toast.success(failed > 0 ? `Pushed with ${failed} failure(s) — see connected directories.` : "Photo pushed.");
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't push this photo."),
  });

  return (
    <div className="group relative flex flex-col gap-2 rounded-[var(--radius-noxtill)] border border-border bg-surface p-2">
      <div className="relative aspect-square overflow-hidden rounded-[6px] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external directory-photo URLs, not a local/optimized asset */}
        <img src={photo.url} alt={photo.category} className="h-full w-full object-cover" />
        <button
          onClick={() => deleteMutation.mutate()}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
          aria-label="Delete photo"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <select
        value={photo.category}
        onChange={(e) => categoryMutation.mutate(e.target.value as ListingPhotoCategory)}
        className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-fg"
      >
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          {photo.pushedProviders.map((p) => (
            <Badge key={p} tone="success">
              {p}
            </Badge>
          ))}
        </div>
        <button
          onClick={() => pushMutation.mutate()}
          disabled={pushMutation.isPending}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2"
          aria-label="Push to directories"
        >
          <UploadCloud className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function AddPhotoDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<ListingPhotoCategory>("exterior");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createListingPhoto({ url, category }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing-photos"] });
      toast.success("Photo added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this photo — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add photo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!url.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Photo URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as ListingPhotoCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
    </Dialog>
  );
}
