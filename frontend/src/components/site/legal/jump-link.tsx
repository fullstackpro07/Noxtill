"use client";

import type { CSSProperties, ReactNode } from "react";
import { jumpTo } from "./use-legal";

/** In-page anchor that smooth-scrolls below the sticky header and focuses the target section. */
export function JumpLink({ id, style, className, children }: { id: string; style?: CSSProperties; className?: string; children: ReactNode }) {
  return (
    <a href={`#${id}`} onClick={jumpTo(id)} style={style} className={className}>
      {children}
    </a>
  );
}

/** Opens the browser print dialog (Print / Save as PDF). */
export function PrintButton({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} style={style}>
      {children}
    </button>
  );
}
