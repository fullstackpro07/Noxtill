import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function WizardProgress({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mb-8 flex items-center">
      {labels.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  active && !done && "bg-primary/12 text-primary ring-2 ring-primary",
                  !done && !active && "bg-surface-2 text-fg-faint",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  active ? "text-fg" : "text-fg-faint",
                )}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span
                className={cn("mx-2 h-px flex-1 transition-colors", done ? "bg-primary" : "bg-border")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
