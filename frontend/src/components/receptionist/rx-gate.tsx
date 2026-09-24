"use client";

import type { ReactNode } from "react";
import { ErrorBanner } from "@/components/shared/error-states";
import { useRx } from "./rx-data";
import { SkeletonBlock } from "./rx-ui";

/** Every screen reads the same call data; this shows the skeleton / error state once, in one place. */
export function RxGate({ children }: { children: ReactNode }) {
  const rx = useRx();
  if (rx.error) return <ErrorBanner title="Couldn't load your calls" onRetry={rx.refetch} />;
  if (rx.loading) {
    return (
      <>
        <SkeletonBlock h={150} />
        <SkeletonBlock h={110} />
        <SkeletonBlock h={280} />
      </>
    );
  }
  return <>{children}</>;
}
