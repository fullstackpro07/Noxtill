import { cn } from "@/lib/utils";
import { scorePassword, STRENGTH_LABEL, type PasswordStrength } from "@/lib/password-strength";

const BAR_COLOR: Record<PasswordStrength, string> = {
  0: "bg-border-strong",
  1: "bg-destructive",
  2: "bg-accent",
  3: "bg-whatsapp",
  4: "bg-primary",
};

const LABEL_COLOR: Record<PasswordStrength, string> = {
  0: "text-fg-faint",
  1: "text-destructive",
  2: "text-accent-foreground",
  3: "text-whatsapp",
  4: "text-primary",
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i < score ? BAR_COLOR[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <span className={cn("shrink-0 text-xs font-medium", LABEL_COLOR[score])}>
        {STRENGTH_LABEL[score]}
      </span>
    </div>
  );
}
