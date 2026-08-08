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
  /** Widgets flagged here accept the dashboard's 7/30/90-day range selector; everything else is a snapshot or "today" widget by design and ignores it (matches backend's WIDGET_RANGE_DAYS-aware resolvers). */
  rangeAware?: boolean;
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
  { key: "avg_order_value_month", title: "Avg. Order Value", category: "sales", kind: "average", icon: TrendingUp, rangeAware: true },
  { key: "revenue_this_month", title: "Revenue (this month)", category: "sales", kind: "currencyPair", icon: DollarSign, rangeAware: true },
  { key: "top_products_month", title: "Top Products", category: "sales", kind: "productList", icon: Trophy, rangeAware: true },
  { key: "expenses_this_month", title: "Expenses (this month)", category: "sales", kind: "currency", icon: Wallet, rangeAware: true },
  { key: "new_customers_month", title: "New Customers", category: "sales", kind: "count", icon: UserPlus, rangeAware: true },
  { key: "lapsed_customers", title: "Lapsed Customers", category: "sales", kind: "count", icon: UserMinus },
  { key: "vip_customers", title: "VIP Customers", category: "sales", kind: "count", icon: Crown },

  { key: "low_stock_count", title: "Low Stock Items", category: "inventory", kind: "count", icon: Package, alertWorthy: true },

  { key: "credit_outstanding", title: "Credit Outstanding", category: "credit", kind: "currency", icon: Wallet },

  { key: "upcoming_appointments", title: "Upcoming Appointments", category: "bookings", kind: "count", icon: CalendarClock },
  { key: "no_show_rate_month", title: "No-show Rate", category: "bookings", kind: "percent", icon: CalendarX, rangeAware: true },
  { key: "appointments_completed_month", title: "Completed This Month", category: "bookings", kind: "count", icon: CalendarCheck, rangeAware: true },
  { key: "pending_appointments_today", title: "Today's Appointments", category: "bookings", kind: "count", icon: CalendarDays },

  { key: "reviews_average", title: "Average Rating", category: "reviews", kind: "average", icon: Star },
  { key: "open_complaints", title: "Open Complaints", category: "reviews", kind: "count", icon: MessageSquareWarning, alertWorthy: true },
  { key: "pending_review_requests", title: "Pending Review Requests", category: "reviews", kind: "count", icon: Send },

  { key: "campaign_performance_month", title: "Campaign Performance", category: "marketing", kind: "count", icon: Megaphone, rangeAware: true },
  { key: "referral_count", title: "Customers Referred", category: "marketing", kind: "count", icon: Users },
  { key: "competitor_comparison", title: "Competitor Ratings", category: "marketing", kind: "competitorList", icon: BarChart3 },

  { key: "staff_leaderboard_month", title: "Staff Leaderboard", category: "staff", kind: "leaderboard", icon: Trophy, rangeAware: true },
  { key: "staff_count", title: "Team Size", category: "staff", kind: "count", icon: UserCog },
  { key: "attendance_today", title: "Checked In Today", category: "staff", kind: "count", icon: CheckCircle2 },

  { key: "message_quota_usage", title: "Message Quota Usage", category: "messaging", kind: "quota", icon: Gauge, alertWorthy: true },
  { key: "channel_breakdown_month", title: "Messages by Channel", category: "messaging", kind: "channelBreakdown", icon: BarChart3, rangeAware: true },
  { key: "delivery_rate_month", title: "Delivery Rate", category: "messaging", kind: "percent", icon: Clock, rangeAware: true },
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
