"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fakeQrCells } from "@/lib/fake-qr";
import { toast } from "@/lib/toast";

type QrFormat = "a5" | "a4" | "sticker";

const FORMAT_DIMENSIONS: Record<QrFormat, string> = {
  a5: "A5 — 148 × 210mm",
  a4: "A4 — 210 × 297mm",
  sticker: "Sticker — 80 × 80mm",
};

export function QrGenerator({ businessName }: { businessName: string }) {
  const [format, setFormat] = useState<QrFormat>("a5");
  const cells = fakeQrCells(`${businessName}-review-qr`);

  function handleDownload(kind: "png" | "pdf") {
    toast.success(`${FORMAT_DIMENSIONS[format]} QR ${kind.toUpperCase()} downloaded (mock).`);
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-6">
        <div className="grid h-32 w-32 grid-cols-7 gap-px rounded bg-fg p-2">
          {cells.map((on, i) => (
            <span key={i} className={on ? "bg-bg" : "bg-fg"} />
          ))}
        </div>
        <p className="text-center text-sm font-medium text-fg">{businessName}</p>
        <p className="text-center text-xs text-fg-faint">Scan to leave a review</p>
      </div>

      <div className="flex flex-col gap-4">
        <Select label="Print format" value={format} onChange={(e) => setFormat(e.target.value as QrFormat)}>
          <option value="a5">A5 poster</option>
          <option value="a4">A4 poster</option>
          <option value="sticker">Sticker</option>
        </Select>
        <p className="text-xs text-fg-faint">{FORMAT_DIMENSIONS[format]}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleDownload("png")}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download PNG
          </Button>
          <Button size="sm" onClick={() => handleDownload("pdf")}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
