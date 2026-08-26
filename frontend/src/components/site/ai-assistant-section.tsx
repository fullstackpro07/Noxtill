import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { AiAssistantLiveDemo } from "@/components/site/ai-assistant-live-demo";
import { AiAssistantFlowSteps } from "@/components/site/ai-assistant-flow-steps";
import { AiAssistantReportDemo } from "@/components/site/ai-assistant-report-demo";
import { AI_ASSISTANT_BENEFITS, AI_ASSISTANT_CHECKLIST, AI_ASSISTANT_TAGS } from "@/lib/marketing/home-content";

export function AiAssistantSection() {
  return (
    <section className="px-5 py-16 sm:px-7 sm:py-20">
      <div className="mx-auto max-w-[1560px]">
        <h2 className="mx-auto mb-10 max-w-[1000px] text-balance text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-5xl">
          AI business assistant for <span className="text-accent">Real time business answers</span>
        </h2>

        <div className="flex flex-wrap items-start gap-x-12 gap-y-10">
          <div className="min-w-[300px] max-w-[470px] flex-1 basis-[380px]">
            <p className="mb-6 max-w-[46ch] text-[16.5px] leading-relaxed text-fg-muted">
              Noxtill AI Business Assistant understands your business context, retrieves real-time information from your
              connected business data, analyses it in seconds, and delivers accurate answers, reports and insights exactly
              where you need them.
            </p>

            <div className="flex flex-col gap-3">
              {AI_ASSISTANT_CHECKLIST.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-[#1e3138]">
                  <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-surface-2">
                    <Check className="h-3 w-3 text-accent" aria-hidden />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <Reveal delay={0} className="min-w-[320px] flex-1 basis-[640px]">
            <AiAssistantLiveDemo />
          </Reveal>
        </div>

        <div className="mt-9 flex flex-wrap items-stretch gap-4">
          <Reveal delay={100} className="min-w-[300px] flex-1 basis-[460px] rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
            <div className="mb-4.5 flex items-center gap-3.5">
              <Image src="/marketing/ai-assistant-robot-cutout-1.png" alt="Noxtill AI business assistant answering business questions" width={56} height={68} className="h-[68px] w-[56px] flex-none object-contain" />
              <div className="font-display text-base font-semibold text-fg">How Noxtill AI Assistant Works</div>
            </div>
            <AiAssistantFlowSteps />
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3.5">
              {AI_ASSISTANT_TAGS.map((tag) => (
                <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs uppercase tracking-wide text-fg">
                  {tag}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={200} className="min-w-[280px] flex-1 basis-full">
            <AiAssistantReportDemo />
          </Reveal>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-x-0 gap-y-1 rounded-[var(--radius-lg)] border border-border py-2 sm:grid-cols-2 lg:grid-cols-3">
          {AI_ASSISTANT_BENEFITS.map((benefit, i) => (
            <div key={benefit.title} className={`flex items-start gap-3 p-4.5 ${i % 3 !== 0 ? "sm:border-l sm:border-[#eceeed]" : ""}`}>
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-surface-2">
                <benefit.icon className="h-[18px] w-[18px] text-accent" aria-hidden strokeWidth={1.9} />
              </span>
              <div>
                <div className="mb-1 font-display text-sm font-semibold text-fg">{benefit.title}</div>
                <div className="text-xs leading-snug text-fg-faint">{benefit.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-6 rounded-[var(--radius-xl)] border border-border bg-surface-2 p-7 sm:p-8">
          <div className="flex min-w-[260px] flex-1 basis-[300px] items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
              <ShieldCheck className="h-[19px] w-[19px] text-accent" aria-hidden />
            </span>
            <div>
              <div className="mb-1 font-display text-[15px] font-semibold text-[#0b8f5c]">Your data. Your business. Always secure.</div>
              <div className="max-w-[42ch] text-[12.5px] leading-relaxed text-fg-faint">
                Your data is encrypted, private and never used to train public models. You stay in control.
              </div>
            </div>
          </div>

          <p className="w-full text-[15.5px] leading-relaxed text-fg-muted lg:max-w-[64ch]">
            Noxtill AI Business Assistant turns connected business data into useful answers,{" "}
            <Link href="/product#reports" className="text-primary hover:text-primary-hover">
              business reports
            </Link>{" "}
            and insights. Ask about sales, profit, orders, bookings, customers, inventory, payments, marketing performance or
            business reports and get clear information without switching between multiple dashboards. Where a figure is not
            in your connected data, Noxtill says so rather than inventing a result. See also the{" "}
            <Link href="/product#inbox" className="text-primary hover:text-primary-hover">
              Unified Inbox
            </Link>{" "}
            and the{" "}
            <Link href="/product#assistant" className="text-primary hover:text-primary-hover">
              AI Business Assistant
            </Link>{" "}
            in depth.
          </p>

          <div className="flex min-w-[260px] flex-1 basis-[300px] flex-col items-center gap-2.5">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2.5 rounded-full bg-primary px-7.5 py-4 font-display text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Ask Your Business Anything
            </Link>
            <div className="max-w-[44ch] text-center text-[12.5px] text-fg-faint">
              Get the answers, reports and insights you need without dashboard hopping.
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Link href="/pricing" className="inline-flex items-center rounded-xl border border-[#c8efdd] bg-white px-5 py-2.5 text-[13.5px] font-medium text-[#0b8f5c] hover:border-primary">
                Try Noxtill Free
              </Link>
              <Link href="/product#assistant" className="inline-flex items-center gap-1 rounded-xl border border-border-strong bg-white px-5 py-2.5 text-[13.5px] font-medium text-fg hover:border-primary hover:text-accent">
                See How It Works <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
