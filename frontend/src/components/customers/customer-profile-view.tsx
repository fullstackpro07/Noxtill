"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Download, Trash2, Star, MessageSquareWarning, Wallet, ShoppingBag, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { CUSTOMER_TAGS, type Customer, type CustomerTag } from "@/lib/customers";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const TAG_TONE: Record<CustomerTag, "primary" | "success" | "warning" | "danger"> = {
  VIP: "primary",
  Regular: "success",
  New: "warning",
  Lapsed: "danger",
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

export function CustomerProfileView({ customer, currency }: { customer: Customer; currency: string }) {
  const router = useRouter();
  const [tags, setTags] = useState<CustomerTag[]>(customer.tags);
  const [notes, setNotes] = useState(customer.notes);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [erasing, setErasing] = useState(false);

  function toggleTag(tag: CustomerTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleSaveNotes() {
    toast.success("Customer updated. Live save wires up in INT-006.");
  }

  function handleExport() {
    toast.success(`${customer.name}'s data exported. Live export wires up in INT-006.`);
  }

  async function handleErase() {
    setErasing(true);
    await new Promise((r) => setTimeout(r, 700));
    setErasing(false);
    setEraseOpen(false);
    toast.success(`${customer.name} erased — history anonymized, audit logged. Live erase wires up in INT-006.`);
    router.push("/customers");
  }

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
            <DropdownItem onSelect={handleExport}>
              <Download className="h-4 w-4 text-fg-faint" aria-hidden />
              Export customer data
            </DropdownItem>
            <DropdownItem onSelect={() => setEraseOpen(true)} className="text-destructive hover:bg-destructive/8">
              <Trash2 className="h-4 w-4" aria-hidden />
              Erase customer
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Wallet} label="Total spent" value={formatCurrency(customer.totalSpent, currency)} href="#purchase-history" />
        <StatCard icon={ShoppingBag} label="Visits" value={String(customer.visitCount)} href="#purchase-history" />
        <StatCard icon={Calendar} label="Last visit" value={formatDate(customer.lastVisit)} href="#purchase-history" />
        <StatCard
          icon={Wallet}
          label="Credit balance"
          value={formatCurrency(customer.creditBalance, currency)}
          href="/credit"
          tone={customer.creditBalance > 0 ? "destructive" : undefined}
        />
      </div>

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Tags</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CUSTOMER_TAGS.map((tag) => {
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
          <Button size="sm" onClick={handleSaveNotes}>
            Save changes
          </Button>
        </div>
      </div>

      <div id="purchase-history" className="mb-6 scroll-mt-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Purchase history</p>
        {customer.purchaseHistory.length === 0 ? (
          <p className="text-sm text-fg-faint">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {customer.purchaseHistory.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="text-fg">{h.description}</p>
                  <p className="text-xs text-fg-faint">{formatDate(h.date)}</p>
                </div>
                <span className="font-medium tabular-nums text-fg">{formatCurrency(h.amount, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">Reviews & complaints</p>
        {customer.reviews.length === 0 ? (
          <p className="text-sm text-fg-faint">No reviews or complaints on file.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {customer.reviews.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 text-sm">
                {r.type === "review" ? (
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                ) : (
                  <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-fg">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)} <span className="text-fg-faint">· {formatDate(r.date)}</span>
                  </p>
                  <p className="text-fg-muted">{r.snippet}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DestructiveConfirmDialog
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        onConfirm={handleErase}
        title={`Erase ${customer.name}?`}
        description="Permanently removes personal details. Purchase history is kept, anonymized, for accounting records. This is audit-logged and cannot be undone."
        confirmPhrase={customer.phone}
        confirmLabel="Erase customer"
        pending={erasing}
      />
    </div>
  );
}
