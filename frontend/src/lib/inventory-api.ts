import { apiFetch } from "@/lib/api-client";
import type { SpecialistAgentAiUsageCall } from "@/lib/specialist-agent-usage";
import { postSpecialistAgentRun } from "@/lib/specialist-agent-run-idempotency";

export type InventoryStatus = "out_of_stock" | "low_stock" | "ok";

export interface LiveInventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  stockQty: number;
  lowStockThreshold: number;
  costPrice: number;
  stockValue: number;
  lastPurchaseAt: string | null;
  supplier: string | null;
  /** Most recent `sale`-kind movement's date, or null if this product has never sold. */
  lastSoldAt: string | null;
  /** Units sold per day, trailing 30 days — same window as reorder suggestions. */
  velocityPerDay: number;
  /** stockQty / velocityPerDay, or null when there's no recent sales velocity to divide by. */
  daysOfCover: number | null;
  /** Real velocity exists but current stock covers more than 120 days at that pace. */
  overstocked: boolean;
  status: InventoryStatus;
}

/** GET /inventory — on-hand/threshold/value for every product-kind item, plus its most recent purchase's supplier. */
export function fetchInventory(): Promise<LiveInventoryItem[]> {
  return apiFetch<LiveInventoryItem[]>("/inventory");
}

/** UPD-BE-110 fix-it: the real `StockMovementKind` enum has 7 values — this used to only list 3,
 * so a Stock Count adjustment or a Stock Transfer row silently fell through `describeMovement()`'s
 * catch-all "Sold via POS" branch and had no icon/tone in `MOVEMENT_ICON`/`MOVEMENT_TONE`. */
export type MovementKind =
  | "purchase"
  | "sale"
  | "wastage"
  | "adjustment"
  | "return"
  | "transfer_out"
  | "transfer_in"
  | "production_consume"
  | "production_output";

interface RawMovement {
  id: string;
  kind: MovementKind;
  qty: number;
  unitCost: string | null;
  supplier: string | null;
  reason: string | null;
  /** Inventory depth fix (UPD-INT-013): only set for `kind: "wastage"`. */
  wastageReason: WastageReason | null;
  createdAt: string;
}

export interface LiveMovement {
  id: string;
  kind: MovementKind;
  qty: number;
  unitCost: number | null;
  description: string;
  wastageReason: WastageReason | null;
  createdAt: string;
}

function describeMovement(m: RawMovement): string {
  switch (m.kind) {
    case "purchase":
      return m.supplier ? `Restocked from ${m.supplier}` : "Restocked";
    case "wastage":
      return m.reason ?? "Written off";
    case "sale":
      return "Sold via POS";
    case "adjustment":
      return m.reason ?? "Stock count adjustment";
    case "return":
      return m.reason ?? "Customer return";
    case "transfer_out":
      return m.reason ?? "Transferred to another branch";
    case "transfer_in":
      return m.reason ?? "Transferred from another branch";
    case "production_consume":
      return m.reason ?? "Used in production";
    case "production_output":
      return m.reason ?? "Produced";
  }
}

function toLiveMovement(m: RawMovement): LiveMovement {
  return {
    id: m.id,
    kind: m.kind,
    qty: m.qty,
    unitCost: m.unitCost != null ? Number(m.unitCost) : null,
    description: describeMovement(m),
    wastageReason: m.wastageReason,
    createdAt: m.createdAt,
  };
}

export function fetchMovements(productId: string): Promise<LiveMovement[]> {
  return apiFetch<RawMovement[]>(`/inventory/${productId}/movements`).then(
    (rows) => rows.map(toLiveMovement),
  );
}

export interface RecordPurchaseInput {
  productId: string;
  qty: number;
  unitCost: number;
  supplier?: string;
}

export function recordPurchase(
  input: RecordPurchaseInput,
): Promise<LiveMovement> {
  return apiFetch<RawMovement>("/inventory/purchases", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toLiveMovement);
}

export type WastageReason = "Expired" | "Damaged" | "Theft" | "Other";

export interface RecordWastageInput {
  productId: string;
  qty: number;
  reason: WastageReason;
  note?: string;
}

export function recordWastage(
  input: RecordWastageInput,
): Promise<LiveMovement> {
  return apiFetch<RawMovement>("/inventory/wastage", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toLiveMovement);
}

// --- Stock Movements, cross-product (UPD-BE-110) ---

interface RawMovementWithBalance extends RawMovement {
  productId: string;
  resultingBalance: number;
  product: { id: string; name: string };
  supplierRef: { id: string; name: string } | null;
}

export interface StockMovementRow extends LiveMovement {
  productId: string;
  productName: string;
  resultingBalance: number;
  supplierName: string | null;
}

function toStockMovementRow(m: RawMovementWithBalance): StockMovementRow {
  return {
    ...toLiveMovement(m),
    productId: m.productId,
    productName: m.product.name,
    resultingBalance: m.resultingBalance,
    supplierName: m.supplierRef?.name ?? m.supplier ?? null,
  };
}

export interface MovementFilters {
  productId?: string;
  kind?: MovementKind;
  from?: string;
  to?: string;
}

export async function fetchStockMovements(
  filters: MovementFilters = {},
): Promise<StockMovementRow[]> {
  const query = new URLSearchParams();
  if (filters.productId) query.set("productId", filters.productId);
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const qs = query.toString();
  const raw = await apiFetch<RawMovementWithBalance[]>(
    `/stock/movements${qs ? `?${qs}` : ""}`,
  );
  return raw.map(toStockMovementRow);
}

// --- Low Stock, dedicated (UPD-BE-111) ---

export interface LowStockItem extends LiveInventoryItem {
  daysOutOfStock: number;
  lostSalesEstimate: number;
}

export function fetchLowStock(): Promise<LowStockItem[]> {
  return apiFetch<LowStockItem[]>("/stock?status=low");
}

// --- Back-in-stock waitlist (UPD-BE-111) ---

export interface WaitlistEntry {
  id: string;
  productId: string;
  customerId: string;
  customer: { id: string; name: string; phone: string };
  notifiedAt: string | null;
  createdAt: string;
}

export function fetchWaitlist(productId: string): Promise<WaitlistEntry[]> {
  return apiFetch<WaitlistEntry[]>(`/stock/${productId}/waitlist`);
}

export function addToWaitlist(
  productId: string,
  customerId: string,
): Promise<WaitlistEntry> {
  return apiFetch<WaitlistEntry>(`/stock/${productId}/waitlist`, {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export function removeFromWaitlist(id: string): Promise<void> {
  return apiFetch<void>(`/stock/waitlist/${id}`, { method: "DELETE" });
}

export function notifyWaitlist(
  productId: string,
): Promise<{ notifiedCount: number }> {
  return apiFetch<{ notifiedCount: number }>(
    `/stock/${productId}/waitlist/notify`,
    { method: "POST" },
  );
}

export interface WaitlistNotificationPreview {
  productId: string;
  productName: string;
  availableStock: number;
  asOf: string;
  waitingCount: number;
  eligibleCount: number;
  blockedCount: number;
  providerDeliveryChecked: false;
  recipients: Array<{
    name: string;
    status: "eligible" | "blocked";
    channel: string | null;
    message: string | null;
    reasonCode: string | null;
    reason: string | null;
  }>;
}

export function previewWaitlistNotification(
  productId: string,
): Promise<WaitlistNotificationPreview> {
  return apiFetch<WaitlistNotificationPreview>(
    `/stock/${productId}/waitlist/notification-preview`,
    { method: "POST" },
  );
}

/** A lighter partial update than `updateProduct()` (which requires the full product draft) — safe for a single-field bulk threshold edit. */
export function updateLowStockThreshold(
  productId: string,
  lowStockThreshold: number,
): Promise<void> {
  return apiFetch<void>(`/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ lowStockThreshold }),
  });
}

// --- Reorder Suggestions (UPD-BE-077, real backend, previously zero frontend) ---

export interface ReorderSuggestionItem {
  productId: string;
  name: string;
  sku: string | null;
  currentStock: number;
  lowStockThreshold: number;
  velocityPerDay: number;
  baseSuggestedQty: number;
  incomingPurchaseQty: number;
  incomingTransferQty: number;
  committedOutboundTransferQty: number;
  availableStockAfterOutboundTransfers: number;
  unroundedAdditionalQty: number;
  minimumReorderQty: number | null;
  suggestedQty: number;
  purchasePackSize: number | null;
  purchasePackCount: number | null;
  stockUnitLabel: string | null;
  purchaseUnitLabel: string | null;
  baselineLeadTimeDays: number;
}

export interface ReorderSuggestionGroup {
  supplierId: string;
  supplierName: string;
  items: ReorderSuggestionItem[];
  totalSuggestedQty: number;
}

export function fetchReorderSuggestions(): Promise<ReorderSuggestionGroup[]> {
  return apiFetch<ReorderSuggestionGroup[]>("/stock/reorder-suggestions");
}

export interface InventoryAgentEvidence {
  id: string;
  sourceType: string;
  resourceType: string;
  resourceId: string;
  fieldRefs: string[];
  observedValues: Record<string, unknown>;
  observedAt: string;
  fetchedAt: string;
  freshness: string;
  calculation: string | null;
}

export interface InventoryAgentRecommendation {
  id: string;
  title: string;
  summary: string;
  classification: string;
  details: Record<string, unknown>;
  assumptions: string[];
  missingData: string[];
  confidenceValue: number | null;
  confidenceMethod: string;
  riskTier: string;
  approvalRequired: boolean;
  status: string;
  procurementRequest?: { id: string; status: string; version: number } | null;
  stockTransfer?: { id: string; status: string; createdAt: string } | null;
  inventoryCountTask?: {
    id: string;
    status: "open" | "completed" | "dismissed";
    reason: string;
    stockCountId: string | null;
    createdAt: string;
    completedAt: string | null;
    dismissedByUserId: string | null;
    dismissReason: string | null;
    dismissedAt: string | null;
  } | null;
  inventoryWastageReviewTask?: {
    id: string;
    status: "open" | "reviewed" | "dismissed";
    reason: string;
    reviewNote: string | null;
    reviewedAt: string | null;
    dismissReason: string | null;
    dismissedAt: string | null;
    createdAt: string;
  } | null;
  evidence: InventoryAgentEvidence[];
}

export interface InventoryAgentRun {
  id: string;
  agentKey: string;
  agentVersion: string;
  moduleId: string;
  triggerType: string;
  status: string;
  inputRefs: unknown[];
  output: {
    summary?: string;
    recommendationCount?: number;
    signalCounts?: {
      demandForecast?: number;
      demandHistoryUnavailable?: number;
      inventoryValuation?: number;
      reorder: number;
      stockThreshold: number;
      overstock: number;
      countVariance: number;
      recentWastage: number;
      backInStockReview?: number;
      branchRebalance?: number;
      repeatedCountVariance?: number;
    };
    branchRebalanceAvailability?: "available" | "single_location";
    activeLocationCount?: number;
    inventoryValuation?: {
      productRowCount: number;
      stockValueAtCost: number;
      overstockFlaggedValueAtCost: number;
      zeroCostPriceRowCount: number;
    };
    observedAt?: string;
    formulaVersion?: string;
    salesWindowDays?: number;
    baselineLeadTimeDays?: number;
    aiSummary?: {
      status: string;
      text: string | null;
      message: string | null;
      inputTokens: number;
      outputTokens: number;
    };
  };
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  recommendations: InventoryAgentRecommendation[];
  aiCallLogs?: SpecialistAgentAiUsageCall[];
}

export interface InventoryAgentActionOutcome {
  recommendationId: string;
  title: string;
  recommendationStatus: string;
  recommendedQuantity: number | null;
  recommendationCreatedAt: string;
  product: {
    id: string;
    name: string;
    currentStock: number;
    lowStockThreshold: number;
    observedAt: string;
  } | null;
  procurementRequest: {
    id: string;
    status: string;
    updatedAt: string;
    requestedQuantity: number | null;
  } | null;
  specialistAction: {
    id: string;
    state: string;
    outcomeMeasurement: {
      result: "measured" | "inconclusive";
      observedAt: string;
      reason: string;
      source: string | null;
      windowDays: number | null;
      baseline: {
        recordedUnits: number;
        activeWeeks: number;
        totalWeeks: number;
      } | null;
      followUp: {
        recordedUnits: number;
        activeWeeks: number;
        totalWeeks: number;
      } | null;
      causalAttribution: false | null;
    } | null;
    requiredApproval: boolean;
    executionAttemptCount: number;
    correlationId: string;
    canonicalOperationId: string | null;
    createdAt: string;
    updatedAt: string;
    approvedAt: string | null;
    executedAt: string | null;
    verifiedAt: string | null;
    lastEvent: {
      sequence: number;
      eventType: string;
      fromState: string | null;
      toState: string | null;
      reason: string | null;
      createdAt: string;
    } | null;
    events: {
      sequence: number;
      eventType: string;
      fromState: string | null;
      toState: string | null;
      reason: string | null;
      createdAt: string;
    }[];
  } | null;
  purchaseOrder: {
    id: string;
    status: string;
    sentAt: string | null;
    confirmedAt: string | null;
    receivedAt: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
  } | null;
  recordedSalesComparison: {
    status:
      "not_received" | "awaiting_receipt" | "awaiting_window" | "available";
    source: string;
    windowDays: number;
    receivedAt: string | null;
    baseline: {
      recordedUnits: number;
      activeWeeks: number;
      totalWeeks: number;
      recordedUnitsPerWeek: number;
    } | null;
    followUp: {
      recordedUnits: number;
      activeWeeks: number;
      totalWeeks: number;
      recordedUnitsPerWeek: number;
    } | null;
    note: string;
  };
  measurementNote: string;
}

export function fetchInventoryAgentActionOutcomes(): Promise<
  InventoryAgentActionOutcome[]
> {
  return apiFetch<InventoryAgentActionOutcome[]>("/inventory/agent-outcomes");
}

export function fetchInventoryAgentRuns(): Promise<InventoryAgentRun[]> {
  return apiFetch<InventoryAgentRun[]>("/inventory/agent-runs");
}

export function runInventoryAgent(): Promise<InventoryAgentRun> {
  return postSpecialistAgentRun("inventory", {}, (idempotencyKey) =>
    apiFetch<InventoryAgentRun>("/inventory/agent-runs", {
      method: "POST",
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    }),
  );
}

export function prepareInventoryPurchaseRequest(recommendationId: string) {
  return apiFetch<{ id: string; status: string; version: number }>(
    `/inventory/agent-recommendations/${encodeURIComponent(recommendationId)}/purchase-request`,
    { method: "POST" },
  );
}

export function dismissInventoryReorderRecommendation(
  recommendationId: string,
  reason: string,
) {
  return apiFetch<InventoryAgentRecommendation>(
    `/inventory/agent-recommendations/${encodeURIComponent(recommendationId)}/dismiss`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function prepareInventoryBranchTransfer(recommendationId: string) {
  return apiFetch<{
    id: string;
    status: string;
    sourceBusinessId: string;
    destBusinessId: string;
  }>(
    `/inventory/agent-recommendations/${encodeURIComponent(recommendationId)}/transfer-draft`,
    { method: "POST" },
  );
}

export function requestInventoryRecount(recommendationId: string) {
  return apiFetch<
    NonNullable<InventoryAgentRecommendation["inventoryCountTask"]>
  >(
    `/inventory/agent-recommendations/${encodeURIComponent(recommendationId)}/count-task`,
    { method: "POST" },
  );
}

export function dismissInventoryRecount(taskId: string, reason: string) {
  return apiFetch<
    NonNullable<InventoryAgentRecommendation["inventoryCountTask"]>
  >(`/inventory/agent-count-tasks/${encodeURIComponent(taskId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function requestInventoryWastageReview(recommendationId: string) {
  return apiFetch<
    NonNullable<InventoryAgentRecommendation["inventoryWastageReviewTask"]>
  >(
    `/inventory/agent-recommendations/${encodeURIComponent(recommendationId)}/wastage-review-task`,
    { method: "POST" },
  );
}

export function resolveInventoryWastageReview(taskId: string, note: string) {
  return apiFetch<
    NonNullable<InventoryAgentRecommendation["inventoryWastageReviewTask"]>
  >(
    `/inventory/agent-wastage-review-tasks/${encodeURIComponent(taskId)}/resolve`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}

export function dismissInventoryWastageReview(taskId: string, reason: string) {
  return apiFetch<
    NonNullable<InventoryAgentRecommendation["inventoryWastageReviewTask"]>
  >(
    `/inventory/agent-wastage-review-tasks/${encodeURIComponent(taskId)}/dismiss`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
