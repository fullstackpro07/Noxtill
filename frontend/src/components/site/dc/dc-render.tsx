import { Fragment, createElement, isValidElement, type CSSProperties, type ReactNode } from "react";
import slotsHb from "@/lib/marketing/dc/slots-hb.json";
import slotsNp from "@/lib/marketing/dc/slots-np.json";
import nxIcons from "@/lib/marketing/dc/nx-icons.json";
import { DcImageSlot } from "./dc-image-slot";

/**
 * Renderer for the marketing designs in `docs/Noxtill Header Build/*.dc.html`.
 *
 * `scripts/marketing-dc/convert.js` turns each design's template into a node tree; this file renders
 * that tree with the same semantics as the design runtime (support.js): `{{ path }}` bindings,
 * `<sc-if value>`, `<sc-for list as>`, `<dc-import>` hosts and `<image-slot>`. Pages without component
 * logic render it on the server with empty vals; interactive pages run their ported logic through
 * `DcHost` (dc-host.tsx).
 */

export type DcNode = string | [tag: string, attrs: Record<string, string>, kids: DcNode[]];
export type DcVals = Record<string, unknown>;
export type DcPageData = {
  tree: DcNode[];
  css: string;
  head: { title?: string; canonical?: string; meta?: [string, string, string][]; jsonLd?: string[] };
  effects: string[];
};

export type DcContext = {
  /** Render for `<dc-import name="...">` (NoxtillHeader, NoxtillFooter). */
  imports?: Record<string, ReactNode>;
  /** Swap a design node for a component (e.g. a placeholder form made real); undefined = render as-is. */
  replace?: (node: Exclude<DcNode, string>, key: string | number) => ReactNode | undefined;
};

// ── expressions (support.js expr.ts) ──────────────────────────────────────
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function parensWrapWhole(expr: string) {
  let depth = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") {
      depth--;
      if (depth === 0) return false;
    }
  }
  return true;
}

function findTopLevelEquality(expr: string): { index: number; op: string } | null {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && (c === "=" || c === "!") && expr[i + 1] === "=") {
      if (i > 0 && (expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
      if (!expr.slice(0, i).trim()) continue;
      return { index: i, op: expr[i + 2] === "=" ? c + "==" : c + "=" };
    }
  }
  return null;
}

function resolvePath(vals: DcVals, expr: string): unknown {
  const head = expr.match(IDENT_RE);
  if (!head) return undefined;
  let cur: unknown = vals == null ? undefined : vals[head[0]];
  let i = head[0].length;
  while (i < expr.length) {
    if (expr[i] === ".") {
      const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
      if (!m) return undefined;
      cur = cur == null ? undefined : (cur as Record<string, unknown>)[m[0]];
      i += 1 + m[0].length;
    } else if (expr[i] === "[") {
      let depth = 1;
      let j = i + 1;
      while (j < expr.length && depth > 0) {
        if (expr[j] === "[") depth++;
        else if (expr[j] === "]") {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      if (depth !== 0) return undefined;
      const key = resolve(vals, expr.slice(i + 1, j)) as string;
      cur = cur == null ? undefined : (cur as Record<string, unknown>)[key];
      i = j + 1;
    } else {
      return undefined;
    }
  }
  return cur;
}

export function resolve(vals: DcVals, src: string): unknown {
  const expr = String(src).trim();
  if (!expr) return undefined;
  if (expr[0] === "(" && expr[expr.length - 1] === ")" && parensWrapWhole(expr)) return resolve(vals, expr.slice(1, -1));
  const eq = findTopLevelEquality(expr);
  if (eq) {
    const lv = resolve(vals, expr.slice(0, eq.index));
    const rv = resolve(vals, expr.slice(eq.index + eq.op.length));
    switch (eq.op) {
      case "===":
        return lv === rv;
      case "!==":
        return lv !== rv;
      case "==":
        return lv == rv;
      default:
        return lv != rv;
    }
  }
  if (expr[0] === "!") return !resolve(vals, expr.slice(1));
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "null") return null;
  if (expr === "undefined") return undefined;
  if (NUMBER_RE.test(expr)) return Number(expr);
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return expr.slice(1, -1);
  return resolvePath(vals, expr);
}

const WHOLE_RE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
const SPLIT_RE = /\{\{([\s\S]+?)\}\}/g;

function attrValue(raw: string, vals: DcVals): unknown {
  if (!raw.includes("{{")) return raw;
  const whole = raw.match(WHOLE_RE);
  if (whole) return resolve(vals, whole[1]);
  return raw
    .split(SPLIT_RE)
    .map((s, i) => (i & 1 ? (resolve(vals, s) ?? "") : s))
    .join("");
}

// ── styles ────────────────────────────────────────────────────────────────
const styleCache = new Map<string, CSSProperties>();
export function cssToObj(css: string): CSSProperties {
  const hit = styleCache.get(css);
  if (hit) return hit;
  const o: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop) continue;
    o[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  if (styleCache.size < 6000) styleCache.set(css, o as CSSProperties);
  return o as CSSProperties;
}

const HOST_STYLE_PROPS = new Set(["position", "left", "right", "top", "bottom", "inset", "width", "height", "z-index", "transform"]);
function hostPositionStyle(style: string | undefined): CSSProperties | undefined {
  if (!style) return undefined;
  const all = cssToObj(style) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (HOST_STYLE_PROPS.has(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()))) out[k] = v;
  }
  return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

// ── image-slot ────────────────────────────────────────────────────────────
type SlotEntry = { u?: string; s: number; x: number; y: number };
const SLOTS = { ...(slotsHb as Record<string, SlotEntry>), ...(slotsNp as Record<string, SlotEntry>) };
const NO_VIEW = { s: 1, x: 0, y: 0 };

/** `<image-slot>` → DcImageSlot with the design's saved image (which wins over `src`) and crop. */
function ImageSlot({ attrs }: { attrs: Record<string, unknown> }) {
  const id = String(attrs.id ?? "");
  const saved = SLOTS[id];
  const src = saved?.u || (attrs.src as string) || undefined;
  const shape = String(attrs.shape || "rounded").toLowerCase();
  const n = parseFloat(String(attrs.radius));
  const radius = shape === "circle" ? "50%" : shape === "pill" ? "9999px" : shape === "rounded" ? (Number.isFinite(n) ? n : 12) + "px" : undefined;
  const own = typeof attrs.style === "string" ? cssToObj(attrs.style) : (attrs.style as CSSProperties | undefined);
  const style: CSSProperties = { display: "block", position: "relative", width: "100%", height: "100%", aspectRatio: "3/2", ...own };
  const fit = String(attrs.fit || "cover").toLowerCase() === "contain" ? "contain" : "cover";
  return (
    <DcImageSlot
      src={src}
      view={saved ? { s: saved.s, x: saved.x, y: saved.y } : NO_VIEW}
      fit={fit}
      radius={radius}
      style={style}
      id={id || undefined}
      role={(attrs.role as string) || undefined}
      ariaLabel={(attrs["aria-label"] as string) || undefined}
      className={(attrs.className as string) || undefined}
    />
  );
}

// ── nx-icon ───────────────────────────────────────────────────────────────
const NX = nxIcons as unknown as { S: Record<string, string>; B: Record<string, [string, string]>; GREEN: string };

/**
 * `<nx-icon name size stroke radius color>` from the imported designs' nx-icon.js, rendered on the
 * server with the same markup the element puts in its shadow root (stroke icon, filled icon or
 * full-colour brand mark). The host's own inline style still applies on top of its :host rule.
 */
function NxIcon({ attrs }: { attrs: Record<string, unknown> }) {
  const raw = String(attrs.name || "").trim().toLowerCase();
  const size = attrs.size as string | undefined;
  const sw = (attrs.stroke as string) || "1.85";
  let inner: string;
  const brand = NX.B[raw];
  if (brand) {
    const [bg, mark] = brand;
    const r = (attrs.radius as string) || "5.5";
    const ring =
      bg === "#FFFFFF"
        ? '<rect x=".6" y=".6" width="22.8" height="22.8" rx="' + r + '" fill="#fff" stroke="rgba(16,32,26,.14)"/>'
        : '<rect width="24" height="24" rx="' + r + '" fill="' + bg + '"/>';
    inner = '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;overflow:visible;width:100%;height:100%" aria-hidden="true">' + ring + mark + "</svg>";
  } else if (raw.slice(-7) === "-filled" && NX.S[raw]) {
    inner =
      '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" style="display:block;overflow:visible;width:100%;height:100%" aria-hidden="true"><path d="' +
      NX.S[raw] +
      '"/></svg>';
  } else {
    inner =
      '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="' +
      sw +
      '" stroke-linecap="round" stroke-linejoin="round" style="display:block;overflow:visible;width:100%;height:100%" aria-hidden="true"><path d="' +
      (NX.S[raw] || NX.S.sparkles) +
      '"/></svg>';
  }
  const own = typeof attrs.style === "string" ? cssToObj(attrs.style) : (attrs.style as CSSProperties | undefined);
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 0,
    ...(size ? { width: size + "px", height: size + "px" } : {}),
    ...(brand ? {} : { color: (attrs.color as string) || NX.GREEN }),
    ...own,
    flex: "none",
  };
  return (
    <span
      className={["nx-icon", attrs.className as string].filter(Boolean).join(" ")}
      role={(attrs.role as string) || undefined}
      aria-label={(attrs["aria-label"] as string) || undefined}
      aria-hidden={attrs["aria-hidden"] === "true" || attrs["aria-hidden"] === "" ? true : undefined}
      style={style}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

// ── tree walk (support.js compile.ts) ─────────────────────────────────────
const EVENT_ALIASES: Record<string, string> = {
  onclick: "onClick",
  onchange: "onChange",
  oninput: "onInput",
  onsubmit: "onSubmit",
  onkeydown: "onKeyDown",
  onkeyup: "onKeyUp",
  onfocus: "onFocus",
  onblur: "onBlur",
  onmouseenter: "onMouseEnter",
  onmouseleave: "onMouseLeave",
  onmousedown: "onMouseDown",
  onscroll: "onScroll",
  onerror: "onError",
  onload: "onLoad",
};

function renderNode(node: DcNode, vals: DcVals, ctx: DcContext, key: string | number): ReactNode {
  if (typeof node === "string") {
    if (!node.includes("{{")) return node;
    const parts = node.split(SPLIT_RE);
    return createElement(
      Fragment,
      { key },
      ...parts.map((p, i) => {
        if (!(i & 1)) return p;
        const v = resolve(vals, p);
        if (v === undefined || v === null || typeof v === "boolean") return null;
        if (isValidElement(v) || Array.isArray(v)) return createElement(Fragment, { key: i }, v as ReactNode);
        return createElement("span", { key: i, className: "sc-interp" }, String(v));
      }),
    );
  }

  const [tag, attrs, kids] = node;

  if (ctx.replace) {
    const swapped = ctx.replace(node, key);
    if (swapped !== undefined) return swapped;
  }

  if (tag === "sc-if") {
    const v = attrValue(attrs.value ?? "", vals);
    return v ? createElement(Fragment, { key }, ...kids.map((c, j) => renderNode(c, vals, ctx, j))) : null;
  }

  if (tag === "sc-for") {
    const list = attrValue(attrs.list ?? "", vals);
    const as = attrs.as || "item";
    const items = Array.isArray(list) ? list : [];
    return createElement(
      Fragment,
      { key },
      items.map((item, i) => {
        const sub = { ...vals, [as]: item, $index: i };
        return createElement(Fragment, { key: i }, ...kids.map((c, j) => renderNode(c, sub, ctx, j)));
      }),
    );
  }

  if (tag === "dc-import") {
    const name = attrs.name || attrs.component || "";
    return createElement("div", { key, className: "sc-host", "data-sc-name": name, style: hostPositionStyle(attrs.style) }, ctx.imports?.[name] ?? null);
  }

  const props: Record<string, unknown> = { key };
  for (const [k0, raw] of Object.entries(attrs)) {
    let k = k0;
    if (k.startsWith("on") && k.length > 2) k = EVENT_ALIASES[k] || "on" + k[2].toUpperCase() + k.slice(3);
    let v = attrValue(raw, vals);
    if (k === "style" && typeof v === "string") v = cssToObj(v);
    if ((k === "value" || k === "checked") && v === undefined) v = k === "checked" ? false : "";
    // Boolean attribute written bare in the design (`<article itemscope>`).
    if (k === "itemScope" && v === "") v = true;
    props[k] = v;
  }

  if (tag === "image-slot") return <ImageSlot key={key} attrs={props} />;
  if (tag === "nx-icon") return <NxIcon key={key} attrs={props} />;

  return createElement(tag, props, ...kids.map((c, j) => renderNode(c, vals, ctx, j)));
}

export function renderDc(nodes: DcNode[], vals: DcVals = {}, ctx: DcContext = {}): ReactNode[] {
  return nodes.map((n, i) => renderNode(n, vals, ctx, i));
}
