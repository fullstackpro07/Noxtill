"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchReviewSettings, updateReviewSettings, uploadReviewLogo, removeReviewLogo } from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DEFAULT_BRAND_COLOR = "#0c4b3b";

/** UPD-FE-086: actually rendered on the public rating page, the review widget, and the QR poster — not just stored. */
export function BrandingEditor({ businessName }: { businessName: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });
  const [pendingColor, setPendingColor] = useState<string | null>(null);

  const brandColor = pendingColor ?? settings?.brandColor ?? DEFAULT_BRAND_COLOR;

  const colorMutation = useMutation({
    mutationFn: (color: string) => updateReviewSettings({ brandColor: color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      setPendingColor(null);
    },
    onError: (err) => {
      setPendingColor(null);
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the brand color — please try again.");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadReviewLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      toast.success("Logo updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't upload this logo — please try again."),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeReviewLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      toast.success("Logo removed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this logo — please try again."),
  });

  function handleColorChange(color: string) {
    setPendingColor(color);
    colorMutation.mutate(color);
  }

  function handleFileSelected(file: File) {
    uploadMutation.mutate(file);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-fg">Branding</p>
          <p className="text-xs text-fg-faint">Shown on your public rating page, review widget, and QR poster.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-fg" htmlFor="review-brand-color">
                Brand colour
              </label>
              <input
                id="review-brand-color"
                type="color"
                value={brandColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-[var(--radius-sm)] border border-border-strong"
              />
              <span className="font-mono text-xs text-fg-faint">{brandColor}</span>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Logo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  {uploadMutation.isPending ? "Uploading…" : settings?.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {settings?.logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Rating page preview</p>
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL, not a local/optimizable asset
              <img src={settings.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full font-bold text-[#faf7f0]"
                style={{ background: brandColor }}
              >
                {businessName.slice(0, 1)}
              </div>
            )}
            <button
              type="button"
              disabled
              className="rounded-full px-4 py-2 text-xs font-medium text-[#faf7f0]"
              style={{ background: brandColor }}
            >
              Send privately
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
