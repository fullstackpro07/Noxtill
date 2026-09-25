import { Suspense } from "react";
import { CaptureScreen } from "@/components/digitizer/screens/capture-screen";

export default function DigitizerCapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureScreen />
    </Suspense>
  );
}
