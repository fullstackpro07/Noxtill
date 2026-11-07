import Link from "next/link";
import { ShoppingCart, ClipboardList, Package, CalendarDays, Users, Wallet, Megaphone, FileBarChart, UserCog, Boxes, Inbox } from "lucide-react";
import { useDisabledModules } from "@/components/layout/module-gate";

const ACTIONS = [
  { name: "Fast Sale (POS)", href: "/sales", module: "sales", icon: ShoppingCart, color: "#12A150" },
  { name: "Orders", href: "/orders", module: "orders", icon: ClipboardList, color: "#475467" },
  { name: "Products", href: "/products", module: "products", icon: Package, color: "#F97316" },
  { name: "Bookings", href: "/bookings", module: "bookings", icon: CalendarDays, color: "#9333EA" },
  { name: "Customers", href: "/customers", module: "customers", icon: Users, color: "#0D9488" },
  { name: "Credit", href: "/credit", module: "credit", icon: Wallet, color: "#EF4444" },
  { name: "Marketing", href: "/marketing", module: "marketing", icon: Megaphone, color: "#9333EA" },
  { name: "Reports", href: "/reports", module: "reports", icon: FileBarChart, color: "#475467" },
  { name: "Staff", href: "/staff", module: "staff", icon: UserCog, color: "#0D9488" },
  { name: "Inventory", href: "/inventory", module: "inventory", icon: Boxes, color: "#12A150" },
  { name: "Unified Inbox", href: "/unified-inbox", module: "unified-inbox", icon: Inbox, color: "#2563EB" },
];

/** Static shortcuts — every target is a real, already-built route. */
export function QuickActionsGrid() {
  const disabledModules = useDisabledModules();
  const actions = ACTIONS.filter((action) => !disabledModules.has(action.module));
  return (
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-3.5 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Quick Actions</h2>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
        {actions.map((a) => (
          <Link
            key={a.name}
            href={a.href}
            className="flex flex-col items-center justify-center gap-2 rounded-[12px] px-1.5 py-3.5"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <a.icon className="h-[21px] w-[21px]" style={{ color: a.color }} strokeWidth={1.9} aria-hidden />
            <span className="text-center text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{a.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
