"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldAlert } from "lucide-react";
import { useBranchContextStore } from "@/store/branch-context-store";
import { askBranchAdvisor } from "@/lib/branches-api";
import { ApiError } from "@/lib/api-client";

const DEFAULT_QUESTION = "How is this branch performing overall, and what's one thing I should focus on to improve it?";

/** Answers for whichever branch is currently selected (X-Branch, attached automatically by apiFetch) — refetches whenever that selection changes. */
export function BranchAdvisorCard() {
  const selectedBranchId = useBranchContextStore((s) => s.selectedBranchId);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["branch-advisor", selectedBranchId],
    queryFn: () => askBranchAdvisor(DEFAULT_QUESTION),
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-primary/25 bg-primary/[0.04] p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" aria-hidden />
        Branch advisor
      </div>
      {isPending && <p className="text-sm text-fg-faint">Thinking…</p>}
      {isError && (
        <p className="text-sm text-fg-faint">
          {error instanceof ApiError ? error.message : "Couldn't reach the advisor — please try again."}
        </p>
      )}
      {data && <p className="text-sm text-fg">{data.answer}</p>}
      <div className="mt-3 flex items-start gap-1.5 text-xs text-fg-faint">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {data?.disclaimer ?? "Based on your own branch data only — never a competitor's or another business's numbers."}
      </div>
    </div>
  );
}
