import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Package,
  Boxes,
  CalendarClock,
  Wallet,
  Users,
  Star,
  Megaphone,
  TrendingUp,
  Receipt,
  FileBarChart,
  Plug,
  UserCog,
  Building2,
  Settings,
} from "lucide-react";

export type Role = "owner" | "manager" | "staff";

export interface NavChildItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  /** Rendered indented beneath the parent, expanded only while the parent or one of its children is the active route. */
  children?: NavChildItem[];
}

/** 13 top-level items; Staff sees the 8 day-to-day ones, Manager sees 11, Owner sees all 13 (FE-002). labelKey resolves via useTranslation(). */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "staff"] },
  { key: "sales", labelKey: "nav.sales", href: "/sales", icon: ShoppingCart, roles: ["owner", "manager", "staff"] },
  { key: "orders", labelKey: "nav.orders", href: "/orders", icon: ClipboardList, roles: ["owner", "manager", "staff"] },
  {
    key: "products",
    labelKey: "nav.products",
    href: "/products",
    icon: Package,
    roles: ["owner", "manager", "staff"],
    children: [{ key: "inventory", labelKey: "nav.inventory", href: "/inventory", icon: Boxes }],
  },
  { key: "bookings", labelKey: "nav.bookings", href: "/bookings", icon: CalendarClock, roles: ["owner", "manager", "staff"] },
  { key: "credit", labelKey: "nav.credit", href: "/credit", icon: Wallet, roles: ["owner", "manager", "staff"] },
  { key: "customers", labelKey: "nav.customers", href: "/customers", icon: Users, roles: ["owner", "manager", "staff"] },
  { key: "reviews", labelKey: "nav.reviews", href: "/reviews", icon: Star, roles: ["owner", "manager", "staff"] },
  {
    key: "marketing",
    labelKey: "nav.marketing",
    href: "/marketing",
    icon: Megaphone,
    roles: ["owner", "manager"],
    children: [{ key: "integrations", labelKey: "nav.integrations", href: "/integrations", icon: Plug }],
  },
  {
    key: "profit",
    labelKey: "nav.profit",
    href: "/profit",
    icon: TrendingUp,
    roles: ["owner", "manager"],
    children: [
      { key: "expenses", labelKey: "nav.expenses", href: "/expenses", icon: Receipt },
      { key: "reports", labelKey: "nav.reports", href: "/reports", icon: FileBarChart },
    ],
  },
  { key: "staff", labelKey: "nav.staff", href: "/staff", icon: UserCog, roles: ["owner"] },
  { key: "branches", labelKey: "nav.branches", href: "/branches", icon: Building2, roles: ["owner"] },
  { key: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings, roles: ["owner", "manager"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
