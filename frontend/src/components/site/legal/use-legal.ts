"use client";

import { useEffect, useRef, useState } from "react";

/** Smooth-scrolls to a section below the sticky header and moves focus to it (docs/Legal pages/content/nox-ui.js `jump`). */
export function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const y = el.getBoundingClientRect().top + window.scrollY - 118;
  window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/** onClick handler for an in-page anchor that jumps instead of changing the URL hash. */
export function jumpTo(id: string, before?: () => void) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    before?.();
    setTimeout(() => jump(id), before ? 60 : 0);
  };
}

/** Tracks which section is nearest the top of the viewport. Never touches location. */
export function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState("");
  const key = ids.join("|");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const list = key.split("|");
    const seen = new Map<string, number | null>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
        let best: string | null = null;
        let bestTop = Infinity;
        list.forEach((id) => {
          const t = seen.get(id);
          if (t !== null && t !== undefined && Math.abs(t) < bestTop) {
            best = id;
            bestTop = Math.abs(t);
          }
        });
        if (best) setActive(best);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] },
    );
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [key]);
  return active;
}

/** True below the given viewport width (false during SSR, so the wide layout is the server render). */
export function useNarrow(px = 980): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const h = () => setNarrow(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [px]);
  return narrow;
}

/** Traps Tab focus inside an open dialog, closes on Escape, and restores focus on close. */
export function useFocusTrap(open: boolean, onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const esc = useRef(onEscape);
  useEffect(() => {
    esc.current = onEscape;
  });
  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const prev = document.activeElement as HTMLElement | null;
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        esc.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const a = els[0];
      const z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    root.addEventListener("keydown", key);
    setTimeout(() => focusables()[0]?.focus(), 0);
    return () => {
      root.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

/** Tablist keyboard support (Left/Right/Up/Down/Home/End); tab buttons carry id `tab-<key>`. */
export function tabKeys<K extends string | number>(e: React.KeyboardEvent, keys: K[], current: K, set: (k: K) => void) {
  const i = keys.indexOf(current);
  let n = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % keys.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + keys.length) % keys.length;
  else if (e.key === "Home") n = 0;
  else if (e.key === "End") n = keys.length - 1;
  if (n < 0) return;
  e.preventDefault();
  set(keys[n]);
  setTimeout(() => document.getElementById(`tab-${keys[n]}`)?.focus(), 0);
}

/** Detects passwords / card numbers / secrets in free text before a form is submitted. */
export function sensitiveCheck(text: string): string {
  const t = String(text || "");
  const digits = t.replace(/[\s-]/g, "");
  if (/\b\d{13,19}\b/.test(digits)) return "This looks like a payment-card number. Please remove it — never send card details here.";
  if (/(password|passcode|pwd)\s*[:=]/i.test(t)) return "This looks like a password. Please remove it — Noxtill will never ask for your password.";
  if (/(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN/i.test(t)) return "This looks like an API key or secret. Please remove it.";
  return "";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Opens a section's accordion when the URL hash targets it on first load. */
export function useHashOnMount(handler: (hash: string) => void) {
  const h = useRef(handler);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) h.current(hash);
  }, []);
}
