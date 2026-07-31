import { MODULES } from "@/lib/landing-content";

export function ModuleGrid() {
  return (
    <section id="features" className="border-y border-border bg-surface/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">16 modules, 1 login</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-fg sm:text-4xl">One login. Everything in it.</h2>
          <p className="mx-auto mt-3 max-w-lg text-fg-muted">
            No stitching six apps together. No broken syncs. One system where every action feeds the next.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((mod) => (
            <div key={mod.title} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                <mod.icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="mt-3 font-display text-sm font-bold text-fg">{mod.title}</p>
              <p className="mt-1 text-xs text-fg-muted">{mod.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
