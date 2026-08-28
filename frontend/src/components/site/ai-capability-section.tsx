import { Check } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import type { AiCapabilitySection } from "@/lib/marketing/ai-content";

/**
 * Shared text+demo layout for the four "side panel" AI capability sections (Reception,
 * Voice-Entry Sales, Photo Digitizer, AI Insights) — Business Assistant is special-cased in
 * `app/ai/page.tsx` since its demo is a stack of full-width components, not a compact side panel.
 */
export function AiCapabilitySectionBlock({
  data,
  demo,
  reverse = false,
  tint = "white",
}: {
  data: AiCapabilitySection;
  demo: React.ReactNode;
  reverse?: boolean;
  tint?: "white" | "tint" | "tint-2";
}) {
  const textColumn = (
    <Reveal delay={0} className="min-w-[300px] max-w-[480px] flex-1 basis-[400px]">
      <div className="mb-3.5 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">{data.eyebrow}</div>
      <h2 className="mb-4 text-balance font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-fg sm:text-[36px]">
        {data.title} <span className="text-accent">{data.highlight}</span>
      </h2>
      <p className="mb-5 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">{data.body}</p>
      <ul className="flex flex-col gap-2.5">
        {data.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2.5 text-[14.5px] text-[#1e3138]">
            <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-surface-2">
              <Check className="h-3 w-3 text-accent" aria-hidden />
            </span>
            {bullet}
          </li>
        ))}
      </ul>
    </Reveal>
  );

  const demoColumn = (
    <Reveal delay={100} className="min-w-[300px] flex-1 basis-[440px]">
      {demo}
    </Reveal>
  );

  return (
    <section
      id={data.slug}
      className={`px-5 pt-16 sm:px-7 sm:pt-20 ${tint === "tint" ? "bg-surface-tint" : tint === "tint-2" ? "bg-surface-tint-2" : ""}`}
    >
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-wrap items-center gap-x-11 gap-y-10">
          {reverse ? (
            <>
              {demoColumn}
              {textColumn}
            </>
          ) : (
            <>
              {textColumn}
              {demoColumn}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
