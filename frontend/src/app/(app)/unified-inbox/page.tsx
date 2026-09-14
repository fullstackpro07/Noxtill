import { Inbox } from "lucide-react";

/** Placeholder — full pixel-perfect build lands in the dedicated Unified Inbox redesign pass. */
export default function UnifiedInboxPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-success-bg)]">
        <Inbox className="h-6 w-6 text-[var(--app-primary)]" aria-hidden />
      </span>
      <h1 className="text-lg font-bold text-[var(--app-text)]">Unified Inbox</h1>
      <p className="max-w-sm text-sm text-[var(--app-text-faint)]">
        This module&apos;s redesigned page is coming in the next build pass.
      </p>
    </div>
  );
}
