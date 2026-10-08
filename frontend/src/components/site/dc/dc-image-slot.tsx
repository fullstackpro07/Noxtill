"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";

export type SlotView = { s: number; x: number; y: number };

/**
 * `<image-slot>` from the designs' image-slot.js without the editor chrome. The image is laid out
 * exactly like the element does it: a cover (or contain) base scale × the stored zoom `s`, centred
 * and panned by `x`/`y` percent of the frame, pan clamped to the overflow. Before the image has
 * loaded it shows the element's own fallback (centred 100%×100% object-fit crop).
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
  const host = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const apply = useCallback(() => {
    const el = host.current,
      im = img.current;
    if (!el || !im) return;
    const iw = im.naturalWidth,
      ih = im.naturalHeight,
      fw = el.clientWidth,
      fh = el.clientHeight;
    if (!iw || !ih || !fw || !fh) return;
    const base = fit === "contain" ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
    const k = base * view.s;
    const mx = Math.max(0, ((iw * k) / fw - 1) * 50);
    const my = Math.max(0, ((ih * k) / fh - 1) * 50);
    const x = Math.max(-mx, Math.min(mx, view.x));
    const y = Math.max(-my, Math.min(my, view.y));
    im.style.width = ((iw * k) / fw) * 100 + "%";
    im.style.height = ((ih * k) / fh) * 100 + "%";
    im.style.left = 50 + x + "%";
    im.style.top = 50 + y + "%";
    im.style.objectFit = "";
  }, [fit, view.s, view.x, view.y]);

  useEffect(() => {
    const el = host.current,
      im = img.current;
    if (!el || !im) return;
    if (im.complete) apply();
    im.addEventListener("load", apply);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      im.removeEventListener("load", apply);
      ro.disconnect();
    };
  }, [apply]);

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
