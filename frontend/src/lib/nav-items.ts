import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Clock3,
  HeartPulse,
  Radio,
  Sparkles,
  ListChecks,
  Moon,
  ShoppingCart,
  PackageOpen,
  Banknote,
  LogOut,
  History,
  ClipboardList,
  Grid3x3,
  FileEdit,
  FileText,
  Undo2,
  FileSpreadsheet,
  Receipt,
  Package,
  Boxes,
  Layers,
  PackagePlus,
  Truck,
  Tag,
  Wrench,
  Tags,
  Upload,
  Download,
  CalendarClock,
  ClipboardCheck,
  Hourglass,
  Ticket,
  CreditCard,
  UserX,
  ListOrdered,
  QrCode,
  Bell,
  CalendarDays,
  CalendarCheck,
  AlertTriangle,
  ScrollText,
  BellRing,
  PieChart,
  Wallet,
  Users,
  Star,
  Megaphone,
  TrendingUp,
  FileBarChart,
  Plug,
  UserCog,
  Building2,
  Settings,
  Filter,
  Video,
  MessageSquareWarning,
  Send,
  Code2,
  Award,
  Trophy,
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

/** 13 top-level items; Staff sees the 8 day-to-day ones, Manager sees 11, Owner sees all 13 (FE-002).
 * labelKey resolves via useTranslation(). Module subscreens are sidebar dropdown children (not
 * in-page tabs) — each is its own route; this is the standing pattern for every module going forward. */
export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "today", labelKey: "nav.today", href: "/dashboard/today", icon: Clock3 },
      { key: "health-score", labelKey: "nav.healthScore", href: "/dashboard/health-score", icon: HeartPulse },
      { key: "activity", labelKey: "nav.activity", href: "/dashboard/activity", icon: Radio },
      { key: "insights", labelKey: "nav.insights", href: "/dashboard/insights", icon: Sparkles },
      { key: "actions", labelKey: "nav.actions", href: "/dashboard/actions", icon: ListChecks },
      { key: "nightly-close", labelKey: "nav.nightlyClose", href: "/dashboard/nightly-close", icon: Moon },
    ],
  },
  {
    key: "sales",
    labelKey: "nav.sales",
    href: "/sales",
    icon: ShoppingCart,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "held", labelKey: "nav.held", href: "/sales/held", icon: PackageOpen },
      { key: "cash-register", labelKey: "nav.cashRegister", href: "/sales/cash-register", icon: Banknote },
      { key: "shift-closing", labelKey: "nav.shiftClosing", href: "/sales/shift-closing", icon: LogOut },
      { key: "sales-history", labelKey: "nav.salesHistory", href: "/sales/history", icon: History },
    ],
  },
  {
    key: "orders",
    labelKey: "nav.orders",
    href: "/orders",
    icon: ClipboardList,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "tables", labelKey: "nav.tables", href: "/orders/tables", icon: Grid3x3 },
      { key: "drafts", labelKey: "nav.drafts", href: "/orders/drafts", icon: FileEdit },
      { key: "quotations", labelKey: "nav.quotations", href: "/orders/quotations", icon: FileText },
      { key: "returns", labelKey: "nav.returns", href: "/orders/returns", icon: Undo2 },
      { key: "invoices", labelKey: "nav.invoices", href: "/orders/invoices", icon: FileSpreadsheet },
      { key: "receipts", labelKey: "nav.receipts", href: "/orders/receipts", icon: Receipt },
    ],
  },
  {
    key: "products",
    labelKey: "nav.products",
    href: "/products",
    icon: Package,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "inventory", labelKey: "nav.inventory", href: "/inventory", icon: Boxes },
      { key: "variants", labelKey: "nav.variants", href: "/products/variants", icon: Layers },
      { key: "bundles", labelKey: "nav.bundles", href: "/products/bundles", icon: PackagePlus },
      { key: "suppliers", labelKey: "nav.suppliers", href: "/products/suppliers", icon: Truck },
      { key: "pricing", labelKey: "nav.pricing", href: "/products/pricing", icon: Tag },
      { key: "services", labelKey: "nav.services", href: "/products/services", icon: Wrench },
      { key: "categories", labelKey: "nav.categories", href: "/products/categories", icon: Tags },
      { key: "product-import", labelKey: "nav.productImport", href: "/products/import", icon: Upload },
      { key: "product-export", labelKey: "nav.productExport", href: "/products/export", icon: Download },
    ],
  },
  {
    key: "bookings",
    labelKey: "nav.bookings",
    href: "/bookings",
    icon: CalendarClock,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "booking-requests", labelKey: "nav.bookingRequests", href: "/bookings/requests", icon: ClipboardCheck },
      { key: "waitlist", labelKey: "nav.waitlist", href: "/bookings/waitlist", icon: Hourglass },
      { key: "queue", labelKey: "nav.queue", href: "/bookings/queue", icon: Ticket },
      { key: "deposits", labelKey: "nav.deposits", href: "/bookings/deposits", icon: CreditCard },
      { key: "no-shows", labelKey: "nav.noShows", href: "/bookings/no-shows", icon: UserX },
      { key: "appointments-list", labelKey: "nav.appointmentsList", href: "/bookings/appointments", icon: ListOrdered },
      { key: "booking-link", labelKey: "nav.bookingLink", href: "/bookings/link", icon: QrCode },
      { key: "booking-reminders", labelKey: "nav.bookingReminders", href: "/bookings/reminders", icon: Bell },
      { key: "staff-schedule", labelKey: "nav.staffSchedule", href: "/staff", icon: CalendarDays },
    ],
  },
  {
    key: "credit",
    labelKey: "nav.credit",
    href: "/credit",
    icon: Wallet,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "credit-due-today", labelKey: "nav.creditDueToday", href: "/credit/due-today", icon: CalendarCheck },
      { key: "credit-overdue", labelKey: "nav.creditOverdue", href: "/credit/overdue", icon: AlertTriangle },
      { key: "credit-statements", labelKey: "nav.creditStatements", href: "/credit/statements", icon: ScrollText },
      { key: "credit-reminders", labelKey: "nav.creditReminders", href: "/credit/reminders", icon: BellRing },
      { key: "credit-recovery-reports", labelKey: "nav.creditRecoveryReports", href: "/credit/recovery-reports", icon: PieChart },
    ],
  },
  {
    key: "customers",
    labelKey: "nav.customers",
    href: "/customers",
    icon: Users,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "segments", labelKey: "nav.segments", href: "/customers/segments", icon: Filter },
      { key: "import-customers", labelKey: "nav.importCustomers", href: "/customers/import", icon: Upload },
    ],
  },
  {
    key: "reviews",
    labelKey: "nav.reviews",
    href: "/reviews",
    icon: Star,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "video-testimonials", labelKey: "nav.videoTestimonials", href: "/reviews/video-testimonials", icon: Video },
      { key: "private-reviews", labelKey: "nav.privateReviews", href: "/reviews/complaints", icon: MessageSquareWarning },
      { key: "review-requests", labelKey: "nav.reviewRequests", href: "/reviews/requests", icon: Send },
      { key: "rating-qr", labelKey: "nav.ratingQr", href: "/reviews/qr", icon: QrCode },
      { key: "review-widget", labelKey: "nav.reviewWidget", href: "/reviews/widget", icon: Code2 },
      { key: "reputation-score", labelKey: "nav.reputationScore", href: "/reviews/reputation-score", icon: Award },
      { key: "competitor-ratings", labelKey: "nav.competitorRatings", href: "/reviews/competitor-ratings", icon: Trophy },
      { key: "review-settings", labelKey: "nav.reviewSettings", href: "/reviews/settings", icon: Settings },
    ],
  },
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
