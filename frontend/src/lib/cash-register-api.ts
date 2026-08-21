import { apiFetch } from "@/lib/api-client";

export type CashMovementType = "opening" | "sale" | "cash_in" | "cash_out" | "refund";

interface RawCashMovement {
  id: string;
  type: CashMovementType;
  amount: string;
  note: string | null;
  recordedByUserId: string | null;
  createdAt: string;
}

export interface LiveCashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  note: string | null;
  recordedByUserId: string | null;
  createdAt: string;
}

function toLiveMovement(raw: RawCashMovement): LiveCashMovement {
  return {
    id: raw.id,
    type: raw.type,
    amount: Number(raw.amount),
    note: raw.note,
    recordedByUserId: raw.recordedByUserId,
    createdAt: raw.createdAt,
  };
}

/** The staff-safe shape (see backend `stripVariance()`) simply omits these three keys entirely. */
interface RawCashShift {
  id: string;
  openedByUserId: string | null;
  openingFloat: string;
  status: "open" | "closed";
  countedCash?: string | null;
  variance?: string | null;
  varianceNote?: string | null;
  movements: RawCashMovement[];
  openedAt: string;
  closedAt: string | null;
}

export interface LiveCashShift {
  id: string;
  openedByUserId: string | null;
  openingFloat: number;
  status: "open" | "closed";
  /** Undefined (not null) when the caller is staff and the backend stripped these keys entirely. */
  countedCash?: number | null;
  variance?: number | null;
  varianceNote?: string | null;
  hasVarianceData: boolean;
  movements: LiveCashMovement[];
  openedAt: string;
  closedAt: string | null;
}

function toLiveShift(raw: RawCashShift): LiveCashShift {
  return {
    id: raw.id,
    openedByUserId: raw.openedByUserId,
    openingFloat: Number(raw.openingFloat),
    status: raw.status,
    countedCash: raw.countedCash != null ? Number(raw.countedCash) : raw.countedCash,
    variance: raw.variance != null ? Number(raw.variance) : raw.variance,
    varianceNote: raw.varianceNote,
    hasVarianceData: "variance" in raw,
    movements: raw.movements.map(toLiveMovement),
    openedAt: raw.openedAt,
    closedAt: raw.closedAt,
  };
}

export function fetchCurrentShift(): Promise<LiveCashShift | null> {
  return apiFetch<RawCashShift | null>("/cash/shift/current").then((raw) => (raw ? toLiveShift(raw) : null));
}

export function fetchShiftHistory(): Promise<LiveCashShift[]> {
  return apiFetch<RawCashShift[]>("/cash/shifts").then((rows) => rows.map(toLiveShift));
}

export function openShift(openingFloat: number): Promise<LiveCashShift> {
  return apiFetch<RawCashShift>("/cash/shift/open", {
    method: "POST",
    body: JSON.stringify({ openingFloat }),
  }).then(toLiveShift);
}

export function recordCashMovement(input: { type: "cash_in" | "cash_out"; amount: number; note?: string }): Promise<LiveCashMovement> {
  return apiFetch<RawCashMovement>("/cash/movements", { method: "POST", body: JSON.stringify(input) }).then(toLiveMovement);
}

export function closeShiftBare(): Promise<LiveCashShift> {
  return apiFetch<RawCashShift>("/cash/shift/close", { method: "POST" }).then(toLiveShift);
}

export function reconcileShift(input: { countedCash: number; note?: string }): Promise<LiveCashShift> {
  return apiFetch<RawCashShift>("/cash-reconciliation", { method: "POST", body: JSON.stringify(input) }).then(toLiveShift);
}
