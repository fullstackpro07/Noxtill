import Link from "next/link";
import { Reveal } from "@/components/site/reveal";
import type { ProductGroup } from "@/lib/marketing/product-content";

/**
 * Renders one Product-page feature group (heading + card grid). Each card's `id` is kept as
 * the slug so old `/product#<slug>` bookmarks still scroll correctly, but the card itself now
 * links to a real detail page — `/product/<slug>` for the three feature groups, `/ai#<slug>`
 * for "Powered by AI" (that group's real home is the dedicated AI page).
 */
export function ProductFeatureGroup({ group, delay = 0 }: { group: ProductGroup; delay?: number }) {
  const isAiGroup = group.title === "Powered by AI";

  return (
    <Reveal delay={delay}>
      <div>
        <div className="mb-1.5 flex items-baseline gap-3.5">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-[26px]">{group.title}</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">{group.items.length} features</span>
        </div>
        <p className="mb-5 max-w-[76ch] text-sm leading-relaxed text-fg-muted">{group.intro}</p>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {group.items.map((item) => {
            const Icon = item.icon;
            const href = isAiGroup ? `/ai#${item.slug}` : `/product/${item.slug}`;
            return (
              <Link
                key={item.slug}
                id={item.slug}
                href={href}
                className="scroll-mt-24 flex flex-col gap-2.5 rounded-[var(--radius-noxtill-lg)] border border-border p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-noxtill)] bg-primary/8 text-primary">
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="font-display text-[15.5px] font-semibold text-fg">{item.name}</span>
                <span className="text-[13px] leading-relaxed text-fg-muted">{item.description}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}
