"use client";

import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomerTag } from "@/lib/customers";
import { toast } from "@/lib/toast";

export function SegmentBar({ tag, count, onClear }: { tag: CustomerTag; count: number; onClear: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-primary/30 bg-primary/6 px-4 py-3">
      <p className="text-sm text-fg">
        <span className="font-semibold text-fg">{count}</span> customer{count === 1 ? "" : "s"} tagged{" "}
        <span className="font-semibold text-fg">{tag}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => toast.info(`Segment "${tag}" (${count} customers) ready — campaign builder wires up in FE-030.`)}
        >
          <Megaphone className="h-3.5 w-3.5" aria-hidden />
          Start campaign
        </Button>
        <button
          onClick={onClear}
          aria-label="Clear segment"
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
