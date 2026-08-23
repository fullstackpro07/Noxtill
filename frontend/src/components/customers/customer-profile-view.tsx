"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Download, Trash2, Merge, MessageSquareWarning, Wallet, ShoppingBag, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { MergeCustomerDialog } from "./merge-customer-dialog";
import { CUSTOMER_TAGS, type CustomerTag } from "@/lib/customers";
import { updateCustomer, eraseCustomer, exportCustomer, type CustomerDetail } from "@/lib/customers-api";
import { fetchLedger } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const TAG_TONE: Record<CustomerTag, "primary" | "success" | "warning" | "danger"> = {
  VIP: "primary",
  Regular: "success",
  New: "warning",
  Lapsed: "danger",
};

/** "New" is computed from signup date server-side (BE-041), not a stored tag — nothing to toggle manually. */
const TOGGLEABLE_TAGS = CUSTOMER_TAGS.filter((t) => t !== "New");

const NEW_CUSTOMER_WINDOW_DAYS = 30;
function isNewCustomer(c: CustomerDetail): boolean {
  return Date.now() - new Date(c.createdAt).getTime() <= NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

const FEEDBACK_STATUS_LABEL: Record<CustomerDetail["privateFeedback"][number]["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  href: string;
  tone?: "destructive";
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-fg-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span className={cn("font-display text-lg font-bold", tone === "destructive" ? "text-destructive" : "text-fg")}>{value}</span>
    </Link>
  );
}

export function CustomerProfileView({ customer, currency }: { customer: CustomerDetail; currency: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tags, setTags] = useState<CustomerTag[]>(customer.tags.filter((t): t is CustomerTag => (CUSTOMER_TAGS as string[]).includes(t)));
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [eraseOpen, setEraseOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const { data: ledger } = useQuery({ queryKey: ["ledger", customer.id], queryFn: () => fetchLedger(customer.id) });

  const saveMutation = useMutation({
    mutationFn: () => updateCustomer(customer.id, { tags, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer updated.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save changes — please try again.");
    },
  });

  const eraseMutation = useMutation({
    mutationFn: (confirmPhrase: string) => eraseCustomer(customer.id, confirmPhrase),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${customer.name} erased — history anonymized, audit logged.`);
      router.push("/customers");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't erase this customer — please try again.");
      setEraseOpen(false);
    },
  });

  function toggleTag(tag: CustomerTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const exportMutation = useMutation({
    mutationFn: () => exportCustomer(customer.id),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${customer.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't export this customer's data — please try again.");
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">{customer.name}</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{customer.phone}</p>
          {customer.email && <p className="text-sm text-fg-muted">{customer.email}</p>}
        </div>
        <DropdownMenu>
          <DropdownTrigger>
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2">
              <MoreVertical className="h-4 w-4" aria-hidden />
            </span>
          </DropdownTrigger>
          <DropdownContent className="w-52" align="end">
            <DropdownItem onSelect={() => exportMutation.mutate()}>
              <Download className="h-4 w-4 text-fg-faint" aria-hidden />
              Export customer data
            </DropdownItem>
            <DropdownItem onSelect={() => setMergeOpen(true)}>
              <Merge className="h-4 w-4 text-fg-faint" aria-hidden />
              Merge a duplicate…
            </DropdownItem>
            <DropdownItem onSelect={() => setEraseOpen(true)} className="text-destructive hover:bg-destructive/8">
              <Trash2 className="h-4 w-4" aria-hidden />
              Erase customer
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Wallet} label="Total spent" value={formatCurrency(customer.lifetimeSpend, currency)} href="#purchase-history" />
        <StatCard icon={ShoppingBag} label="Visits" value={String(customer.visitCount)} href="#purchase-history" />
        <StatCard
          icon={Calendar}
          label="Last visit"
          value={customer.lastVisitAt ? formatDate(customer.lastVisitAt) : "—"}
          href="#purchase-history"
        />
        <StatCard
          icon={Wallet}
          label="Credit balance"
          value={ledger ? formatCurrency(ledger.balance, currency) : "…"}
          href={`/credit/${customer.id}`}
          tone={ledger && ledger.balance > 0 ? "destructive" : undefined}
        />
      </div>

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Tags</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {isNewCustomer(customer) && <Badge tone={TAG_TONE.New}>New</Badge>}
          {TOGGLEABLE_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent" : "border-border text-fg-muted hover:bg-surface-2",
                )}
              >
                {active ? <Badge tone={TAG_TONE[tag]}>{tag}</Badge> : tag}
              </button>
            );
          })}
        </div>

        <label htmlFor="customer-notes" className="mb-1.5 block text-sm font-medium text-fg">
          Notes
        </label>
        <textarea
          id="customer-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div id="purchase-history" className="mb-6 scroll-mt-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Purchase history</p>
        {customer.orders.length === 0 ? (
          <p className="text-sm text-fg-faint">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {customer.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="text-fg">
                    #{o.orderNo} · {o.items.map((i) => i.name).join(", ")}
                  </p>
                  <p className="text-xs text-fg-faint">{formatDate(o.createdAt)}</p>
                </div>
                <span className="font-medium tabular-nums text-fg">{formatCurrency(o.total, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Complaints & feedback</p>
        {customer.privateFeedback.length === 0 ? (
          <p className="text-sm text-fg-faint">Nothing on file.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {customer.privateFeedback.map((f) => (
              <li key={f.id} className="flex items-start gap-2.5 text-sm">
                <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-fg">
                    {"★".repeat(f.stars)}
                    {"☆".repeat(5 - f.stars)} <span className="text-fg-faint">· {formatDate(f.createdAt)}</span>{" "}
                    <Badge tone={f.status === "resolved" ? "success" : "neutral"} className="ms-1">
                      {FEEDBACK_STATUS_LABEL[f.status]}
                    </Badge>
                  </p>
                  {f.message && <p className="text-fg-muted">{f.message}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DestructiveConfirmDialog
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        onConfirm={() => eraseMutation.mutate(customer.phone)}
        title={`Erase ${customer.name}?`}
        description="Permanently removes personal details. Purchase history is kept, anonymized, for accounting records. This is audit-logged and cannot be undone."
        confirmPhrase={customer.phone}
        confirmLabel="Erase customer"
        pending={eraseMutation.isPending}
      />

      {mergeOpen && (
        <MergeCustomerDialog
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setMergeOpen(false)}
          onMerged={() => setMergeOpen(false)}
        />
      )}
    </div>
  );
}
