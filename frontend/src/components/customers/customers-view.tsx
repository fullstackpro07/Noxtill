"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentBar } from "./segment-bar";
import { CUSTOMERS, CUSTOMER_TAGS, type CustomerTag } from "@/lib/customers";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAG_TONE: Record<CustomerTag, "primary" | "success" | "warning" | "danger"> = {
  VIP: "primary",
  Regular: "success",
  New: "warning",
  Lapsed: "danger",
};

export function CustomersView({ currency }: { currency: string }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<CustomerTag | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CUSTOMERS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))) return false;
      if (activeTag && !c.tags.includes(activeTag)) return false;
      return true;
    });
  }, [query, activeTag]);

  const segmentCount = activeTag ? CUSTOMERS.filter((c) => c.tags.includes(activeTag)).length : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Customers</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{CUSTOMERS.length} total</p>
        </div>
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

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No customers match" description="Try a different search or tag." />
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
                      {c.tags.map((tag) => (
                        <Badge key={tag} tone={TAG_TONE[tag]}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg">{formatCurrency(c.totalSpent, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(c.lastVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
