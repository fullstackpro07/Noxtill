"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Check,
  Clock,
  CreditCard,
  Download,
  Mail,
  Megaphone,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";

const SUMMARY_ROWS = [
  { icon: TrendingUp, label: "Total Sales", value: "$18,760", color: "#0ea86a" },
  { icon: Package, label: "Total Orders", value: "128", color: "#2563eb" },
  { icon: Calendar, label: "Bookings", value: "24", color: "#7c3aed" },
  { icon: AlertTriangle, label: "Gross Profit", value: "$4,890", color: "#d97706" },
  { icon: CreditCard, label: "Pending Payments", value: "$3,150", color: "#e0483f" },
];

const STEPS = ["Preparing", "Ready", "Sent"];

const CAMPAIGN_ROWS = [
  { icon: Users, label: "Customer Segments", badge: "AI Suggested", tone: "purple" },
  { icon: Pencil, label: "Copy & Content", badge: "AI Draft", tone: "purple" },
  { icon: Megaphone, label: "Social Media", badge: "AI Draft", tone: "purple" },
  { icon: Tag, label: "Offers & Discounts", badge: "AI Recommendation", tone: "green" },
  { icon: Mail, label: "Email Campaign", badge: "AI Draft", tone: "purple" },
  { icon: BarChart3, label: "Performance Report", badge: "AI Insight", tone: "green" },
] as const;

/** Phase durations (ms): user msg → summary → insight → pdf+bar → preparing → ready → sent+deliver → campaign msg → campaign rows → approval (hold). */
const PHASE_DURATIONS = [650, 700, 650, 1100, 450, 450, 700, 650, 900, 2600];
const LAST_PHASE = PHASE_DURATIONS.length - 1;
const RESET_PAUSE = 500;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Every block is always mounted — visibility is a class swap (opacity-0 → animate-stagger-in),
 * never a mount/unmount — so each panel keeps its full, final height from the very first frame
 * instead of growing/shrinking as content reveals. */
function reveal(flag: boolean) {
  return flag ? "animate-stagger-in" : "opacity-0";
}

/**
 * Pixel-faithful, animated recreation of the static "Business Summary Report" screenshot: one
 * continuous automation runs across all three panels — a WhatsApp-style request produces a live
 * business summary, which becomes a generated report ready to deliver, which in turn spins up a
 * draft marketing campaign awaiting human approval. Holds on the settled final state for
 * prefers-reduced-motion instead of cycling.
 */
export function AiAssistantReportDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const [cycle, setCycle] = useState(0);
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;

    let timer: ReturnType<typeof setTimeout>;
    if (phase === -1) {
      timer = setTimeout(() => setPhase(0), RESET_PAUSE);
    } else if (phase < LAST_PHASE) {
      timer = setTimeout(() => setPhase((p) => p + 1), PHASE_DURATIONS[phase]);
    } else {
      timer = setTimeout(() => {
        setPhase(-1);
        setCycle((c) => c + 1);
      }, PHASE_DURATIONS[phase]);
    }
    return () => clearTimeout(timer);
  }, [phase]);

  const userMsg = phase >= 0;
  const summary = phase >= 1;
  const insight = phase >= 2;
  const pdf = phase >= 3;
  const preparingLit = phase >= 4;
  const readyLit = phase >= 5;
  const sentLit = phase >= 6;
  const deliverButtons = phase >= 6;
  const campaignMsg = phase >= 7;
  const campaignRows = phase >= 8;
  const approvalBox = phase >= 9;

  return (
    <div key={cycle} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
      {/* Panel 1 — Sample conversation */}
      <div className="flex flex-col rounded-[var(--radius-lg)] border border-border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-[16px] font-semibold text-fg">Sample conversation</div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-fg-faint">Today</div>
        </div>

        <div className={`mb-4 self-start rounded-[12px_12px_12px_3px] bg-[#e3fbf1] px-3.5 py-2.5 ${reveal(userMsg)}`}>
          <div className="text-[13px] text-fg">Give me today&apos;s business summary</div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-fg-faint">
            10:30 AM <Check className="h-3 w-3 text-accent" aria-hidden strokeWidth={3} />
          </div>
        </div>

        <div className={`rounded-[12px] border border-border p-4 ${reveal(summary)}`}>
          <div className="mb-3 font-display text-[13.5px] font-semibold text-fg">Today&apos;s Business Summary</div>
          <div className="flex flex-col gap-2.5">
            {SUMMARY_ROWS.map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between gap-3 ${reveal(summary)}`} style={{ animationDelay: `${i * 80}ms` }}>
                <span className="flex items-center gap-2 text-[12.5px] text-fg-muted">
                  <row.icon className="h-3.5 w-3.5 flex-none" style={{ color: row.color }} aria-hidden />
                  {row.label}
                </span>
                <span className="text-[13px] font-medium text-fg">{row.value}</span>
              </div>
            ))}
          </div>

          <div className={`mt-3.5 border-t border-border pt-3 ${reveal(insight)}`}>
            <div className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-accent">AI Insight</div>
            <div className="text-[11.5px] leading-relaxed text-fg-muted">
              Sales are up 18% compared to yesterday.
              <br />
              Top category: Electronics.
            </div>
          </div>
        </div>

        <div className={`mt-3.5 flex items-start gap-2.5 rounded-[12px] bg-[#e3fbf1] p-3.5 ${reveal(insight)}`}>
          <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-accent">
            <Check className="h-2.5 w-2.5 text-white" aria-hidden strokeWidth={3} />
          </span>
          <div className="text-[11px] leading-relaxed text-[#0b8f5c]">
            Using: Sales Data · Orders · Bookings · Inventory · Customers (real-time). If a figure isn&apos;t in your
            connected data, Noxtill replies &ldquo;I couldn&apos;t find that information.&rdquo;
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-medium text-fg">
            <Plus className="h-3 w-3" aria-hidden /> New conversation
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-medium text-fg">
            <Search className="h-3 w-3" aria-hidden /> Search history
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-medium text-fg">
            <Clock className="h-3 w-3" aria-hidden /> Recent questions
          </span>
        </div>
      </div>

      {/* Panel 2 — Business Summary Report */}
      <div className="flex flex-col rounded-[var(--radius-lg)] border border-border bg-white p-5">
        <div className="mb-4 font-display text-[16px] font-semibold text-fg">Business Summary Report</div>

        <div className={`rounded-[12px] border border-border p-4 ${reveal(pdf)}`}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-7 flex-none items-center justify-center rounded-[4px] bg-[#e0483f]">
              <span className="font-mono text-[7px] font-bold text-white">PDF</span>
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-fg">Business_Summary_Report.pdf</div>
              <div className="text-[10.5px] text-fg-faint">245 KB</div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-fg-muted">Generating report…</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-accent"
                style={pdf ? { animation: "bar-fill 1s ease-out forwards" } : { width: 0 }}
              />
            </span>
            <span className="flex-none font-mono text-[10.5px] font-medium text-accent">100%</span>
          </div>
        </div>

        <div className={`mt-5 flex items-center justify-between ${reveal(preparingLit)}`}>
          {STEPS.map((step, i) => {
            const lit = (i === 0 && preparingLit) || (i === 1 && readyLit) || (i === 2 && sentLit);
            return (
              <div key={step} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-300 ${lit ? "bg-accent" : "bg-surface-2"}`}
                  style={lit ? { animation: "step-pulse 0.5s ease-out" } : undefined}
                >
                  {lit ? <Check className="h-3.5 w-3.5 text-white" aria-hidden /> : null}
                </span>
                <span className={`font-mono text-[9.5px] uppercase tracking-wide ${lit ? "text-fg" : "text-fg-faint"}`}>{step}</span>
              </div>
            );
          })}
        </div>

        <div className={`mt-5 ${reveal(deliverButtons)}`}>
          <div className="mb-2.5 text-[12.5px] font-medium text-fg">Deliver to</div>
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-whatsapp px-4 py-2.5 text-[13px] font-medium text-white">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </span>
            <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#2563eb] px-4 py-2.5 text-[13px] font-medium text-white">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email
            </span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between pt-5 text-[13px] font-medium text-accent">
          <span>Download report</span>
          <Download className="h-4 w-4" aria-hidden />
        </div>
      </div>

      {/* Panel 3 — One message can start the work */}
      <div className="flex flex-col rounded-[var(--radius-lg)] border border-[#e3ddfa] bg-[#f6f4fd] p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#e3ddfa]">
            <Sparkles className="h-4 w-4 text-[#7c3aed]" aria-hidden />
          </span>
          <div className="font-display text-[15px] font-semibold text-[#4c1d95]">One message can start the work.</div>
        </div>

        <div className={`mb-3.5 self-start rounded-[12px_12px_12px_3px] bg-[#e3ddfa] px-3.5 py-2.5 ${reveal(campaignMsg)}`}>
          <div className="text-[13px] text-[#3b1a78]">Prepare today&apos;s marketing campaign.</div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-[#7c6aa3]">
            10:35 AM <Check className="h-3 w-3 text-[#7c3aed]" aria-hidden strokeWidth={3} />
          </div>
        </div>

        <div className={`rounded-[12px] border border-[#e3ddfa] bg-white p-4 ${reveal(campaignRows)}`}>
          <div className="mb-3 text-[12px] text-fg-faint">Noxtill is preparing your campaign…</div>
          <div className="flex flex-col gap-3">
            {CAMPAIGN_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-2 ${reveal(campaignRows)}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg">
                  <row.icon className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
                  <span className="truncate">{row.label}</span>
                </span>
                <span
                  className={`flex-none rounded-full px-2 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wide ${
                    row.tone === "green" ? "bg-[#e3fbf1] text-[#0b8f5c]" : "bg-[#ede9fe] text-[#6d28d9]"
                  }`}
                >
                  {row.badge}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`mt-auto flex items-center gap-2.5 rounded-[12px] bg-[#fdf1de] p-3.5 ${reveal(approvalBox)}`}>
          <Shield className="h-4 w-4 flex-none text-[#c9791a]" aria-hidden />
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[#c9791a]">Human Approval Required</div>
        </div>
      </div>
    </div>
  );
}
