"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Exact chrome match for the design's right-side drawers: dark backdrop, 480px panel sliding
 * from the right, 17px header/footer padding, #F0F2F5 dividers. Shared across modules (Marketing,
 * Profit & Analytics, ...) so every drawer in the app has identical chrome. */
export function SideDrawer({
  title,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80]" style={{ background: "rgba(10,27,42,.36)" }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[85] flex max-w-full flex-col"
        style={{ width, background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}
      >
        <div className="flex items-center gap-3" style={{ padding: 17, borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-[9px]"
            style={{ width: 34, height: 34, border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-faint)" }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto" style={{ padding: 17 }}>
          {children}
        </div>
        <div className="flex gap-2" style={{ padding: 17, borderTop: "1px solid var(--app-surface-2)" }}>
          {footer}
        </div>
      </aside>
    </>
  );
}

export function DrawerLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>
      {children}
    </label>
  );
}
