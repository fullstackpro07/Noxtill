import type { LucideIcon } from "lucide-react";

export interface EcosystemItem {
  icon: LucideIcon;
  label: string;
  /** Highlights this node as the current page's own feature within the ecosystem row. */
  active?: boolean;
}

/**
 * Shared "Part of the Noxtill Ecosystem" strip used across product detail pages —
 * a row of connected icon nodes inside a single bordered panel.
 */
export function EcosystemStrip({
  heading = "Part of the Noxtill Ecosystem",
  subheading,
  items,
}: {
  heading?: string;
  subheading?: string;
  items: EcosystemItem[];
}) {
  return (
    <section className="mt-10 px-5 sm:px-7">
      <div className="mx-auto max-w-[1320px] rounded-md border border-border bg-surface-2 px-6 py-10 sm:px-10">
        <h2 className="mb-2 text-center font-display text-[20px] font-semibold text-fg">{heading}</h2>
        {subheading ? <p className="mb-8 text-center text-[13px] text-fg-muted">{subheading}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap">
          {items.map((item, i) => (
            <div key={item.label} className="flex items-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-md border ${
                    item.active ? "border-accent bg-[#e3fbf1]" : "border-border bg-white"
                  }`}
                >
                  <item.icon className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <span className={`max-w-[80px] text-[11px] leading-tight ${item.active ? "font-semibold text-fg" : "text-fg-muted"}`}>{item.label}</span>
              </div>
              {i < items.length - 1 ? <div className="mx-2 hidden h-px w-8 border-t border-dashed border-border-strong sm:block" aria-hidden /> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
