"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency } from "@/lib/format";
import { fetchProducts } from "@/lib/products-api";
import { fetchStaffList } from "@/lib/staff-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { ProductFormDrawer } from "./product-form-drawer";
import type { Product } from "@/lib/products";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function ServicesPanel({ currency }: { currency: string }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const { data: products, isPending, isError, refetch } = useQuery({
    queryKey: ["products", "services"],
    queryFn: () => fetchProducts({ kind: "service" }),
  });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const { data: appointments } = useQuery({
    queryKey: ["appointments", "last-90-days"],
    queryFn: () => fetchAppointments({ from: new Date(Date.now() - NINETY_DAYS_MS).toISOString() }),
  });

  const staffNameById = useMemo(() => new Map((staff ?? []).map((s) => [s.id, s.name])), [staff]);

  const bookingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appt of appointments ?? []) {
      counts.set(appt.serviceName, (counts.get(appt.serviceName) ?? 0) + 1);
    }
    return counts;
  }, [appointments]);
  const maxCount = Math.max(...Array.from(bookingCounts.values()), 1);

  if (isError) {
    return <ErrorBanner title="Couldn't load services" onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bookings per service (last 90 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {products.map((p) => {
              const count = bookingCounts.get(p.name) ?? 0;
              return (
                <div key={p.id} className="flex items-center gap-2.5 text-sm">
                  <span className="w-40 shrink-0 truncate text-fg">{p.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-end text-xs tabular-nums text-fg-faint">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {products.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={CalendarClock} title="No services yet" description="Add a product with kind &quot;service&quot; from the Catalog tab." />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {products.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{p.name}</p>
                  <p className="text-xs text-fg-muted">
                    {p.durationMinutes ?? 30} min · {formatCurrency(p.price, currency)}
                    {p.depositRequired && p.depositAmount ? ` · ${formatCurrency(p.depositAmount, currency)} deposit` : ""}
                  </p>
                  <p className="mt-1 text-xs text-fg-faint">
                    {p.eligibleStaffIds && p.eligibleStaffIds.length > 0
                      ? p.eligibleStaffIds.map((id) => staffNameById.get(id) ?? "Unknown").join(", ")
                      : "Any staff"}
                    {(p.bufferBeforeMin || p.bufferAfterMin) && (
                      <span> · buffer {p.bufferBeforeMin ?? 0}m before / {p.bufferAfterMin ?? 0}m after</span>
                    )}
                  </p>
                </div>
                {p.depositRequired && <Badge tone="primary">Deposit required</Badge>}
                <button
                  onClick={() => setEditing(p)}
                  aria-label={`Edit ${p.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProductFormDrawer open={editing != null} onClose={() => setEditing(null)} product={editing} />
    </div>
  );
}
