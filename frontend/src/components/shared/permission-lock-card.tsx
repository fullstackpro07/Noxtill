import { Lock } from "lucide-react";

export function PermissionLockCard({
  title = "You don't have access to this",
  description = "This area is limited to owners and managers. Ask a manager if you think this is a mistake.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
        <Lock className="h-6 w-6 text-fg-faint" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-semibold text-fg">{title}</p>
        <p className="text-sm text-fg-muted">{description}</p>
      </div>
    </div>
  );
}
