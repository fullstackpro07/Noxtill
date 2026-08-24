import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { NeedSolution } from "@/lib/marketing/solutions-content";

export function SolutionsNeedCard({ need }: { need: NeedSolution }) {
  return (
    <div
      id={need.slug}
      className="flex scroll-mt-24 flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <div className="font-display text-[17px] font-semibold text-fg">{need.title}</div>
      <p className="text-[13.5px] leading-relaxed text-fg-muted">{need.desc}</p>

      <div>
        <div className="mb-1.5 text-[10.5px] text-fg-faint">How it works</div>
        <div className="flex flex-wrap gap-1.5">
          {need.flow.map((step) => (
            <span key={step} className="rounded-full border border-border px-2.5 py-1 text-[10.5px] text-[#253830]">
              {step}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {need.modules.map((m) => (
          <Link
            key={m.name}
            href={m.href}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-fg-muted hover:border-accent/40 hover:text-primary"
          >
            {m.name}
          </Link>
        ))}
      </div>

      <div className="text-[11.5px] text-fg-faint">Most useful for: {need.who}</div>

      <Link href={`#${need.slug}`} className="mt-auto flex items-center gap-1 text-[13px] font-medium text-primary">
        {need.cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
