import { ShieldAlert } from "lucide-react";

export function BillingDisclaimerStrip() {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-3.5 py-3 text-xs text-fg-muted">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
      Ad spend is billed directly by the platform to your own payment method — no billing touches Noxtill&apos;s systems.
    </div>
  );
}
