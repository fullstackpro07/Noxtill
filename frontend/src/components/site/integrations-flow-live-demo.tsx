"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, BarChart3, Radar, Sparkles, Star, TrendingUp, Users, Zap } from "lucide-react";

const TOOLS = [
  { name: "Shopify", logo: "/brand/shopify.png" },
  { name: "WooCommerce", logo: "/brand/woocommerce.png" },
  { name: "Stripe", letter: "S", bg: "#635bff" },
  { name: "QuickBooks", logo: "/brand/quickbooks.png" },
  { name: "WhatsApp", logo: "/brand/whatsapp.png" },
  { name: "HubSpot", logo: "/brand/hubspot.png" },
  { name: "Google Business Profile", logo: "/brand/gbp.png" },
  { name: "Mailchimp", logo: "/brand/mailchimp.png" },
];

const NAV_ITEMS = ["Dashboard", "Sales / POS", "Orders", "Bookings", "Customers", "Inventory", "Marketing", "Reports", "Staff", "Integrations", "Settings"];

const STATS = [
  { label: "Today's Sales", value: "$12,540", delta: "↑ 18%", points: "0,18 8,14 16,16 24,9 32,11 40,4" },
  { label: "Orders", value: "256", delta: "↑ 12%", points: "0,15 8,17 16,10 24,12 32,7 40,5" },
  { label: "Bookings", value: "89", delta: "↑ 9%", points: "0,16 8,12 16,14 24,10 32,8 40,6" },
];

const TOP_PRODUCTS = [
  { name: "Hair Cut", value: "$1,250", pct: 100 },
  { name: "Beard Trim", value: "$980", pct: 78 },
  { name: "Hair Color", value: "$870", pct: 70 },
  { name: "Facial", value: "$620", pct: 50 },
];

const AI_ITEMS = [
  { icon: Radar, title: "Pattern Recognition", description: "AI finds trends and changes" },
  { icon: AlertTriangle, title: "Anomaly Detection", description: "AI detects unusual activity" },
  { icon: TrendingUp, title: "Smart Predictions", description: "AI forecasts what's next" },
];

const INSIGHTS = [
  { icon: BarChart3, tone: "#0b8f5c", bg: "#e3fbf1", title: "Sales Increased", description: "Sales up 18% compared to last week." },
  { icon: AlertTriangle, tone: "#b45309", bg: "#fdf3e6", title: "Low Stock Alert", description: "5 items are running low on stock." },
  { icon: Star, tone: "#b45309", bg: "#fdf3e6", title: "New Review Received", description: "You got a 5-star review on Google." },
  { icon: Users, tone: "#2c477e", bg: "#e8edfa", title: "Follow Up", description: "12 customers have outstanding credit." },
];

/** Which of the 4 panels (Tools → Noxtill → AI → Insights) is currently "active" in the flow. */
const PHASE_DURATION = 1400;
const LAST_PHASE = 3;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function ConnectorGap({ rows, active }: { rows?: number; active: boolean }) {
  const paths = rows
    ? Array.from({ length: rows }, (_, i) => {
        const y = ((i + 0.5) / rows) * 100;
        return `M 0 ${y} C 45 ${y}, 55 50, 100 50`;
      })
    : ["M 0 50 C 45 50, 55 50, 100 50"];

  return (
    <div className="hidden w-9 flex-none items-center self-stretch lg:flex">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={active ? "#0ea86a" : "#a9e8cb"}
            strokeWidth={1.1}
            strokeDasharray="3 3"
            style={{ animation: "dash-flow 1.1s linear infinite" }}
          />
        ))}
      </svg>
    </div>
  );
}

function PanelHeader({ icon, label, iconBg = "bg-primary" }: { icon: React.ReactNode; label: string; iconBg?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-[9px] ${iconBg}`}>{icon}</span>
      <span className="font-display text-[14.5px] font-semibold text-fg">{label}</span>
    </div>
  );
}

/**
 * Live recreation of the static "integrations data flow" screenshot: tools sync into Noxtill,
 * Noxtill feeds AI analysis, AI analysis surfaces insights and actions. Connector lines flow
 * continuously; which of the four panels is currently "processing" cycles on a timer so the
 * diagram reads as an always-on automation pipeline rather than a still image.
 */
export function IntegrationsFlowLiveDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    const timer = setInterval(() => setPhase((p) => (p + 1) % (LAST_PHASE + 1)), PHASE_DURATION);
    return () => clearInterval(timer);
  }, []);

  const toolsActive = phase === 0;
  const noxtillActive = phase === 1;
  const aiActive = phase === 2;
  const insightsActive = phase === 3;

  return (
    <div className="mx-auto w-full max-w-[1180px] overflow-x-auto">
      <div className="flex min-w-[900px] items-stretch gap-0 lg:min-w-0">
        {/* Your Tools */}
        <div className={`w-[230px] flex-none rounded-2xl border p-4 transition-colors duration-300 ${toolsActive ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-border bg-white"}`}>
          <div className="mb-3 font-display text-[14.5px] font-semibold text-fg">Your Tools</div>
          <div className="flex flex-col gap-2">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-center gap-2">
                {tool.logo ? (
                  <Image src={tool.logo} alt="" width={20} height={20} className="h-5 w-5 flex-none rounded-[5px] object-contain" />
                ) : (
                  <span
                    className="flex h-5 w-5 flex-none items-center justify-center rounded-[5px] text-[10px] font-bold text-white"
                    style={{ backgroundColor: tool.bg }}
                  >
                    {tool.letter}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">{tool.name}</span>
                <span className="flex-none rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[9px] font-medium text-[#0b8f5c]">Connected</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong py-2 text-[11px] font-medium text-fg-muted">
            + Connect more tools
          </div>
        </div>

        <ConnectorGap rows={TOOLS.length} active={toolsActive} />

        {/* Noxtill dashboard */}
        <div className={`w-[300px] flex-none rounded-2xl border p-4 transition-colors duration-300 ${noxtillActive ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-border bg-white"}`}>
          <PanelHeader
            icon={<Image src="/brand/noxtill-mark.png" alt="" width={20} height={20} className="h-4.5 w-4.5 object-contain" />}
            label="Noxtill"
            iconBg="border border-[#eef0ef] bg-white"
          />
          <div className="flex gap-3">
            <div className="flex w-[84px] flex-none flex-col gap-1.5">
              {NAV_ITEMS.map((item) => (
                <div
                  key={item}
                  className={`truncate rounded-md px-1.5 py-1 text-[9.5px] ${item === "Dashboard" ? "bg-[#e3fbf1] font-medium text-[#0b8f5c]" : "text-fg-faint"}`}
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {STATS.map((stat) => (
                  <div key={stat.label} className="rounded-sm border border-[#eef0ef] p-1.5">
                    <div className="truncate text-[8.5px] text-fg-faint">{stat.label}</div>
                    <div className="text-[11px] font-semibold text-fg">{stat.value}</div>
                    <div className="text-[8px] text-accent">{stat.delta}</div>
                    <svg viewBox="0 0 40 20" preserveAspectRatio="none" className="mt-0.5 h-3 w-full" aria-hidden>
                      <polyline points={stat.points} fill="none" stroke="#0ea86a" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ))}
              </div>

              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <div className="rounded-sm border border-[#eef0ef] p-1.5">
                  <div className="mb-1 text-[8.5px] text-fg-faint">Sales Overview</div>
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
                    <polyline
                      points="0,24 15,18 30,20 45,10 60,14 75,6 100,9"
                      fill="none"
                      stroke="#0ea86a"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col gap-1 rounded-sm border border-[#eef0ef] p-1.5">
                  {TOP_PRODUCTS.map((p) => (
                    <div key={p.name} className="flex items-center gap-1">
                      <span className="w-9 flex-none truncate text-[7.5px] text-fg-faint">{p.name}</span>
                      <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#eef0ef]">
                        <span
                          key={phase}
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${p.pct}%`, animation: "bar-fill 2.4s ease-out infinite" }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-sm border border-[#eef0ef] p-1.5">
                  <div className="text-[8px] text-fg-faint">Outstanding Credit</div>
                  <div className="text-[10.5px] font-semibold text-fg">$4,350</div>
                  <div className="text-[7.5px] text-fg-faint">23 customers</div>
                </div>
                <div className="rounded-sm border border-[#eef0ef] p-1.5">
                  <div className="text-[8px] text-fg-faint">Low Stock Alerts</div>
                  <div className="text-[10.5px] font-semibold text-[#c4563f]">5</div>
                  <div className="text-[7.5px] text-fg-faint">items need attention</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ConnectorGap active={aiActive || noxtillActive} />

        {/* AI Analysis */}
        <div className={`w-[220px] flex-none rounded-2xl border p-4 transition-colors duration-300 ${aiActive ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-border bg-white"}`}>
          <PanelHeader icon={<span className="font-display text-[11px] font-bold text-white">AI</span>} label="AI Analysis" />

          <div className="mb-3.5 flex items-center justify-center py-1">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-[spin_7s_linear_infinite] rounded-full border-2 border-dashed border-[#a9e8cb]" />
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary" style={{ animation: "step-pulse 1.8s ease-out infinite" }}>
                <Sparkles className="h-4.5 w-4.5 text-white" aria-hidden />
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {AI_ITEMS.map((item) => (
              <div key={item.title} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-[#e3fbf1]">
                  <item.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                </span>
                <div>
                  <div className="font-display text-[11.5px] font-semibold text-fg">{item.title}</div>
                  <div className="text-[10px] leading-snug text-fg-faint">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ConnectorGap active={insightsActive || aiActive} />

        {/* Insights & Actions */}
        <div className={`w-[260px] flex-none rounded-2xl border p-4 transition-colors duration-300 ${insightsActive ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-border bg-white"}`}>
          <div className="mb-3 font-display text-[14.5px] font-semibold text-fg">Insights &amp; Actions</div>
          <div className="flex flex-col gap-2.5">
            {INSIGHTS.map((item) => (
              <div key={item.title} className="flex items-center gap-2.5 rounded-sm border border-[#eef0ef] px-2.5 py-2">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={{ backgroundColor: item.bg }}>
                  <item.icon className="h-3.5 w-3.5" style={{ color: item.tone }} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[11.5px] font-semibold text-fg">{item.title}</div>
                  <div className="truncate text-[9.5px] text-fg-faint">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[12px] font-medium text-white"
            style={insightsActive ? { animation: "step-pulse 1.4s ease-out infinite" } : undefined}
          >
            <Zap className="h-3.5 w-3.5" aria-hidden /> Take Action
          </div>
        </div>
      </div>
    </div>
  );
}
