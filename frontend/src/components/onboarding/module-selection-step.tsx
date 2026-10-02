"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  BUSINESS_MODULES_QUERY_KEY,
  fetchBusinessModules,
} from "@/lib/business-modules-api";
import { useOnboardingStore } from "@/store/onboarding-store";

const GROUP_HINTS: Record<string, string> = {
  Core: "Day-to-day operations",
  "Growth & channels": "Selling and marketing beyond the counter",
  AI: "AI tools for your business",
};

export function ModuleSelectionStep() {
  const { data: onboarding, updateData } = useOnboardingStore();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: BUSINESS_MODULES_QUERY_KEY,
    queryFn: fetchBusinessModules,
    staleTime: 60_000,
  });

  const modules = data?.modules ?? [];
  const selected = new Set(onboarding.enabledModuleKeys ?? []);
  const confirmed = onboarding.enabledModuleKeys !== null;
  const groups = Array.from(new Set(modules.map((module) => module.group)));

  function toggle(key: string, checked: boolean) {
    const next = new Set(onboarding.enabledModuleKeys ?? []);
    if (checked) next.add(key);
    else next.delete(key);
    updateData({ enabledModuleKeys: [...next] });
  }

  return (
    <section aria-labelledby="module-selection-title">
      <h2 id="module-selection-title" className="font-display text-xl font-bold text-fg">
        Which modules do you want to use?
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Choose what fits your business. You can change this later in Settings → Modules.
        Dashboard and Settings always stay on.
      </p>

      {isPending ? (
        <p className="mt-6 text-sm text-fg-muted" role="status">Loading module choices…</p>
      ) : isError ? (
        <div className="mt-6 rounded-[var(--radius-noxtill)] border border-border p-4">
          <p className="text-sm text-fg-muted">Module choices couldn&apos;t load.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg" aria-live="polite">
              {confirmed
                ? `${selected.size} of ${modules.length} modules selected`
                : "Nothing selected yet"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => updateData({ enabledModuleKeys: modules.map((module) => module.key) })}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => updateData({ enabledModuleKeys: [] })}
              >
                Dashboard &amp; Settings only
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {groups.map((group) => (
              <fieldset key={group} className="min-w-0">
                <legend className="font-display text-sm font-bold text-fg">{group}</legend>
                <p className="mt-0.5 text-xs text-fg-muted">{GROUP_HINTS[group] ?? "Choose the tools you need"}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {modules.filter((module) => module.group === group).map((module) => (
                    <label
                      key={module.key}
                      className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        checked={selected.has(module.key)}
                        onChange={(event) => toggle(module.key, event.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{module.label}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">{module.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
