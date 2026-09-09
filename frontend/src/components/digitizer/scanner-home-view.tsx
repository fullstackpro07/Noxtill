"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Camera, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { uploadDigitizerScan, SCANNER_TYPE_LABELS, type DigitizerScannerType } from "@/lib/digitizer-api";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SCANNER_TYPES = Object.keys(SCANNER_TYPE_LABELS) as DigitizerScannerType[];

export function ScannerHomeView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scannerType, setScannerType] = useState<DigitizerScannerType>("receipt");

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDigitizerScan(file, scannerType),
    onSuccess: (preview) => router.push(`/digitizer/review?batch=${preview.batchId}`),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Scanner</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Photograph a receipt, invoice, menu, product label, or ledger page — the AI reads it and stages real records for you to review.</p>
      </div>

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">What are you scanning?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SCANNER_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setScannerType(type)}
              className={cn(
                "rounded-[var(--radius-sm)] border px-3 py-2.5 text-center text-xs font-medium transition-colors",
                scannerType === type ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
              )}
            >
              {SCANNER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="flex w-full flex-col items-center gap-2.5 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-12 text-center transition-colors hover:border-primary disabled:opacity-60"
      >
        {uploadMutation.isPending ? <ScanLine className="h-8 w-8 animate-pulse text-primary" aria-hidden /> : <Camera className="h-8 w-8 text-fg-faint" aria-hidden />}
        <span className="text-sm font-medium text-fg">{uploadMutation.isPending ? "Reading photo…" : "Take a photo or choose a file"}</span>
      </button>
      {uploadMutation.isError && (
        <div className="mt-3">
          <InlineError message={uploadMutation.error instanceof ApiError ? uploadMutation.error.message : "Couldn't read this photo — please try again."} />
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/digitizer/history")}>
          Scan history
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push("/digitizer/settings")}>
          Settings
        </Button>
      </div>
    </div>
  );
}
