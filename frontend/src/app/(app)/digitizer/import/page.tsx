import { Suspense } from "react";
import { ImportScreen } from "@/components/digitizer/screens/import-screen";

export default function DigitizerImportPage() {
  return (
    <Suspense fallback={null}>
      <ImportScreen />
    </Suspense>
  );
}
