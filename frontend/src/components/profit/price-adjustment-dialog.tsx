"use client";

import { Dialog } from "@/components/ui/dialog";
import { ProfitWhatifTab } from "./profit-whatif-tab";

export function PriceAdjustmentDialog({ productId, onClose }: { productId?: string; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Price adjustment — what if?" className="max-w-lg">
      <ProfitWhatifTab initialProductId={productId} />
    </Dialog>
  );
}
