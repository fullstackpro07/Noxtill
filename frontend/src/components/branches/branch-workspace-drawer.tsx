"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Building2, Sparkles, Pencil, Boxes, Users2, CalendarCheck, ArrowLeftRight, LineChart } from "lucide-react";
import { useSession } from "@/lib/session";
import { fetchRollupDashboard } from "@/lib/branches-api";
import { fetchBranchAdvisorAnswer } from "@/lib/branch-scoped-api";
import { formatCurrency } from "@/lib/format";
import { computeOpenStatus } from "@/lib/branch-hours";
import { useBranchesScope } from "@/components/branches/branches-context";
import { useBranchWorkspace, type BranchWorkspace } from "@/components/branches/use-branch-workspace";
import { BR, Chip, type Tone } from "@/components/branches/branches-ui";

const SECTIONS = ["Overview", "Sales", "Orders", "Products", "Inventory", "Customers", "Bookings", "Staff", "Credit", "Reviews", "Profit", "Activity", "Settings"] as const;
type Section = (typeof SECTIONS)[number];

export function BranchWorkspaceDrawer({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;
  const { periodDays } = useBranchesScope();
  const [section, setSection] = useState<Section>("Overview");
  const [askedAnswer, setAskedAnswer] = useState<string | null>(null);

  const { data: ws, isPending, isError } = useBranchWorkspace(branchId);
  const { data: rollup } = useQuery({ queryKey: ["rollup-dashboard", periodDays], queryFn: () => fetchRollupDashboard(periodDays) });
  const rollupRow = rollup?.branches.find((b) => b.businessId === branchId);

  const askMutation = useMutation({
    mutationFn: () => fetchBranchAdvisorAnswer(branchId, "What's the one thing I should focus on at this branch right now, and why?"),
    onSuccess: (r) => setAskedAnswer(r.answer),
  });

  const margin = rollupRow && rollupRow.revenue > 0 ? (rollupRow.grossProfit / rollupRow.revenue) * 100 : null;
  const isTrading = !!rollupRow && (rollupRow.revenue > 0 || rollupRow.ordersCount > 0);
  const healthTone: Tone = !isTrading ? "blue" : margin == null ? "neutral" : margin < 18 ? "red" : margin < 22 ? "amber" : "green";
  const healthLabel = !isTrading ? "Opening" : margin == null ? "—" : margin < 18 ? "At Risk" : margin < 22 ? "Watch" : "Healthy";
  const openStatus = ws ? computeOpenStatus(ws.branch) : null;

  const sectionData = useMemo(() => (ws ? sectionFor(section, ws, rollupRow, currency) : null), [section, ws, rollupRow, currency]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(12,23,39,.38)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 820, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div style={{ width: 48, height: 48, flex: "0 0 48px", borderRadius: 13, background: healthTone === "red" ? "#FEF3F2" : healthTone === "amber" ? "#FEF6E7" : healthTone === "blue" ? "#EEF4FF" : "#E8F7EE", color: healthTone === "red" ? "#B42318" : healthTone === "amber" ? "#B54708" : healthTone === "blue" ? "#3538CD" : "#0E8442", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.015em" }}>{ws?.branch.name ?? "Loading…"}</div>
            <div style={{ fontSize: 11.5, color: BR.textDim, marginTop: 3 }}>{ws ? `${ws.branch.country ?? "—"} · ${ws.branch.currency}` : ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
              {openStatus && (
                <Chip tone={openStatus.isOpen ? "green" : "neutral"} style={{ height: 23 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: openStatus.isOpen ? "#12A150" : "#94A3B8" }} />
                  <span>{openStatus.label}</span>
                </Chip>
              )}
              {ws && (
                <Chip tone={healthTone} style={{ height: 23 }}>
                  <span>Health: {healthLabel}</span>
                </Chip>
              )}
              {margin != null && (
                <Chip tone={margin >= 20 ? "green" : margin >= 17 ? "amber" : "red"} style={{ height: 23 }}>
                  Margin {margin.toFixed(1)}%
                </Chip>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: BR.textDim, cursor: "pointer", border: 0, background: "transparent" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "14px 20px", background: "#FBFAFF", borderBottom: "1px solid #F0F2F5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={14} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#6D28D9" }}>What should I do?</div>
            {!askedAnswer && (
              <button type="button" onClick={() => askMutation.mutate()} disabled={askMutation.isPending} style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: 8, border: "1px solid #DDD3FE", background: "#fff", color: "#6D28D9", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                {askMutation.isPending ? "Thinking…" : "Ask"}
              </button>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "#45505F", lineHeight: 1.55, marginTop: askedAnswer || askMutation.isPending ? 10 : 6 }}>
            {askedAnswer ?? (askMutation.isPending ? "Thinking…" : "Ask the real branch advisor, scoped to just this branch's own records.")}
          </div>
        </div>

        <div className="nx-scroll" style={{ display: "flex", gap: 3, padding: "0 20px", borderBottom: "1px solid #F0F2F5", overflowX: "auto" }}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              style={{ padding: "11px 9px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontWeight: section === s ? 700 : 600, color: section === s ? BR.text : BR.textMuted, boxShadow: section === s ? "inset 0 -2px 0 #12A150" : "none", background: "transparent", border: 0 }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {isPending && <div style={{ fontSize: 12.5, color: BR.textFaint }}>Loading…</div>}
          {isError && <div style={{ fontSize: 12.5, color: "#B42318" }}>Couldn&apos;t load this branch&apos;s workspace.</div>}
          {sectionData && (
            <>
              <div style={{ border: `1px solid ${BR.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: "1px solid #F0F2F5" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: BR.textDim }}>{sectionData.lineage}</div>
                </div>
                {sectionData.rows.map(([label, value], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", borderTop: i === 0 ? "none" : "1px solid #F0F2F5", background: i % 2 ? "#FCFCFD" : "#fff" }}>
                    <div style={{ fontSize: 12, color: BR.textMuted, fontWeight: 600, flex: "0 0 44%" }}>{label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", flex: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                  </div>
                ))}
              </div>
              {sectionData.bullets.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: BR.textFaint, marginBottom: 10 }}>{sectionData.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {sectionData.bullets.map((b, i) => (
                      <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: BR.primary, marginTop: 6, flex: "0 0 6px" }} />
                        <div style={{ fontSize: 12.5, color: "#45505F", lineHeight: 1.55 }}>{b}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ border: `1px solid ${BR.border}`, background: "#FCFCFD", borderRadius: 12, padding: 13, fontSize: 11.5, color: BR.textMuted, lineHeight: 1.55 }}>{sectionData.note}</div>
            </>
          )}
        </div>

        <div className="nx-scroll" style={{ padding: "12px 20px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", display: "flex", gap: 7, overflowX: "auto" }}>
          {[
            { label: "Edit branch", icon: Pencil, onClick: () => router.push(`/branches/${branchId}/settings`) },
            { label: "View inventory", icon: Boxes, onClick: () => router.push("/branches/inventory") },
            { label: "View staff", icon: Users2, onClick: () => router.push("/branches/staff") },
            { label: "View bookings", icon: CalendarCheck, onClick: () => router.push("/branches/bookings") },
            { label: "Compare branches", icon: LineChart, onClick: () => router.push("/branches/performance") },
            { label: "Create transfer", icon: ArrowLeftRight, onClick: () => router.push("/branches/transfers") },
          ].map((a) => (
            <button key={a.label} type="button" onClick={a.onClick} style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${BR.borderStrong}`, background: "#fff", color: "#45505F" }}>
              <a.icon size={14} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SectionResult {
  lineage: string;
  rows: [string, string][];
  title: string;
  bullets: string[];
  note: string;
}

function sectionFor(name: Section, ws: BranchWorkspace, rollupRow: { revenue: number; grossProfit: number; ordersCount: number; customerCount: number; creditOutstanding: number } | undefined, currency: string): SectionResult {
  const m = (n: number) => formatCurrency(n, currency);
  const trading = !!rollupRow && (rollupRow.revenue > 0 || rollupRow.ordersCount > 0);

  switch (name) {
    case "Overview":
      return {
        lineage: "This period, from Branches' own record plus the modules that own each figure",
        rows: [
          ["Country", ws.branch.country ?? "—"],
          ["Currency", ws.branch.currency],
          ["Timezone", ws.branch.timezone],
          ["Revenue", trading ? m(rollupRow!.revenue) : "Not trading yet"],
          ["Profit", trading ? m(rollupRow!.grossProfit) : "—"],
          ["Orders", trading ? String(rollupRow!.ordersCount) : "—"],
          ["Customers", String(ws.customers.count)],
          ["Staff", String(ws.staff.length)],
          ["Products listed", String(ws.products.total)],
        ],
        title: "Health is not a black box",
        bullets: [
          trading ? "Health combines revenue, margin, inventory state and open bookings" : "This branch is excluded from performance comparison because it has not started trading",
          "Each input is visible in its own section, so you can check the reasoning",
        ],
        note: "Branches owns the branch record. Every figure above is read from the module that owns it.",
      };
    case "Sales":
      return {
        lineage: "From Fast Sale / Orders",
        rows: ws.orders
          ? [
              ["Orders today", String(ws.orders.today.total)],
              ["Completed today", String(ws.orders.today.completed)],
              ["Revenue collected today", m(ws.orders.today.revenuePaid)],
              ["Pending today", String(ws.orders.today.pending)],
            ]
          : [["Sales", "Not available"]],
        title: "What this counts",
        bullets: ["Revenue is recognised at the sale, whether or not cash has been collected yet", "Sales are owned by Orders — Branches references them"],
        note: "Click through to Orders for the full transaction list.",
      };
    case "Orders":
      return {
        lineage: "From Orders",
        rows: ws.orders
          ? [
              ["Total today", String(ws.orders.today.total)],
              ["In progress", String(ws.orders.today.inProgress)],
              ["Cancelled today", String(ws.orders.today.cancelled)],
              ["Completed today", String(ws.orders.today.completed)],
            ]
          : [["Orders", "Not available"]],
        title: "Branch attribution",
        bullets: ["An order belongs to the branch that fulfils it", "Orders remains the source of truth for order state"],
        note: "Orders owns the record — this is the branch's own today's snapshot.",
      };
    case "Products":
      return {
        lineage: "From Products",
        rows: [
          ["Products at this branch", String(ws.products.total)],
          ["Active", String(ws.products.active)],
          ["Inactive", String(ws.products.total - ws.products.active)],
        ],
        title: "Branch-level catalog",
        bullets: ["A product exists once and is made available per branch", "Availability here does not change the product definition anywhere else"],
        note: "Products owns the catalog. This is what this location currently offers.",
      };
    case "Inventory": {
      const low = ws.inventory.filter((i) => i.status === "low_stock").length;
      const out = ws.inventory.filter((i) => i.status === "out_of_stock").length;
      const value = ws.inventory.reduce((a, i) => a + i.stockValue, 0);
      return {
        lineage: "From Inventory",
        rows: [
          ["Stock value at cost", m(value)],
          ["Lines tracked", String(ws.inventory.length)],
          ["Low stock", String(low)],
          ["Out of stock", String(out)],
        ],
        title: out > 0 || low > 0 ? "Stock needs attention" : "Stock position",
        bullets: out > 0 || low > 0 ? ["Some lines are below their reorder point at this branch", "A transfer moves stock only after approval — never automatically"] : ["Stock cover is comfortable across the assortment"],
        note: "Inventory owns stock quantity. Branches shows the branch view and requests movements.",
      };
    }
    case "Customers":
      return {
        lineage: "From Customers (CRM)",
        rows: [
          ["Customers served", String(ws.customers.count)],
          ["New this month", String(ws.customers.newThisMonth)],
          ["Lifetime spend, combined", m(ws.customers.totalLifetimeSpend)],
        ],
        title: "One customer, several branches",
        bullets: ["A customer who visits two branches is one record, counted once in the business total", "Branch customer counts therefore overlap and must not be added together"],
        note: "Customers owns the record — Branches never creates a duplicate.",
      };
    case "Bookings":
      return {
        lineage: "From Bookings",
        rows: [
          ["Today", String(ws.bookings.total)],
          ["Completed", String(ws.bookings.completed)],
          ["Cancelled", String(ws.bookings.cancelled)],
          ["No-shows", String(ws.bookings.noShow)],
          ["Unassigned", String(ws.bookings.unassigned)],
        ],
        title: trading ? "Today's appointments" : "Why bookings are blocked",
        bullets: trading ? ["Unassigned bookings have no staff member attached yet"] : ["A branch needs enabled services and configured availability before it can accept a booking"],
        note: "Bookings owns appointments. Branches supplies the location.",
      };
    case "Staff": {
      const managers = ws.staff.filter((s) => s.role === "manager");
      return {
        lineage: "From Staff",
        rows: [
          ["Staff assigned", String(ws.staff.length)],
          ["Managers", String(managers.length)],
          ["Manager", managers[0]?.user.name ?? "Unassigned"],
        ],
        title: managers.length === 0 ? "No manager assigned" : "Coverage",
        bullets: managers.length === 0 ? ["Unassigned tasks and bookings escalate to the owner rather than being handled locally"] : ["Staff schedules are owned by Staff and are never changed automatically"],
        note: "Staff owns people and schedules. Branches shows the location view.",
      };
    }
    case "Credit":
      return {
        lineage: "From Credit",
        rows: [
          ["Outstanding", m(ws.credit.totalOutstanding)],
          ["Debtors", String(ws.credit.debtorCount)],
          ["Past 30 days", String(ws.credit.pastTermsCount)],
        ],
        title: "Credit is not cash",
        bullets: ["Outstanding credit is money owed to you, not money you hold", "Never added to collections or treated as realised profit"],
        note: "Credit owns balances and ledgers. Branch attribution follows the sale.",
      };
    case "Reviews":
      return {
        lineage: "From Reviews & Reputation",
        rows: ws.reviews
          ? [
              ["Average rating", `${ws.reviews.averageRating.toFixed(1)} ★`],
              ["Distribution", ws.reviews.distribution.map((d) => `${d.stars}★ ×${d.count}`).join(", ") || "—"],
              ["Conversion", `${ws.reviews.conversion.received} of ${ws.reviews.conversion.requested} requested`],
            ]
          : [["Reviews", "Not available"]],
        title: "Attribution care",
        bullets: ["A review is linked to a branch only where the order or booking record connects it"],
        note: "Reviews owns the records and never has its text altered.",
      };
    case "Profit":
      return {
        lineage: "Revenue − COGS, from Profit & Analytics",
        rows: trading
          ? [
              ["Revenue", m(rollupRow!.revenue)],
              ["Gross profit", m(rollupRow!.grossProfit)],
              ["Margin", `${((rollupRow!.grossProfit / rollupRow!.revenue) * 100).toFixed(1)}%`],
            ]
          : [["Profit", "Not trading yet"]],
        title: "What is and is not included",
        bullets: ["Shared overhead is excluded rather than split by an arbitrary rule", "Branch net profit therefore does not sum to business net profit"],
        note: "Profit & Analytics owns the calculation. This is the branch slice of it.",
      };
    case "Activity":
      return {
        lineage: "Chronological, filterable",
        rows: ws.activity.length > 0 ? ws.activity.slice(0, 8).map((a) => [new Date(a.createdAt).toLocaleString(), `${a.action} · ${a.entity}`] as [string, string]) : [["Activity", "No recent activity recorded"]],
        title: "What appears here",
        bullets: ["Only events that genuinely happened at this branch", "Every entry links to its source record in the module that owns it"],
        note: "The timeline is filterable and forms part of the audit trail.",
      };
    case "Settings":
      return {
        lineage: "Branch configuration",
        rows: [
          ["Tax", `${ws.branch.taxLabel} · ${ws.branch.taxRate}%`],
          ["Nightly close", ws.branch.nightlyCloseTime],
          ["Message channel", ws.branch.channelPref],
          ["Accepted payments", ws.branch.acceptedPaymentMethods.join(", ") || "—"],
          ["Status", ws.branch.active ? "Active" : "Deactivated"],
        ],
        title: "Scope and permissions",
        bullets: ["Changing a setting is recorded with who, when, before and after"],
        note: "Enforcement is server-side — hiding a control in the interface is not access control.",
      };
    default:
      return { lineage: "", rows: [], title: "", bullets: [], note: "" };
  }
}
