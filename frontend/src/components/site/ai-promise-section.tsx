import { Reveal } from "@/components/site/reveal";
import { AI_PROMISE } from "@/lib/marketing/ai-content";

export function AiPromiseSection() {
  return (
    <section id="ai-promise" className="px-5 pt-16 sm:px-7 sm:pt-20">
      <div className="mx-auto max-w-330">
        <div className="mx-auto mb-9 max-w-170 text-center">
          <div className="mb-4 inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">
            {AI_PROMISE.eyebrow}
          </div>
          <h2 className="mb-3.5 text-balance font-display text-[30px] font-bold leading-tight tracking-tight text-fg sm:text-[38px]">
            {AI_PROMISE.heading}
          </h2>
          <p className="text-[15.5px] leading-relaxed text-fg-muted">{AI_PROMISE.body}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {AI_PROMISE.principles.map((principle, i) => (
            <Reveal key={principle.title} delay={i * 90} className="rounded-2xl border border-border bg-white p-6">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e3fbf1]">
                <principle.icon className="h-5 w-5 text-accent" aria-hidden strokeWidth={1.8} />
              </span>
              <div className="mb-2 font-display text-[17px] font-semibold text-fg">{principle.title}</div>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">{principle.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
