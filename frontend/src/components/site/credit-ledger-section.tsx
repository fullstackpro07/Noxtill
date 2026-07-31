import { CREDIT_MODULE } from "@/lib/landing-content";

export function CreditLedgerSection() {
  return (
    <section className="bg-primary py-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{CREDIT_MODULE.eyebrow}</p>
          <h2 className="mt-2 text-balance font-display text-3xl font-bold leading-tight text-primary-foreground sm:text-4xl">
            {CREDIT_MODULE.headline}
          </h2>
          <p className="mt-4 text-primary-foreground/75">{CREDIT_MODULE.body}</p>

          <div className="mt-8 grid grid-cols-2 gap-6">
            {CREDIT_MODULE.stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-2xl font-bold text-accent">{stat.value}</p>
                <p className="mt-0.5 text-xs text-primary-foreground/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-white/10 bg-[#0f2b22] p-5 shadow-[var(--shadow-lg)]">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-sm font-bold text-white">Credit Ledger</p>
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-medium text-accent">{CREDIT_MODULE.outstandingTotal}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {CREDIT_MODULE.debtors.map((d) => (
              <div key={d.name} className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/5 p-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                  {d.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{d.name}</p>
                  <p className="text-xs text-white/50">{d.days}</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-destructive">{d.amount}</span>
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">Remind</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-full border border-white/15 py-2.5 text-center text-sm text-white/80">
            Remind all debtors politely
          </div>
        </div>
      </div>
    </section>
  );
}
