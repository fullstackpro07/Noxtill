"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { InlineError } from "@/components/shared/error-states";
import { exportPayroll } from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

export function PayrollView() {
  const session = useSession();
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);

  const mutation = useMutation({
    mutationFn: () => exportPayroll(month),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Payroll export ready — opening in a new tab.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export — please try again."),
  });

  if (session.user.role !== "owner") {
    return <PermissionLockCard description="Payroll export is limited to the business owner." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm text-fg-muted">
          Generates a real payroll workbook — hours, overtime, commission, and any outstanding advances deducted (oldest first). Advances
          netted this way are marked deducted and won&apos;t be deducted again.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-48">
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Download className="h-4 w-4" aria-hidden />
            {mutation.isPending ? "Generating…" : "Export payroll"}
          </Button>
        </div>
        {mutation.isError && (
          <div className="mt-3">
            <InlineError message={mutation.error instanceof ApiError ? mutation.error.message : "Couldn't generate this export — please try again."} />
          </div>
        )}
      </div>

      {mutation.data && mutation.data.warnings.length > 0 && (
        <div className="rounded-[var(--radius-noxtill)] border border-accent/30 bg-accent/6 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-accent-foreground" aria-hidden />
            <p className="text-sm font-medium text-fg">{mutation.data.warnings.length} warning(s) in this export</p>
          </div>
          <ul className="flex flex-col gap-1 ps-1 text-sm text-fg-muted">
            {mutation.data.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
