"use client";

import { AlertTriangle } from "lucide-react";

/** Exception Center — deliberately not built out yet. The design's whole premise is comparing
 * each order against "its promise" (a delivery ETA, a kitchen prep-time target, a payment
 * follow-up window) and ranking what's overdue against that promise. None of that exists in the
 * schema today — there's no per-order-type SLA/promise-time configuration anywhere in the app, and
 * inventing one (e.g. a hardcoded "30 minutes for dine-in") would mean labeling a made-up number
 * as "the customer's promise," which is exactly the kind of fabrication this rebuild avoids
 * elsewhere. Real, honest exceptions (unpaid orders sitting too long, stalled quotations) could be
 * built once "promise time" is a real, configurable concept — this screen says so instead of
 * faking it. */
export function ExceptionCenterView() {
  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Exception Center</h2>
      <div className="rounded-[16px] p-[48px_24px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "var(--app-warning-bg)" }}>
          <AlertTriangle className="h-[23px] w-[23px]" style={{ color: "var(--app-warning-text)" }} aria-hidden />
        </div>
        <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Not available yet</div>
        <p className="mx-auto mt-2 max-w-[46ch] text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>
          This screen is meant to flag orders that broke a promised time — a delivery ETA, a kitchen prep target, a payment follow-up window. That
          &quot;promise&quot; isn&apos;t a real, configurable thing anywhere in the app yet, so rather than invent a threshold and label it as your
          business&apos;s promise, this stays off until that&apos;s real.
        </p>
      </div>
    </main>
  );
}
