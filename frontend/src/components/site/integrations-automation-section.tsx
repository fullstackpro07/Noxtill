import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import {
  AUTOMATION_DASHBOARD,
  AUTOMATION_EXAMPLES,
  AUTOMATION_SECTION,
  type AutomationStep,
} from "@/lib/marketing/integrations-content";

function StepIcon({ step }: { step: AutomationStep }) {
  if (step.logo) {
    return (
      <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl bg-[#e8f7ef]">
        <Image src={step.logo} alt="" width={28} height={28} className="h-7 w-7 object-contain" aria-hidden />
      </span>
    );
  }
  const Icon = step.icon!;
  return (
    <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl bg-[#e8f7ef]">
      <Icon className="h-[26px] w-[26px] text-[#12a066]" aria-hidden strokeWidth={1.7} />
    </span>
  );
}

export function IntegrationsAutomationSection() {
  return (
    <section className="px-5 py-14 sm:px-7 sm:py-17.5">
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-8 max-w-[640px] text-center">
          <div className="mb-4 inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.09em] text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {AUTOMATION_SECTION.eyebrow}
          </div>
          <h2 className="mb-3.5 text-balance font-display text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[42px]">
            {AUTOMATION_SECTION.heading}
          </h2>
          <p className="text-base leading-relaxed text-fg-muted">{AUTOMATION_SECTION.body}</p>
        </div>

        <div className="flex flex-wrap items-start gap-4.5">
          <div className="flex min-w-[300px] flex-[1_1_620px] flex-col gap-4">
            {AUTOMATION_EXAMPLES.map((example) => (
              <div key={example.label} className="rounded-[20px] border border-border bg-white p-5.5">
                <div className="mb-4.5 flex flex-wrap items-center justify-between gap-2.5">
                  <span className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 font-display text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {example.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7ef] px-3.5 py-1.5 text-xs font-medium text-[#0b7a4c]">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Automated
                  </span>
                </div>
                <div className="flex flex-nowrap items-start justify-center gap-1.5 overflow-x-auto">
                  {example.steps.map((step, i) => (
                    <div key={step.title} className="contents">
                      <div className="flex max-w-[168px] min-w-[92px] flex-[1_1_100px] flex-col items-center gap-2.5 text-center">
                        <StepIcon step={step} />
                        <div className="font-display text-sm font-semibold text-fg">{step.title}</div>
                        <div className="text-[12.5px] leading-relaxed text-fg-faint">{step.description}</div>
                      </div>
                      {i < example.steps.length - 1 ? (
                        <ArrowRight className="mt-6.5 h-4 w-4 shrink-0 self-start text-accent" aria-hidden />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Reveal className="min-w-[290px] max-w-[420px] flex-[1_1_330px] rounded-[20px] border border-border bg-white p-5.5">
            <div className="mb-4.5 flex items-center gap-2.5">
              <span className="font-display text-base font-semibold text-fg">{AUTOMATION_DASHBOARD.title}</span>
              <span className="rounded-full bg-[#e8f7ef] px-2.5 py-0.5 text-[11px] text-[#0b7a4c]">{AUTOMATION_DASHBOARD.liveBadge}</span>
            </div>
            <div className="mb-5 flex flex-wrap gap-2.5">
              {AUTOMATION_DASHBOARD.stats.map((stat) => (
                <div key={stat.label} className="min-w-[108px] flex-[1_1_118px] rounded-[14px] border border-border p-3.5">
                  <div className="mb-1.5 text-[11px] text-fg-faint">{stat.label}</div>
                  <div className="font-display text-[22px] font-bold text-fg">{stat.value}</div>
                  <div className="mt-1 text-[11px] text-primary">{stat.delta}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4">
              <div className="mb-1.5 font-display text-[13px] font-semibold text-fg">Recent Automations</div>
              {AUTOMATION_DASHBOARD.recent.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-b-0">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{item.label}</span>
                  <span className="shrink-0 text-[11.5px] text-fg-faint">{item.time}</span>
                  <span className="shrink-0 rounded-full bg-[#e8f7ef] px-2.5 py-0.5 text-[11px] text-[#0b7a4c]">Success</span>
                </div>
              ))}
              <Link href={AUTOMATION_DASHBOARD.viewAllHref} className="mt-3.5 flex items-center justify-between gap-2.5 text-[13.5px] font-medium text-primary">
                {AUTOMATION_DASHBOARD.viewAllLabel} <span aria-hidden>›</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
