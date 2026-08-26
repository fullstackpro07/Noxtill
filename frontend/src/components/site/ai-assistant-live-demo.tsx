"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BarChart3, Check, CheckSquare, Lightbulb, Mail, Mic, Pencil, User } from "lucide-react";

const STEPS = [
  { title: "Understands", description: "AI understands the context", icon: Lightbulb },
  { title: "Analyses", description: "Analyses across your data", icon: BarChart3 },
  { title: "Acts", description: "Takes action and gets it done", icon: Check },
];

const ACTIONS = [
  { icon: BarChart3, label: "Create Report" },
  { icon: User, label: "Send to Team" },
  { icon: Pencil, label: "Update Record" },
  { icon: CheckSquare, label: "Create Task" },
];

/** Phase durations (ms): understand → analyse → act → typing → answer+buttons (hold). */
const PHASE_DURATIONS = [750, 750, 750, 600, 2800];
const LAST_PHASE = PHASE_DURATIONS.length - 1;
const RESET_PAUSE = 500;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Always mount, only toggle opacity — keeps the Unified Inbox card's height fixed from the first
 * frame instead of growing/shrinking as the typing indicator, answer and buttons reveal in turn. */
function reveal(flag: boolean) {
  return flag ? "animate-stagger-in" : "opacity-0";
}

/**
 * Pixel-faithful recreation of the static "AI Business Assistant" screenshot — same four channel
 * cards, same Unified Inbox card, same Understands/Analyses/Acts list — brought to life: the voice
 * waveform and file progress bar animate continuously, the dashed connectors "flow", and the
 * pipeline lights up in sequence before the answer and action buttons land, looping. Holds on the
 * settled final state for prefers-reduced-motion instead of cycling.
 */
export function AiAssistantLiveDemo() {
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

  const understandActive = phase === 0;
  const analyseActive = phase === 1;
  const actActive = phase === 2;
  const typing = phase === 3;
  const answerVisible = phase >= 4;

  const stepLit = (i: number) =>
    (i === 0 && understandActive) ||
    (i === 1 && analyseActive) ||
    (i === 2 && actActive) ||
    (i === 0 && phase > 0) ||
    (i === 1 && phase > 1) ||
    (i === 2 && phase > 2);

  return (
    <div className="w-full rounded-[24px] bg-[#fbfcfb] p-1">
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <ChannelCard
          avatar={<Image src="/brand/whatsapp.png" alt="" width={48} height={48} className="h-10 w-10 rounded-full object-cover" />}
          title="WhatsApp"
          description="Ask questions and receive answers."
        >
          <div className="flex flex-col gap-2">
            <div className="ml-auto max-w-[92%] rounded-[12px_12px_3px_12px] bg-[#d9fdd3] px-3 py-2">
              <div className="text-[12px] leading-snug text-fg">How much did we sell today?</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-[#5a6b62]">
                10:30 AM
                <Check className="h-3 w-3 text-[#4fc3f7]" aria-hidden strokeWidth={3} />
              </div>
            </div>
            <div className="mr-auto max-w-[92%] rounded-[12px_12px_12px_3px] bg-surface-2 px-3 py-2">
              <div className="text-[12px] leading-snug text-fg">Total sales today $18,760.</div>
              <div className="mt-1 text-right text-[9.5px] text-fg-faint">10:30 AM</div>
            </div>
          </div>
        </ChannelCard>

        <ChannelCard
          avatar={
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe8fc]">
              <Mail className="h-5 w-5 text-[#1d4ed8]" aria-hidden strokeWidth={2} />
            </span>
          }
          title="Email"
          description="Request reports and business updates."
        >
          <div className="rounded-[12px] border border-border p-3">
            <div className="text-[11.5px] text-fg-faint">
              To: <span className="font-medium text-fg">Noxtill</span>
            </div>
            <div className="mt-1 text-[11.5px] text-fg-faint">
              Subject: <span className="font-medium text-fg">Sales report</span>
            </div>
            <div className="mt-2 text-[12px] leading-snug text-fg">Hi, can you send me yesterday&apos;s sales summary?</div>
            <div className="mt-2 text-right text-[9.5px] text-fg-faint">10:31 AM</div>
          </div>
        </ChannelCard>

        <ChannelCard
          avatar={
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e6e0fa]">
              <Mic className="h-5 w-5 text-[#6d28d9]" aria-hidden strokeWidth={2} />
            </span>
          }
          title="Voice"
          description="Speak naturally and get instant answers."
        >
          <div className="rounded-[12px] border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-4 flex-1 items-end gap-[1.5px] overflow-hidden">
                {[5, 9, 6, 12, 8, 14, 7, 10, 5, 9, 6, 11, 8].map((h, i) => (
                  <span
                    key={i}
                    className="w-[2px] flex-none rounded-full bg-[#8b5cf6]/70"
                    style={{ height: `${h}px`, animation: "waveform-pulse 1s ease-in-out infinite", animationDelay: `${i * 0.07}s` }}
                  />
                ))}
              </span>
              <span className="flex-none font-mono text-[9.5px] text-fg-faint">00:07</span>
            </div>
            <div className="mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent">Live Transcript</div>
            <div className="mt-1 flex items-start justify-between gap-2">
              <div className="text-[12px] leading-snug text-fg">&ldquo;Show me today&apos;s top products.&rdquo;</div>
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#6d28d9]">
                <Mic className="h-3 w-3 text-white" aria-hidden />
              </span>
            </div>
            <div className="mt-2 text-[9.5px] leading-relaxed text-fg-faint">Speak → Understand → Show result → Confirm if an action is required.</div>
          </div>
        </ChannelCard>

        <ChannelCard
          avatar={
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="flex h-9 w-7 items-center justify-center rounded-[3px] border border-border-strong bg-white" />
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-[3px] bg-[#e0483f] px-1 py-[1px] font-mono text-[7px] font-bold text-white">
                PDF
              </span>
            </span>
          }
          title="File / PDF"
          description="Upload a file and get useful insights."
        >
          <div key={cycle} className="rounded-[12px] border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-6 flex-none items-center justify-center rounded-[3px] bg-[#e0483f]/10">
                <span className="h-2.5 w-2 rounded-[1px] bg-[#e0483f]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-fg">Sales_Report_May.pdf</span>
            </div>
            <div className="ml-8 text-[9.5px] text-fg-faint">1.2 MB</div>
            <div className="mt-2.5 text-[10.5px] text-fg-muted">Summarising your file…</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-accent" style={{ animation: "bar-fill 2.4s ease-out infinite" }} />
              </span>
              <span className="flex-none font-mono text-[9.5px] font-medium text-accent">100%</span>
            </div>
          </div>
        </ChannelCard>
      </div>

      <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-[34px] w-full" aria-hidden>
        {[12.5, 37.5, 62.5, 87.5].map((x) => (
          <path
            key={x}
            d={`M ${x} 0 C ${x} 6, 25 4, 25 12`}
            fill="none"
            stroke="#a9e8cb"
            strokeWidth={0.5}
            strokeDasharray="1.6 1.6"
            style={{ animation: "dash-flow 1.4s linear infinite" }}
          />
        ))}
      </svg>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full max-w-[460px] rounded-[var(--radius-lg)] border border-border p-4.5 sm:p-5.5">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#e3fbf1]">
                <Mail className="h-4 w-4 text-accent" aria-hidden />
              </span>
              <span className="font-display text-[15px] font-semibold text-fg">Noxtill Unified Inbox</span>
            </div>
            <span className="rounded-full bg-[#e3fbf1] px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-[#0b8f5c]">
              AI Powered
            </span>
          </div>
          <div className="border-t border-border pt-3.5">
            <div className="relative min-h-[52px]">
              <div className={`absolute inset-0 inline-flex items-center gap-1 rounded-[10px] bg-surface-2 px-3 py-2.5 ${reveal(typing)}`}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-fg-faint"
                    style={{ animation: "typing-bounce 1.1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <div className={`absolute inset-0 flex items-start justify-between gap-3 ${reveal(answerVisible)}`}>
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[11.5px] text-fg-faint">
                    Here&apos;s your answer <span className="text-[10px]">· 10:32 AM</span>
                  </div>
                  <div className="text-[15px] font-medium text-fg">$18,760 in total sales today.</div>
                </div>
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent">
                  <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                </span>
              </div>
            </div>

            <div className={`mt-4 flex flex-wrap gap-2 border-t border-border pt-4 ${reveal(answerVisible)}`}>
              {ACTIONS.map((action, i) => (
                <span
                  key={action.label}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3.5 py-2 text-[12.5px] font-medium text-fg"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <action.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                  {action.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 pt-1 sm:pt-2.5">
          {STEPS.map((step, i) => {
            const lit = stepLit(i);
            const isActs = step.title === "Acts";
            return (
              <div key={step.title} className="flex items-start gap-3">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors duration-300 ${
                    isActs && lit ? "bg-accent" : lit ? "bg-[#e3fbf1]" : "bg-surface-2"
                  }`}
                  style={lit && (i === 0 ? understandActive : i === 1 ? analyseActive : actActive) ? { animation: "step-pulse 0.6s ease-out" } : undefined}
                >
                  <step.icon className={`h-4 w-4 ${isActs && lit ? "text-white" : lit ? "text-accent" : "text-fg-faint"}`} aria-hidden />
                </span>
                <div>
                  <div className={`font-display text-[15px] font-semibold transition-colors duration-300 ${lit ? "text-fg" : "text-fg-faint"}`}>
                    {step.title}
                  </div>
                  <div className="text-[12.5px] text-fg-faint">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChannelCard({
  avatar,
  title,
  description,
  children,
}: {
  avatar: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[18px] border border-border bg-white p-4 text-center shadow-[0_8px_24px_-18px_rgba(13,21,18,0.4)]">
      <div className="mx-auto mb-3">{avatar}</div>
      <div className="mb-1 font-display text-[15px] font-semibold text-fg">{title}</div>
      <div className="mb-3.5 text-[11.5px] leading-snug text-fg-faint">{description}</div>
      <div className="mt-auto text-left">{children}</div>
    </div>
  );
}
