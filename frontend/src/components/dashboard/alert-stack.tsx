import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIDGETS, getMockWidgetData, getWidgetAlert } from "@/lib/widgets";

/** Surfaces every alert-worthy widget that's currently crossing its threshold — never more than what's real. */
export function AlertStack() {
  const alerts = WIDGETS.filter((w) => w.alertWorthy)
    .map((w) => getWidgetAlert(w, getMockWidgetData(w.key)))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.widgetKey}
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--radius-noxtill)] border px-4 py-2.5 text-sm",
            alert.tone === "danger"
              ? "border-destructive/25 bg-destructive/6 text-fg"
              : "border-accent/30 bg-accent/8 text-fg",
          )}
        >
          <AlertTriangle
            className={cn("h-4 w-4 shrink-0", alert.tone === "danger" ? "text-destructive" : "text-accent-foreground")}
            aria-hidden
          />
          {alert.message}
        </div>
      ))}
    </div>
  );
}
