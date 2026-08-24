"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function PricingBillingToggle({ yearly, onChange }: { yearly: boolean; onChange: (yearly: boolean) => void }) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <span className={cn("font-display text-base font-medium", yearly ? "text-fg-faint" : "text-fg")}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          aria-label="Bill yearly"
          onClick={() => onChange(!yearly)}
          className={cn(
            "relative h-[38px] w-[74px] rounded-full border bg-white p-0 transition-colors",
            yearly ? "border-accent-hover" : "border-[#dbe6e1]",
          )}
        >
          <span
            className={cn(
              "absolute top-1 block size-7 rounded-full transition-[left,background-color] duration-200",
              yearly ? "left-10 bg-accent-hover" : "left-1 bg-[#c8d3ce]",
            )}
          />
        </button>
        <span className={cn("font-display text-base font-medium", yearly ? "text-fg" : "text-fg-faint")}>Yearly</span>
        <span className="rounded-full bg-primary/8 px-3.5 py-1.5 text-[13.5px] font-medium text-accent-hover">Save 20%</span>
      </div>
      <div className="inline-flex items-center gap-2.5 text-[14.5px] text-fg-muted">
        <Check className="size-4 text-accent-hover" aria-hidden />
        14-day free trial <span className="text-border-strong">•</span> No credit card required
      </div>
    </div>
  );
}
