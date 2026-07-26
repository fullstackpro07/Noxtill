import Link from "next/link";
import { Package, ShoppingCart, UserPlus, Rocket } from "lucide-react";

const SHORTCUTS = [
  { href: "/products", label: "Add your first product", icon: Package },
  { href: "/sales", label: "Record a sale", icon: ShoppingCart },
  { href: "/customers", label: "Invite a customer", icon: UserPlus },
];

/** Shown only while a business has recorded literally nothing yet (FE-007). */
export function NewBusinessEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/8">
        <Rocket className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-display text-lg font-semibold text-fg">Welcome to Noxtill!</p>
        <p className="text-sm text-fg-muted">
          Your dashboard fills in automatically once you start using the product. Here&apos;s a good place to start.
        </p>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2.5 rounded-[var(--radius-noxtill)] border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/8 text-primary">
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-fg">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
