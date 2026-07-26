import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Package,
  CalendarClock,
  Wallet,
  Users,
  Star,
  Megaphone,
  TrendingUp,
  UserCog,
  Building2,
  Settings,
} from "lucide-react";

export type Role = "owner" | "manager" | "staff";

export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

/** 13 items total; Staff sees the 8 day-to-day ones, Manager sees 11, Owner sees all 13 (FE-002). labelKey resolves via useTranslation(). */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "staff"] },
  { key: "sales", labelKey: "nav.sales", href: "/sales", icon: ShoppingCart, roles: ["owner", "manager", "staff"] },
  { key: "orders", labelKey: "nav.orders", href: "/orders", icon: ClipboardList, roles: ["owner", "manager", "staff"] },
  { key: "products", labelKey: "nav.products", href: "/products", icon: Package, roles: ["owner", "manager", "staff"] },
  { key: "bookings", labelKey: "nav.bookings", href: "/bookings", icon: CalendarClock, roles: ["owner", "manager", "staff"] },
  { key: "credit", labelKey: "nav.credit", href: "/credit", icon: Wallet, roles: ["owner", "manager", "staff"] },
  { key: "customers", labelKey: "nav.customers", href: "/customers", icon: Users, roles: ["owner", "manager", "staff"] },
  { key: "reviews", labelKey: "nav.reviews", href: "/reviews", icon: Star, roles: ["owner", "manager", "staff"] },
  { key: "marketing", labelKey: "nav.marketing", href: "/marketing", icon: Megaphone, roles: ["owner", "manager"] },
  { key: "profit", labelKey: "nav.profit", href: "/profit", icon: TrendingUp, roles: ["owner", "manager"] },
  { key: "staff", labelKey: "nav.staff", href: "/staff", icon: UserCog, roles: ["owner"] },
  { key: "branches", labelKey: "nav.branches", href: "/branches", icon: Building2, roles: ["owner"] },
  { key: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings, roles: ["owner", "manager"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
