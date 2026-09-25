import { Suspense } from "react";
import { HistoryScreen } from "@/components/digitizer/screens/history-screen";

export default function DigitizerHistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryScreen />
    </Suspense>
  );
}
