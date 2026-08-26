"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchCoupons, createCoupon, updateCoupon, deleteCoupon, type Coupon, type CouponType } from "@/lib/coupons-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function CouponsPanel({ currency }: { currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const queryClient = useQueryClient();

  const { data: coupons, isPending, isError, refetch } = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Coupon deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this coupon."),
  });

  function describeDiscount(c: Coupon) {
    return c.type === "percentage" ? `${Number(c.value)}% off` : `${formatCurrency(Number(c.value), currency)} off`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New coupon
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load coupons" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {coupons && coupons.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Tag} title="No coupons yet" description="Create a discount code customers can redeem at checkout." />
          </CardContent>
        </Card>
      )}

      {coupons && coupons.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Code</th>
                <th className="px-4 py-3 text-start">Discount</th>
                <th className="px-4 py-3 text-start">Used</th>
                <th className="px-4 py-3 text-start">Expires</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono font-medium text-fg">{c.code}</td>
                  <td className="px-4 py-3 text-fg-muted">{describeDiscount(c)}</td>
                  <td className="px-4 py-3 text-fg-muted tabular-nums">
                    {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{c.expiresAt ? formatDate(c.expiresAt) : "Never"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && <CouponFormDialog coupon={editing ?? undefined} onClose={() => (editing ? setEditing(null) : setCreating(false))} />}
    </div>
  );
}

function CouponFormDialog({ coupon, onClose }: { coupon?: Coupon; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<CouponType>(coupon?.type ?? "percentage");
  const [value, setValue] = useState(coupon ? Number(coupon.value) : 10);
  const [minOrderAmount, setMinOrderAmount] = useState(coupon?.minOrderAmount ? Number(coupon.minOrderAmount) : undefined);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(coupon?.maxDiscountAmount ? Number(coupon.maxDiscountAmount) : undefined);
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit ?? undefined);
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState(coupon?.usageLimitPerCustomer ?? undefined);
  const [expiresAt, setExpiresAt] = useState(coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : "");
  const [active, setActive] = useState(coupon?.active ?? true);

  const mutation = useMutation({
    mutationFn: () =>
      coupon
        ? updateCoupon(coupon.id, {
            value,
            minOrderAmount,
            maxDiscountAmount,
            usageLimit,
            usageLimitPerCustomer,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            active,
          })
        : createCoupon({
            code,
            type,
            value,
            minOrderAmount,
            maxDiscountAmount,
            usageLimit,
            usageLimitPerCustomer,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success(coupon ? "Coupon updated." : "Coupon created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this coupon."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={coupon ? "Edit coupon" : "New coupon"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!code.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!!coupon} placeholder="SUMMER10" />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as CouponType)} disabled={!!coupon}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </Select>
        </div>
        <Input label={type === "percentage" ? "Percentage (%)" : "Amount"} type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Min. order amount (optional)"
            type="number"
            min={0}
            value={minOrderAmount ?? ""}
            onChange={(e) => setMinOrderAmount(e.target.value ? Number(e.target.value) : undefined)}
          />
          {type === "percentage" && (
            <Input
              label="Max. discount (optional)"
              type="number"
              min={0}
              value={maxDiscountAmount ?? ""}
              onChange={(e) => setMaxDiscountAmount(e.target.value ? Number(e.target.value) : undefined)}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Total use limit (optional)"
            type="number"
            min={1}
            value={usageLimit ?? ""}
            onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
          />
          <Input
            label="Per-customer limit (optional)"
            type="number"
            min={1}
            value={usageLimitPerCustomer ?? ""}
            onChange={(e) => setUsageLimitPerCustomer(e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <Input label="Expires (optional)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        {coupon && (
          <label className="flex items-center gap-2 text-sm font-medium text-fg">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        )}
      </div>
    </Dialog>
  );
}
