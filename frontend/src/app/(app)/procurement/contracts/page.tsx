import { Suspense } from "react";
import { ProcurementContractsView } from "@/components/procurement/procurement-contracts-view";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProcurementContractsView />
    </Suspense>
  );
}
