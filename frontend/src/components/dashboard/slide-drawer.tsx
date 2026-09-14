"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useNxPortalTarget } from "@/hooks/use-nx-portal-target";

/** Right-anchored slide-in drawer matching the v2 design's drawer chrome exactly (440px, header
 * row with close button, scrollable body) — used for every "drill into this number" interaction. */
export function SlideDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const portalTarget = useNxPortalTarget();
  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.34)" }} />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col"
        style={{ background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}
      >
        <div className="flex items-center gap-3 p-[18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-[9px]"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-[18px]">{children}</div>
      </aside>
    </div>,
    portalTarget,
  );
}
