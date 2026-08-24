import Link from "next/link";
import type { ProblemCard } from "@/lib/marketing/integrations-content";

export function IntegrationsProblemCard({ title, description, href }: ProblemCard) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-white p-5 transition-colors hover:border-[#a9e8cb] hover:bg-surface-2"
    >
      <div className="mb-1.5 font-display text-base font-semibold text-fg">{title}</div>
      <div className="text-[13.5px] leading-relaxed text-fg-muted">{description}</div>
    </Link>
  );
}
