"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Ban, Ticket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchVouchers, issueVoucher, cancelVoucher, type VoucherStatus } from "@/lib/vouchers-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<VoucherStatus, "success" | "neutral" | "danger"> = {
  active: "success",
  redeemed: "neutral",
  cancelled: "danger",
};

export function VouchersPanel({ currency }: { currency: string }) {
  const [issuing, setIssuing] = useState(false);
  const queryClient = useQueryClient();

  const { data: vouchers, isPending, isError, refetch } = useQuery({ queryKey: ["vouchers"], queryFn: fetchVouchers });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelVoucher(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success("Voucher cancelled.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this voucher."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setIssuing(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Issue voucher
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load vouchers" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {vouchers && vouchers.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Ticket} title="No vouchers yet" description="Issue a store-credit voucher a customer can redeem across future visits." />
          </CardContent>
        </Card>
      )}

      {vouchers && vouchers.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Code</th>
                <th className="px-4 py-3 text-start">Balance</th>
                <th className="px-4 py-3 text-start">Expires</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono font-medium text-fg">{v.code}</td>
                  <td className="px-4 py-3 text-fg-muted tabular-nums">
                    {formatCurrency(Number(v.balance), currency)} / {formatCurrency(Number(v.initialValue), currency)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{v.expiresAt ? formatDate(v.expiresAt) : "Never"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-end">
                    {v.status === "active" && (
                      <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(v.id)}>
                        <Ban className="h-3.5 w-3.5" aria-hidden />
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {issuing && <IssueVoucherDialog onClose={() => setIssuing(false)} />}
    </div>
  );
}

function IssueVoucherDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [value, setValue] = useState(20);
  const [expiresAt, setExpiresAt] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);

  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1 && !selected,
  });

  const mutation = useMutation({
    mutationFn: () =>
      issueVoucher({
        code: code.trim() || undefined,
        customerId: selected?.id,
        value,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success("Voucher issued.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't issue this voucher."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Issue a voucher"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={value <= 0 || mutation.isPending}>
            {mutation.isPending ? "Issuing…" : "Issue"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Value" type="number" min={0.01} step={0.01} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <Input label="Code (optional — generated if left blank)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AUTO" />
        <Input label="Expires (optional)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />

        <div>
          <Input
            label="Customer (optional)"
            value={selected ? selected.name : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Search by name or phone…"
          />
          {results && results.length > 0 && !selected && (
            <div className="mt-1.5 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className="flex flex-col items-start px-3 py-2 text-start text-sm hover:bg-surface-2"
                >
                  <span className="text-fg">{c.name}</span>
                  <span className="text-xs text-fg-faint">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
