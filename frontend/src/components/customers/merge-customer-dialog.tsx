"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCustomers, mergeCustomer, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function MergeCustomerDialog({
  customerId,
  customerName,
  onClose,
  onMerged,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const queryClient = useQueryClient();

  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1,
  });
  const candidates = (results ?? []).filter((r) => r.id !== customerId);

  const mutation = useMutation({
    mutationFn: () => mergeCustomer(customerId, selected!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast.success(`Merged "${selected!.name}" into ${customerName}.`);
      onMerged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't merge these customers."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Merge a duplicate into ${customerName}`}
      description="The duplicate's orders, credit history, appointments, and everything else move onto this customer, then the duplicate is deleted. This can't be undone."
      preventCasualDismiss
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!selected || mutation.isPending}>
            {mutation.isPending ? "Merging…" : "Merge"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Find the duplicate by name or phone"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search…"
          autoFocus
        />
        {candidates.length > 0 && !selected && (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
            {candidates.map((c) => (
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
        {selected && (
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-destructive/8 px-3.5 py-2.5 text-sm">
            <div>
              <p className="font-medium text-fg">{selected.name}</p>
              <p className="text-xs text-fg-faint">{selected.phone}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-fg-muted hover:text-fg">
              Change
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
