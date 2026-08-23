"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Download, Send, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { StatementDialog } from "./statement-dialog";
import { fetchDebtors, generateStatement, sendStatement, bulkGenerateStatements, type LiveDebtor } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

export function StatementsPanel({ currency }: { currency: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<LiveDebtor | null>(null);

  const { data: debtors, isPending, isError, refetch } = useQuery({ queryKey: ["debtors"], queryFn: () => fetchDebtors() });

  const downloadMutation = useMutation({
    mutationFn: (customerId: string) => generateStatement(customerId),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this statement."),
  });

  const sendMutation = useMutation({
    mutationFn: (customerId: string) => sendStatement(customerId),
    onSuccess: () => toast.success("Statement sent."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this statement."),
  });

  const bulkMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkGenerateStatements(customerIds),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.url).length;
      toast.success(`Generated ${ok} of ${results.length} statement(s).`);
      results.forEach((r) => r.url && window.open(r.url, "_blank", "noopener,noreferrer"));
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate statements."),
  });

  function toggle(customerId: string) {
    setSelected((ids) => (ids.includes(customerId) ? ids.filter((i) => i !== customerId) : [...ids, customerId]));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => bulkMutation.mutate(selected)} disabled={selected.length === 0 || bulkMutation.isPending}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Bulk generate ({selected.length})
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load debtors" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {debtors && debtors.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={FileText} title="No statements to generate" description="Customers with an outstanding balance show up here." />
          </CardContent>
        </Card>
      )}
      {debtors && debtors.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {debtors.map((d) => (
            <Card key={d.customerId}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <input type="checkbox" checked={selected.includes(d.customerId)} onChange={() => toggle(d.customerId)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{d.name}</p>
                  <p className="text-xs text-fg-muted">{formatCurrency(d.balance, currency)} outstanding</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewing(d)}>
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    Preview
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => sendMutation.mutate(d.customerId)} disabled={sendMutation.isPending}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Send
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate(d.customerId)} disabled={downloadMutation.isPending}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <StatementDialog debtor={previewing} currency={currency} onClose={() => setPreviewing(null)} />
    </div>
  );
}
