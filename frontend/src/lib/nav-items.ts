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
  Zap,
  Gift,
  Mail,
  Image as ImageIcon,
  BarChart3,
  CalendarRange,
  Timer,
  HandCoins,
  FileDown,
  ShieldCheck,
  UserCheck,
  Repeat2,
  PackageCheck,
  Trash2,
  Bot,
  HelpCircle,
  Mic,
  MessagesSquare,
  Settings2,
  Clock,
  Percent,
  MapPin,
  Camera,
  RefreshCw,
  Sliders,
  Share2,
  PenSquare,
  Rocket,
  Images,
  Wand2,
  MessageCircle,
  Gauge,
  Lightbulb,
  Map,
  Hash,
  PhoneCall,
  PhoneMissed,
  Inbox,
  ScanLine,
  Route,
  Target,
  Calculator,
  Stamp,
  StickyNote,
  Brain,
  Radar,
  FlaskConical,
  Stethoscope,
  Cpu,
} from "lucide-react";

export type Role = "owner" | "manager" | "staff";

export interface NavChildItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavBadge {
  /** Static label text (e.g. a live count). Left undefined for items with no badge. */
  count?: string | number;
  /** Tailwind-independent color for the badge pill background; defaults to the app's orange accent. */
  color?: string;
}

export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  /** Rendered as an in-page tab bar on the module's own page (NOT a sidebar dropdown in the v2 design) — each is its own route. */
  children?: NavChildItem[];
  /** Live count badge shown at the end of the sidebar row (e.g. Orders, Reviews). */
  badge?: NavBadge;
  /** Shows a small "New" pill next to the label. */
  isNew?: boolean;
  /** Renders a literal 1px divider line above this item (exact match: height:1px;background:#1D3547;margin:9px 6px). */
  dividerBefore?: boolean;
  /** Renders an uppercase section label above this item instead of a line (exact match: the "Business intelligence" header). */
  sectionLabel?: string;
  /** Sidebar entry exists but has no page yet (v2 design lists it with no corresponding build) — rendered non-navigable with a "Soon" pill instead of linking anywhere. */
  disabled?: boolean;
}

/**
 * Sidebar v2 (Sept 2026 redesign) — order and grouping match `Noxtill Sidebar.dc.html` exactly:
 * Group 1 = core day-to-day modules, Group 2 = growth/channel modules + Unified Inbox, Group 3 =
 * new AI modules. `labelKey` resolves via useTranslation(). Module subscreens (`children`) are no
 * longer sidebar dropdowns — each module's own page renders them as an in-page tab bar instead
 * (see `components/layout/module-tabs.tsx`), but the routes/keys/icons here are unchanged and are
 * the single source of truth for both the sidebar and each page's tab bar.
 */
export const NAV_ITEMS: NavItem[] = [
  // ---- Group 1 ----
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
      { key: "loyalty", labelKey: "nav.loyalty", href: "/customers/loyalty", icon: Stamp },
      { key: "memory-notes", labelKey: "nav.memoryNotes", href: "/customers/memory-notes", icon: StickyNote },
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
    children: [
      { key: "campaigns", labelKey: "nav.campaigns", href: "/marketing/campaigns", icon: Send },
      { key: "coupons", labelKey: "nav.coupons", href: "/marketing/coupons", icon: Tag },
      { key: "vouchers", labelKey: "nav.vouchers", href: "/marketing/vouchers", icon: Ticket },
      { key: "automations", labelKey: "nav.automations", href: "/marketing/automations", icon: Zap },
      { key: "referrals", labelKey: "nav.referrals", href: "/marketing/referrals", icon: Gift },
      { key: "email-marketing", labelKey: "nav.emailMarketing", href: "/marketing/email", icon: Mail },
      { key: "marketing-assets", labelKey: "nav.marketingAssets", href: "/marketing/assets", icon: ImageIcon },
      { key: "marketing-analytics", labelKey: "nav.marketingAnalytics", href: "/marketing/analytics", icon: BarChart3 },
    ],
  },
  {
    key: "profit",
    labelKey: "nav.profit",
    href: "/profit",
    icon: TrendingUp,
    roles: ["owner", "manager"],
    children: [
      { key: "product-profitability", labelKey: "nav.productProfitability", href: "/profit/product-profitability", icon: PieChart },
      { key: "time-analysis", labelKey: "nav.timeAnalysis", href: "/profit/time-analysis", icon: Clock3 },
      { key: "cash-flow", labelKey: "nav.cashFlow", href: "/profit/cash-flow", icon: Banknote },
      { key: "customer-analytics", labelKey: "nav.customerAnalytics", href: "/profit/customer-analytics", icon: Users },
      { key: "staff-analytics", labelKey: "nav.staffAnalytics", href: "/profit/staff-analytics", icon: BarChart3 },
      { key: "expenses", labelKey: "nav.expenses", href: "/expenses", icon: Receipt },
    ],
  },
  {
    key: "staff",
    labelKey: "nav.staff",
    href: "/staff",
    icon: UserCog,
    roles: ["owner", "manager"],
    children: [
      { key: "schedule", labelKey: "nav.staffScheduleFull", href: "/staff/schedule", icon: CalendarRange },
      { key: "timesheets", labelKey: "nav.staffTimesheets", href: "/staff/timesheets", icon: Timer },
      { key: "advances", labelKey: "nav.staffAdvances", href: "/staff/advances", icon: HandCoins },
      { key: "payroll", labelKey: "nav.staffPayroll", href: "/staff/payroll", icon: FileDown },
      { key: "roles-permissions", labelKey: "nav.staffRoles", href: "/staff/roles", icon: ShieldCheck },
      { key: "attendance", labelKey: "nav.staffAttendance", href: "/staff/attendance", icon: UserCheck },
    ],
  },
  {
    key: "branches",
    labelKey: "nav.branches",
    href: "/branches",
    icon: Building2,
    roles: ["owner"],
    children: [
      { key: "rollup", labelKey: "nav.branchRollup", href: "/branches/rollup", icon: LayoutDashboard },
      { key: "compare", labelKey: "nav.branchCompare", href: "/branches/compare", icon: BarChart3 },
      { key: "transfers", labelKey: "nav.branchTransfers", href: "/branches/transfers", icon: Repeat2 },
    ],
  },
  {
    key: "inventory",
    labelKey: "nav.inventory",
    href: "/inventory",
    icon: Boxes,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "stock-count", labelKey: "nav.stockCount", href: "/inventory/stock-count", icon: ClipboardCheck },
      { key: "movements", labelKey: "nav.movements", href: "/inventory/movements", icon: History },
      { key: "low-stock", labelKey: "nav.lowStock", href: "/inventory/low-stock", icon: AlertTriangle },
      { key: "purchases", labelKey: "nav.purchases", href: "/inventory/purchases", icon: PackageCheck },
      { key: "wastage", labelKey: "nav.wastage", href: "/inventory/wastage", icon: Trash2 },
    ],
  },
  {
    key: "ai-assistant",
    labelKey: "nav.aiAssistant",
    href: "/assistant/help",
    icon: Bot,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "help", labelKey: "nav.helpAssistant", href: "/assistant/help", icon: HelpCircle },
      { key: "voice", labelKey: "nav.voiceAssistant", href: "/assistant/voice", icon: Mic },
      { key: "history", labelKey: "nav.chatHistory", href: "/assistant/history", icon: MessagesSquare },
      { key: "ai-settings", labelKey: "nav.aiSettings", href: "/assistant/settings", icon: Settings2 },
    ],
  },
  {
    key: "reports",
    labelKey: "nav.reports",
    href: "/reports",
    icon: FileBarChart,
    roles: ["owner", "manager"],
    children: [
      { key: "scheduled-reports", labelKey: "nav.scheduledReports", href: "/reports/scheduled", icon: Clock },
      { key: "tax-reports", labelKey: "nav.taxReports", href: "/reports/tax", icon: Percent },
    ],
  },
  { key: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings, roles: ["owner", "manager"] },

  // ---- Group 2 ----
  {
    key: "social",
    labelKey: "nav.social",
    href: "/social",
    icon: Share2,
    roles: ["owner", "manager"],
    dividerBefore: true,
    children: [
      { key: "social-calendar", labelKey: "nav.socialCalendar", href: "/social/calendar", icon: CalendarRange },
      { key: "social-create", labelKey: "nav.socialCreate", href: "/social/create", icon: PenSquare },
      { key: "social-drafts", labelKey: "nav.socialDrafts", href: "/social/drafts", icon: FileEdit },
      { key: "social-scheduled", labelKey: "nav.socialScheduled", href: "/social/scheduled", icon: CalendarClock },
      { key: "social-published", labelKey: "nav.socialPublished", href: "/social/published", icon: Rocket },
      { key: "social-media", labelKey: "nav.socialMedia", href: "/social/media", icon: Images },
      { key: "social-studio", labelKey: "nav.socialStudio", href: "/social/studio", icon: Wand2 },
      { key: "social-inbox", labelKey: "nav.socialInbox", href: "/social/inbox", icon: MessageCircle },
      { key: "social-analytics", labelKey: "nav.socialAnalytics", href: "/social/analytics", icon: BarChart3 },
      { key: "social-settings", labelKey: "nav.socialSettings", href: "/social/settings", icon: Settings },
    ],
  },
  {
    key: "advertising",
    labelKey: "nav.advertising",
    href: "/advertising",
    icon: Target,
    roles: ["owner", "manager"],
    children: [
      { key: "advertising-accounts", labelKey: "nav.advertisingAccounts", href: "/advertising", icon: Plug },
      { key: "advertising-campaigns", labelKey: "nav.advertisingCampaigns", href: "/advertising/campaigns", icon: BarChart3 },
      { key: "advertising-creatives", labelKey: "nav.advertisingCreatives", href: "/advertising/creatives", icon: ImageIcon },
      { key: "advertising-performance", labelKey: "nav.advertisingPerformance", href: "/advertising/performance", icon: Wallet },
      { key: "advertising-settings", labelKey: "nav.advertisingSettings", href: "/advertising/settings", icon: Settings2 },
    ],
  },
  {
    key: "listings",
    labelKey: "nav.listings",
    href: "/listings",
    icon: MapPin,
    roles: ["owner", "manager"],
    children: [
      { key: "listings-google", labelKey: "nav.listingsGoogle", href: "/listings/google", icon: Building2 },
      { key: "listings-sync", labelKey: "nav.listingsSync", href: "/listings/sync", icon: RefreshCw },
      { key: "listings-photos", labelKey: "nav.listingsPhotos", href: "/listings/photos", icon: Camera },
      { key: "listings-settings", labelKey: "nav.listingsSettings", href: "/listings/settings", icon: Sliders },
    ],
  },
  {
    key: "competitive",
    labelKey: "nav.competitive",
    href: "/competitive/visibility-score",
    icon: Gauge,
    roles: ["owner", "manager"],
    children: [
      { key: "competitive-visibility", labelKey: "nav.competitiveVisibility", href: "/competitive/visibility-score", icon: Gauge },
      { key: "competitive-opportunities", labelKey: "nav.competitiveOpportunities", href: "/competitive/opportunities", icon: Lightbulb },
      { key: "competitive-tracking", labelKey: "nav.competitiveTracking", href: "/competitive/tracking", icon: Building2 },
      { key: "competitive-keywords", labelKey: "nav.competitiveKeywords", href: "/competitive/keywords", icon: Hash },
      { key: "competitive-heatmap", labelKey: "nav.competitiveHeatmap", href: "/competitive/heatmap", icon: Map },
    ],
  },
  {
    key: "receptionist",
    labelKey: "nav.receptionist",
    href: "/receptionist",
    icon: PhoneCall,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "receptionist-overview", labelKey: "nav.receptionistOverview", href: "/receptionist", icon: PhoneCall },
      { key: "receptionist-missed", labelKey: "nav.receptionistMissed", href: "/receptionist/missed-calls", icon: PhoneMissed },
      { key: "receptionist-queue", labelKey: "nav.receptionistQueue", href: "/receptionist/queue", icon: Inbox },
      { key: "receptionist-analytics", labelKey: "nav.receptionistAnalytics", href: "/receptionist/analytics", icon: BarChart3 },
      { key: "receptionist-settings", labelKey: "nav.receptionistSettings", href: "/receptionist/settings", icon: Settings2 },
    ],
  },
  {
    key: "digitizer",
    labelKey: "nav.digitizer",
    href: "/digitizer",
    icon: ScanLine,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "digitizer-scanner", labelKey: "nav.digitizerScanner", href: "/digitizer", icon: Camera },
      { key: "digitizer-history", labelKey: "nav.digitizerHistory", href: "/digitizer/history", icon: History },
      { key: "digitizer-settings", labelKey: "nav.digitizerSettings", href: "/digitizer/settings", icon: Settings2 },
    ],
  },
  {
    key: "deliveries",
    labelKey: "nav.deliveries",
    href: "/deliveries",
    icon: Truck,
    roles: ["owner", "manager", "staff"],
    children: [
      { key: "deliveries-live", labelKey: "nav.deliveriesLive", href: "/deliveries", icon: Radio },
      { key: "deliveries-all", labelKey: "nav.deliveriesAll", href: "/deliveries/all", icon: Package },
      { key: "deliveries-riders", labelKey: "nav.deliveriesRiders", href: "/deliveries/riders", icon: UserCheck },
      { key: "deliveries-routes", labelKey: "nav.deliveriesRoutes", href: "/deliveries/routes", icon: Route },
      { key: "deliveries-settings", labelKey: "nav.deliveriesSettings", href: "/deliveries/settings", icon: Settings2 },
    ],
  },
  {
    key: "integrations",
    labelKey: "nav.integrations",
    href: "/integrations",
    icon: Plug,
    roles: ["owner", "manager"],
    children: [
      { key: "integrations-directory", labelKey: "nav.integrationsDirectory", href: "/integrations", icon: Plug },
      { key: "integrations-accounting-ecommerce", labelKey: "nav.integrationsAccountingEcommerce", href: "/integrations/accounting-ecommerce", icon: Calculator },
      { key: "integrations-automation", labelKey: "nav.integrationsAutomation", href: "/integrations/automation", icon: Zap },
    ],
  },
  {
    key: "unified-inbox",
    labelKey: "nav.unifiedInbox",
    href: "/unified-inbox",
    icon: Inbox,
    roles: ["owner", "manager", "staff"],
    isNew: true,
  },

  // ---- Group 3 (all new AI modules) ----
  {
    key: "business-brain",
    labelKey: "nav.businessBrain",
    href: "/business-brain",
    icon: Brain,
    roles: ["owner", "manager"],
    sectionLabel: "Business intelligence",
    isNew: true,
  },
  {
    key: "opportunity-radar",
    labelKey: "nav.opportunityRadar",
    href: "/opportunity-radar",
    icon: Radar,
    roles: ["owner", "manager"],
    isNew: true,
    disabled: true,
  },
  {
    key: "business-simulator",
    labelKey: "nav.businessSimulator",
    href: "/business-simulator",
    icon: FlaskConical,
    roles: ["owner", "manager"],
    isNew: true,
    disabled: true,
  },
  {
    key: "diagnosis-center",
    labelKey: "nav.diagnosisCenter",
    href: "/diagnosis-center",
    icon: Stethoscope,
    roles: ["owner", "manager"],
    isNew: true,
    disabled: true,
  },
  {
    key: "digital-twin",
    labelKey: "nav.digitalTwin",
    href: "/digital-twin",
    icon: Cpu,
    roles: ["owner", "manager"],
    isNew: true,
    disabled: true,
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
