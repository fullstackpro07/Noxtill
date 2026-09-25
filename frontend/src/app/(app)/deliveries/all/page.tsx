import { Suspense } from "react";
import { AllDeliveriesView } from "@/components/delivery/all-deliveries-view";

export default function AllDeliveriesPage() {
  return (
    <Suspense fallback={null}>
      <AllDeliveriesView />
    </Suspense>
  );
}
