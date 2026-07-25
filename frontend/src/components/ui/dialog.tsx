"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Destructive dialogs (BE danger-zone pattern) skip the click-outside-to-close shortcut on purpose. */
  preventCasualDismiss?: boolean;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  preventCasualDismiss,
  className,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !preventCasualDismiss) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, preventCasualDismiss]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        onClick={() => !preventCasualDismiss && onClose()}
        className="absolute inset-0 bg-[#1c231e]/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          "animate-stagger-in relative w-full max-w-md rounded-[var(--radius-noxtill)] border border-border",
          "bg-surface p-6 shadow-[var(--shadow-lg)]",
          className,
        )}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute end-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 id="dialog-title" className="font-display text-lg font-semibold text-fg pe-8">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm text-fg-muted">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
