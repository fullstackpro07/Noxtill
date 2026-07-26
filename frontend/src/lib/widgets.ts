import type { LucideIcon } from "lucide-react";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Wallet,
  CalendarClock,
  CalendarX,
  Star,
  MessageSquareWarning,
  Send,
  Megaphone,
  Users,
  Trophy,
  UserCog,
  Gauge,
  BarChart3,
  CheckCircle2,
  UserPlus,
  UserMinus,
  Crown,
  Clock,
  CalendarCheck,
  CalendarDays,
} from "lucide-react";

export type WidgetKind =
  | "currency"
  | "currencyPair"
  | "count"
  | "percent"
  | "average"
  | "productList"
  | "leaderboard"
  | "competitorList"
  | "quota"
  | "channelBreakdown";

export type WidgetCategory =
  | "sales"
  | "inventory"
  | "credit"
  | "bookings"
  | "reviews"
  | "marketing"
  | "staff"
  | "messaging";

export interface WidgetDef {
  key: string;
  title: string;
  category: WidgetCategory;
  kind: WidgetKind;
  icon: LucideIcon;
  /** Widgets flagged here surface in the alert stack when their mock value crosses a concerning threshold. */
  alertWorthy?: boolean;
}

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  sales: "Sales",
  inventory: "Inventory",
  credit: "Credit",
  bookings: "Bookings",
  reviews: "Reviews",
  marketing: "Marketing",
  staff: "Staff",
  messaging: "Messaging",
};

/** Mirrors the backend's widget registry (BE-067) key-for-key, so wiring live data in INT-002 is a drop-in. */
export const WIDGETS: WidgetDef[] = [
  { key: "revenue_today", title: "Today's Revenue", category: "sales", kind: "currency", icon: DollarSign },
  { key: "orders_today", title: "Today's Orders", category: "sales", kind: "count", icon: ShoppingCart },
  { key: "avg_order_value_month", title: "Avg. Order Value", category: "sales", kind: "average", icon: TrendingUp },
  { key: "revenue_this_month", title: "Revenue (this month)", category: "sales", kind: "currencyPair", icon: DollarSign },
  { key: "top_products_month", title: "Top Products", category: "sales", kind: "productList", icon: Trophy },
  { key: "expenses_this_month", title: "Expenses (this month)", category: "sales", kind: "currency", icon: Wallet },
  { key: "new_customers_month", title: "New Customers", category: "sales", kind: "count", icon: UserPlus },
  { key: "lapsed_customers", title: "Lapsed Customers", category: "sales", kind: "count", icon: UserMinus },
  { key: "vip_customers", title: "VIP Customers", category: "sales", kind: "count", icon: Crown },

  { key: "low_stock_count", title: "Low Stock Items", category: "inventory", kind: "count", icon: Package, alertWorthy: true },

  { key: "credit_outstanding", title: "Credit Outstanding", category: "credit", kind: "currency", icon: Wallet },

  { key: "upcoming_appointments", title: "Upcoming Appointments", category: "bookings", kind: "count", icon: CalendarClock },
  { key: "no_show_rate_month", title: "No-show Rate", category: "bookings", kind: "percent", icon: CalendarX },
  { key: "appointments_completed_month", title: "Completed This Month", category: "bookings", kind: "count", icon: CalendarCheck },
  { key: "pending_appointments_today", title: "Today's Appointments", category: "bookings", kind: "count", icon: CalendarDays },

  { key: "reviews_average", title: "Average Rating", category: "reviews", kind: "average", icon: Star },
  { key: "open_complaints", title: "Open Complaints", category: "reviews", kind: "count", icon: MessageSquareWarning, alertWorthy: true },
  { key: "pending_review_requests", title: "Pending Review Requests", category: "reviews", kind: "count", icon: Send },

  { key: "campaign_performance_month", title: "Campaign Performance", category: "marketing", kind: "count", icon: Megaphone },
  { key: "referral_count", title: "Customers Referred", category: "marketing", kind: "count", icon: Users },
  { key: "competitor_comparison", title: "Competitor Ratings", category: "marketing", kind: "competitorList", icon: BarChart3 },

  { key: "staff_leaderboard_month", title: "Staff Leaderboard", category: "staff", kind: "leaderboard", icon: Trophy },
  { key: "staff_count", title: "Team Size", category: "staff", kind: "count", icon: UserCog },
  { key: "attendance_today", title: "Checked In Today", category: "staff", kind: "count", icon: CheckCircle2 },

  { key: "message_quota_usage", title: "Message Quota Usage", category: "messaging", kind: "quota", icon: Gauge, alertWorthy: true },
  { key: "channel_breakdown_month", title: "Messages by Channel", category: "messaging", kind: "channelBreakdown", icon: BarChart3 },
  { key: "delivery_rate_month", title: "Delivery Rate", category: "messaging", kind: "percent", icon: Clock },
];

export function widgetByKey(key: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.key === key);
}

/** The 6 widgets a brand-new dashboard ships with by default. */
export const DEFAULT_LAYOUT = [
  "revenue_today",
  "orders_today",
  "upcoming_appointments",
  "low_stock_count",
  "credit_outstanding",
  "reviews_average",
  "message_quota_usage",
  "open_complaints",
];

/**
 * Deterministic mock payloads shaped exactly like the real widget resolvers
 * (BE-067) — this is what gets swapped for a real `GET /widgets/:key` call
 * in INT-002, no shape changes needed.
 */
export function getMockWidgetData(key: string): unknown {
  switch (key) {
    case "revenue_today":
      return { revenue: 842.5, orders: 14 };
    case "orders_today":
      return { count: 14 };
    case "avg_order_value_month":
      return { average: 62.4 };
    case "revenue_this_month":
      return { revenue: 18420, grossProfit: 7368 };
    case "top_products_month":
      return [
        { name: "Signature Haircut", units: 82, revenue: 2460 },
        { name: "Argan Oil Treatment", units: 41, revenue: 1230 },
        { name: "Beard Trim", units: 65, revenue: 975 },
      ];
    case "expenses_this_month":
      return { total: 3120 };
    case "new_customers_month":
      return { count: 23 };
    case "lapsed_customers":
      return { count: 9 };
    case "vip_customers":
      return { count: 17 };
    case "low_stock_count":
      return { count: 3 };
    case "credit_outstanding":
      return { total: 1284.75 };
    case "upcoming_appointments":
      return { count: 11 };
    case "no_show_rate_month":
      return { rate: 6.4 };
    case "appointments_completed_month":
      return { count: 58 };
    case "pending_appointments_today":
      return { count: 7 };
    case "reviews_average":
      return { average: 4.7 };
    case "open_complaints":
      return { count: 2 };
    case "pending_review_requests":
      return { count: 5 };
    case "campaign_performance_month":
      return { campaignCount: 3, totalSent: 640 };
    case "referral_count":
      return { count: 12 };
    case "competitor_comparison":
      return [
        { platformRef: "Glow Salon & Spa", rating: 4.5, reviewsCount: 212 },
        { platformRef: "The Barber Room", rating: 4.2, reviewsCount: 98 },
      ];
    case "staff_leaderboard_month":
      return [
        { name: "Maria Santos", total: 4820 },
        { name: "Jordan Lee", total: 3910 },
        { name: "Priya Nair", total: 3105 },
      ];
    case "staff_count":
      return { count: 6 };
    case "attendance_today":
      return { count: 4 };
    case "message_quota_usage":
      return { used: 418, quota: 600, percent: 69.7 };
    case "channel_breakdown_month":
      return { whatsapp: 512, sms: 64, email: 22 };
    case "delivery_rate_month":
      return { rate: 97.2 };
    default:
      return null;
  }
}

export interface WidgetAlert {
  widgetKey: string;
  message: string;
  tone: "warning" | "danger";
}

/** Per-widget threshold logic for the alert stack (FE-007) — only alertWorthy widgets are ever checked. */
export function getWidgetAlert(widget: WidgetDef, data: unknown): WidgetAlert | null {
  if (!widget.alertWorthy) return null;

  switch (widget.key) {
    case "low_stock_count": {
      const count = (data as { count: number }).count;
      return count > 0
        ? { widgetKey: widget.key, message: `${count} product${count === 1 ? "" : "s"} running low on stock`, tone: "warning" }
        : null;
    }
    case "open_complaints": {
      const count = (data as { count: number }).count;
      return count > 0
        ? { widgetKey: widget.key, message: `${count} private complaint${count === 1 ? "" : "s"} awaiting a response`, tone: "danger" }
        : null;
    }
    case "message_quota_usage": {
      const { used, quota } = data as { used: number; quota: number };
      const percent = quota > 0 ? (used / quota) * 100 : 0;
      return percent >= 80
        ? {
            widgetKey: widget.key,
            message: `Message quota at ${Math.round(percent)}% — consider upgrading your plan`,
            tone: percent >= 95 ? "danger" : "warning",
          }
        : null;
    }
    default:
      return null;
  }
}
