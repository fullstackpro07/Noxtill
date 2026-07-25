import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Small, sits directly below the field/control it explains — never its own attention-grabbing block. */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-destructive", className)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export interface ErrorBannerProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/** A whole section/page failed to load — one banner, one retry action, no guessing at partial data. */
export function ErrorBanner({ title, description, onRetry, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-noxtill)] border border-destructive/25",
        "bg-destructive/6 p-4",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </Button>
      )}
    </div>
  );
}
