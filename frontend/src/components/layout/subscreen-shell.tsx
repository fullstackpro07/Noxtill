import type { ReactNode } from "react";

/**
 * Shared page wrapper for module subscreens (Dashboard/Sales/Orders/Products, etc.) — these are
 * now reached via the sidebar's dropdown under each module rather than in-page tabs, so every
 * subscreen is its own route with its own heading instead of a shared tab bar.
 */
export function SubscreenShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
