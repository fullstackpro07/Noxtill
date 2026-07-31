import { HOW_IT_WORKS } from "@/lib/landing-content";

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">How it works</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-fg sm:text-4xl">Automation through connection.</h2>
        <p className="mt-3 text-fg-muted">Every action triggers the next with zero owner effort.</p>
      </div>

      <div className="relative grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="absolute inset-x-0 top-6 hidden h-px bg-border lg:block" aria-hidden />
        {HOW_IT_WORKS.map((step) => (
          <div key={step.step} className="relative flex flex-col items-center text-center">
            <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <step.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="mt-3 text-xs font-semibold text-accent-foreground">{step.step}</span>
            <p className="mt-1 font-display text-base font-bold text-fg">{step.title}</p>
            <p className="mt-2 max-w-[15rem] text-sm text-fg-muted">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
