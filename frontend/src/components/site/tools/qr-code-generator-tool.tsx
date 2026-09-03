"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { Download, QrCode } from "lucide-react";

const inputClass =
  "h-11 w-full rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function QrCodeGeneratorTool() {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const valid = isValidUrl(url);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${label.trim() || "noxtill-qr-code"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
          <QrCode className="h-4.5 w-4.5 text-accent" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold text-fg">Generate your QR code</span>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-fg">Destination link (booking page, review link, anything)</span>
            <input
              type="url"
              inputMode="url"
              className={inputClass}
              placeholder="https://your-business.com/book"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {url && !valid ? <span className="text-xs text-destructive">Enter a full link starting with https://</span> : null}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-fg">Label (optional, for the downloaded file name)</span>
            <input type="text" className={inputClass} placeholder="e.g. booking-qr" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={download}
            disabled={!valid}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary text-[14px] font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden /> Download PNG
          </button>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#eef0ef] bg-surface-2 p-6">
          {valid ? (
            <QRCodeCanvas ref={canvasRef} value={url} size={160} level="M" marginSize={2} />
          ) : (
            <div className="flex h-[160px] w-[160px] items-center justify-center rounded-lg border border-dashed border-border-strong text-center text-[11.5px] text-fg-faint">
              Enter a link to preview
            </div>
          )}
          <span className="text-[11px] text-fg-faint">Live preview</span>
        </div>
      </div>

      <p className="mt-6 text-[12.5px] leading-relaxed text-fg-faint">
        Works for any link — your Noxtill booking page, your Google review link, a menu, anything. Print it, or see{" "}
        <Link href="/product/bookings" className="text-primary hover:underline">
          Bookings
        </Link>{" "}
        for how customers land straight in your diary.
      </p>
    </div>
  );
}
