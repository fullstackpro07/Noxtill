"use client";

import { useState } from "react";
import { BUSINESS_TYPES } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

export function BusinessTypePicker() {
  const [selectedKey, setSelectedKey] = useState("cafe");
  const selected = BUSINESS_TYPES.find((b) => b.key === selectedKey) ?? BUSINESS_TYPES[0];

  return (
    <section id="business-types" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Universal coverage</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-fg sm:text-4xl">Built for every business on earth.</h2>
        <p className="mx-auto mt-3 max-w-lg text-fg-muted">
          Pick your type and get a dashboard pre-configured for you. Not on the list? Describe your business in one line — AI
          generates your setup in seconds.
        </p>
      </div>

      <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-2">
        {BUSINESS_TYPES.map((type) => {
          const active = type.key === selectedKey;
          return (
            <button
              key={type.key}
              onClick={() => setSelectedKey(type.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-fg-muted hover:bg-surface-2",
              )}
            >
              {type.label}
            </button>
          );
        })}
        <button className="rounded-full border border-dashed border-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/8">
          + My business isn&apos;t listed
        </button>
      </div>

      <div className="mx-auto mt-6 max-w-2xl rounded-[var(--radius-noxtill)] border border-border bg-surface-2/50 p-5 text-center">
        <p className="font-display text-sm font-bold text-fg">{selected.label}</p>
        <p className="mt-1 text-sm text-fg-muted">
          → <span className="text-fg">{selected.preview}</span>
        </p>
      </div>
    </section>
  );
}
