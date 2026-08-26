"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Clock,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  SendHorizontal,
  Settings2,
  Smile,
  Star,
  Type,
  Zap,
} from "lucide-react";

const TABS = [
  { label: "All", count: 32, active: true },
  { label: "Unread", count: 8 },
  { label: "Mentions", count: 4 },
  { label: "Priority", count: 3 },
];

const CONVERSATIONS = [
  { initials: "SJ", name: "Sarah Johnson", color: "#0ea86a", channel: "whatsapp", time: "10:32 AM", preview: "Hi, I would like to know the status of my order.", badge: "2", badgeColor: "#0ea86a", active: true },
  { initials: "JW", name: "James Wilson", color: "#2563eb", channel: "email", time: "10:28 AM", preview: "Can you share the invoice for my last order?", badge: "1", badgeColor: "#9aa5a1" },
  { initials: "ED", name: "Emma Davis", color: "#db2777", channel: "instagram", time: "09:45 AM", preview: "Do you have this product in black colour?", badge: "1", badgeColor: "#9aa5a1" },
  { initials: "MB", name: "Michael Brown", color: "#7c3aed", channel: "facebook", time: "09:18 AM", preview: "I received a wrong item. Please help.", badge: "3", badgeColor: "#e0483f" },
  { initials: "OM", name: "Olivia Martinez", color: "#6b7a73", channel: "sms", time: "Yesterday", preview: "How can I track my shipment?", badge: null },
  { initials: "DT", name: "Daniel Taylor", color: "#0d9488", channel: "tiktok", time: "Yesterday", preview: "I'm interested in your enterprise plan. Please share details.", badge: "1", badgeColor: "#9aa5a1" },
  { initials: "SA", name: "Sophia Anderson", color: "#ca8a04", channel: "linkedin", time: "Yesterday", preview: "Do you offer discounts for bulk orders?", badge: "2", badgeColor: "#9aa5a1" },
  { initials: "WT", name: "William Thomas", color: "#0ea86a", channel: "chat", time: "May 19", preview: "Please call me back. Need help with payment.", badge: "1", badgeColor: "#9aa5a1" },
  { initials: "AC", name: "Ava Clark", color: "#2563eb", channel: "email", time: "May 18", preview: "Can you provide a warranty for this product?", badge: null },
  { initials: "JB", name: "James Baker", color: "#db2777", channel: "instagram", time: "May 17", preview: "I want to return my order. What is the process?", badge: null },
  { initials: "EM", name: "Emily Moore", color: "#7c3aed", channel: "whatsapp", time: "May 16", preview: "Do you have a physical store location?", badge: null },
];

const BRAND_ICON_CHANNELS = ["whatsapp", "facebook", "instagram", "linkedin" , "tiktok" , "email" ,"sms"  ];

function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel) return null;
  if (BRAND_ICON_CHANNELS.includes(channel)) {
    const src = channel === "facebook" ? "/brand/messenger.png" : `/brand/${channel}.png`;
    return <Image src={src} alt="" width={13} height={13} className="h-[13px] w-[13px] rounded-md object-cover" />;
  }
  
}

/** Phases: agent-typing → reply1 → yes-order# → agent-typing2 → reply2 (shipping details) → thanks (hold). */
const PHASE_DURATIONS = [900, 700, 700, 900, 800, 2600];
const LAST_PHASE = PHASE_DURATIONS.length - 1;
const RESET_PAUSE = 500;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Pixel-faithful, animated recreation of the static Unified Inbox screenshot. The outer frame has a
 * fixed height (tall enough that every panel's full content fits with no scrollbar) so it never
 * grows or shrinks — only the middle conversation thread replays live, message by message. Holds on
 * the fully resolved thread for prefers-reduced-motion instead of cycling.
 */
export function UnifiedInboxLiveDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === -1) {
      timer = setTimeout(() => setPhase(0), RESET_PAUSE);
    } else if (phase < LAST_PHASE) {
      timer = setTimeout(() => setPhase((p) => p + 1), PHASE_DURATIONS[phase]);
    } else {
      timer = setTimeout(() => setPhase(-1), PHASE_DURATIONS[phase]);
    }
    return () => clearTimeout(timer);
  }, [phase]);

  const typing1 = phase === 0;
  const reply1 = phase >= 1;
  const orderNumMsg = phase >= 2;
  const typing2 = phase === 3;
  const reply2 = phase >= 4;
  const thanksMsg = phase >= 5;

  return (
    <div className="h-[660px] w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white text-[13px] shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
      <div className="flex h-full">
        {/* Left — conversation list */}
        <div className="flex w-[30%] min-w-0 flex-none flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
            <div className="flex items-center gap-2">
              <Mail className="h-[18px] w-[18px] text-fg" aria-hidden />
              <span className="font-display text-[15px] font-bold text-fg">Unified Inbox</span>
            </div>
            <Settings2 className="h-4 w-4 text-fg-faint" aria-hidden />
          </div>

          <div className="flex items-center gap-2 px-4 pb-2.5">
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-fg-faint">
              <Search className="h-3 w-3 flex-none" aria-hidden />
              <span className="truncate text-[10.5px]">Search conversations…</span>
            </div>
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg border border-border-strong text-fg-faint">
              <Settings2 className="h-3 w-3" aria-hidden />
            </span>
          </div>

          <div className="flex items-center gap-2 border-b border-border px-4 pb-2 text-[10.5px] font-medium">
            {TABS.map((tab) => (
              <span key={tab.label} className={`flex items-center gap-1 pb-1.5 ${tab.active ? "border-b-2 border-accent text-accent" : "text-fg-faint"}`}>
                {tab.label}
                <span className={`text-[9px] ${tab.active ? "text-accent" : "text-fg-faint"}`}>{tab.count}</span>
              </span>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {CONVERSATIONS.map((c) => (
              <div
                key={c.name}
                className={`flex items-start gap-2 border-b border-[#f2f5f3] px-4 py-2 ${c.active ? "border-l-2 border-l-accent bg-[#f7fdfa]" : ""}`}
              >
                <span
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ backgroundColor: c.color }}
                >
                  {c.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-fg">
                      {c.name}
                      <ChannelBadge channel={c.channel} />
                    </span>
                    <span className="flex-none text-[9px] text-fg-faint">{c.time}</span>
                  </div>
                  <div className="mt-0.5 flex items-end justify-between gap-2">
                    <span className="line-clamp-1 text-[10px] leading-snug text-fg-faint">{c.preview}</span>
                    {c.badge ? (
                      <span
                        className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-[8px] font-semibold text-white"
                        style={{ backgroundColor: c.badgeColor }}
                      >
                        {c.badge}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle — active conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0ea86a] text-[10px] font-semibold text-white">SJ</span>
              <div>
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                  Sarah Johnson
                  <Image src="/brand/whatsapp.png" alt="" width={13} height={13} className="h-[13px] w-[13px] rounded-full object-cover" />
                </span>
                <span className="flex items-center gap-1 text-[9.5px] text-fg-faint">
                  <MessageCircle className="h-2.5 w-2.5" aria-hidden /> WhatsApp
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-fg-faint">
              <Star className="h-3.5 w-3.5" aria-hidden />
              <Mail className="h-3.5 w-3.5" aria-hidden />
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <MoreVertical className="h-3.5 w-3.5" aria-hidden />
            </div>
          </div>

          <div className="flex-1 px-4 py-3">
            <div className="mx-auto mb-3 w-fit rounded-full bg-surface-2 px-3 py-1 text-[9.5px] text-fg-faint">Today</div>

            <div className="mb-2.5 max-w-[80%] rounded-[10px_10px_10px_2px] bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-fg">
              Hi, I would like to know the status of my order.
              <div className="mt-1 text-[9px] text-fg-faint">10:31 AM</div>
            </div>

            {typing1 ? (
              <div className="mb-2.5 ml-auto flex w-fit items-center gap-1 rounded-[10px_10px_2px_10px] bg-[#e3fbf1] px-3 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "typing-bounce 1.1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            ) : null}

            {reply1 ? (
              <div className="animate-stagger-in mb-2.5 ml-auto max-w-[80%] rounded-[10px_10px_2px_10px] bg-[#e3fbf1] px-3 py-2 text-[11.5px] leading-snug text-fg">
                Hello Sarah! 👋
                <br />
                Sure, I can help you with that. Can you please share your order number?
                <div className="mt-1 text-right text-[9px] text-fg-faint">10:31 AM ✓✓</div>
              </div>
            ) : null}

            {orderNumMsg ? (
              <div className="animate-stagger-in mb-2.5 max-w-[80%] rounded-[10px_10px_10px_2px] bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-fg">
                Yes, it&apos;s #ORD-9847
                <div className="mt-1 text-[9px] text-fg-faint">10:32 AM</div>
              </div>
            ) : null}

            {typing2 ? (
              <div className="mb-2.5 ml-auto flex w-fit items-center gap-1 rounded-[10px_10px_2px_10px] bg-[#e3fbf1] px-3 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "typing-bounce 1.1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            ) : null}

            {reply2 ? (
              <div className="animate-stagger-in mb-2.5 ml-auto max-w-[85%] rounded-[10px_10px_2px_10px] bg-[#e3fbf1] px-3 py-2.5 text-[11.5px] leading-snug text-fg">
                Thank you! 🙌
                <br />
                Your order #ORD-9847 was shipped on May 18, 2025 and is currently in transit.
                <br />
                <br />
                Estimated delivery: May 22, 2025
                <br />
                <br />
                You can track your order using this link:
                <br />
                <span className="inline-flex items-center gap-1 font-medium text-accent underline">
                  <Link2 className="h-3 w-3" aria-hidden /> Track Order
                </span>
                <div className="mt-1 text-right text-[9px] text-fg-faint">10:32 AM ✓✓</div>
              </div>
            ) : null}

            {thanksMsg ? (
              <div className="animate-stagger-in max-w-[80%] rounded-[10px_10px_10px_2px] bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-fg">
                Great, thank you so much! 😊
                <div className="mt-1 text-[9px] text-fg-faint">10:33 AM</div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2">
            {["Reply", "Thank You", "Track Order", "View Policy"].map((label) => (
              <span key={label} className="rounded-full border border-border-strong px-2.5 py-1 text-[10px] font-medium text-fg">
                {label}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
            <span className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-[10.5px] text-fg-faint">Type a message</span>
            <Paperclip className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <Smile className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <Zap className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <Type className="h-3.5 w-3.5 flex-none text-fg-faint" aria-hidden />
            <span className="flex flex-none items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[11px] font-medium text-white">
              <SendHorizontal className="h-3 w-3" aria-hidden /> Send
            </span>
          </div>
        </div>

        {/* Right — customer context */}
        <div className="flex w-[26%] min-w-0 flex-none flex-col border-l border-border p-4">
          <div className="mb-3.5 flex items-center gap-2 text-[11px] font-medium">
            <span className="border-b-2 border-accent pb-1 text-accent">Details</span>
            <span className="pb-1 text-fg-faint">Profile</span>
            <span className="pb-1 text-fg-faint">Notes</span>
            <span className="pb-1 text-fg-faint">Activity</span>
          </div>

          <div className="mb-3.5 rounded-[12px] border border-border p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0ea86a] text-[11px] font-semibold text-white">SJ</span>
              <div>
                <div className="text-[12.5px] font-semibold text-fg">Sarah Johnson</div>
                <span className="inline-flex rounded-full bg-[#ede9fe] px-2 py-0.5 text-[9px] font-medium text-[#6d28d9]">VIP Customer</span>
              </div>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[10.5px] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-accent" aria-hidden /> +1 234 567 8900
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-accent" aria-hidden /> New York, USA
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-accent" aria-hidden /> 10:32 AM (Local Time)
              </span>
            </div>
          </div>

          <div className="mb-3.5">
            <div className="mb-1.5 text-[11.5px] font-semibold text-fg">Customer Overview</div>
            {[
              ["Total Orders", "12"],
              ["Total Spent", "$1,245.00"],
              ["Customer Since", "Feb 10, 2024"],
              ["Last Order", "May 10, 2025"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-1 text-[10.5px]">
                <span className="text-fg-faint">{label}</span>
                <span className="font-medium text-fg">{value}</span>
              </div>
            ))}
          </div>

          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-fg">Recent Orders</span>
              <span className="text-[9.5px] font-medium text-accent">View All</span>
            </div>
            {[
              { id: "#ORD-9847", date: "May 10, 2025", status: "In Transit", tone: "#e8a93c", price: "$125.00" },
              { id: "#ORD-9731", date: "Apr 28, 2025", status: "Delivered", tone: "#0ea86a", price: "$210.00" },
            ].map((o) => (
              <div key={o.id} className="flex items-center justify-between py-1 text-[10.5px]">
                <div>
                  <div className="font-medium text-fg">{o.id}</div>
                  <div className="text-[9px] text-fg-faint">{o.date}</div>
                </div>
                <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-medium text-white" style={{ backgroundColor: o.tone }}>
                  {o.status}
                </span>
                <span className="font-medium text-fg">{o.price}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-fg">Open Tickets</span>
              <span className="text-[9.5px] font-medium text-accent">View All</span>
            </div>
            {[
              { title: "Wrong item received", date: "May 12, 2025", status: "Open", tone: "#6d28d9", bg: "#ede9fe" },
              { title: "Discount on bulk order", date: "May 05, 2025", status: "Closed", tone: "#6b7a73", bg: "#f2f4f3" },
            ].map((t) => (
              <div key={t.title} className="flex items-center justify-between py-1 text-[10.5px]">
                <div>
                  <div className="font-medium text-fg">{t.title}</div>
                  <div className="text-[9px] text-fg-faint">{t.date}</div>
                </div>
                <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-medium" style={{ backgroundColor: t.bg, color: t.tone }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
