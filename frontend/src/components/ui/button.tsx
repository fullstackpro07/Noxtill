import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover shadow-[var(--shadow-sm)]",
  accent:
    "bg-accent text-accent-foreground hover:bg-accent-hover shadow-[var(--shadow-sm)]",
  outline:
    "border border-border-strong bg-transparent text-fg hover:bg-surface-2",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-[var(--shadow-sm)]",
  whatsapp:
    "bg-whatsapp text-whatsapp-foreground hover:brightness-105 shadow-[var(--shadow-sm)]",
} as const;

const SIZES = {
  sm: "h-8 px-3.5 text-sm gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-10 w-10",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

/** Pill-shaped everywhere per FE-001 — radius-full, not the standard 14px token. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium",
          "transition-all duration-150 ease-out active:scale-[0.97]",
          "disabled:pointer-events-none disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
