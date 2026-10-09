"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";

export type SlotView = { s: number; x: number; y: number };

/** At or below this width a picture is shown whole instead of cropped into its desktop frame. */
const FULL_MQ = "(max-width: 860px)";
const FRAME_PROPS = ["height", "min-height", "max-height", "aspect-ratio"] as const;

/**
 * The frame a slot fills: the slot itself, or the wrappers around it that hold nothing else (no
 * text, no other visible element), stopping at a card/section boundary. Null when the picture shares
 * its frame with overlays or text (it is a background), floats (absolute), or is a small
 * thumbnail/avatar.
 */
function soleFrame(host: HTMLElement): HTMLElement | null {
  let el = host;
  for (let i = 0; i < 4; i++) {
    const p = el.parentElement;
    if (!p || p.classList.contains("dcx") || /^(SECTION|ARTICLE|MAIN|HEADER|FOOTER|BODY|LI|A|BUTTON)$/.test(p.tagName)) break;
    if ([...p.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) break;
    if ([...p.children].some((c) => c !== el && getComputedStyle(c).display !== "none")) break;
    el = p;
  }
  // A slot filling (100% / default height) a parent that also holds other content keeps that frame.
  if (el === host && !/^\d+(\.\d+)?px$/.test(host.style.height.trim())) return null;
  const cs = getComputedStyle(el);
  if (cs.position === "absolute" || cs.position === "fixed" || el.clientWidth < 200) return null;
  return el;
}

/**
 * `<image-slot>` from the designs' image-slot.js without the editor chrome. The image is laid out
 * exactly like the element does it: a cover (or contain) base scale × the stored zoom `s`, centred
 * and panned by `x`/`y` percent of the frame, pan clamped to the overflow. Before the image has
 * loaded it shows the element's own fallback (centred 100%×100% object-fit crop).
 *
 * On phones and tablets (≤860px) a picture its desktop frame crops noticeably — a wide screenshot in
 * a tall box — gets a frame of the picture's own proportions and is shown whole, unzoomed. Pictures
 * that sit behind text or other elements keep the design framing.
 *
 * A slot the design never filled renders its empty frame only — the editor caption ("Drop a
 * photo…") is an authoring instruction, not page copy.
 */
export function DcImageSlot({
  src,
  view,
  fit,
  radius,
  style,
  id,
  role,
  ariaLabel,
  className,
}: {
  src?: string;
  view: SlotView;
  fit: "cover" | "contain";
  radius?: string;
  style: CSSProperties;
  id?: string;
  role?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const { s: vs, x: vx, y: vy } = view;
  const host = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);
  // The frame resized for the whole picture, with its original inline values (restored on widen).
  const resized = useRef<{ el: HTMLElement; orig: [string, string][] } | null>(null);

  const restore = useCallback(() => {
    const r = resized.current;
    if (!r) return;
    for (const [k, v] of r.orig) {
      if (v) r.el.style.setProperty(k, v);
      else r.el.style.removeProperty(k);
    }
    resized.current = null;
  }, []);

  const apply = useCallback(() => {
    const el = host.current,
      im = img.current;
    if (!el || !im) return;
    const iw = im.naturalWidth,
      ih = im.naturalHeight;
    if (!iw || !ih || !el.clientWidth || !el.clientHeight) return;

    let full = false;
    if (fit === "cover" && window.matchMedia(FULL_MQ).matches) {
      const frame = resized.current?.el ?? soleFrame(el);
      if (frame) {
        const cropped = vs > 1.05 || Math.abs(el.clientWidth / el.clientHeight / (iw / ih) - 1) > 0.1;
        if (resized.current || cropped) {
          if (!resized.current) resized.current = { el: frame, orig: FRAME_PROPS.map((k) => [k, frame.style.getPropertyValue(k)]) };
          frame.style.setProperty("height", "auto", "important");
          frame.style.setProperty("min-height", "0", "important");
          frame.style.setProperty("max-height", "none", "important");
          frame.style.setProperty("aspect-ratio", iw + " / " + ih, "important");
          full = true;
        }
      }
    } else restore();

    const fw = el.clientWidth,
      fh = el.clientHeight;
    if (!fw || !fh) return;
    const v = full ? { s: 1, x: 0, y: 0 } : { s: vs, x: vx, y: vy };
    const base = fit === "contain" ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
    const k = base * v.s;
    const mx = Math.max(0, ((iw * k) / fw - 1) * 50);
    const my = Math.max(0, ((ih * k) / fh - 1) * 50);
    const x = Math.max(-mx, Math.min(mx, v.x));
    const y = Math.max(-my, Math.min(my, v.y));
    im.style.width = ((iw * k) / fw) * 100 + "%";
    im.style.height = ((ih * k) / fh) * 100 + "%";
    im.style.left = 50 + x + "%";
    im.style.top = 50 + y + "%";
    im.style.objectFit = "";
  }, [fit, vs, vx, vy, restore]);

  useEffect(() => {
    const el = host.current,
      im = img.current;
    if (!el || !im) return;
    if (im.complete) apply();
    im.addEventListener("load", apply);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    const mq = window.matchMedia(FULL_MQ);
    mq.addEventListener("change", apply);
    return () => {
      im.removeEventListener("load", apply);
      ro.disconnect();
      mq.removeEventListener("change", apply);
      restore();
    };
  }, [apply, restore]);

  return (
    // <span>s with block display: a slot can sit inside a design <p>, where a <div> is invalid HTML.
    <span ref={host} id={id} role={role} aria-label={ariaLabel} className={["image-slot", className].filter(Boolean).join(" ")} style={style}>
      <span style={{ display: "block", position: "absolute", inset: 0, overflow: "hidden", background: "rgba(127,127,127,.08)", borderRadius: radius }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            style={{ position: "absolute", left: "50%", top: "50%", width: "100%", height: "100%", maxWidth: "none", transform: "translate(-50%,-50%)", objectFit: fit, userSelect: "none" }}
          />
        ) : null}
      </span>
    </span>
  );
}
