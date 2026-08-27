"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell,
  Calendar,
  ChevronRight,
  CreditCard,
  Megaphone,
  MessageCircle,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Star,
  Users,
} from "lucide-react";

const LEFT_CARDS = [
  { icon: ShoppingCart, bg: "#e3fbf1", tone: "#0ea86a", title: "Orders", description: "Sync orders from all your channels and keep everything in one place.", tags: ["Online Orders", "POS Orders", "Returns"] },
  { icon: Users, bg: "#e8edfa", tone: "#2c477e", title: "Customers", description: "Unify customer profiles, history, and interactions across all tools.", tags: ["Profiles", "Purchase History", "Segments"] },
  { icon: CreditCard, bg: "#e3fbf1", tone: "#0ea86a", title: "Payments", description: "Sync payments, refunds, and fees so your records always match.", tags: ["Transactions", "Refunds", "Payment Methods"] },
  { icon: Package, bg: "#f3e8fd", tone: "#7c3aed", title: "Inventory", description: "Keep stock levels, purchases, and adjustments in real time.", tags: ["Stock Levels", "Purchases", "Wastage"] },
];

const RIGHT_CARDS = [
  { icon: Calendar, bg: "#ffe9d6", tone: "#c2540a", title: "Bookings", description: "Sync appointments and schedules to reduce no-shows and conflicts.", tags: ["Appointments", "Availability", "Reminders"] },
  { icon: Megaphone, bg: "#fde2ea", tone: "#c2255c", title: "Marketing", description: "Sync contacts, campaigns, and results to target the right customers.", tags: ["Campaigns", "Segments", "Performance"] },
  { icon: MessageCircle, bg: "#e3fbf1", tone: "#0ea86a", title: "Communication", description: "Bring WhatsApp, SMS, email and social messages into one inbox.", tags: ["WhatsApp", "SMS", "Email", "Social"] },
  { icon: Star, bg: "#fff6d6", tone: "#b45309", title: "Reviews", description: "Collect, monitor and respond to reviews from all major platforms.", tags: ["Google", "Facebook", "Trustpilot", "More"] },
];

const SATELLITES = [...LEFT_CARDS.map((c, i) => ({ ...c, side: "left" as const, index: i })), ...RIGHT_CARDS.map((c, i) => ({ ...c, side: "right" as const, index: i }))];

const NAV_ITEMS = ["Dashboard", "Sales / POS", "Orders", "Bookings", "Customers", "Inventory", "Payments", "Marketing", "Inbox", "Reviews", "Reports", "Integrations", "Settings"];

const TOOLS_ROW = [
  { name: "Shopify", logo: "/brand/shopify.png" },
  { name: "WooCommerce", logo: "/brand/woocommerce.png" },
  { name: "Stripe", letter: "S", bg: "#635bff" },
  { name: "QuickBooks", logo: "/brand/quickbooks.png" },
  { name: "WhatsApp", logo: "/brand/whatsapp.png" },
  { name: "HubSpot", logo: "/brand/hubspot.png" },
];

const SYNC_STATS = [
  { label: "Data Synced Today", value: "12,540", delta: "↑ 18%", points: "0,18 8,14 16,16 24,9 32,11 40,4" },
  { label: "Records Updated", value: "8,921", delta: "↑ 12%", points: "0,15 8,17 16,10 24,12 32,7 40,5" },
  { label: "Sync Success Rate", value: "99.8%", delta: "↑ 0.2%", points: "0,16 8,12 16,14 24,10 32,8 40,6" },
];

const RECENT_ACTIVITY = [
  { name: "Shopify", logo: "/brand/shopify.png", detail: "Orders · Customers · Products", time: "2 mins ago" },
  { name: "Stripe", letter: "S", bg: "#635bff", detail: "Payments · Refunds · Fees", time: "5 mins ago" },
  { name: "QuickBooks", logo: "/brand/quickbooks.png", detail: "Invoices · Customers · Payments", time: "8 mins ago" },
];

const PHASE_DURATION = 900;
const LAST_PHASE = SATELLITES.length - 1;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function ToolBadge({ tool }: { tool: { name: string; logo?: string; letter?: string; bg?: string } }) {
  if (tool.logo) {
    return <Image src={tool.logo} alt="" width={20} height={20} className="h-5 w-5 flex-none rounded-[5px] object-contain" />;
  }
  return (
    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[5px] text-[10px] font-bold text-white" style={{ backgroundColor: tool.bg }}>
      {tool.letter}
    </span>
  );
}

function SideConnector({ side, activeIndex }: { side: "left" | "right"; activeIndex: number | null }) {
  const paths = Array.from({ length: 4 }, (_, i) => {
    const y = ((i + 0.5) / 4) * 100;
    return side === "left" ? `M 0 ${y} C 45 ${y}, 55 50, 100 50` : `M 100 ${y} C 55 ${y}, 45 50, 0 50`;
  });

  return (
    <div className="flex w-9 flex-none items-center self-stretch">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={activeIndex === i ? "#0ea86a" : "#a9e8cb"}
            strokeWidth={1.1}
            strokeDasharray="3 3"
            style={{ animation: "dash-flow 1.1s linear infinite" }}
          />
        ))}
      </svg>
    </div>
  );
}

function CategoryCard({ card, active }: { card: (typeof LEFT_CARDS)[number]; active: boolean }) {
  return (
    <div className={`rounded-2xl border p-2.5 transition-colors duration-300 ${active ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-border bg-white"}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={{ backgroundColor: card.bg }}>
          <card.icon className="h-3.5 w-3.5" style={{ color: card.tone }} aria-hidden />
        </span>
        <span className="font-display text-[12px] font-semibold text-fg">{card.title}</span>
      </div>
      <p className="mb-1.5 whitespace-nowrap text-[10px] leading-snug text-fg-muted">{card.description}</p>
      <div className="flex flex-nowrap gap-1">
        {card.tags.map((tag) => (
          <span key={tag} className="whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[8.5px] text-fg-muted">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Live recreation of the static "integrations sync overview" screenshot: eight category cards
 * (orders, customers, payments, inventory, bookings, marketing, communication, reviews) radiate
 * into the central Noxtill dashboard. Connector lines flow continuously; a timer cycles which
 * satellite card is "syncing" so the hub reads as an always-on system instead of a still image.
 */
export function IntegrationsSyncOverviewLiveDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    const timer = setInterval(() => setPhase((p) => (p + 1) % (LAST_PHASE + 1)), PHASE_DURATION);
    return () => clearInterval(timer);
  }, []);

  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const naturalWidth = inner.offsetWidth;
      setNaturalHeight(inner.offsetHeight);
      setScale(naturalWidth > 0 ? Math.min(1, outer.offsetWidth / naturalWidth) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  const active = SATELLITES[phase];

  return (
    <div ref={outerRef} className="mx-auto w-full max-w-350 overflow-hidden" style={{ height: naturalHeight ? naturalHeight * scale : undefined }}>
      <div
        ref={innerRef}
        className="flex w-max items-stretch"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <div className="flex w-100 flex-none flex-col gap-2">
          {LEFT_CARDS.map((card, i) => (
            <CategoryCard key={card.title} card={card} active={active.side === "left" && active.index === i} />
          ))}
        </div>

        <SideConnector side="left" activeIndex={active.side === "left" ? active.index : null} />

        {/* Noxtill dashboard */}
        <div className="w-99 flex-none rounded-2xl border border-border bg-white p-4">
          <div className="mb-3.5 flex items-center gap-2">
            <Image src="/brand/noxtill-mark.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            <span className="font-display text-[14px] font-bold text-fg">Noxtill</span>
            <span className="ml-3 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10.5px] text-fg-faint">
              <Search className="h-3 w-3" aria-hidden /> Search anything...
            </span>
            <Bell className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <Settings className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <span className="h-5.5 w-5.5 flex-none rounded-full bg-[#e3fbf1]" />
          </div>

          <div className="flex gap-3">
            <div className="flex w-[78px] flex-none flex-col gap-1.5">
              {NAV_ITEMS.map((item) => (
                <div
                  key={item}
                  className={`truncate rounded-md px-1.5 py-1 text-[8.5px] ${item === "Integrations" ? "bg-[#e3fbf1] font-medium text-[#0b8f5c]" : "text-fg-faint"}`}
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-[13.5px] font-semibold text-fg">Integrations Overview</div>
                  <div className="text-[9.5px] text-fg-faint">All your tools. All your data. Always in sync.</div>
                </div>
                <span className="flex-none rounded-full bg-[#e3fbf1] px-2 py-1 text-[8.5px] font-medium text-[#0b8f5c]">✓ 12 Integrations Connected</span>
              </div>

              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {TOOLS_ROW.map((tool) => (
                  <span key={tool.name} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#eef0ef] bg-white">
                    <ToolBadge tool={tool} />
                  </span>
                ))}
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-border-strong text-fg-faint">+</span>
              </div>

              <div className="mb-2.5 rounded-sm border border-[#eef0ef] p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-semibold text-fg">Sync Status</span>
                  <span className="flex items-center gap-1 text-[8px] text-[#0b8f5c]">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" /> All Systems Operational
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {SYNC_STATS.map((stat) => (
                    <div key={stat.label} className="rounded-sm border border-[#eef0ef] p-1.5">
                      <div className="truncate text-[7px] text-fg-faint">{stat.label}</div>
                      <div className="text-[10px] font-semibold text-fg">{stat.value}</div>
                      <div className="text-[7px] text-accent">{stat.delta}</div>
                      <svg viewBox="0 0 40 20" preserveAspectRatio="none" className="mt-0.5 h-2.5 w-full" aria-hidden>
                        <polyline points={stat.points} fill="none" stroke="#0ea86a" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  ))}
                  <div className="rounded-sm border border-[#eef0ef] p-1.5">
                    <div className="text-[7px] text-fg-faint">Last Sync</div>
                    <div className="text-[10px] font-semibold text-fg">2 mins ago</div>
                    <div className="text-[7px] text-accent">Real-time</div>
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-[#eef0ef] p-2">
                <div className="mb-1.5 text-[9.5px] font-semibold text-fg">Recent Sync Activity</div>
                <div className="flex flex-col gap-1.5">
                  {RECENT_ACTIVITY.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <ToolBadge tool={item} />
                      <span className="min-w-0 flex-1 truncate text-[8.5px] text-fg">{item.detail}</span>
                      <span className="flex-none font-mono text-[7.5px] text-fg-faint">{item.time}</span>
                      <span className="flex-none rounded-full bg-[#e3fbf1] px-1.5 py-0.5 text-[7px] font-medium text-[#0b8f5c]">Synced</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[8.5px] text-primary">
                  View all activity <ChevronRight className="h-3 w-3" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>

        <SideConnector side="right" activeIndex={active.side === "right" ? active.index : null} />

        <div className="flex w-100 flex-none flex-col gap-2">
          {RIGHT_CARDS.map((card, i) => (
            <CategoryCard key={card.title} card={card} active={active.side === "right" && active.index === i} />
          ))}
        </div>
      </div>
    </div>
  );
}
