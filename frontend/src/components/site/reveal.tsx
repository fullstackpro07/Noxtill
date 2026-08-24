"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fade + rise-in animation triggered once an element crosses into view, ported from the
 * marketing redesign's RevealOnScroll.dc.html. Renders children unwrapped (no hidden state,
 * no observer) when the visitor prefers reduced motion, rather than relying on the global
 * `prefers-reduced-motion` CSS rule to zero out the animation duration — that would still
 * gate first paint on scroll position, which the original behavior explicitly avoids.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"reduced" | "hidden" | "visible">(() =>
    prefersReducedMotion() ? "reduced" : "hidden",
  );

  useEffect(() => {
    if (state === "reduced") return;
    const node = ref.current;
    if (!node) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          timer = setTimeout(() => setState("visible"), delay);
          io.unobserve(entry.target);
          return;
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [state, delay]);

  return (
    <Tag ref={ref} className={className} data-reveal-state={state === "reduced" ? undefined : state}>
      {children}
    </Tag>
  );
}
