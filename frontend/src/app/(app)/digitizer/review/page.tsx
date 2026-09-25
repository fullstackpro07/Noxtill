import { Suspense } from "react";
import { ReviewScreen } from "@/components/digitizer/screens/review-screen";

export default function DigitizerReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewScreen />
    </Suspense>
  );
}
