import type { ReactNode } from "react";

/**
 * Shared page-content header (title/description/actions) for a module's own pages. Subscreen
 * *navigation* is handled separately by `<ModuleTabs/>`, rendered once per module in that route
 * segment's `layout.tsx` — this component is just the heading block underneath it, not a nav.
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
