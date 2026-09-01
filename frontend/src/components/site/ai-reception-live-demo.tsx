import Image from "next/image";
import { Calendar, Mic, PhoneOff, Sparkles } from "lucide-react";

const CALL_MESSAGES = [
  { from: "ai", text: "Hello! 👋 Thank you for calling Noxtill. How can I help you today?", time: "10:24 AM" },
  { from: "caller", text: "Hi, I'd like to know about your pricing plans.", time: "10:24 AM" },
  {
    from: "ai",
    text: "Sure! We have three main plans: Starter at $29/month, Growth at $79/month, and Pro at $199/month. Which one would you like more information about?",
    time: "10:24 AM",
  },
  { from: "caller", text: "I think the Growth plan. Does it include team access?", time: "10:25 AM" },
  {
    from: "ai",
    text: "Yes! The Growth plan includes up to 10 team members, unlimited customers, automated workflows and reports.",
    time: "10:24 AM",
  },
  
];

/**
 * Live-call demo panel used by the homepage's AI Reception section and the /ai page — extracted
 * so both can share the exact same markup instead of duplicating it.
 */
export function AiReceptionLiveDemo() {
  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-border p-4.5 shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#e3fbf1]">
            <Mic className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.9} />
          </span>
          <span className="font-display text-[17px] font-semibold text-fg">AI Reception</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11.5px] text-[#0b8f5c]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live Call
          </span>
        </div>
        <span className="text-[12.5px] text-fg-faint">
          Call Duration <span className="ml-1.5 font-mono font-medium text-fg">02:37</span>
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[200px] flex-1 basis-[210px] flex-col items-center gap-3.5 rounded-2xl border border-[#eef0ef] px-4 py-5">
          <div className="text-[13px] text-[#0b8f5c]">Incoming Call</div>
          <div className="h-[92px] w-[92px] flex-none overflow-hidden rounded-full">
            <Image
              src="/marketing/caller-sophia-small.png"
              alt="Noxtill AI Phone Receptionist showing a live customer call, transcript, detected intent and appointment booking"
              width={220}
              height={220}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="text-center">
            <div className="font-display text-base font-semibold text-fg">Sophia Martinez</div>
            <div className="mt-0.5 text-[13px] text-fg-muted">+1 (555) 987-6543</div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#c8efdd] bg-[#eefaf4] px-3.5 py-2 text-[12.5px] text-[#0b8f5c]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI Handling Call
          </div>
          <div className="mt-1.5 flex flex-col items-center gap-2 pt-3.5">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#e0453a]">
              <PhoneOff className="h-6 w-6 text-white" aria-hidden />
            </span>
            <span className="text-[12.5px] text-fg-faint">End Call</span>
          </div>
        </div>

        <div className="flex min-w-[290px] flex-1 basis-[330px] flex-col gap-2.5 px-1.5 py-1">
          {CALL_MESSAGES.map((message, i) => (
            <div key={i} className={`flex items-start gap-2 ${message.from === "caller" ? "flex-row-reverse" : ""}`}>
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                  message.from === "ai" ? "bg-primary text-white" : "bg-[#eef0ef] text-fg-faint"
                }`}
              >
                {message.from === "ai" ? "N" : ""}
              </span>
              <div
                className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 ${
                  message.from === "ai" ? "border border-[#d5eee2] bg-[#eefaf4]" : "bg-[#f7f8f8]"
                }`}
              >
                <div className="text-[12.5px] leading-relaxed text-fg">{message.text}</div>
                <div className={`mt-0.5 text-right font-mono text-[9px] ${message.from === "ai" ? "text-[#7ba492]" : "text-fg-faint"}`}>{message.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex w-full flex-wrap gap-3.5 border-t border-[#eef0ef] pt-4">
          <div className="min-w-55 flex-1 rounded-2xl border border-[#eef0ef] p-3.5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="h-10 w-10 flex-none overflow-hidden rounded-full">
                <Image src="/marketing/caller-sophia.png" alt="Noxtill AI Reception caller record showing a new lead captured from an answered business call" width={120} height={120} className="h-full w-full object-cover" />
              </span>
              <div>
                <div className="font-display text-[14.5px] font-semibold text-fg">Sophia Martinez</div>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e3fbf1] px-2.5 py-0.5 text-[10px] text-[#0b8f5c]">✓ New Lead</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-xs text-fg-muted">
              <div>+1 (555) 987-6543</div>
              <div>sophia.martinez@email.com</div>
              <div>Austin, Texas, USA</div>
            </div>
          </div>

          <div className="min-w-37.5 flex-1 rounded-2xl border border-[#eef0ef] px-3.5 py-3">
            <span className="font-display text-[13.5px] font-semibold text-fg">Intent Detected</span>
            <span className="mt-2 block w-fit rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11px] text-[#0b8f5c]">Pricing Inquiry</span>
          </div>

          <div className="min-w-37.5 flex-1 rounded-2xl border border-[#eef0ef] p-3.5">
            <div className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-semibold text-fg">
              <Calendar className="h-3.5 w-3.5 text-accent" aria-hidden />
              Scheduled Demo
            </div>
            <div className="text-xs text-fg-muted">
              Tomorrow, May 21, 2025
              <br />
              11:00 AM (CST)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
