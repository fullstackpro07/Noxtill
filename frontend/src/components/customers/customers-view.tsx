"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { SegmentBar } from "./segment-bar";
import { ImportCustomersDialog } from "./import-customers-dialog";
import { CUSTOMER_TAGS, type CustomerTag } from "@/lib/customers";
import { fetchCustomers, type LiveCustomer } from "@/lib/customers-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAG_TONE: Record<CustomerTag, "primary" | "success" | "warning" | "danger"> = {
  VIP: "primary",
  Regular: "success",
  New: "warning",
  Lapsed: "danger",
};

/** Mirrors the backend's segments.service.ts NEW_CUSTOMER_WINDOW_DAYS — "New" isn't a stored tag, it's computed from signup date. */
const NEW_CUSTOMER_WINDOW_DAYS = 30;

function isNewCustomer(c: LiveCustomer): boolean {
  return Date.now() - new Date(c.createdAt).getTime() <= NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function hasTag(c: LiveCustomer, tag: CustomerTag): boolean {
  return tag === "New" ? isNewCustomer(c) : c.tags.includes(tag);
}

export function CustomersView({ currency }: { currency: string }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<CustomerTag | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const {
    data: customers = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))) return false;
      if (activeTag && !hasTag(c, activeTag)) return false;
      return true;
    });
  }, [customers, query, activeTag]);

  const segmentCount = activeTag ? customers.filter((c) => hasTag(c, activeTag)).length : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Customers</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{customers.length} total</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" aria-hidden />
          Import
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="min-w-56 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone…"
            leadingSlot={<Search className="h-4 w-4" aria-hidden />}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOMER_TAGS.map((tag) => {
            const active = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(active ? null : tag)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-muted hover:bg-surface-2",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {activeTag && <SegmentBar tag={activeTag} count={segmentCount} onClear={() => setActiveTag(null)} />}

      {isError ? (
        <ErrorBanner title="Couldn't load customers" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={customers.length === 0 ? "No customers yet" : "No customers match"}
          description={customers.length === 0 ? "Add a customer at checkout or import a list to get started." : "Try a different search or tag."}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Name</th>
                <th className="px-4 py-3 text-start">Tags</th>
                <th className="px-4 py-3 text-start">Total spent</th>
                <th className="px-4 py-3 text-start">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-fg hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-fg-faint">{c.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {isNewCustomer(c) && <Badge tone={TAG_TONE.New}>New</Badge>}
                      {c.tags.map((tag) => (
                        <Badge key={tag} tone={TAG_TONE[tag as CustomerTag] ?? "neutral"}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg">{formatCurrency(c.lifetimeSpend, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.lastVisitAt ? formatDate(c.lastVisitAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportCustomersDialog open={importOpen} onClose={() => setImportOpen(false)} currency={currency} />
    </div>
  );
}
