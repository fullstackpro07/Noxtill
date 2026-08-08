"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIDGETS, getWidgetAlert } from "@/lib/widgets";
import { useWidgetDataMany } from "@/hooks/use-widget-data";

const ALERT_WORTHY_WIDGETS = WIDGETS.filter((w) => w.alertWorthy);

/** Surfaces every alert-worthy widget that's currently crossing its threshold — never more than what's real. */
export function AlertStack() {
  const results = useWidgetDataMany(ALERT_WORTHY_WIDGETS.map((w) => w.key));

  const alerts = ALERT_WORTHY_WIDGETS.map((widget, i) => {
    const result = results[i];
    if (!result.data) return null;
    return getWidgetAlert(widget, result.data);
  }).filter((a): a is NonNullable<typeof a> => a !== null);

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
