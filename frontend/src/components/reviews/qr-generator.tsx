"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { generateQrPoster, type QrPosterFormat, type QrPosterFileType } from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const FORMAT_DIMENSIONS: Record<QrPosterFormat, string> = {
  a5: "A5 — 148 × 210mm",
  a4: "A4 — 210 × 297mm",
  sticker: "Sticker — 80 × 80mm",
};

export function QrGenerator({ businessName, businessSlug }: { businessName: string; businessSlug: string }) {
  const [format, setFormat] = useState<QrPosterFormat>("a5");
  // Safe to read directly (no SSR/hydration concern): this component only ever mounts after a
  // user clicks into the "Grow" tab, which is itself a post-hydration client-side interaction —
  // it can never be part of the server-rendered HTML in the first place.
  const targetUrl = `${window.location.origin}/rq/${businessSlug}`;

  const downloadMutation = useMutation({
    mutationFn: (fileType: QrPosterFileType) => generateQrPoster({ format, fileType, targetUrl }),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the poster — please try again.");
    },
  });

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-6">
        <div className="flex h-32 w-32 items-center justify-center rounded bg-white p-2">
          <QRCodeSVG value={targetUrl} size={112} level="M" marginSize={0} />
        </div>
        <p className="text-center text-sm font-medium text-fg">{businessName}</p>
        <p className="text-center text-xs text-fg-faint">Scan to leave a review</p>
      </div>

      <div className="flex flex-col gap-4">
        <Select label="Print format" value={format} onChange={(e) => setFormat(e.target.value as QrPosterFormat)}>
          <option value="a5">A5 poster</option>
          <option value="a4">A4 poster</option>
          <option value="sticker">Sticker</option>
        </Select>
        <p className="text-xs text-fg-faint">{FORMAT_DIMENSIONS[format]}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadMutation.mutate("png")}
            disabled={downloadMutation.isPending}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {downloadMutation.isPending ? "Generating…" : "Download PNG"}
          </Button>
          <Button size="sm" onClick={() => downloadMutation.mutate("pdf")} disabled={downloadMutation.isPending}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {downloadMutation.isPending ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
