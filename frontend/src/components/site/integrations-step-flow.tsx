import { ArrowRight, Sparkles } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { IntegrationsFlowLiveDemo } from "@/components/site/integrations-flow-live-demo";
import {
  FLOW_BODY,
  FLOW_EYEBROW,
  FLOW_HEADING,
  FLOW_STEPS,
  FLOW_TRUST_ITEMS,
} from "@/lib/marketing/integrations-content";

export function IntegrationsStepFlow() {
  const headingParts = FLOW_HEADING.split(" → ");

  return (
    <section className="bg-surface-2 px-5 py-14 sm:px-7 sm:py-19">
      <div className="mx-auto max-w-[1420px]">
        <div className="mx-auto mb-8.5 text-center">
          <div className="mb-4.5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            {FLOW_EYEBROW}
          </div>
          <div className="mb-4 overflow-x-auto text-left sm:text-center">
            <h2 className="whitespace-nowrap font-display text-lg font-bold leading-tight tracking-tight text-fg sm:text-[34px]">
              {headingParts.map((part, i) => (
                <span key={part}>
                  {i > 0 ? <span className="text-primary"> → </span> : null}
                  <span className={part === "Noxtill" ? "text-primary" : undefined}>{part}</span>
                </span>
              ))}
            </h2>
          </div>
          <p className="mx-auto max-w-[58ch] text-base leading-relaxed text-fg-muted">{FLOW_BODY}</p>
        </div>

        <div className="mb-7.5 flex flex-wrap items-stretch gap-2.5">
          {FLOW_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 90} className="flex min-w-[190px] flex-1 basis-[200px] items-center gap-1.5">
              <div className="min-w-0 flex-1 rounded-[14px] border border-border bg-white p-4">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-[11.5px] font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="font-display text-[15.5px] font-semibold text-fg">{step.title}</span>
                </div>
                <div className="text-[13.5px] leading-relaxed text-fg-muted">{step.description}</div>
              </div>
              {i < FLOW_STEPS.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 self-center text-accent" aria-hidden /> : null}
            </Reveal>
          ))}
        </div>

        <IntegrationsFlowLiveDemo />

        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5 rounded-[18px] border border-border p-5.5 sm:p-6">
          {FLOW_TRUST_ITEMS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-[26px] w-[26px] shrink-0 text-primary" aria-hidden strokeWidth={1.7} />
              <div>
                <div className="mb-0.5 font-display text-sm font-semibold text-fg">{title}</div>
                <div className="text-[12.5px] leading-relaxed text-fg-muted">{description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
