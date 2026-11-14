"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check, Sparkles } from "lucide-react";
import {
  fetchInventory,
  fetchInventoryAgentBranchTransferOutcomes,
  fetchInventoryAgentActionOutcomes,
  fetchInventoryAgentRuns,
  fetchLowStock,
  fetchReorderSuggestions,
  runInventoryAgent,
  prepareInventoryPurchaseRequest,
  dismissInventoryReorderRecommendation,
  prepareInventoryBranchTransfer,
  requestInventoryRecount,
  dismissInventoryRecount,
  requestInventoryWastageReview,
  resolveInventoryWastageReview,
  dismissInventoryWastageReview,
  previewWaitlistNotification,
  type WaitlistNotificationPreview,
} from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import {
  useInventoryDrawer,
  useInventorySearch,
  useRegisterExport,
} from "@/components/inventory/inventory-drawer-context";
import {
  INV,
  KpiTile,
  KpiSkeleton,
  filterSelectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  EmptyBlock,
  chipStyle,
  type Tone,
} from "@/components/inventory/inventory-ui";
import {
  classifyUrgency,
  type Urgency,
} from "@/components/inventory/inventory-classification";
import { useDisabledModules } from "@/components/layout/module-gate";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { askText } from "@/lib/ask-dialog";
import { SpecialistAgentUsage } from "@/components/agents/specialist-agent-usage";

const URGENCY_TONE: Record<Urgency, Tone> = {
  Critical: "red",
  High: "amber",
  Medium: "neutral",
};

export function ReorderSuggestionsView() {
  const session = useSession();
  const currency = session.business.currency;
  const disabledModules = useDisabledModules();
  const canRunAgent =
    session.user.role === "owner" || session.user.role === "manager";
  const [supplier, setSupplier] = useState("all");
  const [urgency, setUrgency] = useState<Urgency | "all">("all");
  const [category, setCategory] = useState("all");
  const [inventoryQuestion, setInventoryQuestion] = useState("");
  const [decisions, setDecisions] = useState<
    Record<string, "accepted" | "dismissed">
  >({});
  const [waitlistPreviews, setWaitlistPreviews] = useState<
    Record<string, WaitlistNotificationPreview>
  >({});
  const { query } = useInventorySearch();
  const { openPo, openRationale, openWaitlist } = useInventoryDrawer();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: fetchInventory,
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ["low-stock"],
    queryFn: fetchLowStock,
  });
  const {
    data: groups = [],
    isPending,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: fetchReorderSuggestions,
  });
  const {
    data: agentRuns = [],
    isPending: agentRunsPending,
    isError: agentRunsError,
  } = useQuery({
    queryKey: ["inventory-agent-runs"],
    queryFn: fetchInventoryAgentRuns,
  });
  const {
    data: agentOutcomes = [],
    isPending: agentOutcomesPending,
    isError: agentOutcomesError,
  } = useQuery({
    queryKey: ["inventory-agent-outcomes"],
    queryFn: fetchInventoryAgentActionOutcomes,
    enabled: !disabledModules.has("procurement"),
  });
  const {
    data: branchTransferOutcomes = [],
    isPending: branchTransferOutcomesPending,
    isError: branchTransferOutcomesError,
  } = useQuery({
    queryKey: ["inventory-agent-branch-transfer-outcomes"],
    queryFn: fetchInventoryAgentBranchTransferOutcomes,
    enabled: !disabledModules.has("branches"),
  });
  const agentMutation = useMutation({
    mutationFn: runInventoryAgent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-outcomes"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-branch-transfer-outcomes"],
      });
      toast.success("Inventory analysis saved with its source evidence");
    },
    onError: (error) =>
      toast.error(
        error.message || "The inventory analysis could not be completed",
      ),
  });
  const handoffMutation = useMutation({
    mutationFn: prepareInventoryPurchaseRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-outcomes"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["procurement", "requests"],
      });
      toast.success(
        "Purchase request draft saved. Review it in Procurement before submitting for approval.",
      );
    },
    onError: (error) =>
      toast.error(
        error.message || "The purchase request draft could not be prepared",
      ),
  });
  const dismissReorderMutation = useMutation({
    mutationFn: ({
      recommendationId,
      reason,
    }: {
      recommendationId: string;
      reason: string;
    }) => dismissInventoryReorderRecommendation(recommendationId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success("Reorder finding dismissed and recorded in the audit log");
    },
    onError: (error) =>
      toast.error(
        error.message || "The reorder finding could not be dismissed",
      ),
  });
  const branchTransferMutation = useMutation({
    mutationFn: prepareInventoryBranchTransfer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-branch-transfer-outcomes"],
      });
      toast.success(
        "Pending stock-transfer request saved. Approval and shipping remain human actions; stock was not changed.",
      );
    },
    onError: (error) =>
      toast.error(
        error.message || "The branch-transfer request could not be prepared",
      ),
  });
  const countTaskMutation = useMutation({
    mutationFn: requestInventoryRecount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success(
        "Recount request saved. Record a physical count in Stock Count; no stock was changed.",
      );
    },
    onError: (error) =>
      toast.error(error.message || "The recount request could not be saved"),
  });
  const dismissCountTaskMutation = useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      dismissInventoryRecount(taskId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success(
        "Recount request dismissed with an audit reason. No stock was changed.",
      );
    },
    onError: (error) =>
      toast.error(
        error.message || "The recount request could not be dismissed",
      ),
  });
  const wastageReviewTaskMutation = useMutation({
    mutationFn: requestInventoryWastageReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success(
        "Wastage review task saved. Stock and wastage records were not changed.",
      );
    },
    onError: (error) =>
      toast.error(
        error.message || "The wastage review task could not be saved",
      ),
  });
  const resolveWastageReviewTaskMutation = useMutation({
    mutationFn: ({ taskId, note }: { taskId: string; note: string }) =>
      resolveInventoryWastageReview(taskId, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success(
        "Wastage review recorded. No stock or wastage movement was changed.",
      );
    },
    onError: (error) =>
      toast.error(error.message || "The wastage review could not be recorded"),
  });
  const dismissWastageReviewTaskMutation = useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      dismissInventoryWastageReview(taskId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory-agent-runs"],
      });
      toast.success("Wastage review task dismissed with an audit reason.");
    },
    onError: (error) =>
      toast.error(
        error.message || "The wastage review task could not be dismissed",
      ),
  });
  const waitlistPreviewMutation = useMutation({
    mutationFn: previewWaitlistNotification,
    onSuccess: (preview) => {
      setWaitlistPreviews((current) => ({
        ...current,
        [preview.productId]: preview,
      }));
      toast.success(
        `Preview ready · ${preview.eligibleCount} eligible, ${preview.blockedCount} blocked. No message was sent.`,
      );
    },
    onError: (error) =>
      toast.error(
        error.message ||
          "The waitlist notification preview could not be prepared",
      ),
  });
  const latestAgentRun = agentRuns[0];

  async function dismissCountTask(taskId: string) {
    const reason = await askText({
      title: "Why dismiss this recount request?",
      description:
        "This will close the request only. It will not change inventory or create a stock-count adjustment.",
      minLength: 5,
      confirmLabel: "Dismiss request",
      tone: "danger",
    });
    if (reason) dismissCountTaskMutation.mutate({ taskId, reason });
  }

  async function dismissReorderFinding(recommendationId: string) {
    const reason = await askText({
      title: "Why dismiss this reorder finding?",
      description:
        "The reason is saved in the audit log. This does not change stock or a purchase request.",
      minLength: 5,
      confirmLabel: "Dismiss finding",
      tone: "danger",
    });
    if (reason) dismissReorderMutation.mutate({ recommendationId, reason });
  }

  async function resolveWastageReviewTask(taskId: string) {
    const note = await askText({
      title: "Record the wastage review",
      description:
        "Write what was checked. This only closes the review task; it does not edit stock or wastage records.",
      minLength: 5,
      confirmLabel: "Save review note",
    });
    if (note) resolveWastageReviewTaskMutation.mutate({ taskId, note });
  }

  async function dismissWastageReviewTask(taskId: string) {
    const reason = await askText({
      title: "Why dismiss this wastage review?",
      description:
        "This closes the task only and does not change any source records.",
      minLength: 5,
      confirmLabel: "Dismiss task",
      tone: "danger",
    });
    if (reason) dismissWastageReviewTaskMutation.mutate({ taskId, reason });
  }

  const rows = useMemo(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    return groups.flatMap((g) =>
      g.items.map((s) => {
        const item = itemById.get(s.productId);
        return {
          productId: s.productId,
          name: s.name,
          category: item?.category ?? null,
          supplierId: g.supplierId,
          supplierName: g.supplierName,
          stock: s.currentStock,
          velocity: s.velocityPerDay,
          cover: item?.daysOfCover ?? null,
          suggested: s.suggestedQty,
          incomingPurchaseQty: s.incomingPurchaseQty,
          incomingTransferQty: s.incomingTransferQty,
          committedOutboundTransferQty: s.committedOutboundTransferQty,
          availableStockAfterOutboundTransfers:
            s.availableStockAfterOutboundTransfers,
          minimumReorderQty: s.minimumReorderQty,
          purchaseQuantityLabel:
            s.purchasePackCount !== null &&
            s.purchaseUnitLabel &&
            s.stockUnitLabel
              ? `${s.purchasePackCount} × ${s.purchaseUnitLabel} · ${s.suggestedQty} × ${s.stockUnitLabel}`
              : null,
          estCost: s.suggestedQty * (item?.costPrice ?? 0),
          urgency: classifyUrgency(
            item?.stockQty ?? s.currentStock,
            item?.daysOfCover ?? null,
          ),
        };
      }),
    );
  }, [groups, items]);

  const suppliers = useMemo(
    () => [...new Set(rows.map((r) => r.supplierName))].sort(),
    [rows],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set(
          rows.map((r) => r.category).filter((c): c is string => Boolean(c)),
        ),
      ].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (supplier !== "all" && r.supplierName !== supplier) return false;
      if (urgency !== "all" && r.urgency !== urgency) return false;
      if (category !== "all" && r.category !== category) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.supplierName.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, supplier, urgency, category, query]);

  const suggestionCount = rows.length;
  const orderValue = rows.reduce((s, r) => s + r.estCost, 0);
  const atRisk = rows.filter((r) => r.cover != null && r.cover < 7).length;
  const lostSalesEstimate = lowStock.reduce(
    (sum, i) => sum + i.lostSalesEstimate,
    0,
  );

  const velocityChart = useMemo(() => {
    const top = [...rows].sort((a, b) => b.velocity - a.velocity).slice(0, 6);
    const maxVel = Math.max(1, ...top.map((r) => r.velocity));
    const maxCover = Math.max(1, ...top.map((r) => r.cover ?? 0));
    return top.map((r) => ({
      name: r.name,
      velPct: Math.round((r.velocity / maxVel) * 100),
      coverPct: r.cover != null ? Math.round((r.cover / maxCover) * 100) : 0,
      coverColor: r.cover != null && r.cover <= 7 ? "#B42318" : "#12A150",
      velLabel: `${r.velocity}/day`,
      coverLabel: r.cover != null ? `${r.cover}d cover` : "No sales",
    }));
  }, [rows]);

  function accept(productId: string) {
    const row = rows.find((r) => r.productId === productId);
    if (!row) return;
    setDecisions((prev) => ({ ...prev, [productId]: "accepted" }));
    openPo({
      supplierId: row.supplierId !== "unassigned" ? row.supplierId : undefined,
      prefill: [{ productId: row.productId, qty: row.suggested }],
    });
  }
  function dismiss(productId: string) {
    setDecisions((prev) => ({ ...prev, [productId]: "dismissed" }));
  }
  function acceptAll() {
    const pending = filtered.filter((r) => !decisions[r.productId]);
    if (pending.length === 0) return;
    const bySupplier = new Map<string, typeof pending>();
    for (const r of pending) {
      const list = bySupplier.get(r.supplierId) ?? [];
      list.push(r);
      bySupplier.set(r.supplierId, list);
    }
    const [supplierId, group] = [...bySupplier.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    setDecisions((prev) => {
      const next = { ...prev };
      for (const r of group) next[r.productId] = "accepted";
      return next;
    });
    if (group.length < pending.length) {
      toast.success(
        `Opening a draft for one supplier — ${pending.length - group.length} item(s) from other suppliers need a separate order.`,
      );
    }
    openPo({
      supplierId: supplierId !== "unassigned" ? supplierId : undefined,
      prefill: group.map((r) => ({ productId: r.productId, qty: r.suggested })),
    });
  }

  useRegisterExport(() => {
    const header = [
      "Product",
      "Urgency",
      "Current stock",
      "Available after outbound transfers",
      "Daily velocity",
      "Days of cover",
      "Open purchase units",
      "Incoming branch transfer units",
      "Product minimum reorder units",
      "Suggested stock units",
      "Suggested purchase units",
      "Supplier",
      "Est. cost",
    ];
    const csvRows = filtered.map((r) => [
      r.name,
      r.urgency,
      r.stock,
      r.availableStockAfterOutboundTransfers,
      r.velocity,
      r.cover ?? "",
      r.incomingPurchaseQty,
      r.incomingTransferQty,
      r.minimumReorderQty ?? "Not configured",
      r.suggested,
      r.purchaseQuantityLabel ?? "Not configured",
      r.supplierName,
      r.estCost,
    ]);
    const csv = [header, ...csvRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reorder-suggestions.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  return (
    <main
      style={{
        padding: "16px 22px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 15,
      }}
    >
      <section
        aria-labelledby="inventory-agent-heading"
        style={{
          background: "#fff",
          border: `1px solid ${INV.border}`,
          borderRadius: 16,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2
              id="inventory-agent-heading"
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 800,
                color: "#101828",
              }}
            >
              Inventory Intelligence Agent
            </h2>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 12,
                color: "#667085",
                lineHeight: 1.55,
              }}
            >
              Analyze recorded stock and sales movements, then prepare a
              purchase-request draft for review. Procurement manages approval
              and purchase orders.
            </p>
          </div>
          {canRunAgent ? (
            <button
              type="button"
              onClick={() => agentMutation.mutate()}
              disabled={agentMutation.isPending}
              style={{
                ...primaryBtnStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                opacity: agentMutation.isPending ? 0.65 : 1,
              }}
            >
              <Sparkles size={14} />
              {agentMutation.isPending
                ? "Analyzing…"
                : "Analyze current inventory"}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: "#667085" }}>
              Owner or manager access required to run the agent.
            </span>
          )}
        </div>
        {canRunAgent && (
          <div
            style={{
              display: "flex",
              alignItems: "end",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <label
              style={{
                flex: 1,
                minWidth: 240,
                fontSize: 11,
                fontWeight: 700,
                color: "#344054",
              }}
            >
              Ask about saved Inventory findings
              <textarea
                value={inventoryQuestion}
                onChange={(event) => setInventoryQuestion(event.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="For example: Which reorder suggestions have the most incoming supply?"
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: 5,
                  padding: 9,
                  borderRadius: 8,
                  border: `1px solid ${INV.border}`,
                  background: "#fff",
                  color: "#101828",
                  font: "inherit",
                  fontWeight: 400,
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => agentMutation.mutate(inventoryQuestion.trim())}
              disabled={
                agentMutation.isPending || inventoryQuestion.trim().length < 4
              }
              style={{
                ...outlineBtnStyle,
                opacity:
                  agentMutation.isPending || inventoryQuestion.trim().length < 4
                    ? 0.55
                    : 1,
              }}
            >
              Ask Inventory Agent
            </button>
            <p
              style={{
                width: "100%",
                margin: 0,
                fontSize: 10.5,
                color: "#667085",
              }}
            >
              The question is sent to the configured AI provider; Noxtill stores
              only its hash. Answers use the current review&rsquo;s saved
              calculations and selected evidence fields. Record IDs and
              inventory cost values are excluded from the AI context.
            </p>
          </div>
        )}
        {agentRunsPending ? (
          <div style={{ fontSize: 12, color: "#667085" }}>
            Loading saved agent runs…
          </div>
        ) : agentRunsError ? (
          <div role="alert" style={{ fontSize: 12, color: "#B42318" }}>
            Saved agent run history could not be loaded.
          </div>
        ) : latestAgentRun ? (
          <div
            style={{
              borderTop: `1px solid ${INV.border}`,
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "#344054" }}>
              <strong>
                Latest run ·{" "}
                {new Date(latestAgentRun.createdAt).toLocaleString()}
              </strong>
              <span style={{ marginLeft: 8, color: "#667085" }}>
                {latestAgentRun.output.recommendationCount ??
                  latestAgentRun.recommendations.length}{" "}
                saved finding(s)
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "#344054",
                lineHeight: 1.55,
              }}
            >
              {latestAgentRun.output.summary}
            </p>
            {latestAgentRun.output.message ? (
              <p
                role="status"
                style={{ margin: 0, fontSize: 11.5, color: "#667085" }}
              >
                {latestAgentRun.output.message}
              </p>
            ) : null}
            {latestAgentRun.output.signalCounts ? (
              <div style={{ fontSize: 10.5, color: "#667085" }}>
                Historical demand baselines{" "}
                {latestAgentRun.output.signalCounts.demandForecast ?? 0} ·
                Low-stock items without recent demand history{" "}
                {latestAgentRun.output.signalCounts.demandHistoryUnavailable ?? 0} ·
                Valuation snapshots{" "}
                {latestAgentRun.output.signalCounts.inventoryValuation ?? 0} ·
                Reorder {latestAgentRun.output.signalCounts.reorder} · Low-stock{" "}
                {latestAgentRun.output.signalCounts.stockThreshold} · Existing
                overstock flags {latestAgentRun.output.signalCounts.overstock} ·
                Draft count variances{" "}
                {latestAgentRun.output.signalCounts.countVariance} · Repeated
                applied-count patterns{" "}
                {latestAgentRun.output.signalCounts.repeatedCountVariance ?? 0}{" "}
                · Products with recorded wastage{" "}
                {latestAgentRun.output.signalCounts.recentWastage} ·
                Back-in-stock reviews{" "}
                {latestAgentRun.output.moduleSources?.customers === "disabled"
                  ? "not evaluated"
                  : (latestAgentRun.output.signalCounts.backInStockReview ??
                    0)}{" "}·
                Branch rebalance reviews{" "}
                {latestAgentRun.output.moduleSources?.branches === "disabled"
                  ? "not evaluated"
                  : (latestAgentRun.output.signalCounts.branchRebalance ?? 0)}
              </div>
            ) : null}
            {latestAgentRun.output.inventoryValuation ? (
              <div
                role="status"
                style={{
                  background: "#F5F8F6",
                  border: `1px solid ${INV.border}`,
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 11.5,
                  color: "#344054",
                }}
              >
                InventoryService value at recorded cost:{" "}
                <strong>
                  {formatCurrency(
                    latestAgentRun.output.inventoryValuation.stockValueAtCost,
                    currency,
                  )}
                </strong>
                <span>
                  {" "}
                  · Existing overstock-flagged rows:{" "}
                  {formatCurrency(
                    latestAgentRun.output.inventoryValuation
                      .overstockFlaggedValueAtCost,
                    currency,
                  )}
                </span>
                <span>
                  {" "}
                  · {
                    latestAgentRun.output.inventoryValuation.productRowCount
                  }{" "}
                  product rows, including{" "}
                  {
                    latestAgentRun.output.inventoryValuation
                      .zeroCostPriceRowCount
                  }{" "}
                  with zero recorded cost
                </span>
              </div>
            ) : null}
            {latestAgentRun.output.moduleSources?.purchasing === "included" ||
            latestAgentRun.output.moduleSources?.customers === "disabled" ? (
              <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
                {latestAgentRun.output.moduleSources?.purchasing === "included"
                  ? "Open purchase orders and confirmed supplier terms are included from Inventory. "
                  : ""}
                {latestAgentRun.output.moduleSources?.customers === "disabled"
                  ? "Back-in-stock waitlist data was not included because Customers is disabled."
                  : ""}
              </div>
            ) : null}
            {latestAgentRun.output.branchRebalanceAvailability ===
            "single_location" ? (
              <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
                Branch comparison is not available until this business has
                another active location.
              </div>
            ) : latestAgentRun.output.branchRebalanceAvailability ===
              "module_disabled" ? (
              <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
                Branch comparison is unavailable because the Branches module is
                disabled for this business.
              </div>
            ) : latestAgentRun.output.branchRebalanceAvailability ===
              "available" ? (
              <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
                Branch comparison uses{" "}
                {latestAgentRun.output.activeLocationCount ?? "the active"}{" "}
                active locations in this business group.
              </div>
            ) : null}
            {latestAgentRun.output.aiSummary?.status === "ready" &&
            latestAgentRun.output.aiSummary.text ? (
              <div
                style={{
                  background: "#F5F8F6",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 12,
                  color: "#344054",
                  lineHeight: 1.55,
                }}
              >
                <strong>
                  {latestAgentRun.output.aiSummary.mode === "question"
                    ? "Inventory Agent answer"
                    : "AI-generated review note"}
                </strong>
                <p style={{ margin: "5px 0 0", whiteSpace: "pre-wrap" }}>
                  {latestAgentRun.output.aiSummary.text}
                </p>
                <span
                  style={{
                    display: "block",
                    marginTop: 6,
                    color: "#667085",
                    fontSize: 10.5,
                  }}
                >
                  Check this commentary against the source evidence below before
                  acting.
                </span>
              </div>
            ) : latestAgentRun.output.aiSummary?.message ? (
              <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
                AI explanation: {latestAgentRun.output.aiSummary.message}
              </div>
            ) : null}
            <SpecialistAgentUsage calls={latestAgentRun.aiCallLogs} />
            {latestAgentRun.recommendations.map((recommendation) => {
              const signalType = recommendation.details.signalType;
              const historicalLeadTimeScenario = recommendation.details
                .historicalLeadTimeScenario as
                | {
                    status?: string;
                    sampleCount?: number;
                    minimumSampleCount?: number;
                    lookbackDays?: number;
                    medianElapsedDays?: number;
                    suggestedQty?: number;
                  }
                | undefined;
              const historicalBacktest = recommendation.details
                .historicalBacktest as
                | {
                    status?: string;
                    evaluatedWeeks?: number;
                    meanAbsoluteErrorUnits?: number | null;
                    calibrationWeeks?: number;
                    intervalTargetCoveragePercent?: number | null;
                    forecastLowerUnits?: number | null;
                    forecastUpperUnits?: number | null;
                    observedHoldoutCoveragePercent?: number | null;
                  }
                | undefined;
              const samePeriodComparison = recommendation.details
                .samePeriodRecordedSalesComparison as
                | {
                    status?: string;
                    windowWeeks?: number;
                    offsetDays?: number;
                    currentRecordedUnits?: number | null;
                    currentWeeksWithRecordedSales?: number | null;
                    earlierRecordedUnits?: number | null;
                    earlierWeeksWithRecordedSales?: number | null;
                    differenceRecordedUnits?: number | null;
                    percentDifference?: number | null;
                  }
                | undefined;
              const calculationLabel =
                signalType === "reorder"
                  ? `Existing reorder formula net of outstanding purchase orders · ${latestAgentRun.output.salesWindowDays}-day sales window · ${latestAgentRun.output.baselineLeadTimeDays}-day baseline lead-time assumption`
                  : signalType === "demand_forecast"
                    ? `Historical demand baseline · ${recommendation.details.forecastBaselineWeeks}-week point baseline · ${recommendation.details.historyWeeks}-week recorded-sales history · ${recommendation.details.forecastHorizonDays}-day horizon`
                    : signalType === "count_variance"
                      ? "Persisted draft count snapshot; the canonical apply flow rechecks current stock"
                      : signalType === "repeated_count_variance"
                        ? `Repeated applied stock-count adjustments · trailing ${recommendation.details.lookbackDays}-day window`
                        : signalType === "inventory_value_exposure"
                          ? "Canonical InventoryService valuation and overstock flag snapshot"
                          : signalType === "wastage_review"
                            ? `Recorded wastage movements · trailing ${latestAgentRun.output.salesWindowDays}-day window`
                            : signalType === "back_in_stock"
                              ? "Current canonical stock and unnotified product-waitlist entries"
                              : signalType === "branch_rebalance"
                                ? "Unique-SKU comparison across active branches with recorded sales and open transfers"
                                : "Existing Inventory service status and calculation";
              return (
                <article
                  key={recommendation.id}
                  style={{
                    border: `1px solid ${INV.border}`,
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <strong
                    style={{ display: "block", fontSize: 12, color: "#101828" }}
                  >
                    {recommendation.title}
                  </strong>
                  <p
                    style={{
                      margin: "5px 0",
                      fontSize: 11.5,
                      color: "#475467",
                      lineHeight: 1.5,
                    }}
                  >
                    {recommendation.summary}
                  </p>
                  <div style={{ fontSize: 10.5, color: "#667085" }}>
                    {calculationLabel} · Confidence: not available (not
                    calibrated)
                  </div>
                  {signalType === "reorder" &&
                  historicalLeadTimeScenario?.status === "available" ? (
                    <div
                      role="status"
                      style={{ marginTop: 4, fontSize: 10.5, color: "#475467" }}
                    >
                      Historical sensitivity only:{" "}
                      {historicalLeadTimeScenario.sampleCount} completed
                      product/supplier orders in the last{" "}
                      {historicalLeadTimeScenario.lookbackDays} days had a
                      median lead time of{" "}
                      {historicalLeadTimeScenario.medianElapsedDays} days. The
                      same reorder equation would show{" "}
                      {historicalLeadTimeScenario.suggestedQty} units with that
                      historical input; the displayed suggestion above remains
                      unchanged. This is not a delivery promise or forecast.
                    </div>
                  ) : signalType === "reorder" &&
                    historicalLeadTimeScenario?.status ===
                      "insufficient_history" ? (
                    <div
                      role="status"
                      style={{ marginTop: 4, fontSize: 10.5, color: "#667085" }}
                    >
                      Historical lead-time sensitivity is not calculated:{" "}
                      {historicalLeadTimeScenario.sampleCount ?? 0} matching
                      completed product/supplier orders recorded,{" "}
                      {historicalLeadTimeScenario.minimumSampleCount ?? 3}{" "}
                      required. The existing displayed reorder suggestion is
                      unchanged.
                    </div>
                  ) : null}
                  {signalType === "demand_forecast" ? (
                    <div
                      role="status"
                      style={{ marginTop: 4, fontSize: 10.5, color: "#667085" }}
                    >
                      {samePeriodComparison?.status === "available" &&
                      typeof samePeriodComparison.currentRecordedUnits ===
                        "number" &&
                      typeof samePeriodComparison.currentWeeksWithRecordedSales ===
                        "number" &&
                      typeof samePeriodComparison.earlierRecordedUnits ===
                        "number" &&
                      typeof samePeriodComparison.earlierWeeksWithRecordedSales ===
                        "number" &&
                      typeof samePeriodComparison.differenceRecordedUnits ===
                        "number" ? (
                        <div style={{ marginBottom: 4 }}>
                          Same-period recorded sales:{" "}
                          {samePeriodComparison.currentRecordedUnits} units
                          across the latest {samePeriodComparison.windowWeeks}{" "}
                          weeks, compared with{" "}
                          {samePeriodComparison.earlierRecordedUnits} units{" "}
                          {samePeriodComparison.offsetDays} days earlier (
                          {samePeriodComparison.differenceRecordedUnits > 0
                            ? "+"
                            : ""}
                          {samePeriodComparison.differenceRecordedUnits} units
                          {typeof samePeriodComparison.percentDifference ===
                          "number"
                            ? ` · ${samePeriodComparison.percentDifference > 0 ? "+" : ""}${samePeriodComparison.percentDifference}%`
                            : " · percentage unavailable because the earlier recorded total is zero"}
                          ). Captured movement comparison only; not a seasonal
                          adjustment, demand guarantee or causal result.
                          Recorded-sales weeks:{" "}
                          {samePeriodComparison.currentWeeksWithRecordedSales}/
                          {samePeriodComparison.windowWeeks} recent and{" "}
                          {samePeriodComparison.earlierWeeksWithRecordedSales}/
                          {samePeriodComparison.windowWeeks} earlier.
                        </div>
                      ) : (
                        <div style={{ marginBottom: 4 }}>
                          Same-period recorded-sales comparison: not available
                          because the source history does not cover both
                          windows.
                        </div>
                      )}
                      {historicalBacktest?.status === "available" &&
                      typeof historicalBacktest.meanAbsoluteErrorUnits ===
                        "number" &&
                      typeof historicalBacktest.forecastLowerUnits ===
                        "number" &&
                      typeof historicalBacktest.forecastUpperUnits ===
                        "number" &&
                      typeof historicalBacktest.observedHoldoutCoveragePercent ===
                        "number"
                        ? `Empirical historical range: ${historicalBacktest.forecastLowerUnits}–${historicalBacktest.forecastUpperUnits} units/week (nominal ${historicalBacktest.intervalTargetCoveragePercent}% from ${historicalBacktest.calibrationWeeks} older calibration windows). Recent holdout coverage: ${historicalBacktest.observedHoldoutCoveragePercent}% across ${historicalBacktest.evaluatedWeeks} weeks · mean absolute error ${historicalBacktest.meanAbsoluteErrorUnits} units/week. Historical only, not a guarantee.`
                        : "Historical forecast range: not available because recorded-sales history is too sparse."}
                    </div>
                  ) : null}
                  {recommendation.assumptions.map((assumption) => (
                    <div
                      key={assumption}
                      style={{ marginTop: 4, fontSize: 10.5, color: "#667085" }}
                    >
                      Assumption: {assumption}
                    </div>
                  ))}
                  {recommendation.missingData.map((missing) => (
                    <div
                      key={missing}
                      style={{ marginTop: 4, fontSize: 10.5, color: "#8A5A00" }}
                    >
                      Not included: {missing}
                    </div>
                  ))}
                  {signalType === "reorder" &&
                  recommendation.status === "dismissed" ? (
                    <div
                      role="status"
                      style={{
                        marginTop: 10,
                        fontSize: 11.5,
                        color: "#667085",
                      }}
                    >
                      Dismissed · reason recorded in the audit log
                    </div>
                  ) : signalType === "reorder" &&
                    recommendation.procurementRequest ? (
                    <Link
                      href={`/procurement/requests#request-${recommendation.procurementRequest.id}`}
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        fontSize: 12,
                        color: "var(--app-primary)",
                        textDecoration: "underline",
                      }}
                    >
                      Open purchase request ·{" "}
                      {recommendation.procurementRequest.status}
                    </Link>
                  ) : signalType === "reorder" &&
                    recommendation.details.coveredByIncoming === true ? (
                    <div
                      role="status"
                      style={{
                        marginTop: 10,
                        fontSize: 11.5,
                        color: "#475467",
                      }}
                    >
                      No additional purchase quantity is suggested after
                      outstanding purchase orders. Verify their delivery status
                      in{" "}
                      <Link
                        href="/inventory/purchases"
                        style={{
                          color: "var(--app-primary)",
                          textDecoration: "underline",
                        }}
                      >
                        Purchases
                      </Link>
                      .
                    </div>
                  ) : signalType === "reorder" &&
                    canRunAgent &&
                    typeof recommendation.details.suggestedQty === "number" &&
                    recommendation.details.suggestedQty > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handoffMutation.mutate(recommendation.id)
                        }
                        disabled={
                          handoffMutation.isPending ||
                          dismissReorderMutation.isPending
                        }
                        style={{ ...outlineBtnStyle, fontSize: 11.5 }}
                      >
                        {handoffMutation.isPending &&
                        handoffMutation.variables === recommendation.id
                          ? "Preparing draft…"
                          : "Prepare purchase request draft"}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissReorderFinding(recommendation.id)}
                        disabled={
                          handoffMutation.isPending ||
                          dismissReorderMutation.isPending
                        }
                        style={{ ...outlineBtnStyle, fontSize: 11.5 }}
                      >
                        {dismissReorderMutation.isPending &&
                        dismissReorderMutation.variables?.recommendationId ===
                          recommendation.id
                          ? "Saving decision…"
                          : "Dismiss finding"}
                      </button>
                    </div>
                  ) : signalType === "back_in_stock" && canRunAgent ? (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          openWaitlist(String(recommendation.details.productId))
                        }
                        style={{ ...outlineBtnStyle, fontSize: 11.5 }}
                      >
                        Review canonical waitlist
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          waitlistPreviewMutation.mutate(
                            String(recommendation.details.productId),
                          )
                        }
                        disabled={waitlistPreviewMutation.isPending}
                        style={{
                          ...outlineBtnStyle,
                          marginLeft: 8,
                          fontSize: 11.5,
                        }}
                      >
                        {waitlistPreviewMutation.isPending &&
                        waitlistPreviewMutation.variables ===
                          recommendation.details.productId
                          ? "Checking send rules…"
                          : "Prepare notification preview"}
                      </button>
                      {waitlistPreviews[
                        String(recommendation.details.productId)
                      ]
                        ? (() => {
                            const preview =
                              waitlistPreviews[
                                String(recommendation.details.productId)
                              ];
                            return (
                              <div
                                role="status"
                                style={{
                                  marginTop: 10,
                                  border: `1px solid ${INV.border}`,
                                  borderRadius: 9,
                                  padding: 10,
                                  background: "#F8FAFC",
                                }}
                              >
                                <strong
                                  style={{ fontSize: 11.5, color: "#344054" }}
                                >
                                  Current preview · {preview.eligibleCount}{" "}
                                  eligible · {preview.blockedCount} blocked
                                </strong>
                                <p
                                  style={{
                                    margin: "5px 0 8px",
                                    fontSize: 10.5,
                                    color: "#667085",
                                  }}
                                >
                                  The waitlist row records a request but not
                                  separate consent evidence. This checks current
                                  contact, channel, template and quota rules
                                  only; it does not send or verify provider
                                  delivery. The actual send checks again.
                                </p>
                                <div style={{ display: "grid", gap: 6 }}>
                                  {preview.recipients.map(
                                    (recipient, index) => (
                                      <div
                                        key={`${recipient.name}-${index}`}
                                        style={{
                                          borderTop: `1px solid ${INV.border}`,
                                          paddingTop: 6,
                                          fontSize: 10.5,
                                        }}
                                      >
                                        <strong style={{ color: "#344054" }}>
                                          {recipient.name}
                                        </strong>
                                        <span
                                          style={{
                                            marginLeft: 7,
                                            color:
                                              recipient.status === "eligible"
                                                ? "#027A48"
                                                : "#B42318",
                                          }}
                                        >
                                          {recipient.status === "eligible"
                                            ? `Eligible · ${recipient.channel}`
                                            : `Blocked · ${recipient.reason}`}
                                        </span>
                                        {recipient.message ? (
                                          <div
                                            style={{
                                              marginTop: 3,
                                              color: "#475467",
                                            }}
                                          >
                                            {recipient.message}
                                          </div>
                                        ) : null}
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        : null}
                    </div>
                  ) : signalType === "branch_rebalance" ? (
                    recommendation.stockTransfer ? (
                      <div
                        role="status"
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 9,
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#475467",
                        }}
                      >
                        Transfer request ·{" "}
                        {recommendation.stockTransfer.status.replaceAll(
                          "_",
                          " ",
                        )}{" "}
                        · human approval required
                        <Link
                          href="/branches/transfers"
                          style={{
                            color: "var(--app-primary)",
                            textDecoration: "underline",
                          }}
                        >
                          Review canonical stock transfers
                        </Link>
                      </div>
                    ) : canRunAgent &&
                      recommendation.details.sourceBusinessId ===
                        session.business.id ? (
                      <div style={{ marginTop: 10 }}>
                        <p
                          style={{
                            margin: "0 0 7px",
                            fontSize: 10.5,
                            color: "#667085",
                          }}
                        >
                          Prepares a pending request from a fresh inventory
                          calculation. A person must approve and ship it; this
                          does not change stock.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            branchTransferMutation.mutate(recommendation.id)
                          }
                          disabled={branchTransferMutation.isPending}
                          style={{ ...outlineBtnStyle, fontSize: 11.5 }}
                        >
                          {branchTransferMutation.isPending &&
                          branchTransferMutation.variables === recommendation.id
                            ? "Preparing transfer request…"
                            : "Prepare transfer request"}
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#667085",
                        }}
                      >
                        <Link
                          href="/branches/transfers"
                          style={{
                            marginRight: 8,
                            color: "var(--app-primary)",
                            textDecoration: "underline",
                          }}
                        >
                          Review canonical stock transfers
                        </Link>
                        Prepare this request from the source branch.
                      </div>
                    )
                  ) : signalType === "count_variance" ||
                    signalType === "repeated_count_variance" ? (
                    recommendation.inventoryCountTask ? (
                      <div
                        role="status"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#475467",
                        }}
                      >
                        Recount request ·{" "}
                        {recommendation.inventoryCountTask.status ===
                        "completed"
                          ? "physical count recorded"
                          : recommendation.inventoryCountTask.status ===
                              "dismissed"
                            ? `dismissed: ${recommendation.inventoryCountTask.dismissReason}`
                            : "open"}
                        <Link
                          href="/inventory/stock-count"
                          style={{
                            color: "var(--app-primary)",
                            textDecoration: "underline",
                          }}
                        >
                          Open canonical Stock Count
                        </Link>
                        {recommendation.inventoryCountTask.status === "open" &&
                          canRunAgent && (
                            <button
                              type="button"
                              onClick={() =>
                                dismissCountTask(
                                  recommendation.inventoryCountTask!.id,
                                )
                              }
                              disabled={dismissCountTaskMutation.isPending}
                              style={{
                                ...outlineBtnStyle,
                                fontSize: 11,
                                padding: "5px 9px",
                              }}
                            >
                              {dismissCountTaskMutation.isPending
                                ? "Dismissing…"
                                : "Dismiss request"}
                            </button>
                          )}
                      </div>
                    ) : canRunAgent ? (
                      <button
                        type="button"
                        onClick={() =>
                          countTaskMutation.mutate(recommendation.id)
                        }
                        disabled={countTaskMutation.isPending}
                        style={{
                          ...outlineBtnStyle,
                          marginTop: 10,
                          fontSize: 11.5,
                        }}
                      >
                        {countTaskMutation.isPending &&
                        countTaskMutation.variables === recommendation.id
                          ? "Saving recount request…"
                          : "Request a physical recount"}
                      </button>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#667085",
                        }}
                      >
                        Owner or manager access is required to request a
                        recount.
                      </span>
                    )
                  ) : signalType === "inventory_value_exposure" ? (
                    <Link
                      href="/inventory/valuation"
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        fontSize: 12,
                        color: "var(--app-primary)",
                        textDecoration: "underline",
                      }}
                    >
                      Open canonical Inventory valuation
                    </Link>
                  ) : signalType === "wastage_review" ? (
                    recommendation.inventoryWastageReviewTask ? (
                      <div
                        role="status"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#475467",
                        }}
                      >
                        Wastage review task ·{" "}
                        {recommendation.inventoryWastageReviewTask.status}
                        <Link
                          href="/inventory/wastage"
                          style={{
                            color: "var(--app-primary)",
                            textDecoration: "underline",
                          }}
                        >
                          Open canonical Wastage log
                        </Link>
                        {recommendation.inventoryWastageReviewTask.status ===
                          "reviewed" &&
                        recommendation.inventoryWastageReviewTask.reviewNote ? (
                          <span>
                            Review note:{" "}
                            {
                              recommendation.inventoryWastageReviewTask
                                .reviewNote
                            }
                          </span>
                        ) : null}
                        {recommendation.inventoryWastageReviewTask.status ===
                          "dismissed" &&
                        recommendation.inventoryWastageReviewTask
                          .dismissReason ? (
                          <span>
                            Dismissed:{" "}
                            {
                              recommendation.inventoryWastageReviewTask
                                .dismissReason
                            }
                          </span>
                        ) : null}
                        {recommendation.inventoryWastageReviewTask.status ===
                          "open" && canRunAgent ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                resolveWastageReviewTask(
                                  recommendation.inventoryWastageReviewTask!.id,
                                )
                              }
                              disabled={
                                resolveWastageReviewTaskMutation.isPending
                              }
                              style={{
                                ...outlineBtnStyle,
                                fontSize: 11,
                                padding: "5px 9px",
                              }}
                            >
                              {resolveWastageReviewTaskMutation.isPending
                                ? "Saving…"
                                : "Record review"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                dismissWastageReviewTask(
                                  recommendation.inventoryWastageReviewTask!.id,
                                )
                              }
                              disabled={
                                dismissWastageReviewTaskMutation.isPending
                              }
                              style={{
                                ...outlineBtnStyle,
                                fontSize: 11,
                                padding: "5px 9px",
                              }}
                            >
                              {dismissWastageReviewTaskMutation.isPending
                                ? "Dismissing…"
                                : "Dismiss task"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : canRunAgent ? (
                      <div style={{ marginTop: 10 }}>
                        <Link
                          href="/inventory/wastage"
                          style={{
                            marginRight: 10,
                            fontSize: 11.5,
                            color: "var(--app-primary)",
                            textDecoration: "underline",
                          }}
                        >
                          Open canonical Wastage log
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            wastageReviewTaskMutation.mutate(recommendation.id)
                          }
                          disabled={wastageReviewTaskMutation.isPending}
                          style={{ ...outlineBtnStyle, fontSize: 11.5 }}
                        >
                          {wastageReviewTaskMutation.isPending &&
                          wastageReviewTaskMutation.variables ===
                            recommendation.id
                            ? "Creating task…"
                            : "Create wastage review task"}
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 11.5,
                          color: "#667085",
                        }}
                      >
                        Owner or manager access is required to create a wastage
                        review task.
                      </span>
                    )
                  ) : null}
                  {recommendation.evidence.map((evidence) => (
                    <details
                      key={evidence.id}
                      style={{ marginTop: 7, fontSize: 10.5, color: "#475467" }}
                    >
                      <summary style={{ cursor: "pointer" }}>
                        Source evidence · {evidence.freshness} · observed{" "}
                        {new Date(evidence.observedAt).toLocaleString()}
                      </summary>
                      <div style={{ marginTop: 5, overflowWrap: "anywhere" }}>
                        {evidence.calculation}
                      </div>
                      <code
                        style={{
                          display: "block",
                          marginTop: 5,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {JSON.stringify(evidence.observedValues, null, 2)}
                      </code>
                    </details>
                  ))}
                </article>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              borderTop: `1px solid ${INV.border}`,
              paddingTop: 11,
              fontSize: 11.5,
              color: "#667085",
            }}
          >
            No saved Inventory Agent run yet. The first run will use this
            business&apos;s current inventory and recorded stock movements.
          </div>
        )}
        <div
          aria-labelledby="inventory-agent-outcomes-heading"
          style={{
            borderTop: `1px solid ${INV.border}`,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <h3
              id="inventory-agent-outcomes-heading"
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                color: "#101828",
              }}
            >
              Recorded recommendation follow-through
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "#667085",
                lineHeight: 1.5,
              }}
            >
              Shows linked Procurement requests, actual PO receipts, current
              stock, and a descriptive comparison of recorded sales before and
              after full receipt.
            </p>
          </div>
          {disabledModules.has("procurement") ? (
            <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
              Procurement follow-through is unavailable because the Procurement module is disabled for this business.
            </div>
          ) : agentOutcomesPending ? (
            <div style={{ fontSize: 11.5, color: "#667085" }}>
              Loading recorded follow-through…
            </div>
          ) : agentOutcomesError ? (
            <div role="alert" style={{ fontSize: 11.5, color: "#B42318" }}>
              Recorded follow-through could not be loaded.
            </div>
          ) : agentOutcomes.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#667085" }}>
              No saved reorder recommendations to measure yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 900,
                  fontSize: 11.5,
                  color: "#344054",
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left", color: "#667085" }}>
                    <th
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      Recommendation
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      Procurement
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      PO receipt
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      Current stock
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      Recorded sales comparison
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agentOutcomes.slice(0, 10).map((outcome) => (
                    <tr key={outcome.recommendationId}>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${INV.border}`,
                          verticalAlign: "top",
                        }}
                      >
                        <strong>
                          {outcome.product?.name ?? outcome.title}
                        </strong>
                        <div style={{ marginTop: 3, color: "#667085" }}>
                          Suggested{" "}
                          {outcome.recommendedQuantity ?? "Not recorded"} units
                          ·{" "}
                          {new Date(
                            outcome.recommendationCreatedAt,
                          ).toLocaleDateString()}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${INV.border}`,
                          verticalAlign: "top",
                        }}
                      >
                        {outcome.procurementRequest ? (
                          <>
                            <Link
                              href={`/procurement/requests#request-${outcome.procurementRequest.id}`}
                              style={{
                                color: "var(--app-primary)",
                                textDecoration: "underline",
                              }}
                            >
                              {outcome.procurementRequest.status.replaceAll(
                                "_",
                                " ",
                              )}{" "}
                              ·{" "}
                              {outcome.procurementRequest.requestedQuantity ??
                                0}{" "}
                              requested
                            </Link>
                            {outcome.specialistAction ? (
                              <div style={{ marginTop: 4, color: "#667085" }}>
                                Agent action:{" "}
                                {outcome.specialistAction.state.replaceAll(
                                  "_",
                                  " ",
                                )}
                                {outcome.specialistAction.requiredApproval &&
                                outcome.specialistAction.state ===
                                  "approval_required"
                                  ? " · waiting for Procurement approval"
                                  : ""}
                                {outcome.specialistAction.lastEvent?.reason ? (
                                  <div style={{ marginTop: 2 }}>
                                    {outcome.specialistAction.lastEvent.reason}
                                  </div>
                                ) : null}
                                <div style={{ marginTop: 2 }}>
                                  Trace{" "}
                                  {outcome.specialistAction.correlationId.slice(
                                    0,
                                    8,
                                  )}{" "}
                                  ·{" "}
                                  {
                                    outcome.specialistAction
                                      .executionAttemptCount
                                  }{" "}
                                  execution attempts
                                </div>
                                {outcome.specialistAction.events.length > 0 ? (
                                  <details style={{ marginTop: 4 }}>
                                    <summary style={{ cursor: "pointer" }}>
                                      Action history ·{" "}
                                      {outcome.specialistAction.events.length}{" "}
                                      events
                                    </summary>
                                    <ol
                                      style={{
                                        margin: "4px 0 0",
                                        paddingLeft: 18,
                                      }}
                                    >
                                      {outcome.specialistAction.events.map(
                                        (event) => (
                                          <li
                                            key={event.sequence}
                                            style={{ marginTop: 3 }}
                                          >
                                            {event.fromState
                                              ? `${event.fromState.replaceAll("_", " ")} → `
                                              : ""}
                                            {event.toState?.replaceAll(
                                              "_",
                                              " ",
                                            ) ??
                                              event.eventType.replaceAll(
                                                "_",
                                                " ",
                                              )}
                                            {event.reason
                                              ? ` · ${event.reason}`
                                              : ""}
                                            <span
                                              style={{
                                                display: "block",
                                                color: "#98A2B3",
                                              }}
                                            >
                                              {new Date(
                                                event.createdAt,
                                              ).toLocaleString()}
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ol>
                                  </details>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : outcome.recommendationStatus === "dismissed" ? (
                          "Finding dismissed"
                        ) : (
                          "Not handed off"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${INV.border}`,
                          verticalAlign: "top",
                        }}
                      >
                        {outcome.purchaseOrder ? (
                          <Link
                            href="/inventory/purchases"
                            style={{
                              color: "var(--app-primary)",
                              textDecoration: "underline",
                            }}
                          >
                            {outcome.purchaseOrder.status.replaceAll("_", " ")}{" "}
                            · {outcome.purchaseOrder.receivedQuantity}/
                            {outcome.purchaseOrder.orderedQuantity} received
                          </Link>
                        ) : outcome.procurementRequest ? (
                          "No linked purchase order"
                        ) : (
                          "Not available yet"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${INV.border}`,
                          verticalAlign: "top",
                        }}
                      >
                        {outcome.product ? (
                          <span
                            style={{
                              color:
                                outcome.product.currentStock <
                                outcome.product.lowStockThreshold
                                  ? "#B42318"
                                  : "#027A48",
                            }}
                          >
                            {outcome.product.currentStock} on hand · threshold{" "}
                            {outcome.product.lowStockThreshold}
                          </span>
                        ) : (
                          "Product record unavailable"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${INV.border}`,
                          verticalAlign: "top",
                          minWidth: 250,
                        }}
                      >
                        {outcome.recordedSalesComparison.status ===
                          "available" &&
                        outcome.recordedSalesComparison.baseline &&
                        outcome.recordedSalesComparison.followUp ? (
                          <>
                            <div>
                              Before:{" "}
                              {outcome.recordedSalesComparison.baseline.recordedUnits.toLocaleString()}{" "}
                              units ·{" "}
                              {outcome.recordedSalesComparison.baseline.recordedUnitsPerWeek.toFixed(
                                1,
                              )}
                              /week
                            </div>
                            <div style={{ marginTop: 3 }}>
                              After:{" "}
                              {outcome.recordedSalesComparison.followUp.recordedUnits.toLocaleString()}{" "}
                              units ·{" "}
                              {outcome.recordedSalesComparison.followUp.recordedUnitsPerWeek.toFixed(
                                1,
                              )}
                              /week
                            </div>
                            <div style={{ marginTop: 3, color: "#667085" }}>
                              {outcome.recordedSalesComparison.windowDays}-day
                              windows around full receipt on{" "}
                              {outcome.recordedSalesComparison.receivedAt
                                ? new Date(
                                    outcome.recordedSalesComparison.receivedAt,
                                  ).toLocaleDateString()
                                : "date unavailable"}
                            </div>
                            <div style={{ marginTop: 3, color: "#667085" }}>
                              Sales recorded in{" "}
                              {
                                outcome.recordedSalesComparison.baseline
                                  .activeWeeks
                              }
                              /
                              {
                                outcome.recordedSalesComparison.baseline
                                  .totalWeeks
                              }{" "}
                              prior weeks and{" "}
                              {
                                outcome.recordedSalesComparison.followUp
                                  .activeWeeks
                              }
                              /
                              {
                                outcome.recordedSalesComparison.followUp
                                  .totalWeeks
                              }{" "}
                              follow-up weeks
                            </div>
                            {outcome.specialistAction?.outcomeMeasurement ? (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: 7,
                                  borderRadius: 7,
                                  background: "#F2F4F7",
                                  color: "#475467",
                                }}
                              >
                                <strong>
                                  Follow-up evidence{" "}
                                  {outcome.specialistAction.outcomeMeasurement
                                    .result === "measured"
                                    ? "recorded"
                                    : "inconclusive"}
                                </strong>
                                <div style={{ marginTop: 2 }}>
                                  {
                                    outcome.specialistAction.outcomeMeasurement
                                      .reason
                                  }
                                </div>
                                <div style={{ marginTop: 2, color: "#667085" }}>
                                  Saved{" "}
                                  {new Date(
                                    outcome.specialistAction.outcomeMeasurement
                                      .observedAt,
                                  ).toLocaleString()}
                                  {outcome.specialistAction.outcomeMeasurement
                                    .causalAttribution === false
                                    ? " · no causal attribution"
                                    : ""}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : outcome.recordedSalesComparison.status ===
                          "awaiting_window" ? (
                          <span style={{ color: "#667085" }}>
                            56-day follow-up after full receipt is still in
                            progress
                          </span>
                        ) : outcome.recordedSalesComparison.status ===
                          "awaiting_receipt" ? (
                          <span style={{ color: "#667085" }}>
                            Available after the purchase order is fully received
                          </span>
                        ) : (
                          <span style={{ color: "#667085" }}>
                            Available after a linked purchase order is fully
                            received
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {agentOutcomes[0] ? (
                <p style={{ margin: 5, fontSize: 10.5, color: "#667085" }}>
                  {agentOutcomes[0].measurementNote}
                </p>
              ) : null}
              <p style={{ margin: 5, fontSize: 10.5, color: "#667085" }}>
                Source: {agentOutcomes[0].recordedSalesComparison.source}.{" "}
                {agentOutcomes[0].recordedSalesComparison.note} Stockout
                prevention and causal sales impact are not tracked.
              </p>
            </div>
          )}
        </div>
      </section>
      <section
        aria-labelledby="inventory-branch-transfer-follow-through"
        style={{
          border: `1px solid ${INV.border}`,
          borderRadius: 12,
          background: "#FFFFFF",
          padding: 16,
          marginTop: 14,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h3
            id="inventory-branch-transfer-follow-through"
            style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#101828" }}
          >
            Branch transfer follow-through
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#667085" }}>
            Shows linked Stock Transfer status, requested and received units,
            and current branch stock. Approval and receipt stay in Stock
            Transfers.
          </p>
        </div>
        {disabledModules.has("branches") ? (
          <div role="status" style={{ fontSize: 11.5, color: "#667085" }}>
            Branch transfer follow-through is unavailable because the Branches module is disabled for this business.
          </div>
        ) : branchTransferOutcomesPending ? (
          <div style={{ fontSize: 11.5, color: "#667085" }}>
            Loading branch transfer records…
          </div>
        ) : branchTransferOutcomesError ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#B42318" }}>
            Branch transfer follow-through could not be loaded.
          </div>
        ) : branchTransferOutcomes.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "#667085" }}>
            No saved branch-rebalance findings to follow yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 760,
                fontSize: 11.5,
                color: "#344054",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "#667085" }}>
                  {["Product", "Source branch", "Destination branch", "Transfer", "Current stock"].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${INV.border}`,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branchTransferOutcomes.slice(0, 10).map((outcome) => (
                  <tr key={outcome.recommendationId}>
                    <td style={{ padding: 8, borderBottom: `1px solid ${INV.border}` }}>
                      <strong>{outcome.source.productName}</strong>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Suggested {outcome.suggestedQuantity ?? "Not recorded"} units
                      </div>
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${INV.border}` }}>
                      {outcome.source.businessName}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${INV.border}` }}>
                      {outcome.destination.businessName}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${INV.border}` }}>
                      {outcome.transfer ? (
                        <Link
                          href="/branches/transfers"
                          style={{ color: "var(--app-primary)", textDecoration: "underline" }}
                        >
                          {outcome.transfer.status.replaceAll("_", " ")} · {outcome.transfer.requestedQuantity} requested
                          {outcome.transfer.receivedQuantity !== null
                            ? ` · ${outcome.transfer.receivedQuantity} received`
                            : " · Not received"}
                        </Link>
                      ) : (
                        "No transfer prepared"
                      )}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${INV.border}` }}>
                      {outcome.source.currentStock ?? "Not available"} source · {outcome.destination.currentStock ?? "Not available"} destination
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "7px 5px 0", fontSize: 10.5, color: "#667085" }}>
              {branchTransferOutcomes[0]?.measurementNote} Observed {branchTransferOutcomes[0]?.observedAt ? new Date(branchTransferOutcomes[0].observedAt).toLocaleString() : "time not recorded"}.
            </p>
          </div>
        )}
      </section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "#3538CD",
            background: "#EEF4FF",
            borderRadius: 20,
            padding: "5px 12px",
          }}
        >
          Generated{" "}
          {dataUpdatedAt
            ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })
            : "…"}
        </span>
        <select
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          aria-label="Supplier"
          style={filterSelectStyle}
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as Urgency | "all")}
          aria-label="Urgency"
          style={filterSelectStyle}
        >
          <option value="all">All urgency</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          style={filterSelectStyle}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div
          style={{
            display: "flex",
            gap: 9,
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["reorder-suggestions"],
              })
            }
            style={{
              ...outlineBtnStyle,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button type="button" onClick={acceptAll} style={outlineBtnStyle}>
            Accept All
          </button>
          <button type="button" onClick={acceptAll} style={primaryBtnStyle}>
            Create Purchase Orders
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 14,
        }}
      >
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Suggestions" value={String(suggestionCount)} />
            <KpiTile
              label="Order Value"
              value={formatCurrency(orderValue, currency)}
              meta={
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#B54708",
                    background: "#FEF6E7",
                    borderRadius: 6,
                    padding: "3px 7px",
                  }}
                >
                  Estimate
                </span>
              }
            />
            <KpiTile
              label="Products at Risk"
              value={String(atRisk)}
              tone="red"
              meta="Under a week of cover"
            />
            <KpiTile
              label="Potential Lost Sales"
              value={formatCurrency(lostSalesEstimate, currency)}
              meta={
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#B54708",
                    background: "#FEF6E7",
                    borderRadius: 6,
                    padding: "3px 7px",
                  }}
                >
                  Estimate
                </span>
              }
            />
          </>
        )}
      </div>

      {velocityChart.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${INV.border}`,
            borderRadius: 16,
            padding: 17,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 14.5,
                fontWeight: 800,
                color: "#101828",
              }}
            >
              Sales velocity vs stock cover
            </h3>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "#475467",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "#C7D7FE",
                }}
              />
              Daily velocity
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "#475467",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "#12A150",
                }}
              />
              Days of cover
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {velocityChart.map((v) => (
              <div key={v.name}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#344054",
                    marginBottom: 6,
                  }}
                >
                  {v.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 6,
                      background: "#F2F4F7",
                      overflow: "hidden",
                      display: "block",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        borderRadius: 6,
                        background: "#C7D7FE",
                        width: `${v.velPct}%`,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      width: 76,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#475467",
                      textAlign: "right",
                    }}
                  >
                    {v.velLabel}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 6,
                      background: "#F2F4F7",
                      overflow: "hidden",
                      display: "block",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        borderRadius: 6,
                        background: v.coverColor,
                        width: `${v.coverPct}%`,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      width: 76,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#475467",
                      textAlign: "right",
                    }}
                  >
                    {v.coverLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: `1px solid ${INV.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            color: "#667085",
            lineHeight: 1.5,
          }}
        >
          Approved or shipped inbound branch transfers count only when one
          active destination product matches the SKU. Pending inbound transfers
          and missing or ambiguous SKU matches are excluded.
        </p>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock
            icon={Sparkles}
            iconBg="#F5EBFE"
            iconColor="#7E22CE"
            title="No additional reorder is suggested"
            description="No product currently has an uncovered reorder need from recorded sales and stock, or the current filters exclude it. Eligible open purchase orders and mapped branch transfers are included."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1120,
              }}
            >
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: "10px 17px",
                    }}
                  >
                    Product
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Urgency
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Current stock
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Daily velocity
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Days of cover
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Suggested qty
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Supplier
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: 10,
                    }}
                  >
                    Est. cost
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#98A2B3",
                      padding: "10px 17px",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const decision = decisions[r.productId];
                  return (
                    <tr
                      key={r.productId}
                      style={{ borderTop: "1px solid #F2F4F7" }}
                    >
                      <td style={{ padding: "11px 17px" }}>
                        <button
                          type="button"
                          onClick={() => openRationale(r.productId)}
                          style={{
                            border: 0,
                            background: "none",
                            padding: 0,
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "#0E8442",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td style={{ padding: 11 }}>
                        <span style={chipStyle(URGENCY_TONE[r.urgency])}>
                          {r.urgency}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: 11,
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#0F172A",
                          textAlign: "right",
                        }}
                      >
                        {r.stock}
                        {r.committedOutboundTransferQty > 0 && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#667085",
                            }}
                          >
                            Available after transfers{" "}
                            {r.availableStockAfterOutboundTransfers}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: 11,
                          fontSize: 12.5,
                          color: "#475467",
                          textAlign: "right",
                        }}
                      >
                        {r.velocity}/day
                      </td>
                      <td
                        style={{
                          padding: 11,
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: "#B54708",
                          textAlign: "center",
                        }}
                      >
                        {r.cover != null ? `${r.cover}d` : "—"}
                      </td>
                      <td
                        style={{
                          padding: 11,
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: "#0E8442",
                          textAlign: "right",
                        }}
                      >
                        {r.suggested}
                        {r.purchaseQuantityLabel && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#667085",
                            }}
                          >
                            {r.purchaseQuantityLabel}
                          </span>
                        )}
                        {(r.incomingPurchaseQty > 0 ||
                          r.incomingTransferQty > 0) && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#667085",
                            }}
                          >
                            Open supply: {r.incomingPurchaseQty} purchase ·{" "}
                            {r.incomingTransferQty} transfer
                          </span>
                        )}
                        {r.minimumReorderQty !== null && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#667085",
                            }}
                          >
                            Product floor {r.minimumReorderQty} stock units
                          </span>
                        )}
                      </td>
                      <td
                        style={{ padding: 11, fontSize: 12, color: "#667085" }}
                      >
                        {r.supplierName}
                      </td>
                      <td
                        style={{
                          padding: 11,
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: "#101828",
                          textAlign: "right",
                        }}
                      >
                        {formatCurrency(r.estCost, currency)}
                      </td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            gap: 7,
                            justifyContent: "flex-end",
                          }}
                        >
                          {!decision && (
                            <>
                              <button
                                type="button"
                                onClick={() => dismiss(r.productId)}
                                style={{
                                  border: `1px solid ${INV.border}`,
                                  background: "#fff",
                                  borderRadius: 9,
                                  padding: "8px 11px",
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  color: "#667085",
                                  cursor: "pointer",
                                  minHeight: 40,
                                }}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                onClick={() => accept(r.productId)}
                                style={{
                                  border: 0,
                                  background: INV.primary,
                                  borderRadius: 9,
                                  padding: "8px 13px",
                                  fontSize: 11.5,
                                  fontWeight: 800,
                                  color: "#fff",
                                  cursor: "pointer",
                                  minHeight: 40,
                                }}
                              >
                                Accept
                              </button>
                            </>
                          )}
                          {decision === "accepted" && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11.5,
                                fontWeight: 800,
                                color: "#0E8442",
                              }}
                            >
                              <Check size={13} />
                              Accepted
                            </span>
                          )}
                          {decision === "dismissed" && (
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: "#98A2B3",
                              }}
                            >
                              Dismissed
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div
          style={{
            padding: "11px 17px",
            borderTop: "1px solid #F0F2F5",
            fontSize: 11.5,
            color: "#98A2B3",
          }}
        >
          Suggestions use recorded sales velocity and your configured lead-time
          baseline. Click a product name to see the calculation. The
          table&apos;s Accept/Dismiss choices are local to this page; dismissals
          in the separate Inventory Agent review panel are saved with an audit
          reason.
        </div>
      </div>
    </main>
  );
}
