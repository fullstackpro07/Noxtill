"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCoupons, createCoupon, updateCoupon, fetchCouponDiscountGiven, type Coupon, type CouponType } from "@/lib/coupons-api";
import { fetchVouchers, issueVoucher, cancelVoucher, type Voucher } from "@/lib/vouchers-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { MarketingDrawer, DrawerLabel } from "@/components/marketing/marketing-drawer";

interface OfferRow {
  kind: "Coupon" | "Voucher";
  id: string;
  code: string;
  type: string;
  value: string;
  conditions: string;
  uses: number;
  limit: number | null;
  expiry: string | null;
  status: string;
  bg: string;
  fg: string;
  canDeactivate: boolean;
}

function couponRow(c: Coupon, currency: string): OfferRow {
  const status = c.active ? "Active" : "Inactive";
  return {
    kind: "Coupon",
    id: c.id,
    code: c.code,
    type: c.type === "percentage" ? "Percentage" : "Fixed",
    value: c.type === "percentage" ? `${Number(c.value)}%` : formatCurrency(Number(c.value), currency),
    conditions: c.minOrderAmount ? `Min spend ${formatCurrency(Number(c.minOrderAmount), currency)}` : "None",
    uses: c.usedCount,
    limit: c.usageLimit,
    expiry: c.expiresAt,
    status,
    bg: status === "Active" ? "#E8F7EE" : "#F2F4F7",
    fg: status === "Active" ? "#0E8442" : "#475467",
    canDeactivate: c.active,
  };
}

function voucherRow(v: Voucher, currency: string): OfferRow {
  const status = v.status === "active" ? "Active" : v.status === "redeemed" ? "Redeemed" : "Cancelled";
  return {
    kind: "Voucher",
    id: v.id,
    code: v.code,
    type: "Fixed",
    value: formatCurrency(Number(v.balance), currency),
    conditions: "Gift voucher",
    uses: v.status === "redeemed" ? 1 : 0,
    limit: 1,
    expiry: v.expiresAt,
    status,
    bg: status === "Active" ? "#E8F7EE" : status === "Cancelled" ? "#FEF3F2" : "#F2F4F7",
    fg: status === "Active" ? "#0E8442" : status === "Cancelled" ? "#B42318" : "#475467",
    canDeactivate: v.status === "active",
  };
}

export function OffersView() {
  const session = useSession();
  const currency = session.business.currency;
  const [tab, setTab] = useState<"Coupons" | "Vouchers">("Coupons");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: coupons = [] } = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });
  const { data: vouchers = [] } = useQuery({ queryKey: ["vouchers"], queryFn: fetchVouchers });
  const { data: discountGiven } = useQuery({ queryKey: ["coupon-discount-given"], queryFn: fetchCouponDiscountGiven });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => updateCoupon(id, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Code deactivated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't deactivate this coupon."),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelVoucher(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success("Code deactivated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this voucher."),
  });

  const outstandingValue = useMemo(() => vouchers.filter((v) => v.status === "active").reduce((a, v) => a + Number(v.balance), 0), [vouchers]);
  const activeCodes = coupons.filter((c) => c.active).length + vouchers.filter((v) => v.status === "active").length;
  const redemptions = coupons.reduce((a, c) => a + c.usedCount, 0) + vouchers.filter((v) => v.status === "redeemed").length;

  const rows: OfferRow[] = useMemo(
    () => (tab === "Coupons" ? coupons.map((c) => couponRow(c, currency)) : vouchers.map((v) => voucherRow(v, currency))),
    [tab, coupons, vouchers, currency],
  );
  const filtered = statusFilter === "All statuses" ? rows : rows.filter((r) => r.status === statusFilter);

  const trendBars = [...coupons].sort((a, b) => b.usedCount - a.usedCount).slice(0, 6);
  const maxUsed = Math.max(1, ...trendBars.map((c) => c.usedCount));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Offers &amp; Promotions</h2>
        <span className="flex gap-2">
          {(["Coupons", "Vouchers"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="rounded-full text-[12.5px] font-bold"
              style={{ border: `1px solid ${tab === k ? "var(--app-sidebar-bg)" : "var(--app-border)"}`, background: tab === k ? "var(--app-sidebar-bg)" : "var(--app-surface)", color: tab === k ? "#fff" : "var(--app-text-faint)", padding: "8px 16px", minHeight: 42 }}
            >
              {k}
            </button>
          ))}
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-[11px] text-[12.5px] font-extrabold text-white"
            style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
          >
            {tab === "Coupons" ? "Create Coupon" : "Create Voucher"}
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Active Codes</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{activeCodes}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Redemptions</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{redemptions}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Discount Given</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>{discountGiven ? formatCurrency(discountGiven.discountGiven, currency) : "…"}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Voucher Value Outstanding</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(outstandingValue, currency)}</div>
        </div>
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Redemptions by code</h3>
        {trendBars.length === 0 ? (
          <div className="flex h-[128px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No coupons yet.</div>
        ) : (
          <svg viewBox="0 0 620 128" style={{ width: "100%", height: 128, display: "block" }}>
            {trendBars.map((c, i) => {
              const slot = (620 - 44) / trendBars.length;
              const h = (c.usedCount / maxUsed) * 92;
              const x = 34 + i * slot + slot * 0.18;
              const w = slot * 0.64;
              return (
                <g key={c.id}>
                  <rect x={x} y={112 - h} width={w} height={h} rx={5} fill="#BFE7CF" />
                  <text x={x + w / 2} y={122} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{c.code}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2" style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All statuses</option>
            <option>Active</option>
            {tab === "Coupons" ? <option>Inactive</option> : <><option>Redeemed</option><option>Cancelled</option></>}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Create a coupon or gift voucher</div>
            <div className="mt-[15px] flex flex-wrap justify-center gap-[9px]">
              <button type="button" onClick={() => { setTab("Coupons"); setCreating(true); }} className="rounded-[12px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 20px", minHeight: 46 }}>
                Create Coupon
              </button>
              <button type="button" onClick={() => { setTab("Vouchers"); setCreating(true); }} className="rounded-[12px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 20px", minHeight: 46 }}>
                Create Voucher
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 940 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Code</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Value</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Conditions</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Uses / Limit</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Expiry</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 800, color: "var(--app-success-text)", fontFamily: "ui-monospace,monospace" }}>{r.code}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{r.type}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{r.value}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{r.conditions}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "center" }}>{r.uses}{r.limit != null ? ` / ${r.limit}` : ""}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-disabled)", whiteSpace: "nowrap" }}>{r.expiry ? formatDate(r.expiry) : "Never"}</td>
                    <td style={{ padding: 12 }}>
                      <span className="rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: r.bg, color: r.fg }}>{r.status}</span>
                    </td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      {r.canDeactivate && (
                        <button
                          type="button"
                          onClick={() => (r.kind === "Coupon" ? deactivateMutation.mutate(r.id) : cancelMutation.mutate(r.id))}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-faintest)", padding: "8px 12px", minHeight: 40 }}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && tab === "Coupons" && <CouponFormDialog onClose={() => setCreating(false)} />}
      {creating && tab === "Vouchers" && <IssueVoucherDialog onClose={() => setCreating(false)} />}
    </main>
  );
}

function CouponFormDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percentage");
  const [value, setValue] = useState(10);
  const [minOrderAmount, setMinOrderAmount] = useState<number | undefined>();
  const [usageLimit, setUsageLimit] = useState<number | undefined>();
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createCoupon({ code, type, value, minOrderAmount, usageLimit, startsAt: new Date(validFrom).toISOString(), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Coupon saved and active.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this coupon."),
  });

  const previewValue = type === "percentage" ? `${value || 0}% off` : `${formatCurrency(value || 0, session.business.currency)} off`;
  const previewConditions = minOrderAmount ? ` · min spend ${formatCurrency(minOrderAmount, session.business.currency)}` : "";

  return (
    <MarketingDrawer
      title="Create Coupon"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 16px", minHeight: 46 }}>
            Cancel
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!code.trim() || mutation.isPending} className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
            {mutation.isPending ? "Saving…" : "Save Coupon"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Code</DrawerLabel>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className="w-full rounded-[11px] text-[14px] font-extrabold" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48, fontFamily: "ui-monospace,monospace" }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Discount type</DrawerLabel>
          <select value={type} onChange={(e) => setType(e.target.value as CouponType)} className="w-full rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48, color: "var(--app-text-muted)" }}>
            <option value="percentage">Percent</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
        <div>
          <DrawerLabel>Value</DrawerLabel>
          <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} placeholder="10" className="w-full rounded-[11px] text-[14px] font-extrabold" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Minimum spend</DrawerLabel>
          <input type="number" min={0} value={minOrderAmount ?? ""} onChange={(e) => setMinOrderAmount(e.target.value ? Number(e.target.value) : undefined)} placeholder="1000" className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
        </div>
        <div>
          <DrawerLabel>Usage limit</DrawerLabel>
          <input type="number" min={1} value={usageLimit ?? ""} onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)} placeholder="200" className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Valid from</DrawerLabel>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 11, minHeight: 46 }} />
        </div>
        <div>
          <DrawerLabel>Valid until</DrawerLabel>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)", padding: 11, minHeight: 46 }} />
        </div>
      </div>
      <div className="flex justify-center rounded-[14px]" style={{ background: "var(--app-bg)", padding: 16 }}>
        <div className="text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-primary)", borderRadius: 13, padding: 16, minWidth: 210 }}>
          <div className="text-[10px] font-extrabold uppercase tracking-[.6px]" style={{ color: "var(--app-text-disabled)" }}>Coupon preview</div>
          <div className="mt-2 text-[22px] font-extrabold" style={{ color: "var(--app-success-text)", fontFamily: "ui-monospace,monospace" }}>{code || "CODE10"}</div>
          <div className="mt-1.5 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{previewValue}{previewConditions}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{expiresAt ? `Valid until ${formatDate(expiresAt)}` : "No expiry set"}</div>
        </div>
      </div>
    </MarketingDrawer>
  );
}

const VOUCHER_PRESETS = [2000, 5000, 10000];

function IssueVoucherDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const [value, setValue] = useState(2000);
  const [customValue, setCustomValue] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);

  const { data: results } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 1 && !selected });

  const mutation = useMutation({
    mutationFn: () => issueVoucher({ customerId: selected?.id, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success("Voucher created and sent with its terms.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't issue this voucher."),
  });

  return (
    <MarketingDrawer
      title="Issue a voucher"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "12px 16px", minHeight: 46 }}>
            Cancel
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={value <= 0 || mutation.isPending} className="flex-1 rounded-[11px] text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)", padding: 12, minHeight: 46 }}>
            {mutation.isPending ? "Creating…" : "Review terms & create"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Amount</DrawerLabel>
        <div className="flex flex-wrap gap-2">
          {VOUCHER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => { setValue(preset); setCustomValue(""); }}
              className="rounded-[11px] text-[12.5px]"
              style={{ border: `1px solid ${value === preset ? "var(--app-primary)" : "var(--app-border)"}`, background: value === preset ? "var(--app-bg)" : "transparent", color: value === preset ? "var(--app-success-text)" : "var(--app-text-muted)", fontWeight: value === preset ? 800 : 700, padding: "11px 16px" }}
            >
              {formatCurrency(preset, session.business.currency)}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={customValue}
          onChange={(e) => { setCustomValue(e.target.value); setValue(Number(e.target.value) || 0); }}
          placeholder="Or enter a custom amount"
          className="mt-2.5 w-full rounded-[11px] text-[13px]"
          style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }}
        />
      </div>
      <div>
        <DrawerLabel>Recipient phone</DrawerLabel>
        <input
          value={selected ? selected.name : query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder="03XX XXXXXXX"
          className="w-full rounded-[11px] text-[13.5px]"
          style={{ border: "1px solid var(--app-border)", padding: 12, minHeight: 48 }}
        />
        {results && results.length > 0 && !selected && (
          <div className="mt-1.5 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[10px]" style={{ border: "1px solid var(--app-border)" }}>
            {results.map((c) => (
              <button key={c.id} type="button" onClick={() => setSelected(c)} className="flex flex-col items-start px-3 py-2 text-start text-[12.5px]" style={{ color: "var(--app-text)" }}>
                <span>{c.name}</span>
                <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-center rounded-[14px]" style={{ background: "var(--app-bg)", padding: 16 }}>
        <div className="text-center text-white" style={{ background: "var(--app-sidebar-bg)", borderRadius: 14, padding: 18, minWidth: 230 }}>
          <div className="text-[10px] font-extrabold uppercase tracking-[.6px]" style={{ color: "var(--app-new-badge-fg)" }}>Gift voucher</div>
          <div className="mt-2 text-[26px] font-extrabold" style={{ letterSpacing: "-.7px" }}>{formatCurrency(value || 0, session.business.currency)}</div>
          <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--app-sidebar-fg)" }}>{session.business.name}</div>
          <div className="mt-2.5 text-[10.5px]" style={{ color: "#8EA3B4", fontFamily: "ui-monospace,monospace" }}>Code generated on save</div>
        </div>
      </div>
    </MarketingDrawer>
  );
}
