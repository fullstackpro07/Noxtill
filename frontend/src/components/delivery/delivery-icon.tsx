"use client";

import type { CSSProperties } from "react";

/** Renders one raw SVG path exactly as the design file specifies it — no icon-name registry needed since the design gives the path data directly per tab/glyph. */
export function DeliveryPathIcon({ d, size = 15, style }: { d: string; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}
