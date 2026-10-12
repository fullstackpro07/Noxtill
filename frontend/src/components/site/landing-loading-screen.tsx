"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface LandingLoadingScreenProps {
  /** Optional minimum display duration in ms (default: 850) */
  minDuration?: number;
}

export function LandingLoadingScreen({ minDuration = 850 }: LandingLoadingScreenProps) {
  const [progress, setProgress] = useState(12);
  const [phaseText, setPhaseText] = useState("Initializing business operating system…");
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const startTime = performance.now();
    let animFrame: number;


    const updateProgress = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / minDuration) * 100));

      if (pct < 35) {
        setProgress(Math.max(15, pct));
        setPhaseText("Initializing business operating system…");
      } else if (pct < 75) {
        setProgress(pct);
        setPhaseText("Connecting intelligent workflows…");
      } else if (pct < 100) {
        setProgress(pct);
        setPhaseText("Preparing your workspace…");
      } else {
        setProgress(100);
        setPhaseText("Welcome to Noxtill");

        // Small beat at 100% before dissolving
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            setIsDone(true);
          }, 450); // Matches CSS transition duration
        }, 120);
        return;
      }

      animFrame = requestAnimationFrame(updateProgress);
    };

    animFrame = requestAnimationFrame(updateProgress);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [minDuration]);

  // Once completely faded out, unmount from DOM so it doesn't block interactions or memory
  if (isDone) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Noxtill"
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none transition-all duration-450 ease-out ${
        isFadingOut ? "opacity-0 scale-[1.015] pointer-events-none" : "opacity-100 scale-100"
      }`}
      style={{
        backgroundColor: "#03150f",
        backgroundImage: `
          radial-gradient(circle at 50% 42%, rgba(7, 120, 76, 0.28) 0%, rgba(3, 21, 15, 0.96) 65%, #020f0b 100%),
          radial-gradient(circle at 20% 80%, rgba(14, 168, 106, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 80% 20%, rgba(79, 227, 168, 0.1) 0%, transparent 40%)
        `,
      }}
    >
      {/* Ambient background glow ring */}
      <div
        className="absolute w-[360px] h-[360px] sm:w-[460px] sm:h-[460px] rounded-full pointer-events-none animate-pulse"
        style={{
          background: "radial-gradient(circle, rgba(79, 227, 168, 0.14) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Center branded card / emblem */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-sm text-center">
        {/* Logo mark with elegant glow */}
        <div className="relative mb-6 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: "rgba(14, 168, 106, 0.25)",
              filter: "blur(18px)",
              transform: "scale(1.2)",
            }}
          />
          <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#063323]/80 border border-[#4fe3a8]/25 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-md">
            <Image
              src="/brand/noxtill-mark.png"
              alt="Noxtill"
              width={64}
              height={64}
              priority
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_12px_rgba(79,227,168,0.45)]"
            />
          </div>
        </div>

        {/* Wordmark & Brand Tagline */}
        <div className="flex flex-col items-center gap-1.5 mb-8">
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans drop-shadow-sm">
            Noxtill
          </span>
          <span className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.18em] text-[#a4d4bc]">
            AI-Powered Business Operating System
          </span>
        </div>

        {/* Progress bar container */}
        <div className="w-56 sm:w-64 flex flex-col items-center gap-3">
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden backdrop-blur-sm p-[1px] border border-white/5">
            <div
              className="h-full rounded-full transition-all duration-150 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #07784c 0%, #0ea86a 50%, #4fe3a8 100%)",
                boxShadow: "0 0 10px rgba(79, 227, 168, 0.65)",
              }}
            />
          </div>

          {/* Micro status text */}
          <div className="flex items-center justify-between w-full px-0.5 text-[11px] text-[#7fa393] font-mono">
            <span className="truncate pr-2">{phaseText}</span>
            <span className="font-semibold text-[#a4d4bc] shrink-0 tabular-nums">
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
