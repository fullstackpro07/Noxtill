"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { decideReconItem, fetchReconciliation, runReconciliation, type ReconItem } from "@/lib/commerce-reconciliation-api";

const KIND_LABEL: Record<ReconItem["kind"], string> = {
  missing_on_provider: "Not found on the store",
  stock_mismatch: "Stock differs",
  no_sku: "No SKU — can't be matched",
};
const KEY = ["commerce-reconciliation"];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Channel-listing reconciliation: compares synced listings with the store; never changes Noxtill's data. */
export function CommerceReconciliationSection() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: fetchReconciliation });
  const run = useMutation({
    mutationFn: runReconciliation,
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: KEY });
      toast.success(result.runs.length === 0 ? "No synced listings to check." : `Checked ${result.runs.length} store(s).`);
    },
    onError: (error) => toast.error(errorMessage(error, "Reconciliation failed.")),
  });
  const decide = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: "resolved" | "dismissed"; note: string }) => decideReconItem(id, status, note),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the item.")),
  });
  const data = query.data;
  const open = (data?.items ?? []).filter((item) => item.status === "open");

  return (
    <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div>
          <p className="m-0 text-sm font-bold">Reconciliation{data ? ` · ${data.openItems} open` : ""}</p>
          {data && (
            <p className="m-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
              {data.checks.presence} {data.checks.stock} <strong>{data.checks.notChecked}</strong> Nothing in Noxtill is changed by a check.
            </p>
          )}
        </div>
        <button type="button" disabled={run.isPending} onClick={() => run.mutate()} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
          {run.isPending ? "Checking…" : "Check stores now"}
        </button>
      </div>
      {data && data.runs.length > 0 && (
        <p className="m-0 px-4 pt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>
          Last checks: {data.runs.slice(0, 3).map((row) => `${row.provider} ${row.status} ${formatDate(row.startedAt)}${row.status === "completed" ? ` (${row.discrepancies} of ${row.listingsChecked})` : row.detail ? ` — ${row.detail}` : ""}`).join(" · ")}
        </p>
      )}
      {query.isLoading ? (
        <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
      ) : open.length === 0 ? (
        <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>{data?.runs.length ? "No open discrepancies." : "No check has run yet."}</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col p-0 text-xs">
          {open.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
              <span>
                <span className="font-semibold">{item.local.name}</span> · {item.provider} · <span style={{ color: "var(--app-warning-text)" }}>{KIND_LABEL[item.kind]}</span>
                {item.kind === "stock_mismatch" && item.remote && ` — Noxtill ${item.local.stockQty}, store ${item.remote.quantity}`}
              </span>
              <span className="flex gap-3">
                {(["resolved", "dismissed"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => {
                      const note = window.prompt(status === "resolved" ? "What did you do to fix it?" : "Why dismiss it?")?.trim();
                      if (note) decide.mutate({ id: item.id, status, note });
                    }}
                    className="font-bold underline"
                    style={{ color: status === "dismissed" ? "var(--app-text-faint)" : undefined }}
                  >
                    {status === "resolved" ? "Mark resolved" : "Dismiss"}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
