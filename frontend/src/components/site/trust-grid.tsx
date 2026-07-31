import { TRUST_ITEMS } from "@/lib/landing-content";

export function TrustGrid() {
  return (
    <section className="bg-surface-2/40 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Trust &amp; security</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-fg sm:text-4xl">Built for businesses that cannot afford downtime.</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/8 text-primary">
                <item.icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="mt-3 font-display text-sm font-bold text-fg">{item.title}</p>
              <p className="mt-1.5 text-sm text-fg-muted">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
