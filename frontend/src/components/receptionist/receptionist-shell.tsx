"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { buildBrief, callerName, fmtWhen, needsFollowUp, sliceDay } from "@/lib/receptionist-derive";
import { Ico } from "./rx-icon";
import { Chip } from "./rx-ui";
import { useRx } from "./rx-data";
import { useRxStore } from "./rx-store";
import { RxOverlays } from "./rx-overlays";

interface TabDef {
  key: string;
  label: string;
  href: string;
  icon: string;
  title: string;
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", href: "/receptionist", icon: "phone", title: "Phone Overview" },
  { key: "live", label: "Live Calls", href: "/receptionist/live", icon: "phone-call", title: "Live Calls" },
  { key: "history", label: "Call History", href: "/receptionist/history", icon: "history", title: "Call History" },
  { key: "queue", label: "Queue & Routing", href: "/receptionist/queue", icon: "list-ordered", title: "Call Queue & Routing" },
  { key: "assistant", label: "AI Call Assistant", href: "/receptionist/assistant", icon: "sparkles", title: "AI Call Assistant" },
  { key: "bookings", label: "Bookings", href: "/receptionist/bookings", icon: "calendar-check", title: "Bookings & Reservations" },
  { key: "leads", label: "Leads", href: "/receptionist/leads", icon: "user-round-plus", title: "Leads & Call Contacts" },
  { key: "knowledge", label: "Knowledge", href: "/receptionist/knowledge", icon: "book-open", title: "Knowledge & Voice Training" },
  { key: "analytics", label: "Call Analytics", href: "/receptionist/analytics", icon: "chart-no-axes-combined", title: "Call Analytics" },
  { key: "quality", label: "Call Quality", href: "/receptionist/quality", icon: "badge-check", title: "Call Quality & Intelligence" },
  { key: "numbers", label: "Numbers", href: "/receptionist/numbers", icon: "phone", title: "Phone Numbers & Accounts" },
  { key: "settings", label: "Settings", href: "/receptionist/settings", icon: "settings-2", title: "AI Phone Settings" },
];

function activeTab(pathname: string): TabDef {
  if (pathname === "/receptionist") return TABS[0];
  return TABS.slice(1).find((t) => pathname.startsWith(t.href)) ?? TABS[0];
}

const chipPill = { height: 34, fontSize: 12.5, cursor: "pointer" } as const;

export function ReceptionistShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = activeTab(pathname);
  const rx = useRx();
  const openPanel = useRxStore((s) => s.openPanel);

  const today = useMemo(() => (rx.today ? sliceDay(rx.calls, rx.today) : null), [rx.calls, rx.today]);
  const num = rx.insights?.number ?? null;

  const openAsk = () => openPanel({ kicker: "AI phone assistant", title: "Ask about your calls", badge: "From real call records", badgeTone: "purple", body: <AskBody />, secondary: "Close" });

  // "/" focuses the Ask box, exactly like the design's shortcut hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      openPanel({ kicker: "AI phone assistant", title: "Ask about your calls", badge: "From real call records", badgeTone: "purple", body: <AskBody />, secondary: "Close" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPanel]);

  const openAiStatus = () =>
    openPanel({
      kicker: "AI voice status",
      title: num ? "Answering · always on" : "No number yet — nothing is answering",
      badge: num ? "Answering every call" : "Not set up",
      badgeTone: num ? "green" : "amber",
      rows: [
        { label: "Mode", value: num ? "Answers every inbound call, day and night" : "Off — no number provisioned", tone: num ? undefined : "neg" },
        { label: "Number", value: num?.phoneNumber ?? "None" },
        { label: "Voice", value: rx.settings?.voiceId ? rx.settings.voiceId.replace("Polly.", "") : "Twilio default" },
        { label: "Transfer number", value: rx.settings?.transferNumber ?? (rx.insights?.transferConfigured ? "Server default" : "Not configured — a transfer request is recorded as a message"), tone: rx.insights?.transferConfigured ? "pos" : "neg" },
        { label: "If the AI can't answer", value: "It takes a message and the call joins the follow-up queue" },
        { label: "Live now", value: String(rx.live.length) },
        { label: "Working hours", value: rx.insights?.workingHoursConfigured ? "Set — used to flag after-hours calls" : "Not set" },
      ],
      bulletsTitle: "What the AI may and may not do",
      bullets: [
        "It answers, takes a booking through the booking engine, takes a message, or transfers to a person",
        "It can read the records you allow — prices, stock, hours, and a matched caller's own order or balance — but has no way to change refunds, credit, stock, prices or permissions",
        "Every call starts with the recording and automated-assistant disclosure, which can't be switched off",
        "A missed call is recorded as missed — never counted as handled",
      ],
      note: "Noxtill reports what the call log proves, including the calls that went badly.",
      primary: "Open settings",
      onPrimary: () => {
        useRxStore.getState().closeOverlays();
        router.push("/receptionist/settings");
      },
      secondary: "Close",
    });

  const actions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => router.push("/receptionist/numbers")} className="border-0 bg-transparent p-0">
          <Chip tone={num ? "green" : "neutral"} style={chipPill}>
            <Ico name="phone" size={14} />
            <span className="whitespace-nowrap">{num?.phoneNumber ?? "No number"}</span>
            <Ico name="chevron-down" size={14} className="opacity-70" />
          </Chip>
        </button>
        <button type="button" onClick={openAiStatus} className="border-0 bg-transparent p-0">
          <Chip tone={num ? "green" : "amber"} style={chipPill}>
            <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: num ? "#16A34A" : "#F59E0B", animation: num ? "nxPulse 2.4s ease-in-out infinite" : undefined }} />
            <span className="whitespace-nowrap">{num ? "AI answering · always on" : "AI answering · off"}</span>
          </Chip>
        </button>
        <button type="button" onClick={() => router.push("/receptionist/live")} className="border-0 bg-transparent p-0">
          <Chip tone="blue" style={chipPill}>
            <Ico name="phone-call" size={13} />
            <span className="whitespace-nowrap">{rx.live.length} live</span>
          </Chip>
        </button>
      </div>
    ),
    // openAiStatus closes over rx/num; rebuilding when they change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [num, rx.live.length, rx.settings, rx.insights],
  );

  const search = (
    <div
      onClick={openAsk}
      className="flex h-[38px] w-full min-w-0 max-w-[440px] cursor-text items-center gap-[9px] rounded-[10px] border border-[#E6E8EC] bg-[#F5F6F8] px-3 transition-colors hover:border-[#CBD5E1] hover:bg-white"
    >
      <Ico name="sparkles" size={15} className="text-[#6D28D9]" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-[#8B97A6]">Ask — “which missed calls need follow-up?”</span>
      <span className="rounded-[5px] border border-[#E6E8EC] border-b-2 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-[#7A8798]">/</span>
    </div>
  );

  useModuleHeader({ title: tab.title, subtitle: "AI Phone Receptionist · call operations", search, actions });

  const counts: Record<string, number> = {
    live: rx.live.length,
    history: today?.calls.length ?? 0,
    queue: rx.followUps.length,
    bookings: today?.booked.length ?? 0,
    leads: rx.calls.filter((c) => !c.customer && needsFollowUp(c)).length,
  };

  return (
    <div className="flex min-h-full flex-col bg-[#F5F6F8] font-[Manrope,inherit]">
      <div className="sticky top-0 z-30 flex items-center gap-0.5 overflow-x-auto border-b border-[#EEF0F3] bg-white/95 px-6 backdrop-blur-md">
        {TABS.map((t) => {
          const on = t.key === tab.key;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              href={t.href}
              className="flex flex-none items-center gap-[7px] whitespace-nowrap px-[11px] py-3 text-[13px]"
              style={{ fontWeight: on ? 700 : 600, color: on ? "#0F172A" : "#5B6675", boxShadow: on ? "inset 0 -2px 0 #16A34A" : "none" }}
            >
              <Ico name={t.icon} size={14} />
              <span>{t.label}</span>
              {n ? (
                <span
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[10.5px] font-bold"
                  style={{ background: on ? "#DCFCE7" : "#F1F3F6", color: on ? "#15803D" : "#5B6675" }}
                >
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <main className="flex w-full max-w-[1680px] flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">{children}</main>

      <RxOverlays />
    </div>
  );
}

/** The panel behind the "Ask" box: three questions the call log can genuinely answer. */
function AskBody() {
  const rx = useRx();
  const [q, setQ] = useState<"missed" | "transfer" | "today">("missed");
  const tz = rx.timezone;

  const missed = rx.followUps.filter((c) => c.status === "missed");
  const transferred = rx.calls.filter((c) => c.outcome === "transfer" || c.status === "transferred").slice(0, 3);
  const brief = buildBrief(rx.calls, rx.today, rx.now, !!rx.insights?.workingHoursConfigured);

  let answer: string;
  let rows: { label: string; value: string }[] = [];
  if (q === "missed") {
    answer = missed.length
      ? `${missed.length} missed call${missed.length === 1 ? " is" : "s are"} still waiting for a callback. Noxtill has no transcript or recording for any of them, so it does not guess why they rang.`
      : "No missed call is waiting for a callback.";
    rows = missed.slice(0, 6).map((c) => ({ label: fmtWhen(c.startedAt, tz, rx.today, c.localDay), value: `${callerName(c)} · ${c.fromNumber}${c.assignedToName ? ` · ${c.assignedToName}` : " · unassigned"}` }));
  } else if (q === "transfer") {
    answer = transferred.length
      ? "The AI transfers a call when the caller asks for a person or it can't help. Here are the most recent transfers, with the caller's last words."
      : "No call has been transferred in the last 30 days.";
    rows = transferred.map((c) => {
      const last = [...c.transcript].reverse().find((t) => t.speaker === "caller")?.text;
      return { label: `${callerName(c)} · ${fmtWhen(c.startedAt, tz, rx.today, c.localDay)}`, value: last ? `“${last}”` : "No transcript" };
    });
  } else {
    answer = `${brief.headline} ${brief.body}`;
  }

  const Q = [
    ["missed", "Which missed calls need follow-up?"],
    ["transfer", "Why did AI transfer calls?"],
    ["today", "How is today going?"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {Q.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setQ(k)}
            className="h-8 cursor-pointer rounded-full border px-3 text-[12px] font-bold"
            style={{ borderColor: q === k ? "#DDD3FE" : "#E1E5EB", background: q === k ? "#F5F3FF" : "#fff", color: q === k ? "#6D28D9" : "#45505F" }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-[12px] border border-[#DDD3FE] bg-[#FBFAFF] p-3.5">
        <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[#6D28D9]">Answer</div>
        <div className="mt-2 text-[13px] leading-[1.6] text-[#0F172A]">{answer}</div>
      </div>
      {rows.length ? (
        <div className="overflow-hidden rounded-[12px] border border-[#E6E8EC]">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-3 px-[13px] py-[11px]" style={{ borderTop: i ? "1px solid #EEF0F3" : "none", background: i % 2 ? "#FCFCFD" : "#fff" }}>
              <div className="flex-none basis-[42%] text-[12px] font-semibold text-[#5B6675]">{r.label}</div>
              <div className="flex-1 text-right text-[12.5px] font-bold">{r.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="text-[11px] text-[#94A3B8]">Answers are computed from your call log — nothing is estimated.</div>
    </div>
  );
}
