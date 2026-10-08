import { createElement, type ReactElement } from "react";
import lucide from "@/lib/marketing/dc/lucide-icons.json";

type IconNode = [string, Record<string, string>][];
const ICONS = lucide as unknown as Record<string, IconNode>;

/**
 * The designs' `ic(name, size)` helper: a lucide@0.460.0 icon (the version the .dc.html files
 * load) as an inline SVG. Unknown names fall back to Circle, as in the design runtime.
 */
export function dcIcon(name: string, size = 18, strokeWidth = 1.8): ReactElement | null {
  const node = ICONS[name] || ICONS.Circle;
  if (!node) return null;
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    node.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i })),
  );
}
