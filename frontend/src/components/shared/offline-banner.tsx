"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Persistent top strip while offline — POS/booking flows should queue writes locally rather than fail silently. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator.onLine is unavailable during SSR, so the true initial value can only be read post-mount
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground">
      <WifiOff className="h-4 w-4" aria-hidden />
      You&apos;re offline — new sales will be saved and synced once you&apos;re back online.
    </div>
  );
}
