export interface PurchasePackRounding {
  stockQuantity: number;
  purchaseUnitCount: number | null;
}

/** Apply a product-wide minimum only to a real positive uncovered stock need. */
export function applyMinimumReorderQty(
  uncoveredStockNeed: number,
  minimumReorderQty: number | null,
): number {
  const need = Math.max(0, Math.ceil(uncoveredStockNeed));
  if (need === 0 || minimumReorderQty === null) return need;
  if (!Number.isInteger(minimumReorderQty) || minimumReorderQty < 1) {
    return need;
  }
  return Math.max(need, minimumReorderQty);
}

/** Keeps quantities in canonical stock units and rounds configured products to whole packs. */
export function roundUpToPurchasePack(
  stockQuantity: number,
  purchasePackSize: number | null,
): PurchasePackRounding {
  const quantity = Math.max(0, Math.ceil(stockQuantity));
  if (
    quantity === 0 ||
    purchasePackSize === null ||
    !Number.isInteger(purchasePackSize) ||
    purchasePackSize < 2
  ) {
    return { stockQuantity: quantity, purchaseUnitCount: null };
  }

  const purchaseUnitCount = Math.ceil(quantity / purchasePackSize);
  return {
    stockQuantity: purchaseUnitCount * purchasePackSize,
    purchaseUnitCount,
  };
}
