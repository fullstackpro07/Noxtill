import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BusinessTypeSolution } from "@/lib/marketing/solutions-content";

export function SolutionsTypeCard({ type }: { type: BusinessTypeSolution }) {
  const Icon = type.icon;

  return (
    <div
      id={type.slug}
      className="flex scroll-mt-24 flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 font-display text-[17px] font-semibold text-fg">{type.name}</div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-fg-faint">{type.tier}</div>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-noxtill)] bg-primary/8 text-primary">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      </div>

      <div className="border-l-2 border-[#f0d9b8] pl-2.5">
        <div className="mb-0.5 text-[10.5px] text-[#9a6a1e]">The problem</div>
        <div className="text-[13px] leading-relaxed text-fg-muted">{type.problem}</div>
      </div>

      <div>
        <div className="mb-1.5 text-[10.5px] text-fg-faint">The workflow in Noxtill</div>
        <div className="flex flex-wrap gap-1.5">
          {type.flow.map((step) => (
            <span key={step} className="rounded-full border border-border px-2.5 py-1 text-[10.5px] text-[#253830]">
              {step}
            </span>
          ))}
        </div>
      </div>

      <div className="border-l-2 border-[#cfeede] pl-2.5">
        <div className="mb-0.5 text-[10.5px] text-primary">The outcome</div>
        <div className="text-[13px] leading-relaxed text-[#253830]">{type.outcome}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {type.modules.map((m) => (
          <Link
            key={m.name}
            href={m.href}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-fg-muted hover:border-accent/40 hover:text-primary"
          >
            {m.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-faint">
        <span>Connects:</span>
        {type.integrations.map((i, idx) => (
          <span key={i.name} className="flex items-center gap-1.5">
            <Link href={i.href} className="text-fg-muted hover:text-primary">
              {i.name}
            </Link>
            {idx < type.integrations.length - 1 ? <span aria-hidden>·</span> : null}
          </span>
        ))}
      </div>

      <Link href={`/solutions/${type.slug}`} className="mt-auto flex items-center gap-1 text-[13px] font-medium text-primary">
        {type.cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
