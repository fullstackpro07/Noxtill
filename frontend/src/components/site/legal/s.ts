import type { CSSProperties } from "react";

/**
 * Parses a CSS declaration string into a React style object, so the Legal & Trust pages can carry
 * the design files' inline styles verbatim (docs/Legal pages/*.dc.html). Font stacks are normalised to
 * the design's own (family name first, then system-ui) — next/font (./fonts) registers the real family
 * names, and skipping its metric-adjusted fallback keeps glyph fallback (→, ✓, ●) identical to the
 * design. Results are memoised per string.
 */
const cache = new Map<string, CSSProperties>();

const FONT_SUBS: [RegExp, string][] = [
  [/'Plus Jakarta Sans',\s*(system-ui,\s*)?sans-serif/g, "'Plus Jakarta Sans', system-ui, sans-serif"],
  [/'JetBrains Mono',\s*(ui-monospace,\s*)?monospace/g, "'JetBrains Mono', ui-monospace, monospace"],
];

export function s(decl: string): CSSProperties {
  const hit = cache.get(decl);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const part of decl.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const prop = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    if (!prop || !value) continue;
    for (const [re, rep] of FONT_SUBS) value = value.replace(re, rep);
    const key = prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = value;
  }
  const style = out as CSSProperties;
  if (cache.size < 4000) cache.set(decl, style);
  return style;
}
