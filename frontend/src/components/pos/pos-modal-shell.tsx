"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useNxPortalTarget } from "@/hooks/use-nx-portal-target";

/** Centered modal chrome matching the design's `modalOpen` wrapper exactly (462px, rounded 18px,
 * header row + close, footer row) — reused by every Fast Sale payment/action modal. */
export function PosModalShell({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const portalTarget = useNxPortalTarget();
  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.38)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[462px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px]"
        style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}
      >
        <div className="flex items-center gap-[11px] p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
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
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    portalTarget,
  );
}
