"use client";

import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { useDashboardStore, type DashboardRange } from "@/store/dashboard-store";

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function RangeDropdown() {
  const range = useDashboardStore((s) => s.range);
  const setRange = useDashboardStore((s) => s.setRange);
  const current = RANGES.find((r) => r.value === range) ?? RANGES[1];

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <span className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm font-medium text-fg-muted hover:bg-surface-2">
          {current.label}
          <ChevronDown className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
        </span>
      </DropdownTrigger>
      <DropdownContent>
        {RANGES.map((r) => (
          <DropdownItem key={r.value} active={r.value === range} onSelect={() => setRange(r.value)}>
            <span className="flex-1">{r.label}</span>
            {r.value === range && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}
