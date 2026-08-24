"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { buildFaqJsonLd, type FaqItem } from "@/lib/marketing/faq-jsonld";

export type { FaqItem };

/** Renders both the visible accordion and an FAQPage JSON-LD block for SEO — every programmatic type page ships one. */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const jsonLd = buildFaqJsonLd(items);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-col divide-y divide-border rounded-[var(--radius-noxtill)] border border-border bg-surface">
        {items.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.question}>
              <button
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start"
              >
                <span className="font-medium text-fg">{item.question}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-fg-faint transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {open && <p className="px-5 pb-4 text-sm text-fg-muted">{item.answer}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
