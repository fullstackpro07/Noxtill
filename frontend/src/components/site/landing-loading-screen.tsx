"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface LandingLoadingScreenProps {
  /** Minimum time the screen stays up, in ms (default: 850). */
  minDuration?: number;
}

/** Plain white splash with the Noxtill mark centred; fades out once the page has had `minDuration`. */
export function LandingLoadingScreen({ minDuration = 850 }: LandingLoadingScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setIsFadingOut(true), minDuration);
    // Matches the CSS transition below.
    const done = setTimeout(() => setIsDone(true), minDuration + 400);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [minDuration]);

  // Unmount once faded so it never blocks clicks.
  if (isDone) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Noxtill"
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-white select-none transition-opacity duration-[400ms] ease-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <Image
        src="/brand/noxtill-logo1.png"
        alt="Noxtill"
        width={1159}
        height={798}
        priority
        className="w-16 h-auto sm:w-20 motion-safe:animate-[noxtill-splash_1.4s_ease-in-out_infinite]"
      />
      <style>{`@keyframes noxtill-splash { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.94); opacity: .82; } }`}</style>
    </div>
  );
}
