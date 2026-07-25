import { type InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
  leadingSlot?: React.ReactNode;
  trailingSlot?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leadingSlot, trailingSlot, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leadingSlot && (
            <span className="pointer-events-none absolute start-3.5 flex items-center text-fg-faint">
              {leadingSlot}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            className={cn(
              "h-11 w-full rounded-[var(--radius-sm)] border bg-surface px-3.5 text-sm text-fg",
              "placeholder:text-fg-faint transition-colors duration-150",
              "focus:border-primary focus:ring-2 focus:ring-primary/15",
              error ? "border-destructive" : "border-border-strong",
              leadingSlot && "ps-10",
              trailingSlot && "pe-10",
              className,
            )}
            {...props}
          />
          {trailingSlot && (
            <span className="absolute end-3.5 flex items-center text-fg-faint">
              {trailingSlot}
            </span>
          )}
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-fg-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
