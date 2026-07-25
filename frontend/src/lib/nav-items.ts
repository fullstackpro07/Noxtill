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
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

/** 13 items total; Staff sees the 8 day-to-day ones, Manager sees 11, Owner sees all 13 (FE-002). */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "staff"] },
  { key: "sales", label: "Fast Sale", href: "/sales", icon: ShoppingCart, roles: ["owner", "manager", "staff"] },
  { key: "orders", label: "Orders", href: "/orders", icon: ClipboardList, roles: ["owner", "manager", "staff"] },
  { key: "products", label: "Products", href: "/products", icon: Package, roles: ["owner", "manager", "staff"] },
  { key: "bookings", label: "Bookings", href: "/bookings", icon: CalendarClock, roles: ["owner", "manager", "staff"] },
  { key: "credit", label: "Credit", href: "/credit", icon: Wallet, roles: ["owner", "manager", "staff"] },
  { key: "customers", label: "Customers", href: "/customers", icon: Users, roles: ["owner", "manager", "staff"] },
  { key: "reviews", label: "Reviews", href: "/reviews", icon: Star, roles: ["owner", "manager", "staff"] },
  { key: "marketing", label: "Marketing", href: "/marketing", icon: Megaphone, roles: ["owner", "manager"] },
  { key: "profit", label: "Profit", href: "/profit", icon: TrendingUp, roles: ["owner", "manager"] },
  { key: "staff", label: "Staff", href: "/staff", icon: UserCog, roles: ["owner"] },
  { key: "branches", label: "Branches", href: "/branches", icon: Building2, roles: ["owner"] },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, roles: ["owner", "manager"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
